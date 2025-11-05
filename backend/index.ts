import Fastify from 'fastify'

const fastify = Fastify({ logger: true })

// Test route
fastify.get('/health', async (request, reply) => {
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