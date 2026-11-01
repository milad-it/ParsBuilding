/**
 * Fastify Domain REST APIs Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';

describe('Fastify Domain REST APIs Integration', () => {
  let server: FastifyInstance;
  let managerToken: string;
  let superAdminToken: string;
  const testComplexId = 'cpx-domain-test';
  const testUnitId = '00000000-0000-0000-0000-000000000101';

  // In-memory data store for API testing
  const db = {
    complexes: new Map<string, any>(),
    buildings: new Map<string, any>(),
    units: new Map<string, any>(),
    residents: new Map<string, any>(),
    unitResidents: new Map<string, any>(),
    periods: new Map<string, any>(),
    unitCharges: new Map<string, any>(),
    transactions: new Map<string, any>(),
    chatMessages: new Map<string, any>(),
    auditLogs: [] as any[]
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await buildServer();
    await server.ready();

    managerToken = signAccessToken({
      sub: 'manager-uuid-1',
      phone: '09121111111',
      role: 'COMPLEX_MANAGER',
      complexId: testComplexId,
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

    superAdminToken = signAccessToken({
      sub: 'admin-uuid-1',
      phone: '09120000000',
      role: 'SUPER_ADMIN',
      permissions: ['*']
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
    db.chatMessages.clear();
    db.auditLogs = [];

    // Prepopulate test complex & unit
    db.complexes.set(testComplexId, {
      id: testComplexId,
      slug: 'cpx-slug-1',
      name: 'مجتمع برج پارس',
      unitCount: 10,
      initialFund: 10_000_000,
      currentFund: 10_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    db.units.set(testUnitId, {
      id: testUnitId,
      complexId: testComplexId,
      unitNumber: 101,
      unitName: 'واحد ۱۰۱',
      area: 100,
      occupants: 3,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0
    });

    // Mock rawPrisma delegates
    vi.spyOn(rawPrisma.complex, 'findMany').mockImplementation(async () => Array.from(db.complexes.values()));
    vi.spyOn(rawPrisma.complex, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id) return db.complexes.get(where.id) || null;
      if (where.slug) {
        for (const c of db.complexes.values()) if (c.slug === where.slug) return c;
      }
      return null;
    });
    vi.spyOn(rawPrisma.complex, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: data.id || `cpx-${Date.now()}`, ...data };
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

    vi.spyOn(rawPrisma.building, 'findMany').mockImplementation(async () => Array.from(db.buildings.values()));
    vi.spyOn(rawPrisma.building, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `bld-${Date.now()}`, ...data };
      db.buildings.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.building, 'findFirst').mockImplementation(async () => Array.from(db.buildings.values())[0] || null);

    vi.spyOn(rawPrisma.unit, 'findMany').mockImplementation(async () => Array.from(db.units.values()));
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
      const rec = { id: `unit-${Date.now()}`, ...data };
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
    vi.spyOn(rawPrisma.unit, 'upsert').mockImplementation(async ({ where, create, update }: any) => {
      const { complexId, unitNumber } = where.complexId_unitNumber;
      for (const u of db.units.values()) {
        if (u.complexId === complexId && u.unitNumber === unitNumber) {
          const upd = { ...u, ...update };
          db.units.set(u.id, upd);
          return upd;
        }
      }
      const rec = { id: `unit-${Date.now()}`, ...create };
      db.units.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.resident, 'findMany').mockImplementation(async () => Array.from(db.residents.values()));
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
      const rec = { id: `res-${Date.now()}`, ...data };
      db.residents.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.resident, 'upsert').mockImplementation(async ({ where, create }: any) => {
      for (const r of db.residents.values()) {
        if (r.complexId === where.complexId_phone.complexId && r.phone === where.complexId_phone.phone) {
          return r;
        }
      }
      const rec = { id: `res-${Date.now()}`, ...create };
      db.residents.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.unitResident, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `ur-${Date.now()}`, ...data };
      db.unitResidents.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.unitResident, 'upsert').mockImplementation(async ({ create }: any) => {
      const rec = { id: `ur-${Date.now()}`, ...create };
      db.unitResidents.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.period, 'findMany').mockImplementation(async () => Array.from(db.periods.values()));
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
      const rec = { id: `prd-${Date.now()}`, ...data };
      db.periods.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.period, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.periods.get(where.id) || {};
      const updated = { ...ex, ...data };
      db.periods.set(where.id, updated);
      return updated;
    });

    vi.spyOn(rawPrisma.unitCharge, 'findMany').mockImplementation(async () => Array.from(db.unitCharges.values()));
    vi.spyOn(rawPrisma.unitCharge, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `chg-${Date.now()}`, ...data };
      db.unitCharges.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.unitCharge, 'deleteMany').mockImplementation(async () => ({ count: 0 }));

    vi.spyOn(rawPrisma.ledgerTransaction, 'findMany').mockImplementation(async () => Array.from(db.transactions.values()));
    vi.spyOn(rawPrisma.ledgerTransaction, 'count').mockImplementation(async () => db.transactions.size);
    vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `tx-${Date.now()}`, ...data };
      db.transactions.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.chatMessage, 'findMany').mockImplementation(async () => Array.from(db.chatMessages.values()));
    vi.spyOn(rawPrisma.chatMessage, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `msg-${Date.now()}`, ...data, createdAt: new Date() };
      db.chatMessages.set(rec.id, rec);
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

  it('1. GET /api/v1/complexes: should return complexes accessible to manager', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/complexes',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]?.id).toBe(testComplexId);
  });

  it('2. POST /api/v1/buildings: should create a building block', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/buildings',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        name: 'بلوک ۱',
        floorsCount: 4,
        unitsCount: 8
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('بلوک ۱');
    expect(body.complexId).toBe(testComplexId);
  });

  it('3. POST /api/v1/units: should create unit in complex', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/units',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        unitNumber: 102,
        unitName: 'واحد ۱۰۲',
        area: 95.5,
        occupants: 2,
        occType: 'OWNER_OCCUPIED',
        hasPackage: true,
        initialBalance: 0
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.unitNumber).toBe(102);
    expect(Number(body.area)).toBe(95.5);
  });

  it('4. POST /api/v1/residents: should create resident and assign unit', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/residents',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        fullName: 'رضا حسینی',
        phone: '09123334455',
        type: 'OWNER',
        unitId: testUnitId
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.fullName).toBe('رضا حسینی');
  });

  it('5. Billing Cycle: create period -> dry-run calculate -> publish -> close', async () => {
    // 5.1 Create draft period
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/periods',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        type: 'MONTHLY',
        name: 'آبان ۱۴۰۳',
        year: 1403,
        month: '08',
        fixedCost: 300_000,
        waterCost: 600_000,
      }
    });
    expect(createRes.statusCode).toBe(201);
    const period = createRes.json();

    // 5.2 Calculate preview
    const calcRes = await server.inject({
      method: 'POST',
      url: `/api/v1/periods/${period.id}/calculate`,
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      }
    });
    expect(calcRes.statusCode).toBe(200);
    const calc = calcRes.json();
    expect(calc.conservationDelta).toBe(0);

    // 5.3 Publish
    const pubRes = await server.inject({
      method: 'POST',
      url: `/api/v1/periods/${period.id}/publish`,
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      }
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().status).toBe('ACTIVE');

    // 5.4 Close
    const closeRes = await server.inject({
      method: 'POST',
      url: `/api/v1/periods/${period.id}/close`,
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      }
    });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().status).toBe('CLOSED');
  });

  it('6. POST /api/v1/payments: should record payment and update treasury fund', async () => {
    const payRes = await server.inject({
      method: 'POST',
      url: '/api/v1/payments',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        unitId: testUnitId,
        amount: 1_200_000,
        paymentMethod: 'CARD_TRANSFER',
        description: 'واریز شارژ'
      }
    });

    expect(payRes.statusCode).toBe(201);
    const payment = payRes.json();
    expect(payment.type).toBe('PAYMENT');
    expect(Number(payment.amount)).toBe(1_200_000);

    const complex = db.complexes.get(testComplexId);
    expect(complex.currentFund).toBe(11_200_000);
  });

  it('7. POST /api/v1/announcements: should post digital bulletin announcement', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/announcements',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      },
      payload: {
        title: 'جلسه مجمع عمومی',
        content: 'جلسه سالانه روز جمعه برگزار می‌گردد.'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('جلسه مجمع عمومی');

    const listRes = await server.inject({
      method: 'GET',
      url: '/api/v1/announcements',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-complex-id': testComplexId
      }
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBeGreaterThan(0);
  });

  it('8. POST /api/v1/migration/import: should ingest legacy payload losslessly', async () => {
    const migComplexId = 'cpx-mig-rest-test';
    const payload = {
      complexId: migComplexId,
      initialFund: 15_000_000,
      units: [
        { vahed: 1, metraj: '۸۰', tedad: '۲', name: 'اکبری', balance: 0 },
        { vahed: 2, metraj: '۱۰۰', tedad: '۳', name: 'کریمی', balance: -500_000 }
      ],
      periods: []
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/migration/import',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'x-complex-id': migComplexId
      },
      payload
    });

    expect(res.statusCode).toBe(200);
    const rec = res.json();
    expect(rec.success).toBe(true);
    expect(rec.unitsImported).toBe(2);
    expect(rec.fundDiscrepancy).toBe(0);
    expect(rec.debtDiscrepancy).toBe(0);
  });
});
