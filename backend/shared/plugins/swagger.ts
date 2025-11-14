import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

interface SwaggerPluginOptions {
  serviceName: string;
  version?: string;
  serverUrl?: string;
}

async function swaggerPlugin(fastify: FastifyInstance, opts: SwaggerPluginOptions) {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: `${opts.serviceName} API`,
        version: opts.version || '1.0.0',
      },
      servers: opts.serverUrl ? [{ url: opts.serverUrl }] : [],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });
}

export default fp(swaggerPlugin, {
  name: 'swagger',
});
