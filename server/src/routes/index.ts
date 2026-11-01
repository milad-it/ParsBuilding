import { FastifyInstance } from 'fastify';
import { authRoutes } from './authRoutes';
import { subManagerRoutes } from './subManagerRoutes';
import { auditLogRoutes } from './auditLogRoutes';
import { receiptRoutes } from './receiptRoutes';
import { websocketRoutes } from './websocketRoutes';
import { migrationRoutes } from './migrationRoutes';
import { complexRoutes } from './complexRoutes';
import { buildingRoutes } from './buildingRoutes';
import { unitRoutes } from './unitRoutes';
import { residentRoutes } from './residentRoutes';
import { periodRoutes } from './periodRoutes';
import { chargeRoutes } from './chargeRoutes';
import { transactionRoutes } from './transactionRoutes';
import { announcementRoutes } from './announcementRoutes';

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.get('/ping', async () => ({
    message: 'ParsBuilding API v1 operational',
    version: '1.0.0'
  }));

  // Foundation & Auth
  await fastify.register(authRoutes);
  await fastify.register(subManagerRoutes);
  await fastify.register(auditLogRoutes);
  await fastify.register(receiptRoutes);
  await fastify.register(websocketRoutes);

  // Milestone 3: Domain Entities & Migration
  await fastify.register(migrationRoutes);
  await fastify.register(complexRoutes);
  await fastify.register(buildingRoutes);
  await fastify.register(unitRoutes);
  await fastify.register(residentRoutes);
  await fastify.register(periodRoutes);
  await fastify.register(chargeRoutes);
  await fastify.register(transactionRoutes);
  await fastify.register(announcementRoutes);
}
