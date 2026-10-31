import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './config/env';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { tenantMiddleware } from './middleware/tenant';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : (env.NODE_ENV === 'test' ? 'silent' : 'debug')
    }
  }).withTypeProvider<ZodTypeProvider>();

  // Schema validation compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Security middlewares
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  await server.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest'
  });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });
  await server.register(websocket);

  // Tenant hook
  server.addHook('preHandler', tenantMiddleware);

  // Global Error Handler
  server.setErrorHandler(errorHandler);

  // API Route Registration
  await server.register(registerRoutes, { prefix: '/api/v1' });

  // Healthcheck endpoint
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 ParsBuilding Backend running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  start();
}
