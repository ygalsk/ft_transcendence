import { FastifyInstance } from "fastify";
import { CreateUserSchema, UserSchema, CreateUserType, UserType } from "../../schemas/user.schema";
import { Type } from "@sinclair/typebox";

export default async function authRoutes(fastify:FastifyInstance) {
    fastify.get('/github', async(req, res) => {

        const client_id = process.env.OAUTH_CLIENT_ID as string;
        const redirect_uri = process.env.REDIRECT_URI as string;

        const params = new URLSearchParams({
            client_id: client_id,
            redirect_uri: redirect_uri,
            scope: 'user:email'
        });

        const url = `https://github.com/login/oauth/authorize?${params.toString()}`

        res.redirect(url, 302);
    });

    fastify.get('/github/callback', {
        schema: {
            querystring: Type.Object({
                code: Type.String({ minLength: 1 })
            }),
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                    user: UserSchema
                })
            }
        }
    }, async(req, res) => {
        const code = req.query;
        const client_id = process.env.OAUTH_CLIENT_ID as string;
        const client_secret = process.env.OAUTH_CLIENT_SECRET as string;

        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: client_id,
                client_secret: client_secret,
                code: code
            })
        });
        const data = await response.json();
        console.log('Token response:', data);

        const userResponse = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${data.access_token}`,
                'User-Agent': 'ft-transcendence-app'
            }
        })

        const userData = await userResponse.json();
        console.log('User data:', userData); 
        
        // @ts-ignore
        const existingUser = fastify.db.prepare(
            'SELECT * FROM users WHERE oauth_id = ? AND oauth_provider = ?'
        ).get(String(userData.id), 'github');

        if (existingUser) {
            //Update user
            // @ts-ignore
            fastify.db.prepare(
                'UPDATE users SET username = ?, email = ?, avatarUrl = ? WHERE id = ?'
            ).run(userData.login, userData.email, userData.avatar_url, existingUser.id);
            return res.send({ success: true, user: existingUser });
        } else {
            //create new user
            // @ts-ignore
            const result = fastify.db.prepare(
                'INSERT INTO users (username, email, avatarUrl, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)'
            ).run(userData.login, userData.email, userData.avatar_url, 'github', String(userData.id));
            //get new user
            //@ts-ignore
            const newUser = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

            return res.send({ success: true, user: newUser });
        }
    });

}