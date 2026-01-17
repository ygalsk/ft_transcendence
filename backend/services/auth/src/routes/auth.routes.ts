import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { RegisterSchema, LoginSchema, TwoFAVerifySchema, RegisterType, LoginType, TwoFAVerifyType } from '../../shared/schemas/auth.schema';
import { generateToken, generateServiceToken } from '../../shared/plugins/auth'; // Import generateServiceToken

interface AuthUser {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  twofa_enabled: number;
  twofa_secret?: string | null;
}

export default async function authRoutes(fastify: FastifyInstance) {

  // POST /register
  fastify.post<{ Body: RegisterType }>('/register', {
    schema: { body: RegisterSchema }
  }, async (request, reply) => {
    const { email, password, display_name } = request.body;

    const hash = await bcrypt.hash(password, 12);

    try {
      const stmt = fastify.db.prepare(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
      );
      const result = stmt.run(email, hash, display_name);
      const userId = result.lastInsertRowid as number;

      // Notify user service to create profile
      const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:5000';
      const serviceToken = generateServiceToken('auth'); // Generate service token

      try {
        await axios.post(`${USER_SERVICE_URL}/internal/create-profile`, {
          id: userId,
          email,
          display_name
        }, {
          headers: { 'Authorization': `Service ${serviceToken}` } // Use Authorization header with service token
        });
        fastify.log.info({ userId, email }, 'Created user profile');
      } catch (err) {
        fastify.log.warn({ err, userId }, 'Failed to create user profile in user-service');
      }

      return reply.code(201).send({ message: 'User created successfully' });
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
      fastify.log.error({ err }, 'Registration failed');
      return reply.code(500).send({ error: 'Internal error' });
    }
  });

  // POST /login
  fastify.post<{ Body: LoginType }>('/login', {
    schema: { body: LoginSchema }
  }, async (request, reply) => {
    const { email, password, twofa_code } = request.body;

    const user = fastify.db.prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as AuthUser | undefined;

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // 2FA verification
    if (user.twofa_enabled && user.twofa_secret) {
      if (!twofa_code) {
        return reply.code(400).send({ error: '2FA code required' });
      }
      const valid2fa = authenticator.check(twofa_code, user.twofa_secret);
      if (!valid2fa) {
        return reply.code(401).send({ error: 'Invalid 2FA code' });
      }
    }

    const token = generateToken(user.id, user.email);

    // Call User service to set online status
    try {
      await axios.patch(`http://user-service:5000/internal/${user.id}/online`, {
        online: true
      });
    } catch (err) {
      fastify.log.warn({ userId: user.id }, 'Failed to update online status');
    }
    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name
      }
    });
  });

  // POST /2fa/setup
  fastify.post('/2fa/setup', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as AuthUser;

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'FT_Transcendence', secret);
    const qrCodeDataURL = await QRCode.toDataURL(otpauth);

    fastify.db.prepare('UPDATE users SET twofa_secret = ? WHERE id = ?')
      .run(secret, user.id);

    return reply.send({ qrCode: qrCodeDataURL, secret });
  });

  // POST /2fa/verify
  fastify.post<{ Body: TwoFAVerifyType }>('/2fa/verify', {
    schema: { body: TwoFAVerifySchema },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { code } = request.body;

    const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as AuthUser;

    if (!user || !user.twofa_secret) {
      return reply.code(404).send({ error: '2FA setup not found' });
    }

    const isValid = authenticator.check(code, user.twofa_secret);
    if (!isValid) {
      return reply.code(400).send({ error: 'Invalid 2FA code' });
    }

    fastify.db.prepare('UPDATE users SET twofa_enabled = 1 WHERE id = ?')
      .run(user.id);

    return reply.send({ message: '2FA enabled successfully' });
  });

  // GET /me
  fastify.get('/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = fastify.db.prepare('SELECT id, email, display_name FROM users WHERE id = ?')
      .get(userId) as Partial<AuthUser>;

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });

  // Internal endpoint for user service to delete user from auth DB
  fastify.delete('/internal/users/:userId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: { type: 'number' }
        },
        required: ['userId']
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        401: { type: 'object', additionalProperties: true },
        404: { type: 'object', additionalProperties: true },
        500: { type: 'object', additionalProperties: true }
      }
    }
  }, async (request, reply) => {
    try {
      // Verify service-to-service secret
      const serviceSecret = request.headers['x-service-secret'] as string;
      const expectedSecret = process.env.SERVICE_SECRET;

      if (!expectedSecret) {
        fastify.log.error('SERVICE_SECRET environment variable is required');
        return reply.code(500).send({ error: 'Server configuration error' });
      }

      if (!serviceSecret || serviceSecret !== expectedSecret) {
        fastify.log.warn('Unauthorized internal service call');
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { userId } = request.params as { userId: number };

      // Check if user exists
      const user = fastify.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // Delete user from auth database
      fastify.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      fastify.log.info({ userId }, 'Deleted user from auth service');

      return reply.code(200).send({ message: 'Account deleted successfully'});
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to delete user from auth service');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}

