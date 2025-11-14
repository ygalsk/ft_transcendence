import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import client from 'prom-client';

async function prometheusPlugin(fastify: FastifyInstance) {
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register: client.register });

  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
}

export default fp(prometheusPlugin, {
  name: 'prometheus-metrics',
});
