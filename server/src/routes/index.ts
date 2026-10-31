import { FastifyInstance } from 'fastify';

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.get('/ping', async () => ({
    message: 'ParsBuilding API v1 operational',
    version: '1.0.0'
  }));
}
