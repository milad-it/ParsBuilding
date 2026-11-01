/**
 * Adversarial Verification Test Suite: Milestone 3 Accounting Math & Migration Route Security
 *
 * M3 Challenger 2 Empirical Test Harness:
 * 1. DEFECT-M3-01 Empirical Stress Testing:
 *    - Mathematical conservation: B_final = B_0 + P - C
 *    - Zero-payment scenario (P = 0)
 *    - Partial-payment scenario (0 < P < C)
 *    - Exact full-payment scenario (P = C)
 *    - Overpayment scenario (P > C)
 *    - Initial balance variations: initial debt (B_0 < 0), initial credit (B_0 > 0)
 *    - Heterogeneous multi-unit parallel period close
 *    - Idempotency & state protection: double-closing and post-close mutations blocked
 * 2. Cross-Tenant IDOR & Security Hardening on Migration REST Routes:
 *    - Cross-tenant POST /migration/import -> HTTP 403 Forbidden
 *    - Cross-tenant POST /complexes/:id/migrate -> HTTP 403 Forbidden
 *    - Unauthenticated requests -> HTTP 401 Unauthorized / 400 Tenant Missing
 *    - RESIDENT privilege escalation probe -> HTTP 403 Forbidden
 *    - Sub-manager missing MANAGE_SETTINGS/FINANCES probe -> HTTP 403 Forbidden
 *    - Legitimate manager & SUPER_ADMIN routes -> HTTP 200 OK
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';

describe('Tier 5 Adversarial Verification: M3 Accounting Math (DEFECT-M3-01) & Migration Security', () => {
  let server: FastifyInstance;

  // Tenant identifiers
  const complexAlpha = 'cpx-alpha-challenger';
  const complexBeta = 'cpx-beta-target';

  const bldAlphaId = '10000000-0000-0000-0000-000000000001';
  const bldBetaId = '10000000-0000-0000-0000-000000000002';

  // Unit IDs in Complex Alpha (valid UUIDs)
  const unitZeroPay = '20000000-0000-0000-0000-000000000101';
  const unitPartialPay = '20000000-0000-0000-0000-000000000102';
  const unitFullPay = '20000000-0000-0000-0000-000000000103';
  const unitOverPay = '20000000-0000-0000-0000-000000000104';
  const unitInitDebt = '20000000-0000-0000-0000-000000000105';
  const unitInitCredit = '20000000-0000-0000-0000-000000000106';

  // Unit ID in Complex Beta
  const unitBeta1 = '20000000-0000-0000-0000-000000000201';

  // Tokens
  let tokenManagerAlpha: string;
  let tokenManagerBeta: string;
  let tokenSuperAdmin: string;
  let tokenResidentAlpha: string;
  let tokenSubManagerRestricted: string;

  // In-memory data store for deterministic empirical testing
  const db = {
    complexes: new Map<string, any>(),
    buildings: new Map<string, any>(),
    units: new Map<string, any>(),
    residents: new Map<string, any>(),
    unitResidents: new Map<string, any>(),
    periods: new Map<string, any>(),
    unitCharges: new Map<string, any>(),
    transactions: new Map<string, any>(),
    auditLogs: [] as any[]
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await buildServer();
    await server.ready();

    // 1. Manager of Alpha
    tokenManagerAlpha = signAccessToken({
      sub: 'usr-mgr-alpha',
      phone: '09121111111',
      role: 'COMPLEX_MANAGER',
      complexId: complexAlpha,
      permissions: [
        'MANAGE_UNITS',
        'MANAGE_RESIDENTS',
        'MANAGE_PERIODS',
        'RECORD_PAYMENTS',
        'CLOSE_PERIODS',
        'VIEW_REPORTS',
        'MANAGE_SETTINGS',
        'MANAGE_FINANCES'
      ]
    });

    // 2. Manager of Beta
    tokenManagerBeta = signAccessToken({
      sub: 'usr-mgr-beta',
      phone: '09122222222',
      role: 'COMPLEX_MANAGER',
      complexId: complexBeta,
      permissions: [
        'MANAGE_UNITS',
        'MANAGE_RESIDENTS',
        'MANAGE_PERIODS',
        'RECORD_PAYMENTS',
        'CLOSE_PERIODS',
        'VIEW_REPORTS',
        'MANAGE_SETTINGS',
        'MANAGE_FINANCES'
      ]
    });

    // 3. Super Admin
    tokenSuperAdmin = signAccessToken({
      sub: 'usr-super-admin',
      phone: '09120000000',
      role: 'SUPER_ADMIN',
      permissions: ['*']
    });

    // 4. Resident in Alpha
    tokenResidentAlpha = signAccessToken({
      sub: 'usr-res-alpha',
      phone: '09123333333',
      role: 'RESIDENT',
      complexId: complexAlpha,
      permissions: []
    });

    // 5. Sub-Manager in Alpha without settings/finances
    tokenSubManagerRestricted = signAccessToken({
      sub: 'usr-sub-restricted',
      phone: '09124444444',
      role: 'SUB_MANAGER',
      complexId: complexAlpha,
      permissions: ['VIEW_REPORTS', 'BROADCAST_NOTICES']
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
    db.auditLogs = [];

    // Prepopulate Complex Alpha
    db.complexes.set(complexAlpha, {
      id: complexAlpha,
      slug: 'complex-alpha',
      name: 'مجتمع آلفا',
      unitCount: 6,
      initialFund: 10_000_000,
      currentFund: 10_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Prepopulate Complex Beta
    db.complexes.set(complexBeta, {
      id: complexBeta,
      slug: 'complex-beta',
      name: 'مجتمع بتا',
      unitCount: 1,
      initialFund: 5_000_000,
      currentFund: 5_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Buildings
    db.buildings.set(bldAlphaId, {
      id: bldAlphaId,
      complexId: complexAlpha,
      name: 'بلوک ۱',
      floorsCount: 3,
      unitsCount: 6,
      _count: { units: 6 }
    });

    db.buildings.set(bldBetaId, {
      id: bldBetaId,
      complexId: complexBeta,
      name: 'بلوک بتا',
      floorsCount: 1,
      unitsCount: 1,
      _count: { units: 1 }
    });

    // Units in Alpha
    db.units.set(unitZeroPay, {
      id: unitZeroPay,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 101,
      unitName: 'واحد ۱۰۱ (پرداخت صفر)',
      area: 80,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitPartialPay, {
      id: unitPartialPay,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 102,
      unitName: 'واحد ۱۰۲ (پرداخت ناقص)',
      area: 100,
      occupants: 3,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitFullPay, {
      id: unitFullPay,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 103,
      unitName: 'واحد ۱۰۳ (پرداخت کامل)',
      area: 120,
      occupants: 4,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitOverPay, {
      id: unitOverPay,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 104,
      unitName: 'واحد ۱۰۴ (بیش‌پرداخت)',
      area: 140,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitInitDebt, {
      id: unitInitDebt,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 105,
      unitName: 'واحد ۱۰۵ (بدهی قبلی)',
      area: 90,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: -250_000, // Starting debt: -250,000
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitInitCredit, {
      id: unitInitCredit,
      complexId: complexAlpha,
      buildingId: bldAlphaId,
      unitNumber: 106,
      unitName: 'واحد ۱۰۶ (بستانکاری قبلی)',
      area: 90,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 400_000, // Starting credit: +400,000
      _count: { transactions: 0, charges: 0 }
    });

    // Unit in Beta
    db.units.set(unitBeta1, {
      id: unitBeta1,
      complexId: complexBeta,
      buildingId: bldBetaId,
      unitNumber: 201,
      unitName: 'واحد ۲۰۱ بتا',
      area: 100,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    // Prisma Mocks
    vi.spyOn(rawPrisma.complex, 'findMany').mockImplementation(async () => Array.from(db.complexes.values()));
    vi.spyOn(rawPrisma.complex, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) return db.complexes.get(where.id) || null;
      if (where.slug) {
        for (const c of db.complexes.values()) if (c.slug === where.slug) return c;
      }
      return null;
    });
    vi.spyOn(rawPrisma.complex, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: data.id || `cpx-${Date.now()}-${Math.random()}`, ...data };
      db.complexes.set(rec.id, rec);
      return rec;
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

    vi.spyOn(rawPrisma.building, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.buildings.values());
      if (where?.complexId) items = items.filter(b => b.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.building, 'findFirst').mockImplementation(async ({ where }: any) => {
      for (const b of db.buildings.values()) {
        if (!where?.complexId || b.complexId === where.complexId) return b;
      }
      return null;
    });
    vi.spyOn(rawPrisma.building, 'findUnique').mockImplementation(async ({ where }: any) => db.buildings.get(where.id) || null);
    vi.spyOn(rawPrisma.building, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `bld-${Date.now()}-${Math.random()}`, _count: { units: 0 }, ...data };
      db.buildings.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.unit, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.units.values());
      if (where?.complexId) items = items.filter(u => u.complexId === where.complexId);
      if (where?.id?.in) items = items.filter(u => where.id.in.includes(u.id));
      return items;
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
    vi.spyOn(rawPrisma.unit, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), _count: { transactions: 0, charges: 0 }, ...data };
      db.units.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.unit, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { complexId, unitNumber } = where.complexId_unitNumber;
      for (const u of db.units.values()) {
        if (u.complexId === complexId && u.unitNumber === unitNumber) {
          const upd = { ...u, ...update };
          db.units.set(u.id, upd);
          return upd;
        }
      }
      const rec = { id: `unit-${Date.now()}-${Math.random()}`, _count: { transactions: 0, charges: 0 }, ...create };
      db.units.set(rec.id, rec);
      return rec;
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

    vi.spyOn(rawPrisma.resident, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.residents.values());
      if (where?.complexId) items = items.filter(r => r.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.resident, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) return db.residents.get(where.id) || null;
      if (where.complexId_phone) {
        for (const r of db.residents.values()) {
          if (r.complexId === where.complexId_phone.complexId && r.phone === where.complexId_phone.phone) {
            return r;
          }
        }
      }
      return null;
    });
    vi.spyOn(rawPrisma.resident, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), ...data };
      db.residents.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.resident, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { complexId, phone } = where.complexId_phone;
      for (const r of db.residents.values()) {
        if (r.complexId === complexId && r.phone === phone) {
          const upd = { ...r, ...update };
          db.residents.set(r.id, upd);
          return upd;
        }
      }
      const rec = { id: `res-${Date.now()}-${Math.random()}`, ...create };
      db.residents.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.unitResident, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { complexId, unitId, residentId } = where.complexId_unitId_residentId;
      const key = `${complexId}_${unitId}_${residentId}`;
      const ex = db.unitResidents.get(key);
      if (ex) {
        const upd = { ...ex, ...update };
        db.unitResidents.set(key, upd);
        return upd;
      }
      const rec = { id: `ur-${Date.now()}-${Math.random()}`, ...create };
      db.unitResidents.set(key, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.period, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.periods.values());
      if (where?.complexId) items = items.filter(p => p.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.period, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) {
        const p = db.periods.get(where.id);
        if (p) {
          const charges = Array.from(db.unitCharges.values()).filter(c => c.periodId === p.id);
          return { ...p, charges };
        }
      }
      return null;
    });
    vi.spyOn(rawPrisma.period, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), ...data };
      db.periods.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.period, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { complexId, type, year, month } = where.complexId_type_year_month;
      for (const p of db.periods.values()) {
        if (p.complexId === complexId && p.type === type && p.year === year && p.month === month) {
          const upd = { ...p, ...update };
          db.periods.set(p.id, upd);
          return upd;
        }
      }
      const rec = { id: `prd-${Date.now()}-${Math.random()}`, ...create };
      db.periods.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.period, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.periods.get(where.id) || {};
      const updated = { ...ex, ...data };
      db.periods.set(where.id, updated);
      return updated;
    });
    vi.spyOn(rawPrisma.period, 'deleteMany').mockImplementation(async () => ({ count: 0 }));

    vi.spyOn(rawPrisma.unitCharge, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.unitCharges.values());
      if (where?.complexId) items = items.filter(c => c.complexId === where.complexId);
      if (where?.periodId) items = items.filter(c => c.periodId === where.periodId);
      if (where?.unitId?.in) items = items.filter(c => where.unitId.in.includes(c.unitId));
      else if (where?.unitId) items = items.filter(c => c.unitId === where.unitId);
      return items;
    });
    vi.spyOn(rawPrisma.unitCharge, 'findUnique').mockImplementation(async ({ where }: any) => db.unitCharges.get(where.id) || null);
    vi.spyOn(rawPrisma.unitCharge, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), ...data };
      db.unitCharges.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.unitCharge, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { periodId, unitId } = where.periodId_unitId;
      for (const ch of db.unitCharges.values()) {
        if (ch.periodId === periodId && ch.unitId === unitId) {
          const upd = { ...ch, ...update };
          db.unitCharges.set(ch.id, upd);
          return upd;
        }
      }
      const rec = { id: `chg-${Date.now()}-${Math.random()}`, ...create };
      db.unitCharges.set(rec.id, rec);
      return rec;
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
    vi.spyOn(rawPrisma.unitCharge, 'deleteMany').mockImplementation(async ({ where }: any) => {
      let count = 0;
      for (const [id, c] of db.unitCharges.entries()) {
        if (c.periodId === where.periodId) {
          db.unitCharges.delete(id);
          count++;
        }
      }
      return { count };
    });

    vi.spyOn(rawPrisma.ledgerTransaction, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.transactions.values());
      if (where?.complexId) items = items.filter(t => t.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.ledgerTransaction, 'count').mockImplementation(async () => db.transactions.size);
    vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), ...data };
      db.transactions.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.ledgerTransaction, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { transactionId } = where;
      for (const t of db.transactions.values()) {
        if (t.transactionId === transactionId) {
          const upd = { ...t, ...update };
          db.transactions.set(t.id, upd);
          return upd;
        }
      }
      const rec = { id: `tx-${Date.now()}-${Math.random()}`, ...create };
      db.transactions.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.ledgerTransaction, 'deleteMany').mockImplementation(async () => ({ count: 0 }));

    vi.spyOn(rawPrisma.auditLog, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: BigInt(db.auditLogs.length + 1), ...data, createdAt: new Date() };
      db.auditLogs.push(rec);
      return rec;
    });

    vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
      return await cb(rawPrisma);
    });
  });

  // =========================================================================
  // SECTION 1: DEFECT-M3-01 EMPIRICAL RESOLUTION HARNESS
  // Conservation Invariant: B_final = B_0 + P - C
  // =========================================================================
  describe('Challenge 1: DEFECT-M3-01 Period Close Accounting Conservation (B_final = B_0 + P - C)', () => {
    it('ADV-1.1 [Zero-Payment Scenario, P = 0]: B_final MUST equal B_0 - C with zero double-crediting', async () => {
      const periodId = '30000000-0000-0000-0000-000000000001';
      const chargeAmount = 500_000;

      // Create ACTIVE Period and UnitCharge
      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره پرداخت صفر',
        status: 'ACTIVE',
        year: 1403,
        month: '09'
      });

      const chargeId = '40000000-0000-0000-0000-000000000001';
      db.unitCharges.set(chargeId, {
        id: chargeId,
        complexId: complexAlpha,
        periodId,
        unitId: unitZeroPay,
        amount: chargeAmount,
        paidAmount: 0
      });

      const initialBal = db.units.get(unitZeroPay).currentBalance; // 0
      expect(initialBal).toBe(0);

      // Close period directly (zero payments made)
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        }
      });

      expect(closeRes.statusCode).toBe(200);
      expect(closeRes.json().status).toBe('CLOSED');

      // Assert Mathematical Conservation: B_final = 0 + 0 - 500,000 = -500,000
      const finalBal = db.units.get(unitZeroPay).currentBalance;
      const expectedFinal = initialBal + 0 - chargeAmount;
      expect(finalBal).toBe(expectedFinal);
      expect(finalBal).toBe(-500_000);

      // Verify CHARGE_TRANSFER transaction recorded
      const transfers = Array.from(db.transactions.values()).filter(t => t.periodId === periodId && t.unitId === unitZeroPay);
      expect(transfers.length).toBe(1);
      expect(transfers[0].txKind).toBe('CHARGE_TRANSFER');
      expect(transfers[0].type).toBe('DEBT');
      expect(Number(transfers[0].amount)).toBe(chargeAmount);
    });

    it('ADV-1.2 [Partial-Payment Scenario, 0 < P < C]: B_final MUST equal -(C - P), eliminating DEFECT-M3-01 double-crediting', async () => {
      const periodId = '30000000-0000-0000-0000-000000000002';
      const chargeAmount = 1_000_000;
      const partialPayment = 400_000;

      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره پرداخت ناقص',
        status: 'ACTIVE',
        year: 1403,
        month: '09'
      });

      const chargeId = '40000000-0000-0000-0000-000000000002';
      db.unitCharges.set(chargeId, {
        id: chargeId,
        complexId: complexAlpha,
        periodId,
        unitId: unitPartialPay,
        amount: chargeAmount,
        paidAmount: 0
      });

      const initialBal = db.units.get(unitPartialPay).currentBalance; // 0
      expect(initialBal).toBe(0);

      // Make partial payment of 400,000 Rials
      const payRes = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          unitId: unitPartialPay,
          periodId,
          chargeId,
          amount: partialPayment,
          paymentMethod: 'CARD_TRANSFER',
          description: 'پرداخت ناقص شارژ'
        }
      });
      expect(payRes.statusCode).toBe(201);

      // Verify interim balance is +400,000
      expect(db.units.get(unitPartialPay).currentBalance).toBe(partialPayment);

      // Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        }
      });
      expect(closeRes.statusCode).toBe(200);

      // EMPIRICAL CHALLENGE ASSERTION:
      // In DEFECT-M3-01, unit balance became: +400,000 - (1,000,000 - 400,000) = -200,000 (double-credit +400,000).
      // Correct conservation: B_final = 0 + 400,000 - 1,000,000 = -600,000.
      const finalBal = db.units.get(unitPartialPay).currentBalance;
      const expectedFinal = initialBal + partialPayment - chargeAmount;
      expect(finalBal).toBe(expectedFinal);
      expect(finalBal).toBe(-600_000);

      // Confirm zero delta
      const doubleCreditingDelta = finalBal - expectedFinal;
      expect(doubleCreditingDelta).toBe(0);
    });

    it('ADV-1.3 [Full-Payment Scenario, P = C]: B_final MUST equal 0 (zero phantom credit)', async () => {
      const periodId = '30000000-0000-0000-0000-000000000003';
      const chargeAmount = 750_000;
      const fullPayment = 750_000;

      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره تسویه کامل',
        status: 'ACTIVE',
        year: 1403,
        month: '09'
      });

      const chargeId = '40000000-0000-0000-0000-000000000003';
      db.unitCharges.set(chargeId, {
        id: chargeId,
        complexId: complexAlpha,
        periodId,
        unitId: unitFullPay,
        amount: chargeAmount,
        paidAmount: 0
      });

      const initialBal = db.units.get(unitFullPay).currentBalance; // 0
      expect(initialBal).toBe(0);

      // Pay exact full charge
      const payRes = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          unitId: unitFullPay,
          periodId,
          chargeId,
          amount: fullPayment,
          paymentMethod: 'GATEWAY',
          description: 'تسویه کامل شارژ'
        }
      });
      expect(payRes.statusCode).toBe(201);
      expect(db.units.get(unitFullPay).currentBalance).toBe(fullPayment);

      // Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        }
      });
      expect(closeRes.statusCode).toBe(200);

      // EMPIRICAL CHALLENGE ASSERTION:
      // In DEFECT-M3-01, unpaid was 0, so no debit occurred, leaving phantom credit +750,000!
      // Correct conservation: B_final = 0 + 750,000 - 750,000 = 0.
      const finalBal = db.units.get(unitFullPay).currentBalance;
      const expectedFinal = initialBal + fullPayment - chargeAmount;
      expect(finalBal).toBe(expectedFinal);
      expect(finalBal).toBe(0);
    });

    it('ADV-1.4 [Overpayment Scenario, P > C]: B_final MUST equal +(P - C) as authentic credit balance', async () => {
      const periodId = '30000000-0000-0000-0000-000000000004';
      const chargeAmount = 500_000;
      const overPayment = 850_000; // 350,000 Rials overpayment

      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره بیش‌پرداخت',
        status: 'ACTIVE',
        year: 1403,
        month: '09'
      });

      const chargeId = '40000000-0000-0000-0000-000000000004';
      db.unitCharges.set(chargeId, {
        id: chargeId,
        complexId: complexAlpha,
        periodId,
        unitId: unitOverPay,
        amount: chargeAmount,
        paidAmount: 0
      });

      const initialBal = db.units.get(unitOverPay).currentBalance; // 0
      expect(initialBal).toBe(0);

      // Resident overpays
      const payRes = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          unitId: unitOverPay,
          periodId,
          chargeId,
          amount: overPayment,
          paymentMethod: 'CASH',
          description: 'پرداخت با مازاد جهت شارژ ماه بعد'
        }
      });
      expect(payRes.statusCode).toBe(201);
      expect(db.units.get(unitOverPay).currentBalance).toBe(overPayment);

      // Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        }
      });
      expect(closeRes.statusCode).toBe(200);

      // EMPIRICAL CHALLENGE ASSERTION:
      // Correct conservation: B_final = 0 + 850,000 - 500,000 = +350,000.
      const finalBal = db.units.get(unitOverPay).currentBalance;
      const expectedFinal = initialBal + overPayment - chargeAmount;
      expect(finalBal).toBe(expectedFinal);
      expect(finalBal).toBe(350_000);
    });

    it('ADV-1.5 [Pre-existing Debt & Credit Boundary Tests]: B_final = B_0 + P - C holds for non-zero initial balances', async () => {
      const periodId = '30000000-0000-0000-0000-000000000005';
      const chargeDebt = 400_000;
      const chargeCredit = 300_000;

      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره مانده‌های قبلی',
        status: 'ACTIVE',
        year: 1403,
        month: '09'
      });

      const chgDebtId = '40000000-0000-0000-0000-000000000005';
      db.unitCharges.set(chgDebtId, {
        id: chgDebtId,
        complexId: complexAlpha,
        periodId,
        unitId: unitInitDebt,
        amount: chargeDebt,
        paidAmount: 0
      });

      const chgCreditId = '40000000-0000-0000-0000-000000000006';
      db.unitCharges.set(chgCreditId, {
        id: chgCreditId,
        complexId: complexAlpha,
        periodId,
        unitId: unitInitCredit,
        amount: chargeCredit,
        paidAmount: 0
      });

      // Unit 105 starts with B_0 = -250,000. Pays 300,000.
      const initialBalDebt = db.units.get(unitInitDebt).currentBalance;
      expect(initialBalDebt).toBe(-250_000);

      const payRes105 = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          unitId: unitInitDebt,
          periodId,
          chargeId: chgDebtId,
          amount: 300_000,
          paymentMethod: 'CARD_TRANSFER'
        }
      });
      expect(payRes105.statusCode).toBe(201);
      expect(db.units.get(unitInitDebt).currentBalance).toBe(-250_000 + 300_000); // +50,000

      // Unit 106 starts with B_0 = +400,000 credit. Pays 0 (relies on prior credit).
      const initialBalCredit = db.units.get(unitInitCredit).currentBalance;
      expect(initialBalCredit).toBe(400_000);

      // Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`,
          'x-complex-id': complexAlpha
        }
      });
      expect(closeRes.statusCode).toBe(200);

      // Invariants:
      // Unit 105: B_final = -250,000 + 300,000 - 400,000 = -350,000
      const finalBal105 = db.units.get(unitInitDebt).currentBalance;
      expect(finalBal105).toBe(initialBalDebt + 300_000 - chargeDebt);
      expect(finalBal105).toBe(-350_000);

      // Unit 106: B_final = +400,000 + 0 - 300,000 = +100,000
      const finalBal106 = db.units.get(unitInitCredit).currentBalance;
      expect(finalBal106).toBe(initialBalCredit + 0 - chargeCredit);
      expect(finalBal106).toBe(100_000);
    });

    it('ADV-1.6 [Heterogeneous Complex Invariant]: Multi-unit parallel payments & period close conserve balances and treasury funds', async () => {
      // In this test, we execute a multi-unit period with all 4 payment modes simultaneously:
      const periodId = '30000000-0000-0000-0000-000000000006';
      db.periods.set(periodId, {
        id: periodId,
        complexId: complexAlpha,
        name: 'دوره چند واحدی همزمان',
        status: 'ACTIVE',
        year: 1403,
        month: '10'
      });

      const chargeAmount = 1_000_000;
      const chg1 = '40000000-0000-0000-0000-000000000011';
      const chg2 = '40000000-0000-0000-0000-000000000012';
      const chg3 = '40000000-0000-0000-0000-000000000013';
      const chg4 = '40000000-0000-0000-0000-000000000014';

      db.unitCharges.set(chg1, { id: chg1, complexId: complexAlpha, periodId, unitId: unitZeroPay, amount: chargeAmount, paidAmount: 0 });
      db.unitCharges.set(chg2, { id: chg2, complexId: complexAlpha, periodId, unitId: unitPartialPay, amount: chargeAmount, paidAmount: 0 });
      db.unitCharges.set(chg3, { id: chg3, complexId: complexAlpha, periodId, unitId: unitFullPay, amount: chargeAmount, paidAmount: 0 });
      db.unitCharges.set(chg4, { id: chg4, complexId: complexAlpha, periodId, unitId: unitOverPay, amount: chargeAmount, paidAmount: 0 });

      const initialFund = db.complexes.get(complexAlpha).currentFund;

      // Unit 1: 0 payment
      // Unit 2: 400,000 payment
      await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${tokenManagerAlpha}`, 'x-complex-id': complexAlpha },
        payload: { unitId: unitPartialPay, periodId, chargeId: chg2, amount: 400_000, paymentMethod: 'CARD_TRANSFER' }
      });

      // Unit 3: 1,000,000 payment
      await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${tokenManagerAlpha}`, 'x-complex-id': complexAlpha },
        payload: { unitId: unitFullPay, periodId, chargeId: chg3, amount: 1_000_000, paymentMethod: 'GATEWAY' }
      });

      // Unit 4: 1,300,000 payment (300,000 overpayment)
      await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { authorization: `Bearer ${tokenManagerAlpha}`, 'x-complex-id': complexAlpha },
        payload: { unitId: unitOverPay, periodId, chargeId: chg4, amount: 1_300_000, paymentMethod: 'CASH' }
      });

      // Verify intermediate treasury increment
      const totalPayments = 400_000 + 1_000_000 + 1_300_000;
      expect(db.complexes.get(complexAlpha).currentFund).toBe(initialFund + totalPayments);

      // Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: { authorization: `Bearer ${tokenManagerAlpha}`, 'x-complex-id': complexAlpha }
      });
      expect(closeRes.statusCode).toBe(200);
      expect(closeRes.json().totalCollectedAmount).toBe(totalPayments);

      // Conservation on all 4 units:
      // Unit 1: B_0 + P - C = 0 + 0 - 1,000,000 = -1,000,000
      expect(db.units.get(unitZeroPay).currentBalance).toBe(-1_000_000);
      // Unit 2: B_0 + P - C = 0 + 400,000 - 1,000,000 = -600,000
      expect(db.units.get(unitPartialPay).currentBalance).toBe(-600_000);
      // Unit 3: B_0 + P - C = 0 + 1,000,000 - 1,000,000 = 0
      expect(db.units.get(unitFullPay).currentBalance).toBe(0);
      // Unit 4: B_0 + P - C = 0 + 1,300,000 - 1,000,000 = +300,000
      expect(db.units.get(unitOverPay).currentBalance).toBe(300_000);

      // Attempt double closing -> MUST be blocked (HTTP 400)
      const doubleCloseRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: { authorization: `Bearer ${tokenManagerAlpha}`, 'x-complex-id': complexAlpha }
      });
      expect(doubleCloseRes.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // SECTION 2: CROSS-TENANT IDOR & SECURITY ON MIGRATION REST ROUTES
  // =========================================================================
  describe('Challenge 2: Cross-Tenant IDOR Protection & Authorization Guards on Migration Routes', () => {
    it('ADV-2.1 [Cross-Tenant Migration Probe 1]: Manager of Complex Alpha attempting migration with body.complexId = Beta MUST return HTTP 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`, // user.complexId === complexAlpha
          'x-complex-id': complexAlpha
        },
        payload: {
          complexId: complexBeta, // Attacking target complex Beta!
          initialFund: 0,
          units: [{ vahed: 1, metraj: 85 }],
          periods: []
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/forbidden');
      expect(problem.status).toBe(403);
      expect(problem.detail).toMatch(/Cross-tenant migration forbidden/i);
    });

    it('ADV-2.2 [Cross-Tenant Migration Probe 2]: Manager of Complex Alpha attempting POST /complexes/cpx-beta/migrate MUST return HTTP 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/complexes/${complexBeta}/migrate`,
        headers: {
          authorization: `Bearer ${tokenManagerAlpha}`, // user.complexId === complexAlpha
          'x-complex-id': complexAlpha
        },
        payload: {
          initialFund: 0,
          units: [{ vahed: 1, metraj: 85 }],
          periods: []
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/forbidden');
      expect(problem.status).toBe(403);
      expect(problem.detail).toMatch(/Cross-tenant migration forbidden/i);
    });

    it('ADV-2.3 [Unauthenticated Probe]: Request without Bearer token to /api/v1/migration/import MUST return HTTP 401 Unauthorized', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          'x-complex-id': complexAlpha
        },
        payload: {
          complexId: complexAlpha,
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/unauthorized');
      expect(problem.status).toBe(401);
    });

    it('ADV-2.4 [Unauthenticated Scoped Probe]: Request without Bearer token to /complexes/:id/migrate MUST return HTTP 401 Unauthorized', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/complexes/${complexAlpha}/migrate`,
        headers: {
          'x-complex-id': complexAlpha
        },
        payload: {
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/unauthorized');
      expect(problem.status).toBe(401);
    });

    it('ADV-2.5 [Missing Tenant Context Probe]: Request with no token and no header MUST return 400 Problem Details', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        payload: {
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/tenant-context-missing');
      expect(problem.status).toBe(400);
    });

    it('ADV-2.6 [Privilege Escalation Probe]: RESIDENT role attempting migration MUST return HTTP 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${tokenResidentAlpha}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          complexId: complexAlpha,
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/forbidden');
      expect(problem.detail).toMatch(/managerial privileges/i);
    });

    it('ADV-2.7 [Sub-Manager RBAC Bitmask Probe]: Sub-manager lacking MANAGE_SETTINGS / MANAGE_FINANCES MUST return HTTP 403', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${tokenSubManagerRestricted}`,
          'x-complex-id': complexAlpha
        },
        payload: {
          complexId: complexAlpha,
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/forbidden');
      expect(problem.detail).toMatch(/managerial privileges/i);
    });

    it('ADV-2.8 [Legitimate Manager]: Manager migrating own complex MUST succeed (HTTP 200)', async () => {
      const freshComplexId = 'cpx-fresh-manager-migrate';
      const tokenFreshManager = signAccessToken({
        sub: 'usr-mgr-fresh',
        phone: '09128888888',
        role: 'COMPLEX_MANAGER',
        complexId: freshComplexId,
        permissions: ['MANAGE_SETTINGS', 'MANAGE_FINANCES']
      });

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/complexes/${freshComplexId}/migrate`,
        headers: {
          authorization: `Bearer ${tokenFreshManager}`,
          'x-complex-id': freshComplexId
        },
        payload: {
          initialFund: 10_000_000,
          expectedEndingFund: 10_000_000,
          units: [{ vahed: 1, metraj: 80, balance: 0 }],
          periods: []
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.fundDiscrepancy).toBe(0);
      expect(body.debtDiscrepancy).toBe(0);
    });

    it('ADV-2.9 [Super Admin Override]: SUPER_ADMIN can execute migration across any complex (HTTP 200)', async () => {
      const targetComplex = 'cpx-super-admin-target';
      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/complexes/${targetComplex}/migrate`,
        headers: {
          authorization: `Bearer ${tokenSuperAdmin}`,
          'x-complex-id': targetComplex
        },
        payload: {
          initialFund: 5_000_000,
          expectedEndingFund: 5_000_000,
          units: [{ vahed: 1, metraj: 90, balance: 0 }],
          periods: []
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.fundDiscrepancy).toBe(0);
      expect(body.debtDiscrepancy).toBe(0);
    });
  });
});
