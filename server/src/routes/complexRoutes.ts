/**
 * ParsBuilding Complexes REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import { AuditAction } from '@prisma/client';

const updateComplexSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  address: z.string().max(255).optional(),
  city: z.string().max(50).optional(),
  province: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  unitCount: z.number().int().min(1).max(500).optional(),
  roundStep: z.number().int().min(1000).max(1000000).optional(),
  currency: z.enum(['IRT', 'IRR']).optional(),
  settings: z.record(z.any()).optional()
});

const createComplexSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  address: z.string().max(255).optional(),
  unitCount: z.number().int().min(1).max(500).default(20),
  initialFund: z.number().default(0),
  roundStep: z.number().int().default(50000),
  currency: z.enum(['IRT', 'IRR']).default('IRT'),
});

export async function complexRoutes(fastify: FastifyInstance) {
  // GET /complexes: List complexes
  fastify.get('/complexes', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role === 'SUPER_ADMIN') {
      const complexes = await rawPrisma.complex.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return reply.send(complexes);
    }

    if (!user.complexId) {
      return reply.send([]);
    }

    const userComplex = await rawPrisma.complex.findUnique({
      where: { id: user.complexId }
    });
    return reply.send(userComplex ? [userComplex] : []);
  });

  // GET /complex/current: Current complex shortcut
  fastify.get('/complex/current', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (!user.complexId) {
      return reply.code(404).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'No active complex bound to current user.',
        instance: request.raw.url || request.url
      });
    }

    const complex = await rawPrisma.complex.findUnique({
      where: { id: user.complexId },
      include: {
        buildings: true
      }
    });

    if (!complex) {
      return reply.code(404).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/not-found',
        title: 'Complex Not Found',
        status: 404,
        detail: `Complex ${user.complexId} does not exist.`
      });
    }

    return reply.send(complex);
  });

  // GET /complexes/:id: Get specific complex
  fastify.get('/complexes/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== id) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Cross-tenant access forbidden. You cannot access another complex.'
      });
    }

    const complex = await rawPrisma.complex.findUnique({
      where: { id },
      include: {
        buildings: true
      }
    });

    if (!complex) {
      return reply.code(404).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Complex ${id} not found.`
      });
    }

    return reply.send(complex);
  });

  // POST /complexes: Super Admin creates a new complex
  fastify.post('/complexes', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Only SUPER_ADMIN can create new complexes directly.'
      });
    }

    const parseRes = createComplexSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const existing = await rawPrisma.complex.findUnique({ where: { slug: data.slug } });
    if (existing) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: `Complex with slug '${data.slug}' already exists.`
      });
    }

    const created = await rawPrisma.complex.create({
      data: {
        ...data,
        currentFund: data.initialFund,
      }
    });

    // Also auto-create default building block
    await rawPrisma.building.create({
      data: {
        complexId: created.id,
        name: 'بلوک اصلی',
        unitsCount: created.unitCount,
      }
    });

    await auditLogger.log({
      complexId: created.id,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Complex',
      entityId: created.id,
      after: created
    });

    return reply.code(201).send(created);
  });

  // PUT /complexes/:id: Update complex
  fastify.put('/complexes/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_SETTINGS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== id) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Cannot update complex of another tenant.'
      });
    }

    const parseRes = updateComplexSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const before = await rawPrisma.complex.findUnique({ where: { id } });
    if (!before) {
      return reply.code(404).send({ error: 'Complex not found' });
    }

    const updated = await rawPrisma.complex.update({
      where: { id },
      data: parseRes.data
    });

    await auditLogger.log({
      complexId: id,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.UPDATE,
      entityType: 'Complex',
      entityId: id,
      before,
      after: updated
    });

    return reply.send(updated);
  });

  // GET /complexes/:id/treasury: Get online treasury balance and statistics
  fastify.get('/complexes/:id/treasury', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== id) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant treasury access' });
    }

    const complex = await rawPrisma.complex.findUnique({ where: { id } });
    if (!complex) {
      return reply.code(404).send({ error: 'Complex not found' });
    }

    const units = await rawPrisma.unit.findMany({
      where: { complexId: id },
      select: { currentBalance: true }
    });

    let totalDebts = 0;
    let totalCredits = 0;
    for (const u of units) {
      const bal = Number(u.currentBalance);
      if (bal < 0) {
        totalDebts += Math.abs(bal);
      } else {
        totalCredits += bal;
      }
    }

    const periodsCount = await rawPrisma.period.count({ where: { complexId: id } });

    return reply.send({
      complexId: id,
      initialFund: Number(complex.initialFund),
      currentFund: Number(complex.currentFund),
      totalDebts,
      totalCredits,
      unitCount: units.length,
      periodsCount,
      currency: complex.currency,
      roundStep: complex.roundStep
    });
  });

  // Alias /ledger/treasury
  fastify.get('/ledger/treasury', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    if (!user.complexId) {
      return reply.code(400).send({ error: 'Tenant context required' });
    }

    const complex = await rawPrisma.complex.findUnique({ where: { id: user.complexId } });
    if (!complex) {
      return reply.code(404).send({ error: 'Complex not found' });
    }

    const units = await rawPrisma.unit.findMany({
      where: { complexId: user.complexId },
      select: { currentBalance: true }
    });

    let totalDebts = 0;
    let totalCredits = 0;
    for (const u of units) {
      const bal = Number(u.currentBalance);
      if (bal < 0) totalDebts += Math.abs(bal);
      else totalCredits += bal;
    }

    return reply.send({
      complexId: user.complexId,
      initialFund: Number(complex.initialFund),
      currentFund: Number(complex.currentFund),
      totalDebts,
      totalCredits,
      unitCount: units.length,
      currency: complex.currency
    });
  });
}
