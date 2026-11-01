/**
 * ParsBuilding Billing Periods & Calculation Engine REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import {
  AuditAction,
  CostInputMode,
  PeriodStatus,
  PeriodType,
  SpecialDistMode,
  TxKind,
  TxType
} from '@prisma/client';
import {
  calculatePeriodCharges,
  PeriodExpenseInput,
  UnitData
} from '../services/calculationEngine';
import { realtimeService } from '../services/realtimeService';

const createPeriodSchema = z.object({
  complexId: z.string().optional(),
  type: z.enum(['MONTHLY', 'SPECIAL']).default('MONTHLY'),
  name: z.string().min(2).max(100),
  year: z.number().int().min(1400).max(1500),
  month: z.string().min(1).max(20),
  inputMode: z.enum(['RATE', 'TOTAL']).default('RATE'),
  fixedCost: z.number().min(0).default(0),
  waterCost: z.number().min(0).default(0),
  gasCost: z.number().min(0).default(0),
  electricityCost: z.number().min(0).default(0),
  incidentalCost: z.number().min(0).default(0),
  incidentalDesc: z.string().max(255).optional(),
  areaExpenseTotal: z.number().min(0).default(0), // ماده ۴ قانون تملک
  specialTotalCost: z.number().min(0).default(0),
  specialDistMode: z.enum(['ALL', 'ACTIVE', 'CUSTOM']).default('ALL'),
  roundUp: z.boolean().default(false),
  roundStep: z.number().int().min(1000).default(50000),
  exemptEmptyUnits: z.boolean().default(true)
});

const updatePeriodSchema = createPeriodSchema.partial();

export async function periodRoutes(fastify: FastifyInstance) {
  // GET /periods
  fastify.get('/periods', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      complexId?: string;
      status?: string;
      type?: string;
      year?: string;
    };

    const complexId = query.complexId || user.complexId;
    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const where: any = { complexId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.year) where.year = parseInt(query.year, 10);

    const periods = await rawPrisma.period.findMany({
      where,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: { charges: true }
        }
      }
    });

    return reply.send(periods);
  });

  // GET /periods/:id
  fastify.get('/periods/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const period = await rawPrisma.period.findUnique({
      where: { id },
      include: {
        charges: {
          include: {
            unit: {
              select: { id: true, unitNumber: true, unitName: true, currentBalance: true }
            }
          }
        }
      }
    });

    if (!period) {
      return reply.code(404).send({ error: 'Period not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== period.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    // Resident role: filter charges to their own unit(s)
    if (user.role === 'RESIDENT') {
      const filteredCharges = period.charges.filter(c => user.unitIds.includes(c.unitId));
      return reply.send({
        ...period,
        charges: filteredCharges
      });
    }

    return reply.send(period);
  });

  // POST /periods: Create draft period
  fastify.post('/periods', {
    preHandler: [authenticate, requirePermission('MANAGE_PERIODS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = createPeriodSchema.safeParse(request.body);
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

    // Check unique [complexId, type, year, month]
    const existing = await rawPrisma.period.findUnique({
      where: {
        complexId_type_year_month: {
          complexId,
          type: data.type as PeriodType,
          year: data.year,
          month: data.month
        }
      }
    });

    if (existing) {
      return reply.code(409).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: `A ${data.type} period for year ${data.year} month ${data.month} already exists.`
      });
    }

    const period = await rawPrisma.period.create({
      data: {
        complexId,
        type: data.type as PeriodType,
        name: data.name,
        status: PeriodStatus.DRAFT,
        year: data.year,
        month: data.month,
        inputMode: data.inputMode as CostInputMode,
        fixedCost: data.fixedCost,
        waterCost: data.waterCost,
        gasCost: data.gasCost,
        electricityCost: data.electricityCost,
        incidentalCost: data.incidentalCost,
        incidentalDesc: data.incidentalDesc,
        areaExpenseTotal: data.areaExpenseTotal,
        specialTotalCost: data.specialTotalCost,
        specialDistMode: data.specialDistMode as SpecialDistMode,
        roundUp: data.roundUp,
        roundStep: data.roundStep,
        exemptEmptyUnits: data.exemptEmptyUnits,
        createdById: user.id
      }
    });

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Period',
      entityId: period.id,
      after: period
    });

    return reply.code(201).send(period);
  });

  // PUT /periods/:id: Update draft period
  fastify.put('/periods/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_PERIODS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const before = await rawPrisma.period.findUnique({ where: { id } });
    if (!before) {
      return reply.code(404).send({ error: 'Period not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== before.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    if (before.status !== PeriodStatus.DRAFT) {
      return reply.code(400).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/invalid-state',
        title: 'Invalid State',
        status: 400,
        detail: 'Cannot modify period expenses once it is published or closed.'
      });
    }

    const parseRes = updatePeriodSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const updated = await rawPrisma.period.update({
      where: { id },
      data: parseRes.data as any
    });

    await auditLogger.log({
      complexId: before.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.UPDATE,
      entityType: 'Period',
      entityId: id,
      before,
      after: updated
    });

    return reply.send(updated);
  });

  // POST /periods/:id/calculate: Dry-run preview calculation
  fastify.post('/periods/:id/calculate', {
    preHandler: [authenticate, requirePermission('MANAGE_PERIODS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const period = await rawPrisma.period.findUnique({ where: { id } });
    if (!period) {
      return reply.code(404).send({ error: 'Period not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== period.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    // Optional override body for dry-run
    const body = (request.body || {}) as Partial<PeriodExpenseInput>;

    const units = await rawPrisma.unit.findMany({
      where: { complexId: period.complexId },
      orderBy: { unitNumber: 'asc' }
    });

    const unitData: UnitData[] = units.map(u => ({
      id: u.id,
      unitNumber: u.unitNumber,
      area: Number(u.area),
      occupants: u.occupants,
      hasPackage: u.hasPackage,
      ownerName: u.unitName || `واحد ${u.unitNumber}`
    }));

    const expenseInput: PeriodExpenseInput = {
      fixedPerUnit: body.fixedPerUnit ?? Number(period.fixedCost),
      waterTotal: body.waterTotal ?? Number(period.waterCost),
      gasTotal: body.gasTotal ?? Number(period.gasCost),
      electricityTotal: body.electricityTotal ?? Number(period.electricityCost),
      incidentalTotal: body.incidentalTotal ?? Number(period.incidentalCost),
      areaExpenseTotal: body.areaExpenseTotal ?? Number(period.areaExpenseTotal),
      specialTotal: body.specialTotal ?? Number(period.specialTotalCost),
      specialMode: (body.specialMode || (period.specialDistMode === 'ACTIVE' ? 'active' : (period.specialDistMode === 'CUSTOM' ? 'custom' : 'all'))) as any,
      roundUp: body.roundUp ?? period.roundUp,
      roundStep: body.roundStep ?? period.roundStep,
      exemptEmptyUnits: body.exemptEmptyUnits ?? period.exemptEmptyUnits
    };

    const calcResult = calculatePeriodCharges(unitData, expenseInput);
    return reply.send(calcResult);
  });

  // POST /periods/:id/publish: DRAFT -> ACTIVE
  fastify.post('/periods/:id/publish', {
    preHandler: [authenticate, requirePermission('MANAGE_PERIODS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const period = await rawPrisma.period.findUnique({ where: { id } });
    if (!period) {
      return reply.code(404).send({ error: 'Period not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== period.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    if (period.status !== PeriodStatus.DRAFT) {
      return reply.code(400).send({ error: 'Only DRAFT periods can be published' });
    }

    const units = await rawPrisma.unit.findMany({
      where: { complexId: period.complexId },
      orderBy: { unitNumber: 'asc' }
    });

    const unitData: UnitData[] = units.map(u => ({
      id: u.id,
      unitNumber: u.unitNumber,
      area: Number(u.area),
      occupants: u.occupants,
      hasPackage: u.hasPackage,
      ownerName: u.unitName || `واحد ${u.unitNumber}`
    }));

    const expenseInput: PeriodExpenseInput = {
      fixedPerUnit: Number(period.fixedCost),
      waterTotal: Number(period.waterCost),
      gasTotal: Number(period.gasCost),
      electricityTotal: Number(period.electricityCost),
      incidentalTotal: Number(period.incidentalCost),
      areaExpenseTotal: Number(period.areaExpenseTotal),
      specialTotal: Number(period.specialTotalCost),
      specialMode: period.specialDistMode === 'ACTIVE' ? 'active' : (period.specialDistMode === 'CUSTOM' ? 'custom' : 'all'),
      roundUp: period.roundUp,
      roundStep: period.roundStep,
      exemptEmptyUnits: period.exemptEmptyUnits
    };

    const calcResult = calculatePeriodCharges(unitData, expenseInput);

    await rawPrisma.$transaction(async (tx) => {
      // 1. Delete any existing charge rows (in case of re-publish)
      await tx.unitCharge.deleteMany({ where: { periodId: id } });

      // 2. Persist calculated UnitCharge rows
      for (const ch of calcResult.charges) {
        const u = units.find(item => item.id === ch.unitId);
        await tx.unitCharge.create({
          data: {
            complexId: period.complexId,
            periodId: id,
            unitId: ch.unitId,
            snapshotOccupants: u?.occupants || 0,
            snapshotHasPackage: u?.hasPackage || false,
            snapshotArea: u?.area || 0,
            fixedShare: ch.fixed,
            waterShare: ch.water,
            gasShare: ch.gas,
            electricityShare: ch.electricity,
            incidentalShare: ch.incidental,
            areaShare: ch.areaShare,
            specialShare: ch.specialShare,
            roundingDelta: ch.roundingDelta,
            amount: ch.totalCharge,
            paidAmount: 0,
          }
        });
      }

      // 3. Update Period status and snapshot
      await tx.period.update({
        where: { id },
        data: {
          status: PeriodStatus.ACTIVE,
          startedAt: new Date(),
          totalExpenseAmount: calcResult.totalInputExpenses,
          frozenExpenses: expenseInput as any
        }
      });

      // 4. Immutable Audit Log
      await tx.auditLog.create({
        data: {
          complexId: period.complexId,
          actorId: user.id,
          actorRole: user.role,
          action: AuditAction.START_PERIOD,
          entityType: 'Period',
          entityId: id,
          metadata: {
            name: period.name,
            totalExpenseAmount: calcResult.totalInputExpenses,
            unitsCount: calcResult.charges.length
          }
        }
      });
    });

    // 5. Broadcast real-time events to complex room (dual naming)
    const eventData = {
      periodId: id,
      name: period.name,
      year: period.year,
      month: period.month,
      totalExpenses: calcResult.totalInputExpenses
    };
    realtimeService.broadcastToComplex(period.complexId, 'period:published' as any, eventData);
    realtimeService.broadcastToComplex(period.complexId, 'BILLING_PERIOD_OPENED', eventData);

    const published = await rawPrisma.period.findUnique({
      where: { id },
      include: { charges: true }
    });

    return reply.send(published);
  });

  const closingPeriods = new Set<string>();

  // POST /periods/:id/close: ACTIVE -> CLOSED
  fastify.post('/periods/:id/close', {
    preHandler: [authenticate, requirePermission('CLOSE_PERIODS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    if (closingPeriods.has(id)) {
      return reply.code(400).send({ error: 'Only ACTIVE periods can be closed' });
    }
    closingPeriods.add(id);

    try {
      const period = await rawPrisma.period.findUnique({
        where: { id },
        include: { charges: true }
      });

      if (!period) {
        return reply.code(404).send({ error: 'Period not found' });
      }

      if (user.role !== 'SUPER_ADMIN' && user.complexId !== period.complexId) {
        return reply.code(403).send({ error: 'Forbidden cross-tenant' });
      }

      if (period.status !== PeriodStatus.ACTIVE) {
        return reply.code(400).send({ error: 'Only ACTIVE periods can be closed' });
      }

    let totalCollected = 0;

    await rawPrisma.$transaction(async (tx) => {
      for (const charge of period.charges) {
        const chargeAmount = Number(charge.amount);
        const paidAmount = Number(charge.paidAmount);
        totalCollected += paidAmount;

        // Transfer full period charge to general ledger
        // Because payments made during active period lifecycle already incremented unit.currentBalance,
        // debiting the full chargeAmount (C) guarantees:
        // finalBalance = previousBalance + P - C = -unpaid (zero double-crediting)
        if (chargeAmount > 0) {
          await tx.ledgerTransaction.create({
            data: {
              complexId: period.complexId,
              unitId: charge.unitId,
              periodId: id,
              chargeId: charge.id,
              transactionId: `tx-tf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              txKind: TxKind.CHARGE_TRANSFER,
              type: TxType.DEBT,
              amount: chargeAmount,
              date: new Date(),
              description: `انتقال شارژ دوره ${period.name}`,
              createdById: user.id
            }
          });

          // Debit unit balance by the full period charge
          await tx.unit.update({
            where: { id: charge.unitId },
            data: {
              currentBalance: { decrement: chargeAmount }
            }
          });
        }
      }

      // Mark Period CLOSED
      await tx.period.update({
        where: { id },
        data: {
          status: PeriodStatus.CLOSED,
          closedAt: new Date(),
          totalCollectedAmount: totalCollected
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          complexId: period.complexId,
          actorId: user.id,
          actorRole: user.role,
          action: AuditAction.CLOSE_PERIOD,
          entityType: 'Period',
          entityId: id,
          metadata: {
            name: period.name,
            totalCollectedAmount: totalCollected,
            closedAt: new Date().toISOString()
          }
        }
      });
    });

    // Broadcast real-time events (dual naming)
    const closeData = {
      periodId: id,
      name: period.name,
      closedAt: new Date().toISOString(),
      totalCollected
    };
    realtimeService.broadcastToComplex(period.complexId, 'period:closed' as any, closeData);
    realtimeService.broadcastToComplex(period.complexId, 'BILLING_PERIOD_CLOSED', closeData);

    const closedPeriod = await rawPrisma.period.findUnique({
      where: { id },
      include: { charges: true }
    });

    return reply.send(closedPeriod);
    } finally {
      closingPeriods.delete(id);
    }
  });

  // DELETE /periods/:id: Delete draft period
  fastify.delete('/periods/:id', {
    preHandler: [authenticate, requirePermission('MANAGE_PERIODS')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const period = await rawPrisma.period.findUnique({ where: { id } });
    if (!period) {
      return reply.code(404).send({ error: 'Period not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== period.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    if (period.status !== PeriodStatus.DRAFT) {
      return reply.code(400).send({ error: 'Only DRAFT periods can be deleted' });
    }

    await rawPrisma.period.delete({ where: { id } });

    await auditLogger.log({
      complexId: period.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.DELETE,
      entityType: 'Period',
      entityId: id,
      before: period
    });

    return reply.send({ deleted: true });
  });
}
