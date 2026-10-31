import { FastifyInstance } from 'fastify';
import { authRoutes } from './authRoutes';
import { subManagerRoutes } from './subManagerRoutes';
import { auditLogRoutes } from './auditLogRoutes';
import { receiptRoutes } from './receiptRoutes';
import { websocketRoutes } from './websocketRoutes';

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.get('/ping', async () => ({
    message: 'ParsBuilding API v1 operational',
    version: '1.0.0'
  }));

  await fastify.register(authRoutes);
  await fastify.register(subManagerRoutes);
  await fastify.register(auditLogRoutes);
  await fastify.register(receiptRoutes);
  await fastify.register(websocketRoutes);
}
