import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import client from 'prom-client';

// custom http metrics

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

const httpRequestsActive = new client.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests',
  labelNames: ['service'],
});

// db metrics

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

const dbQueriesTotal = new client.Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'status', 'service'],
});

// error metric
const errorsTotal = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'service'],
});

// normalize routes, prevent high cardinality metrics
function normalizeRoute(url: string): string {
  return url
    .replace(/\/\d+/g, '/{id}') // replace numeric IDs with {id}
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}') // replace UUIDs
    .split('?')[0]; // Remove query params
}

//for microservices 
interface PrometheusPluginOptions {
  serviceName?: string;
}

async function prometheusPlugin(
  fastify: FastifyInstance,
  options: PrometheusPluginOptions = {}
) {
  const serviceName = options.serviceName || 'unknown';

  // collect default Node.js runtime metrics like cpu, memory etc.
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register: client.register });

  // request tracking hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const labels = { service: serviceName };
    httpRequestsActive.inc(labels);
    
    // store start time
    (request as any).startTime = process.hrtime.bigint();
  });

  // response tracking hook
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const labels = { service: serviceName };
    httpRequestsActive.dec(labels);

    const route = normalizeRoute(request.url);
    const method = request.method;
    const statusCode = reply.statusCode.toString();

    // completed request count
    httpRequestsTotal.inc({ method, route, status_code: statusCode, service: serviceName });

    // request duration
    const startTime = (request as any).startTime;
    if (startTime) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9; // convert to seconds
      httpRequestDuration.observe(
        { method, route, status_code: statusCode, service: serviceName }, //record request latency
        duration
      );
    }
  });

  // error tracking hook
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    errorsTotal.inc({ type: error.name || 'Error', service: serviceName });
  });

  // Decorate Fastify instance with metric helpers
  fastify.decorate('metrics', {
    recordDbQuery: (operation: string, durationSeconds: number, status: 'success' | 'error') => {
      dbQueryDuration.observe({ operation, service: serviceName }, durationSeconds);
      dbQueriesTotal.inc({ operation, status, service: serviceName });
    },
    recordError: (errorType: string) => {
      errorsTotal.inc({ type: errorType, service: serviceName });
    },
  });

  // metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });

  fastify.log.info(`Prometheus metrics plugin initialized for service: ${serviceName}`);
}

// extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      recordDbQuery: (operation: string, durationSeconds: number, status: 'success' | 'error') => void;
      recordError: (errorType: string) => void;
    };
  }
}

export default fp(prometheusPlugin, {
  name: 'prometheus-metrics',
});
