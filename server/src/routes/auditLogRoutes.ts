import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';

const queryAuditLogsSchema = z.object({
  complexId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

export async function auditLogRoutes(fastify: FastifyInstance) {
  fastify.get('/audit-logs', {
    preHandler: [authenticate, requirePermission('VIEW_AUDIT_LOGS')]
  }, async (request, reply) => {
    const query = queryAuditLogsSchema.parse(request.query);
    const complexId = request.user!.role === 'SUPER_ADMIN'
      ? (query.complexId || request.user!.complexId || '')
      : (request.user!.complexId || '');

    if (!complexId && request.user!.role !== 'SUPER_ADMIN') {
      return reply.code(400).send({ error: 'Bad Request', message: 'Active complexId is required' });
    }

    const result = await auditLogger.getLogs({
      complexId,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset
    });

    return reply.code(200).send(result);
  });
}
