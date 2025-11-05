import Fastify from 'fastify'
import metricsPlugin from 'fastify-metrics'

const fastify = Fastify({ logger: true })

// Register Prometheus metrics
await fastify.register(metricsPlugin, {
  endpoint: '/metrics',
  defaultMetrics: { enabled: true },
  routeMetrics: { enabled: true }
})

// Test route
fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', message: 'Backend is running!' }
})

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()