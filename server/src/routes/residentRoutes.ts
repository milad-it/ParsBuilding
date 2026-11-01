/**
 * ParsBuilding Residents REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import { AuditAction, ResidentType } from '@prisma/client';

const createResidentSchema = z.object({
  complexId: z.string().optional(),
  fullName: z.string().min(2).max(100),
  phone: z.string().min(10).max(20),
  nationalCode: z.string().max(20).optional(),
  type: z.enum(['OWNER', 'TENANT']).default('OWNER'),
  unitId: z.string().uuid().optional(),
});

const updateResidentSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().min(10).max(20).optional(),
  nationalCode: z.string().max(20).optional(),
  type: z.enum(['OWNER', 'TENANT']).optional(),
  isActive: z.boolean().optional(),
});

const assignUnitSchema = z.object({
  unitId: z.string().uuid(),
  type: z.enum(['OWNER', 'TENANT']),
  startDate: z.string().datetime().optional()
});

const unassignUnitSchema = z.object({
  unitId: z.string().uuid(),
});

export async function residentRoutes(fastify: FastifyInstance) {
  // GET /residents
  fastify.get('/residents', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      complexId?: string;
      unitId?: string;
      type?: string;
      search?: string;
    };

    const complexId = query.complexId || user.complexId;

    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const where: any = { complexId };

    if (query.type && (query.type === 'OWNER' || query.type === 'TENANT')) {
      where.type = query.type;
    }

    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { nationalCode: { contains: s } }
      ];
    }

    if (query.unitId) {
      where.unitAssignments = {
        some: { unitId: query.unitId, isCurrent: true }
      };
    }

    const residents = await rawPrisma.resident.findMany({
      where,
      include: {
        unitAssignments: {
          where: { isCurrent: true },
          include: {
            unit: {
              select: { id: true, unitNumber: true, unitName: true, currentBalance: true }
            }
          }
        }
      },
      orderBy: { fullName: 'asc' }
    });

    return reply.send(residents);
  });

  // GET /residents/:id
  fastify.get('/residents/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const resident = await rawPrisma.resident.findUnique({
      where: { id },
      include: {
        unitAssignments: {
          include: { unit: true }
        }
      }
    });

    if (!resident) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== resident.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    return reply.send(resident);
  });

  // POST /residents
  fastify.post('/residents', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = createResidentSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const complexId = data.complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID required' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant operation' });
    }

    // Check unique phone in complex
    const existing = await rawPrisma.resident.findUnique({
      where: { complexId_phone: { complexId, phone: data.phone } }
    });

    if (existing) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: `Resident with phone ${data.phone} already exists in this complex.`
      });
    }

    const resident = await rawPrisma.resident.create({
      data: {
        complexId,
        fullName: data.fullName,
        phone: data.phone,
        nationalCode: data.nationalCode,
        type: data.type as ResidentType,
      }
    });

    // If unitId provided, assign resident to unit immediately
    if (data.unitId) {
      const unit = await rawPrisma.unit.findUnique({ where: { id: data.unitId } });
      if (unit && unit.complexId === complexId) {
        await rawPrisma.unitResident.create({
          data: {
            complexId,
            unitId: data.unitId,
            residentId: resident.id,
            type: data.type as ResidentType,
            isCurrent: true,
          }
        });
      }
    }

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Resident',
      entityId: resident.id,
      after: resident
    });

    return reply.code(201).send(resident);
  });

  // PUT /residents/:id
  fastify.put('/residents/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const before = await rawPrisma.resident.findUnique({ where: { id } });
    if (!before) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== before.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const parseRes = updateResidentSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const updated = await rawPrisma.resident.update({
      where: { id },
      data: parseRes.data as any
    });

    await auditLogger.log({
      complexId: before.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.UPDATE,
      entityType: 'Resident',
      entityId: id,
      before,
      after: updated
    });

    return reply.send(updated);
  });

  // DELETE /residents/:id
  fastify.delete('/residents/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const resident = await rawPrisma.resident.findUnique({ where: { id } });
    if (!resident) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== resident.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    // Deactivate unit residency assignments
    await rawPrisma.unitResident.updateMany({
      where: { residentId: id },
      data: { isCurrent: false, endDate: new Date() }
    });

    // Mark resident inactive
    const updated = await rawPrisma.resident.update({
      where: { id },
      data: { isActive: false }
    });

    await auditLogger.log({
      complexId: resident.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.DELETE,
      entityType: 'Resident',
      entityId: id,
      before: resident,
      after: updated
    });

    return reply.send({ deactivated: true });
  });

  // POST /residents/:id/assign-unit
  fastify.post('/residents/:id/assign-unit', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const parseRes = assignUnitSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const resident = await rawPrisma.resident.findUnique({ where: { id } });
    if (!resident) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    const unit = await rawPrisma.unit.findUnique({ where: { id: data.unitId } });
    if (!unit || unit.complexId !== resident.complexId) {
      return reply.code(400).send({ error: 'Unit must belong to the same complex' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== resident.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const assignment = await rawPrisma.unitResident.upsert({
      where: {
        complexId_unitId_residentId: {
          complexId: resident.complexId,
          unitId: data.unitId,
          residentId: id
        }
      },
      create: {
        complexId: resident.complexId,
        unitId: data.unitId,
        residentId: id,
        type: data.type as ResidentType,
        isCurrent: true,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
      },
      update: {
        type: data.type as ResidentType,
        isCurrent: true,
        endDate: null
      }
    });

    await auditLogger.log({
      complexId: resident.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'UnitResident',
      entityId: assignment.id,
      after: assignment
    });

    return reply.code(201).send(assignment);
  });

  // POST /residents/:id/unassign-unit
  fastify.post('/residents/:id/unassign-unit', {
    preHandler: [authenticate, requirePermission('MANAGE_RESIDENTS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const parseRes = unassignUnitSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const { unitId } = parseRes.data;
    const resident = await rawPrisma.resident.findUnique({ where: { id } });
    if (!resident) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== resident.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    await rawPrisma.unitResident.updateMany({
      where: {
        complexId: resident.complexId,
        residentId: id,
        unitId
      },
      data: {
        isCurrent: false,
        endDate: new Date()
      }
    });

    return reply.send({ unassigned: true });
  });
}
