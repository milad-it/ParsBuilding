/**
 * ParsBuilding Units REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission, requireResidentUnitAccess } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import { AuditAction, OccupancyStatus } from '@prisma/client';
import { realtimeService } from '../services/realtimeService';

const createUnitSchema = z.object({
  complexId: z.string().optional(),
  buildingId: z.string().uuid().optional(),
  unitNumber: z.number().int().min(1).max(9999),
  unitName: z.string().max(50).optional(),
  floor: z.number().int().min(-5).max(100).optional(),
  area: z.number().min(0).max(5000), // square meters (ماده ۴)
  occupants: z.number().int().min(0).max(50).default(0),
  occType: z.enum(['OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'VACANT']).default('OWNER_OCCUPIED'),
  hasPackage: z.boolean().default(false),
  parkingCount: z.number().int().min(0).max(10).default(0),
  storageArea: z.number().min(0).max(500).default(0),
  initialBalance: z.number().default(0),
  notes: z.string().max(500).optional()
});

const bulkCreateUnitsSchema = z.object({
  complexId: z.string().optional(),
  buildingId: z.string().uuid().optional(),
  startNumber: z.number().int().min(1),
  count: z.number().int().min(1).max(200),
  defaultArea: z.number().min(0).max(2000),
  defaultOccupants: z.number().int().min(0).max(20).default(0),
  defaultHasPackage: z.boolean().default(false)
});

const updateUnitSchema = z.object({
  unitName: z.string().max(50).optional(),
  floor: z.number().int().min(-5).max(100).optional(),
  area: z.number().min(0).max(5000).optional(),
  occupants: z.number().int().min(0).max(50).optional(),
  occType: z.enum(['OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'VACANT']).optional(),
  hasPackage: z.boolean().optional(),
  parkingCount: z.number().int().min(0).max(10).optional(),
  storageArea: z.number().min(0).max(500).optional(),
  notes: z.string().max(500).optional(),
  currentBalance: z.number().optional()
});

export async function unitRoutes(fastify: FastifyInstance) {
  // GET /units: Query units
  fastify.get('/units', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      complexId?: string;
      buildingId?: string;
      occType?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const complexId = query.complexId || user.complexId;

    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const where: any = { complexId };

    // Resident role: only return their assigned units
    if (user.role === 'RESIDENT') {
      where.id = { in: user.unitIds };
    }

    if (query.buildingId) {
      where.buildingId = query.buildingId;
    }

    if (query.occType && (Object.values(OccupancyStatus) as string[]).includes(query.occType)) {
      where.occType = query.occType;
    }

    if (query.search) {
      const s = query.search.trim();
      const num = parseInt(s, 10);
      where.OR = [
        ...(isNaN(num) ? [] : [{ unitNumber: num }]),
        { unitName: { contains: s, mode: 'insensitive' } }
      ];
    }

    const units = await rawPrisma.unit.findMany({
      where,
      orderBy: { unitNumber: 'asc' },
      include: {
        building: { select: { id: true, name: true } },
        unitResidents: {
          where: { isCurrent: true },
          include: {
            resident: { select: { id: true, fullName: true, phone: true, type: true } }
          }
        }
      }
    });

    return reply.send(units);
  });

  fastify.get<{ Params: { id: string } }>('/units/:id', {
    preHandler: [authenticate, requireResidentUnitAccess as any]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const unit = await rawPrisma.unit.findUnique({
      where: { id },
      include: {
        building: true,
        unitResidents: {
          include: { resident: true }
        },
        charges: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { period: true }
        }
      }
    });

    if (!unit) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== unit.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    return reply.send(unit);
  });

  // POST /units: Create single unit
  fastify.post('/units', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = createUnitSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const complexId = data.complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID is required' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant operation' });
    }

    // Check unique unitNumber in complex
    const existing = await rawPrisma.unit.findUnique({
      where: { complexId_unitNumber: { complexId, unitNumber: data.unitNumber } }
    });

    if (existing) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: `Unit number ${data.unitNumber} already exists in this complex.`
      });
    }

    const unit = await rawPrisma.unit.create({
      data: {
        complexId,
        buildingId: data.buildingId,
        unitNumber: data.unitNumber,
        unitName: data.unitName || `واحد ${data.unitNumber}`,
        floor: data.floor,
        area: data.area,
        occupants: data.occupants,
        occType: data.occType as OccupancyStatus,
        hasPackage: data.hasPackage,
        parkingCount: data.parkingCount,
        storageArea: data.storageArea,
        currentBalance: data.initialBalance,
        notes: data.notes
      }
    });

    // Register unit with realtimeService
    realtimeService.registerUnit(unit.id, complexId);

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Unit',
      entityId: unit.id,
      after: unit
    });

    return reply.code(201).send(unit);
  });

  // POST /units/bulk: Bulk create units
  fastify.post('/units/bulk', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = bulkCreateUnitsSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const complexId = data.complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID is required' });
    }

    const createdUnits = [];
    for (let i = 0; i < data.count; i++) {
      const uNum = data.startNumber + i;
      const existing = await rawPrisma.unit.findUnique({
        where: { complexId_unitNumber: { complexId, unitNumber: uNum } }
      });
      if (existing) continue;

      const created = await rawPrisma.unit.create({
        data: {
          complexId,
          buildingId: data.buildingId,
          unitNumber: uNum,
          unitName: `واحد ${uNum}`,
          area: data.defaultArea,
          occupants: data.defaultOccupants,
          occType: data.defaultOccupants === 0 ? OccupancyStatus.VACANT : OccupancyStatus.OWNER_OCCUPIED,
          hasPackage: data.defaultHasPackage,
        }
      });
      realtimeService.registerUnit(created.id, complexId);
      createdUnits.push(created);
    }

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Unit',
      entityId: complexId,
      metadata: { count: createdUnits.length, startNumber: data.startNumber }
    });

    return reply.code(201).send({ createdCount: createdUnits.length, units: createdUnits });
  });

  // PUT & PATCH /units/:id: Update unit specs
  const handleUpdateUnit = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const before = await rawPrisma.unit.findUnique({ where: { id } });
    if (!before) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== before.complexId) {
      return reply.code(403).send({ error: 'Cannot update unit of another tenant' });
    }

    const parseRes = updateUnitSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const updated = await rawPrisma.unit.update({
      where: { id },
      data: parseRes.data as any
    });

    await auditLogger.log({
      complexId: before.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.UPDATE,
      entityType: 'Unit',
      entityId: id,
      before,
      after: updated
    });

    return reply.send(updated);
  };

  fastify.put('/units/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, handleUpdateUnit);

  fastify.patch('/units/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, handleUpdateUnit);

  // PATCH /units/:id/occupancy: Quick occupancy toggle
  fastify.patch('/units/:id/occupancy', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const body = request.body as { occType?: string; occupants?: number };

    const before = await rawPrisma.unit.findUnique({ where: { id } });
    if (!before) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== before.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const updateData: any = {};
    if (body.occType && (Object.values(OccupancyStatus) as string[]).includes(body.occType)) {
      updateData.occType = body.occType;
    }
    if (body.occupants !== undefined) {
      updateData.occupants = Math.max(0, body.occupants);
    }

    const updated = await rawPrisma.unit.update({
      where: { id },
      data: updateData
    });

    return reply.send(updated);
  });

  // DELETE /units/:id
  fastify.delete('/units/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_UNITS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const unit = await rawPrisma.unit.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true, charges: true }
        }
      }
    });

    if (!unit) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== unit.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    if (unit._count.transactions > 0 || unit._count.charges > 0) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Cannot delete unit with existing financial transactions or period charges. Archive the unit instead.'
      });
    }

    await rawPrisma.unit.delete({ where: { id } });

    await auditLogger.log({
      complexId: unit.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.DELETE,
      entityType: 'Unit',
      entityId: id,
      before: unit
    });

    return reply.send({ deleted: true });
  });

  // GET /units/:id/statement & /units/:id/transactions
  const handleStatement = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const unit = await rawPrisma.unit.findUnique({
      where: { id },
      include: {
        building: true
      }
    });

    if (!unit) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== unit.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const transactions = await rawPrisma.ledgerTransaction.findMany({
      where: { unitId: id },
      orderBy: { date: 'desc' }
    });

    const charges = await rawPrisma.unitCharge.findMany({
      where: { unitId: id },
      include: { period: true },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({
      unit: {
        id: unit.id,
        unitNumber: unit.unitNumber,
        unitName: unit.unitName,
        currentBalance: Number(unit.currentBalance),
        area: Number(unit.area),
        occupants: unit.occupants,
      },
      transactions: transactions.map(t => ({
        ...t,
        amount: Number(t.amount)
      })),
      charges: charges.map(c => ({
        ...c,
        amount: Number(c.amount),
        paidAmount: Number(c.paidAmount)
      }))
    });
  };

  fastify.get('/units/:id/statement', {
    preHandler: [authenticate, requireResidentUnitAccess as any]
  }, handleStatement);

  fastify.get('/units/:id/transactions', {
    preHandler: [authenticate, requireResidentUnitAccess as any]
  }, handleStatement);
}
