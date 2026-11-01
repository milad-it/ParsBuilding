/**
 * ParsBuilding Ledger Transactions & Payments REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import {
  AuditAction,
  PaymentMethod,
  TxKind,
  TxType
} from '@prisma/client';
import { realtimeService } from '../services/realtimeService';

const recordPaymentSchema = z.object({
  unitId: z.string().uuid(),
  complexId: z.string().optional(),
  periodId: z.string().uuid().optional(),
  chargeId: z.string().uuid().optional(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'CARD_TRANSFER', 'GATEWAY', 'OFFSET']).default('CARD_TRANSFER'),
  referenceNumber: z.string().max(100).optional(),
  receiptId: z.string().uuid().optional(),
  date: z.string().datetime().optional(),
  description: z.string().min(2).max(255).default('ثبت واریزی شارژ')
});

const manualTransactionSchema = z.object({
  unitId: z.string().uuid(),
  complexId: z.string().optional(),
  type: z.enum(['DEBT', 'PAYMENT', 'FORGIVE']),
  txKind: z.enum(['MANUAL', 'CHARGE_TRANSFER', 'CREDIT_APPLY', 'OVERPAY_CREDIT']).default('MANUAL'),
  amount: z.number().positive(),
  description: z.string().min(2).max(255),
  referenceNumber: z.string().max(100).optional()
});

export async function transactionRoutes(fastify: FastifyInstance) {
  // POST /payments: Record payment
  fastify.post('/payments', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = recordPaymentSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const body = parseRes.data;

    // Check unit and complex
    const unit = await rawPrisma.unit.findUnique({ where: { id: body.unitId } });
    if (!unit) {
      return reply.code(404).send({ error: 'Target unit not found' });
    }

    const complexId = unit.complexId;

    // Permission check: Resident can only pay for own unit; Manager needs RECORD_PAYMENTS
    if (user.role === 'RESIDENT') {
      if (!user.unitIds.includes(body.unitId)) {
        return reply.code(403).send({ error: 'Residents can only submit payments for their own assigned unit' });
      }
    } else if (user.role === 'SUB_MANAGER') {
      const allowed = user.permissions.includes('RECORD_PAYMENTS') || user.permissions.includes('MANAGE_FINANCES');
      if (!allowed) {
        return reply.code(403).send({ error: 'Permission RECORD_PAYMENTS required' });
      }
    } else if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const txId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const result = await rawPrisma.$transaction(async (tx) => {
      // 1. Create LedgerTransaction
      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          complexId,
          unitId: body.unitId,
          periodId: body.periodId,
          chargeId: body.chargeId,
          transactionId: txId,
          txKind: TxKind.MANUAL,
          type: TxType.PAYMENT,
          amount: body.amount,
          paymentMethod: body.paymentMethod as PaymentMethod,
          referenceNumber: body.referenceNumber,
          receiptId: body.receiptId,
          description: body.description,
          date: body.date ? new Date(body.date) : new Date(),
          createdById: user.id
        }
      });

      // 2. Increment Unit balance (debt decreases, credit increases)
      const updatedUnit = await tx.unit.update({
        where: { id: body.unitId },
        data: {
          currentBalance: { increment: body.amount }
        }
      });

      // 3. Increment Complex treasury fund
      const updatedComplex = await tx.complex.update({
        where: { id: complexId },
        data: {
          currentFund: { increment: body.amount }
        }
      });

      // 4. Update UnitCharge paidAmount if chargeId specified
      if (body.chargeId) {
        await tx.unitCharge.update({
          where: { id: body.chargeId },
          data: {
            paidAmount: { increment: body.amount },
            payDate: new Date()
          }
        });
      }

      // 5. Append-only Immutable Audit Log
      await tx.auditLog.create({
        data: {
          complexId,
          actorId: user.id,
          actorRole: user.role,
          action: AuditAction.SETTLE_DEBT,
          entityType: 'LedgerTransaction',
          entityId: ledgerTx.id,
          metadata: {
            amount: body.amount,
            unitId: body.unitId,
            newUnitBalance: Number(updatedUnit.currentBalance),
            newTreasuryFund: Number(updatedComplex.currentFund)
          }
        }
      });

      return { ledgerTx, updatedUnit, updatedComplex };
    });

    // 6. Real-time WebSocket broadcasting (dual naming)
    const paymentEventData = {
      unitId: body.unitId,
      amount: body.amount,
      txId: result.ledgerTx.id,
      timestamp: new Date().toISOString()
    };
    realtimeService.broadcastToComplex(complexId, 'payment:received' as any, paymentEventData);
    realtimeService.broadcastToComplex(complexId, 'PAYMENT_RECEIVED', paymentEventData);
    realtimeService.broadcastToUnit(body.unitId, 'payment:received' as any, paymentEventData, complexId);
    realtimeService.broadcastToUnit(body.unitId, 'PAYMENT_RECEIVED', paymentEventData, complexId);

    // Broadcast unit balance update
    const balanceEventData = {
      unitId: body.unitId,
      currentBalance: Number(result.updatedUnit.currentBalance),
      delta: body.amount
    };
    realtimeService.broadcastToUnit(body.unitId, 'unit:balance_updated' as any, balanceEventData, complexId);
    realtimeService.broadcastToUnit(body.unitId, 'UNIT_BALANCE_UPDATED', balanceEventData, complexId);

    return reply.code(201).send(result.ledgerTx);
  });

  // GET /transactions: Query transactions
  fastify.get('/transactions', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      complexId?: string;
      unitId?: string;
      periodId?: string;
      type?: string;
      limit?: string;
      offset?: string;
    };

    const complexId = query.complexId || user.complexId;
    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const where: any = { complexId };

    if (user.role === 'RESIDENT') {
      where.unitId = { in: user.unitIds };
    } else if (query.unitId) {
      where.unitId = query.unitId;
    }

    if (query.periodId) where.periodId = query.periodId;
    if (query.type && (Object.values(TxType) as string[]).includes(query.type)) {
      where.type = query.type;
    }

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const [transactions, total] = await Promise.all([
      rawPrisma.ledgerTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
        include: {
          unit: { select: { id: true, unitNumber: true, unitName: true } }
        }
      }),
      rawPrisma.ledgerTransaction.count({ where })
    ]);

    return reply.send({
      transactions: transactions.map(t => ({
        ...t,
        amount: Number(t.amount)
      })),
      total,
      limit,
      offset
    });
  });

  // POST /transactions/manual: Record manual adjustment
  fastify.post('/transactions/manual', {
    preHandler: [authenticate, requirePermission('RECORD_PAYMENTS')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = manualTransactionSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const body = parseRes.data;
    const unit = await rawPrisma.unit.findUnique({ where: { id: body.unitId } });
    if (!unit) {
      return reply.code(404).send({ error: 'Unit not found' });
    }

    const complexId = unit.complexId;
    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    const txId = `tx-man-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txType = body.type as TxType;

    const result = await rawPrisma.$transaction(async (tx) => {
      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          complexId,
          unitId: body.unitId,
          transactionId: txId,
          txKind: body.txKind as TxKind,
          type: txType,
          amount: body.amount,
          description: body.description,
          referenceNumber: body.referenceNumber,
          date: new Date(),
          createdById: user.id
        }
      });

      // Update unit balance based on type:
      // PAYMENT: increment balance (+ credit)
      // DEBT: decrement balance (+ debt)
      // FORGIVE: increment balance (waives debt)
      const balanceDelta = txType === TxType.DEBT ? -body.amount : body.amount;
      const updatedUnit = await tx.unit.update({
        where: { id: body.unitId },
        data: { currentBalance: { increment: balanceDelta } }
      });

      // If PAYMENT: also increment treasury
      if (txType === TxType.PAYMENT) {
        await tx.complex.update({
          where: { id: complexId },
          data: { currentFund: { increment: body.amount } }
        });
      }

      await tx.auditLog.create({
        data: {
          complexId,
          actorId: user.id,
          actorRole: user.role,
          action: AuditAction.SETTLE_DEBT,
          entityType: 'LedgerTransaction',
          entityId: ledgerTx.id,
          metadata: {
            type: txType,
            amount: body.amount,
            unitId: body.unitId,
            newUnitBalance: Number(updatedUnit.currentBalance)
          }
        }
      });

      return ledgerTx;
    });

    return reply.code(201).send(result);
  });

  // GET /reports/balance-sheet
  fastify.get('/reports/balance-sheet', {
    preHandler: [authenticate, requirePermission('VIEW_REPORTS')]
  }, async (request, reply) => {
    const user = request.user!;
    const complexId = (request.query as { complexId?: string }).complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID required' });
    }

    const complex = await rawPrisma.complex.findUnique({ where: { id: complexId } });
    if (!complex) {
      return reply.code(404).send({ error: 'Complex not found' });
    }

    const units = await rawPrisma.unit.findMany({
      where: { complexId },
      select: { currentBalance: true }
    });

    let totalDebts = 0;
    let totalCredits = 0;
    for (const u of units) {
      const b = Number(u.currentBalance);
      if (b < 0) totalDebts += Math.abs(b);
      else totalCredits += b;
    }

    const closedPeriods = await rawPrisma.period.findMany({
      where: { complexId, status: 'CLOSED' },
      select: { totalExpenseAmount: true, totalCollectedAmount: true }
    });

    const totalBilled = closedPeriods.reduce((sum, p) => sum + Number(p.totalExpenseAmount), 0);
    const totalCollected = closedPeriods.reduce((sum, p) => sum + Number(p.totalCollectedAmount), 0);

    return reply.send({
      complexId,
      initialFund: Number(complex.initialFund),
      currentFund: Number(complex.currentFund),
      totalDebts,
      totalCredits,
      totalBilledExpenses: totalBilled,
      totalCollectedCharges: totalCollected,
      closedPeriodsCount: closedPeriods.length
    });
  });

  // GET /reports/debtors: List debtor units
  fastify.get('/reports/debtors', {
    preHandler: [authenticate, requirePermission('VIEW_REPORTS')]
  }, async (request, reply) => {
    const user = request.user!;
    const complexId = (request.query as { complexId?: string }).complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID required' });
    }

    const debtorUnits = await rawPrisma.unit.findMany({
      where: {
        complexId,
        currentBalance: { lt: 0 }
      },
      include: {
        unitResidents: {
          where: { isCurrent: true },
          include: { resident: true }
        }
      },
      orderBy: { currentBalance: 'asc' } // Highest debt first
    });

    return reply.send(debtorUnits.map(u => ({
      unitId: u.id,
      unitNumber: u.unitNumber,
      unitName: u.unitName,
      debtAmount: Math.abs(Number(u.currentBalance)),
      residents: u.unitResidents.map(ur => ({
        fullName: ur.resident.fullName,
        phone: ur.resident.phone,
        type: ur.type
      }))
    })));
  });
}
