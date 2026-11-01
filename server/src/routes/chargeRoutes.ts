/**
 * ParsBuilding Unit Charges REST Routes
 */

import { FastifyInstance } from 'fastify';
import { rawPrisma } from '../config/database';
import { authenticate } from '../middleware/rbac';

export async function chargeRoutes(fastify: FastifyInstance) {
  // GET /charges: Query charges
  fastify.get('/charges', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      complexId?: string;
      periodId?: string;
      unitId?: string;
    };

    const complexId = query.complexId || user.complexId;
    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const where: any = { complexId };
    if (query.periodId) where.periodId = query.periodId;

    if (user.role === 'RESIDENT') {
      where.unitId = { in: user.unitIds };
    } else if (query.unitId) {
      where.unitId = query.unitId;
    }

    const charges = await rawPrisma.unitCharge.findMany({
      where,
      include: {
        unit: {
          select: { id: true, unitNumber: true, unitName: true, currentBalance: true }
        },
        period: {
          select: { id: true, name: true, status: true, year: true, month: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(charges);
  });

  // GET /charges/:id: Single charge detail
  fastify.get('/charges/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const charge = await rawPrisma.unitCharge.findUnique({
      where: { id },
      include: {
        unit: true,
        period: true,
        transactions: true
      }
    });

    if (!charge) {
      return reply.code(404).send({ error: 'Charge not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== charge.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    if (user.role === 'RESIDENT' && !user.unitIds.includes(charge.unitId)) {
      return reply.code(403).send({ error: 'Forbidden: You cannot view charges for another unit' });
    }

    return reply.send(charge);
  });
}
