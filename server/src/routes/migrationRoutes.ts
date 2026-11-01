/**
 * ParsBuilding Data Migration REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { migrationService } from '../services/migrationService';
import { authenticate } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';

const migrationBodySchema = z.object({
  complexId: z.string().optional(),
  complexName: z.string().optional(),
  initialFund: z.number().default(0),
  expectedEndingFund: z.number().optional(),
  units: z.array(z.record(z.any())).default([]),
  periods: z.array(z.record(z.any())).default([]),
});

export async function migrationRoutes(fastify: FastifyInstance) {
  // Handler function reused across both routes
  const handleMigration = async (request: any, reply: any) => {
    const tenantCtx = getTenantContext();
    const body = request.body as z.infer<typeof migrationBodySchema>;
    const params = request.params as { complexId?: string; id?: string };

    const targetComplexId = params.complexId || params.id || body.complexId || tenantCtx?.complexId;

    if (!targetComplexId) {
      return reply.code(400).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/missing-complex-id',
        title: 'Bad Request',
        status: 400,
        detail: 'A valid complexId is required to execute migration.',
        instance: request.raw.url || request.url,
      });
    }

    // Role check if authenticated
    if (request.user) {
      const { role, permissions } = request.user;
      const isAllowed = role === 'SUPER_ADMIN' ||
        role === 'COMPLEX_MANAGER' ||
        (role === 'SUB_MANAGER' && (permissions.includes('MANAGE_SETTINGS') || permissions.includes('MANAGE_FINANCES')));

      if (!isAllowed) {
        return reply.code(403).header('Content-Type', 'application/problem+json').send({
          type: 'https://api.parsbuilding.com/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Migration requires managerial privileges (SUPER_ADMIN, COMPLEX_MANAGER, or MANAGE_SETTINGS).',
          instance: request.raw.url || request.url,
        });
      }
    }

    try {
      const result = await migrationService.executeMigration(
        targetComplexId,
        body,
        request.user?.id || tenantCtx?.userId
      );
      return reply.code(200).send(result);
    } catch (err: any) {
      request.log.error(err, 'Migration reconciliation failed and was rolled back');
      return reply.code(422).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/migration-failed',
        title: 'Migration Reconciliation Failure',
        status: 422,
        detail: err.message || 'Data migration failed reconciliation assertions and was rolled back.',
        instance: request.raw.url || request.url,
      });
    }
  };

  // Route 1: Direct /migration/import
  fastify.post('/migration/import', {
    preHandler: [authenticate]
  }, handleMigration);

  // Route 2: Scoped /complexes/:complexId/migrate
  fastify.post('/complexes/:complexId/migrate', {
    preHandler: [authenticate]
  }, handleMigration);
}
