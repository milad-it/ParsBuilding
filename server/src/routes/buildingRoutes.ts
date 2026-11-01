/**
 * ParsBuilding Building Blocks REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import { AuditAction } from '@prisma/client';

const createBuildingSchema = z.object({
  complexId: z.string().optional(),
  name: z.string().min(1).max(50),
  floorsCount: z.number().int().min(1).max(100).optional(),
  unitsCount: z.number().int().min(1).max(500).optional(),
  description: z.string().max(255).optional()
});

const updateBuildingSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  floorsCount: z.number().int().min(1).max(100).optional(),
  unitsCount: z.number().int().min(1).max(500).optional(),
  description: z.string().max(255).optional()
});

export async function buildingRoutes(fastify: FastifyInstance) {
  // GET /buildings
  fastify.get('/buildings', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const complexId = (request.query as { complexId?: string }).complexId || user.complexId;

    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const buildings = await rawPrisma.building.findMany({
      where: { complexId },
      include: {
        _count: {
          select: { units: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return reply.send(buildings);
  });

  // GET /buildings/:id
  fastify.get('/buildings/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const building = await rawPrisma.building.findUnique({
      where: { id },
      include: {
        units: true
      }
    });

    if (!building) {
      return reply.code(404).send({ error: 'Building not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== building.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    return reply.send(building);
  });

  // POST /buildings
  fastify.post('/buildings', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = createBuildingSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const complexId = data.complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Target complexId is required' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Cannot create building for foreign complex' });
    }

    const building = await rawPrisma.building.create({
      data: {
        complexId,
        name: data.name,
        floorsCount: data.floorsCount,
        unitsCount: data.unitsCount,
        description: data.description,
      }
    });

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Building',
      entityId: building.id,
      after: building
    });

    return reply.code(201).send(building);
  });

  // PUT /buildings/:id
  fastify.put('/buildings/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const existing = await rawPrisma.building.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Building not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== existing.complexId) {
      return reply.code(403).send({ error: 'Cannot update building for foreign complex' });
    }

    const parseRes = updateBuildingSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const updated = await rawPrisma.building.update({
      where: { id },
      data: parseRes.data
    });

    await auditLogger.log({
      complexId: existing.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.UPDATE,
      entityType: 'Building',
      entityId: id,
      before: existing,
      after: updated
    });

    return reply.send(updated);
  });

  // DELETE /buildings/:id
  fastify.delete('/buildings/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const existing = await rawPrisma.building.findUnique({
      where: { id },
      include: { _count: { select: { units: true } } }
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Building not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== existing.complexId) {
      return reply.code(403).send({ error: 'Cannot delete building of foreign complex' });
    }

    if (existing._count.units > 0) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: `Cannot delete building with ${existing._count.units} active unit(s). Reassign or remove units first.`
      });
    }

    await rawPrisma.building.delete({ where: { id } });

    await auditLogger.log({
      complexId: existing.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.DELETE,
      entityType: 'Building',
      entityId: id,
      before: existing
    });

    return reply.code(200).send({ deleted: true });
  });
}
