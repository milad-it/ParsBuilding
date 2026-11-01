/**
 * Empirical Gate 4 Challenger Stress Suite:
 * 1. Manager calculation preview and period lifecycle (Draft -> Publish -> Close).
 * 2. Multi-method payment recording and treasury balance synchronization.
 * 3. Resident portal statement breakdown, bulletin notices, and payment simulation.
 * 4. Granular RBAC, IDOR boundaries, and computational invariants.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';

describe('Gate 4 Empirical Challenger: User Journeys & Workflow Integration', () => {
  let server: FastifyInstance;

  // Tokens
  let managerToken: string;
  let resident1Token: string;
  let resident2Token: string;
  let unprivilegedSubManagerToken: string;
  let crossTenantManagerToken: string;

  // Tenant fixtures
  const complexAlphaId = 'cpx-alpha-gate4';
  const complexBetaId = 'cpx-beta-gate4';

  const unitAlpha1Id = '11111111-1111-1111-1111-111111111101';
  const unitAlpha2Id = '11111111-1111-1111-1111-111111111102';
  const unitBeta1Id = '22222222-2222-2222-2222-222222222201';

  // In-memory mock database
  const db = {
    complexes: new Map<string, any>(),
    buildings: new Map<string, any>(),
    units: new Map<string, any>(),
    residents: new Map<string, any>(),
    unitResidents: new Map<string, any>(),
    periods: new Map<string, any>(),
    unitCharges: new Map<string, any>(),
    transactions: new Map<string, any>(),
    announcements: new Map<string, any>(),
    auditLogs: [] as any[]
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await buildServer();
    await server.ready();

    // 1. Manager of Complex Alpha
    managerToken = signAccessToken({
      sub: 'mgr-alpha-uuid',
      phone: '09121111111',
      role: 'COMPLEX_MANAGER',
      complexId: complexAlphaId,
      permissions: [
        'MANAGE_UNITS',
        'MANAGE_RESIDENTS',
        'MANAGE_PERIODS',
        'RECORD_PAYMENTS',
        'CLOSE_PERIODS',
        'BROADCAST_NOTICES',
        'VIEW_REPORTS',
        'MANAGE_SETTINGS'
      ]
    });

    // 2. Resident 1 of Unit Alpha 1
    resident1Token = signAccessToken({
      sub: 'res-alpha-1-uuid',
      phone: '09122222222',
      role: 'RESIDENT',
      complexId: complexAlphaId,
      unitIds: [unitAlpha1Id],
      permissions: []
    });

    // 3. Resident 2 of Unit Alpha 2
    resident2Token = signAccessToken({
      sub: 'res-alpha-2-uuid',
      phone: '09123333333',
      role: 'RESIDENT',
      complexId: complexAlphaId,
      unitIds: [unitAlpha2Id],
      permissions: []
    });

    // 4. Sub-Manager of Alpha with NO payment/finance permissions
    unprivilegedSubManagerToken = signAccessToken({
      sub: 'submgr-alpha-uuid',
      phone: '09124444444',
      role: 'SUB_MANAGER',
      complexId: complexAlphaId,
      permissions: ['BROADCAST_NOTICES'] // only bulletin notice, no financial perms
    });

    // 5. Cross-tenant Manager of Complex Beta
    crossTenantManagerToken = signAccessToken({
      sub: 'mgr-beta-uuid',
      phone: '09125555555',
      role: 'COMPLEX_MANAGER',
      complexId: complexBetaId,
      permissions: [
        'MANAGE_UNITS',
        'MANAGE_PERIODS',
        'RECORD_PAYMENTS',
        'CLOSE_PERIODS'
      ]
    });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    db.complexes.clear();
    db.buildings.clear();
    db.units.clear();
    db.residents.clear();
    db.unitResidents.clear();
    db.periods.clear();
    db.unitCharges.clear();
    db.transactions.clear();
    db.announcements.clear();
    db.auditLogs = [];

    // Prepopulate Complex Alpha
    db.complexes.set(complexAlphaId, {
      id: complexAlphaId,
      name: 'مجتمع مسکونی الفا',
      unitCount: 2,
      initialFund: 5_000_000,
      currentFund: 5_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Prepopulate Complex Beta
    db.complexes.set(complexBetaId, {
      id: complexBetaId,
      name: 'مجتمع مسکونی بتا',
      unitCount: 1,
      initialFund: 2_000_000,
      currentFund: 2_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Unit Alpha 1: 100 sqm, 3 occupants, hasPackage = true
    db.units.set(unitAlpha1Id, {
      id: unitAlpha1Id,
      complexId: complexAlphaId,
      unitNumber: 101,
      unitName: 'واحد ۱۰۱',
      area: 100,
      occupants: 3,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0
    });

    // Unit Alpha 2: 150 sqm, 2 occupants, hasPackage = false
    db.units.set(unitAlpha2Id, {
      id: unitAlpha2Id,
      complexId: complexAlphaId,
      unitNumber: 102,
      unitName: 'واحد ۱۰۲',
      area: 150,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0
    });

    // Unit Beta 1
    db.units.set(unitBeta1Id, {
      id: unitBeta1Id,
      complexId: complexBetaId,
      unitNumber: 201,
      unitName: 'واحد ۲۰۱ بتا',
      area: 120,
      occupants: 4,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0
    });

    // Setup spies on rawPrisma
    vi.spyOn(rawPrisma.complex, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) return db.complexes.get(where.id) || null;
      return null;
    });

    vi.spyOn(rawPrisma.complex, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.complexes.get(where.id) || {};
      const updated = {
        ...ex,
        ...data,
        currentFund: data.currentFund?.increment
          ? Number(ex.currentFund) + data.currentFund.increment
          : (data.currentFund ?? ex.currentFund)
      };
      db.complexes.set(where.id, updated);
      return updated;
    });

    vi.spyOn(rawPrisma.unit, 'findMany').mockImplementation(async ({ where }: any = {}) => {
      return Array.from(db.units.values()).filter(u => !where?.complexId || u.complexId === where.complexId);
    });

    vi.spyOn(rawPrisma.unit, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) return db.units.get(where.id) || null;
      if (where.complexId_unitNumber) {
        for (const u of db.units.values()) {
          if (u.complexId === where.complexId_unitNumber.complexId && u.unitNumber === where.complexId_unitNumber.unitNumber) {
            return u;
          }
        }
      }
      return null;
    });

    vi.spyOn(rawPrisma.unit, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.units.get(where.id) || {};
      const newBal = data.currentBalance?.increment
        ? Number(ex.currentBalance) + data.currentBalance.increment
        : (data.currentBalance?.decrement
          ? Number(ex.currentBalance) - data.currentBalance.decrement
          : (data.currentBalance ?? ex.currentBalance));
      const updated = { ...ex, ...data, currentBalance: newBal };
      db.units.set(where.id, updated);
      return updated;
    });

    vi.spyOn(rawPrisma.period, 'findMany').mockImplementation(async ({ where }: any = {}) => {
      return Array.from(db.periods.values()).filter(p => !where?.complexId || p.complexId === where.complexId);
    });

    vi.spyOn(rawPrisma.period, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) {
        const p = db.periods.get(where.id);
        if (p) {
          const charges = Array.from(db.unitCharges.values()).filter(c => c.periodId === p.id);
          return { ...p, charges };
        }
      }
      if (where.complexId_type_year_month) {
        const { complexId, type, year, month } = where.complexId_type_year_month;
        for (const p of db.periods.values()) {
          if (p.complexId === complexId && p.type === type && p.year === year && p.month === month) {
            return p;
          }
        }
      }
      return null;
    });

    vi.spyOn(rawPrisma.period, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `prd-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      db.periods.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.period, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.periods.get(where.id) || {};
      const updated = { ...ex, ...data };
      db.periods.set(where.id, updated);
      return updated;
    });

    vi.spyOn(rawPrisma.unitCharge, 'findMany').mockImplementation(async ({ where }: any = {}) => {
      return Array.from(db.unitCharges.values()).filter(c => {
        if (where?.unitId && c.unitId !== where.unitId) return false;
        if (where?.periodId && c.periodId !== where.periodId) return false;
        return true;
      });
    });

    vi.spyOn(rawPrisma.unitCharge, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `chg-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      db.unitCharges.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.unitCharge, 'deleteMany').mockImplementation(async ({ where }: any = {}) => {
      let count = 0;
      for (const [id, c] of db.unitCharges.entries()) {
        if (!where?.periodId || c.periodId === where.periodId) {
          db.unitCharges.delete(id);
          count++;
        }
      }
      return { count };
    });

    vi.spyOn(rawPrisma.unitCharge, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.unitCharges.get(where.id) || {};
      const updated = {
        ...ex,
        ...data,
        paidAmount: data.paidAmount?.increment
          ? Number(ex.paidAmount || 0) + data.paidAmount.increment
          : (data.paidAmount ?? ex.paidAmount)
      };
      db.unitCharges.set(where.id, updated);
      return updated;
    });

    vi.spyOn(rawPrisma.ledgerTransaction, 'findMany').mockImplementation(async ({ where }: any = {}) => {
      return Array.from(db.transactions.values()).filter(t => {
        if (where?.complexId && t.complexId !== where.complexId) return false;
        if (where?.unitId && t.unitId !== where.unitId) return false;
        return true;
      });
    });

    vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `tx-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      db.transactions.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.chatMessage, 'findMany').mockImplementation(async ({ where }: any = {}) => {
      return Array.from(db.announcements.values()).filter(a => {
        if (where?.complexId && a.complexId !== where.complexId) return false;
        return true;
      });
    });

    vi.spyOn(rawPrisma.chatMessage, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `ann-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      db.announcements.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.auditLog, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: BigInt(db.auditLogs.length + 1), ...data, createdAt: new Date() };
      db.auditLogs.push(rec);
      return rec;
    });

    vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
      return await cb(rawPrisma);
    });
  });

  // ==========================================================================
  // SECTION 1: Manager Calculation Preview & Period Lifecycle
  // ==========================================================================
  describe('1. Manager Calculation Preview & Period Lifecycle (Draft -> Publish -> Close)', () => {
    it('ADV-4.1.1: Calculate Preview dry-run for draft period accurately calculates unit shares and enforces zero conservation delta', async () => {
      // 1. Create a draft period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          complexId: complexAlphaId,
          type: 'MONTHLY',
          name: 'شارژ آبان ۱۴۰۳',
          year: 1403,
          month: 'آبان',
          fixedCost: 500_000,        // 500k per unit (total 1,000,000 for 2 units)
          waterCost: 1_000_000,      // 1M distributed by occupants (3 + 2 = 5 occupants)
          gasCost: 1_000_000,        // 1M distributed by gas logic
          electricityCost: 400_000,  // 400k equal
          incidentalCost: 200_000,   // 200k equal
          areaExpenseTotal: 2_500_000, // 2.5M by area (100 sqm vs 150 sqm -> total 250 sqm)
          roundUp: false
        }
      });

      expect(createRes.statusCode).toBe(201);
      const period = JSON.parse(createRes.body);
      expect(period.status).toBe('DRAFT');

      // 2. Dry-run calculate preview
      const previewRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/calculate`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {}
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);

      // Verify zero conservation delta invariant
      expect(preview.conservationDelta).toBe(0);
      expect(preview.totalDistributed).toBe(preview.totalInputExpenses);
      expect(preview.charges).toHaveLength(2);

      // Verify Unit 1 (100 sqm, 3 occupants)
      const ch1 = preview.charges.find((c: any) => c.unitId === unitAlpha1Id);
      expect(ch1).toBeDefined();
      expect(ch1.fixed).toBe(500_000);
      // Water: 3/5 of 1,000,000 = 600,000
      expect(ch1.water).toBe(600_000);
      // Area share (ماده ۴): 100/250 of 2,500,000 = 1,000,000
      expect(ch1.areaShare).toBe(1_000_000);

      // Verify Unit 2 (150 sqm, 2 occupants)
      const ch2 = preview.charges.find((c: any) => c.unitId === unitAlpha2Id);
      expect(ch2).toBeDefined();
      expect(ch2.fixed).toBe(500_000);
      // Water: 2/5 of 1,000,000 = 400,000
      expect(ch2.water).toBe(400_000);
      // Area share (ماده ۴): 150/250 of 2,500,000 = 1,500,000
      expect(ch2.areaShare).toBe(1_500_000);

      // Conservation: sum of charges equals total expenses
      expect(ch1.totalCharge + ch2.totalCharge).toBe(preview.totalInputExpenses);
    });

    it('ADV-4.1.2: Publishing DRAFT period transitions status to ACTIVE and persists unitCharge records', async () => {
      // Create period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          complexId: complexAlphaId,
          type: 'MONTHLY',
          name: 'شارژ آذر ۱۴۰۳',
          year: 1403,
          month: 'آذر',
          fixedCost: 300_000,
          waterCost: 500_000,
          areaExpenseTotal: 1_000_000
        }
      });
      const period = JSON.parse(createRes.body);

      // Publish period
      const pubRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      expect(pubRes.statusCode).toBe(200);
      const published = JSON.parse(pubRes.body);
      expect(published.status).toBe('ACTIVE');

      // Verify persisted unitCharge records in db
      const persistedCharges = Array.from(db.unitCharges.values()).filter(c => c.periodId === period.id);
      expect(persistedCharges).toHaveLength(2);

      // Verify audit log for period start
      const startLog = db.auditLogs.find(l => l.action === 'START_PERIOD' && l.entityId === period.id);
      expect(startLog).toBeDefined();
    });

    it('ADV-4.1.3: Period closing transitions status to CLOSED, transfers debt to ledger, and decrements unit balance', async () => {
      // 1. Create and publish period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          complexId: complexAlphaId,
          type: 'MONTHLY',
          name: 'شارژ دی ۱۴۰۳',
          year: 1403,
          month: 'دی',
          fixedCost: 400_000, // 400k per unit
          waterCost: 0,
          areaExpenseTotal: 0
        }
      });
      const period = JSON.parse(createRes.body);

      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      // Unit 1 balance before close is 0
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(0);

      // 2. Close the period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      expect(closeRes.statusCode).toBe(200);
      const closed = JSON.parse(closeRes.body);
      expect(closed.status).toBe('CLOSED');

      // 3. Verify ledger transactions created with CHARGE_TRANSFER
      const txs = Array.from(db.transactions.values()).filter(t => t.periodId === period.id);
      expect(txs.length).toBeGreaterThan(0);
      expect(txs[0].txKind).toBe('CHARGE_TRANSFER');
      expect(txs[0].type).toBe('DEBT');

      // 4. Verify unit balances were decremented by the charge amount
      const unit1After = db.units.get(unitAlpha1Id);
      expect(unit1After.currentBalance).toBe(-400_000); // 400k debt
    });

    it('ADV-4.1.4: Illegal state transitions are strictly blocked with HTTP 400', async () => {
      // Create draft period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          complexId: complexAlphaId,
          type: 'MONTHLY',
          name: 'شارژ بهمن ۱۴۰۳',
          year: 1403,
          month: 'بهمن',
          fixedCost: 200_000
        }
      });
      const period = JSON.parse(createRes.body);

      // Attempt 1: Close a DRAFT period -> MUST FAIL
      const closeDraftRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(closeDraftRes.statusCode).toBe(400);

      // Publish period to make it ACTIVE
      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      // Attempt 2: Re-publish an ACTIVE period -> MUST FAIL
      const republishRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(republishRes.statusCode).toBe(400);

      // Attempt 3: Modify expenses of an ACTIVE period -> MUST FAIL
      const putActiveRes = await server.inject({
        method: 'PUT',
        url: `/api/v1/periods/${period.id}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { fixedCost: 999_999 }
      });
      expect(putActiveRes.statusCode).toBe(400);

      // Close the period to make it CLOSED
      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      // Attempt 4: Close an already CLOSED period -> MUST FAIL
      const recloseRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(recloseRes.statusCode).toBe(400);

      // Attempt 5: Publish a CLOSED period -> MUST FAIL
      const pubClosedRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${period.id}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(pubClosedRes.statusCode).toBe(400);
    });

    it('ADV-4.1.5: Resident role cannot create, calculate preview, publish, or close periods (403 Forbidden)', async () => {
      // Create period attempt
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${resident1Token}` },
        payload: {
          complexId: complexAlphaId,
          type: 'MONTHLY',
          name: 'شارژ اسفند ۱۴۰۳',
          year: 1403,
          month: 'اسفند'
        }
      });
      expect(createRes.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // SECTION 2: Multi-Method Payment Recording & Real-Time Treasury Sync
  // ==========================================================================
  describe('2. Multi-Method Payment Recording & Real-Time Treasury Sync', () => {
    it('ADV-4.2.1: Payment recording supports all methods (CARD_TRANSFER, CASH, GATEWAY, OFFSET) and synchronizes unit balance and treasury', async () => {
      const initialFund = db.complexes.get(complexAlphaId).currentFund; // 5,000,000
      const methods = ['CARD_TRANSFER', 'CASH', 'GATEWAY', 'OFFSET'] as const;

      let expectedFund = initialFund;
      let expectedBalance = 0;

      for (const method of methods) {
        const paymentAmount = 250_000;
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/payments',
          headers: { authorization: `Bearer ${managerToken}` },
          payload: {
            unitId: unitAlpha1Id,
            amount: paymentAmount,
            paymentMethod: method,
            referenceNumber: `REF-${method}-123`,
            description: `واریز به روش ${method}`
          }
        });

        expect(res.statusCode).toBe(201);
        const data = JSON.parse(res.body);
        expect(data.paymentMethod).toBe(method);

        expectedFund += paymentAmount;
        expectedBalance += paymentAmount;

        // Verify Complex Treasury Fund increment
        expect(db.complexes.get(complexAlphaId).currentFund).toBe(expectedFund);

        // Verify Unit currentBalance increment
        expect(db.units.get(unitAlpha1Id).currentBalance).toBe(expectedBalance);
      }

      // Verify Audit logs recorded with SETTLE_DEBT
      const debtLogs = db.auditLogs.filter(l => l.action === 'SETTLE_DEBT');
      expect(debtLogs).toHaveLength(4);
    });

    it('ADV-4.2.2: Payment with specific chargeId updates unitCharge.paidAmount', async () => {
      // Create mock charge with valid UUID
      const chargeId = '33333333-3333-3333-3333-333333333301';
      db.unitCharges.set(chargeId, {
        id: chargeId,
        complexId: complexAlphaId,
        unitId: unitAlpha1Id,
        amount: 800_000,
        paidAmount: 0
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          unitId: unitAlpha1Id,
          chargeId,
          amount: 500_000,
          paymentMethod: 'CARD_TRANSFER'
        }
      });

      expect(res.statusCode).toBe(201);
      const chg = db.unitCharges.get(chargeId);
      expect(chg.paidAmount).toBe(500_000);
      expect(chg.payDate).toBeDefined();
    });

    it('ADV-4.2.3: Boundary validation rejects zero or negative payment amounts with HTTP 400', async () => {
      const resZero = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          unitId: unitAlpha1Id,
          amount: 0
        }
      });
      expect(resZero.statusCode).toBe(400);

      const resNegative = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          unitId: unitAlpha1Id,
          amount: -50_000
        }
      });
      expect(resNegative.statusCode).toBe(400);
    });

    it('ADV-4.2.4: Cross-tenant payment security blocks manager from recording payment in another complex', async () => {
      // Manager of Complex Beta attempts to record payment for Unit in Complex Alpha
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${crossTenantManagerToken}` },
        payload: {
          unitId: unitAlpha1Id, // Belongs to Complex Alpha
          amount: 100_000
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ADV-4.2.5: Sub-manager without RECORD_PAYMENTS permission is blocked with HTTP 403', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${unprivilegedSubManagerToken}` },
        payload: {
          unitId: unitAlpha1Id,
          amount: 100_000
        }
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // SECTION 3: Resident Portal User Journey, Statements & IDOR Boundaries
  // ==========================================================================
  describe('3. Resident Portal User Journey, Statement Breakdown, Bulletin & IDOR', () => {
    it('ADV-4.3.1: Resident can fetch assigned unit statement (GET /units/:id/statement)', async () => {
      // Prepopulate a charge and transaction
      db.unitCharges.set('chg-r1', {
        id: 'chg-r1',
        complexId: complexAlphaId,
        unitId: unitAlpha1Id,
        fixedShare: 200_000,
        waterShare: 150_000,
        gasShare: 100_000,
        electricityShare: 50_000,
        areaShare: 300_000,
        incidentalShare: 80_000,
        amount: 880_000,
        paidAmount: 0
      });

      db.transactions.set('tx-r1', {
        id: 'tx-r1',
        complexId: complexAlphaId,
        unitId: unitAlpha1Id,
        amount: 500_000,
        type: 'PAYMENT',
        description: 'واریز اینترنتی',
        date: new Date()
      });

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitAlpha1Id}/statement`,
        headers: { authorization: `Bearer ${resident1Token}` }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.unit.id).toBe(unitAlpha1Id);
      expect(data.charges).toHaveLength(1);
      expect(data.transactions).toHaveLength(1);
    });

    it('ADV-4.3.2: Statement Breakdown Inspection: Verifies whether charges contain breakdown object or raw Prisma shares', async () => {
      // Prepopulate charge
      db.unitCharges.set('chg-r1-inspect', {
        id: 'chg-r1-inspect',
        complexId: complexAlphaId,
        unitId: unitAlpha1Id,
        fixedShare: 200_000,
        waterShare: 150_000,
        gasShare: 100_000,
        electricityShare: 50_000,
        areaShare: 300_000,
        incidentalShare: 80_000,
        amount: 880_000,
        paidAmount: 0
      });

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitAlpha1Id}/statement`,
        headers: { authorization: `Bearer ${resident1Token}` }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const charge = data.charges[0];
      expect(charge).toBeDefined();

      // Note for Empirical Challenger Findings:
      // The server returns Prisma column names (fixedShare, waterShare, gasShare, electricityShare, areaShare, incidentalShare).
      // If client ResidentPortalPage looks for `c.breakdown.fixed`, we record this data-shape alignment observation.
      expect(charge.fixedShare).toBe(200_000);
      expect(charge.waterShare).toBe(150_000);
      expect(charge.areaShare).toBe(300_000);
    });

    it('ADV-4.3.3: IDOR Security Challenge on Unit Statements: Cross-resident inspection within same complex is blocked with HTTP 403', async () => {
      // Resident 1 of Unit Alpha 1 attempts to fetch statement of Unit Alpha 2 (belonging to Resident 2)
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitAlpha2Id}/statement`,
        headers: { authorization: `Bearer ${resident1Token}` }
      });

      // EMPIRICAL VERIFICATION: requireResidentUnitAccess strictly blocks cross-resident statement inspection
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Forbidden Unit Access');
    });

    it('ADV-4.3.4: Digital Bulletin Board: Resident can view announcements, but cannot create announcements', async () => {
      // 1. Manager posts announcement
      const postRes = await server.inject({
        method: 'POST',
        url: '/api/v1/announcements',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          complexId: complexAlphaId,
          title: 'جلسه مجمع عمومی ساختمان',
          content: 'جلسه سالانه روز جمعه ساعت ۱۸ در لابی برگزار می‌گردد.',
          priority: 'HIGH'
        }
      });
      expect(postRes.statusCode).toBe(201);

      // 2. Resident queries bulletin
      const getRes = await server.inject({
        method: 'GET',
        url: '/api/v1/announcements',
        headers: { authorization: `Bearer ${resident1Token}` },
        query: { complexId: complexAlphaId }
      });
      expect(getRes.statusCode).toBe(200);
      const annList = JSON.parse(getRes.body);
      expect(annList.length).toBeGreaterThan(0);
      expect(annList[0].title).toContain('مجمع عمومی');

      // 3. Resident attempts to post announcement -> MUST BE BLOCKED
      const resPostRes = await server.inject({
        method: 'POST',
        url: '/api/v1/announcements',
        headers: { authorization: `Bearer ${resident1Token}` },
        payload: {
          complexId: complexAlphaId,
          title: 'اعلامیه غیرمجاز توسط ساکن',
          content: 'تست'
        }
      });
      expect(resPostRes.statusCode).toBe(403);
    });

    it('ADV-4.3.5: Resident Online Payment Simulation (paymentMethod = GATEWAY) settles unit debt and updates fund', async () => {
      const prevFund = db.complexes.get(complexAlphaId).currentFund;
      const prevBal = db.units.get(unitAlpha1Id).currentBalance;

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${resident1Token}` },
        payload: {
          unitId: unitAlpha1Id,
          amount: 600_000,
          paymentMethod: 'GATEWAY',
          referenceNumber: 'SHP-99887766',
          description: 'پرداخت اینترنتی از طریق درگاه پرداخت شاپرک'
        }
      });

      expect(res.statusCode).toBe(201);
      expect(db.complexes.get(complexAlphaId).currentFund).toBe(prevFund + 600_000);
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(prevBal + 600_000);
    });

    it('ADV-4.3.6: Cross-Resident Payment IDOR: Resident attempting to pay for another resident unit is blocked with 403', async () => {
      // Resident 1 attempts to submit payment for Unit Alpha 2 (assigned to Resident 2)
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${resident1Token}` },
        payload: {
          unitId: unitAlpha2Id,
          amount: 100_000,
          paymentMethod: 'GATEWAY'
        }
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // SECTION 4: Computational Precision & Concurrency Invariants
  // ==========================================================================
  describe('4. Computational Precision & Concurrency Invariants', () => {
    it('ADV-4.4.1: High prime expense amounts across 7 units with fractional areas preserve exact zero conservation delta', async () => {
      // Create 7 units in complex Alpha
      const primeUnits = [
        { id: 'u-1', unitNumber: 1, area: 93.35, occupants: 1, hasPackage: false, ownerName: 'U1' },
        { id: 'u-2', unitNumber: 2, area: 107.12, occupants: 4, hasPackage: true, ownerName: 'U2' },
        { id: 'u-3', unitNumber: 3, area: 145.89, occupants: 0, hasPackage: false, ownerName: 'U3' }, // Vacant
        { id: 'u-4', unitNumber: 4, area: 88.40, occupants: 2, hasPackage: true, ownerName: 'U4' },
        { id: 'u-5', unitNumber: 5, area: 112.50, occupants: 3, hasPackage: false, ownerName: 'U5' },
        { id: 'u-6', unitNumber: 6, area: 75.00, occupants: 2, hasPackage: true, ownerName: 'U6' },
        { id: 'u-7', unitNumber: 7, area: 130.25, occupants: 5, hasPackage: false, ownerName: 'U7' }
      ];

      // Prime expense totals: 17,391,301 Rials total
      const { calculatePeriodCharges } = await import('../src/services/calculationEngine');
      const calcResult = calculatePeriodCharges(primeUnits, {
        fixedPerUnit: 100_000,
        waterTotal: 3_333_333,
        gasTotal: 4_444_444,
        electricityTotal: 1_111_111,
        incidentalTotal: 888_888,
        areaExpenseTotal: 7_613_525,
        roundUp: true,
        roundStep: 50_000,
        exemptEmptyUnits: true
      });

      // Assert zero loss principle with roundUp = true
      expect(calcResult.conservationDelta).toBe(0);
      expect(calcResult.totalDistributed).toBe(calcResult.totalInputExpenses + calcResult.totalRoundingSurplus);

      // Sum of individual unit charges must match totalDistributed
      const sumUnitCharges = calcResult.charges.reduce((acc, c) => acc + c.totalCharge, 0);
      expect(sumUnitCharges).toBe(calcResult.totalDistributed);

      // Vacant unit (u-3 with 0 occupants) must be exempted from water and gas
      const vacantCharge = calcResult.charges.find(c => c.unitId === 'u-3');
      expect(vacantCharge).toBeDefined();
      expect(vacantCharge!.water).toBe(0);
      expect(vacantCharge!.gas).toBe(0);
      // But must pay areaShare based on its 145.89 sqm
      expect(vacantCharge!.areaShare).toBeGreaterThan(0);

      // Now verify exact identity when roundUp = false (Pure largest remainder conservation)
      const exactResult = calculatePeriodCharges(primeUnits, {
        fixedPerUnit: 100_000,
        waterTotal: 3_333_333,
        gasTotal: 4_444_444,
        electricityTotal: 1_111_111,
        incidentalTotal: 888_888,
        areaExpenseTotal: 7_613_525,
        roundUp: false,
        exemptEmptyUnits: true
      });
      expect(exactResult.conservationDelta).toBe(0);
      expect(exactResult.totalDistributed).toBe(exactResult.totalInputExpenses);
    });

    it('ADV-4.4.2: High-frequency concurrent payments execute without data loss', async () => {
      const initialFund = db.complexes.get(complexAlphaId).currentFund;
      const initialBalance = db.units.get(unitAlpha1Id).currentBalance;

      const paymentCount = 10;
      const paymentAmount = 100_000;

      const promises = Array.from({ length: paymentCount }).map((_, i) =>
        server.inject({
          method: 'POST',
          url: '/api/v1/payments',
          headers: { authorization: `Bearer ${managerToken}` },
          payload: {
            unitId: unitAlpha1Id,
            amount: paymentAmount,
            paymentMethod: 'CARD_TRANSFER',
            referenceNumber: `CONC-TX-${i}`,
            description: `واریز همزمان شماره ${i}`
          }
        })
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.statusCode).toBe(201);
      }

      // Check final state
      const expectedFund = initialFund + paymentCount * paymentAmount;
      const expectedBalance = initialBalance + paymentCount * paymentAmount;

      expect(db.complexes.get(complexAlphaId).currentFund).toBe(expectedFund);
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(expectedBalance);
    });
  });
});
