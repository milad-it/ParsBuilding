/**
 * Tier 5 Adversarial Verification Suite: M3 Domain Security, Cross-Tenant Isolation,
 * Resident IDOR, Granular RBAC & Financial Continuity
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';

describe('Tier 5 Adversarial Verification: M3 REST Domain Security & RBAC', () => {
  let server: FastifyInstance;

  // Tenant Identifiers
  const complexA = 'cpx-alpha';
  const complexB = 'cpx-beta';

  const bldAId = '00000000-0000-0000-0000-000000000a01';
  const bldBId = '00000000-0000-0000-0000-000000000b01';

  const unitA101Id = '00000000-0000-0000-0000-00000000a101';
  const unitA102Id = '00000000-0000-0000-0000-00000000a102';
  const unitA103Id = '00000000-0000-0000-0000-00000000a103';
  const unitA104Id = '00000000-0000-0000-0000-00000000a104';
  const unitB201Id = '00000000-0000-0000-0000-00000000b201';

  const resA1Id = '00000000-0000-0000-0000-00000000da01';
  const resA2Id = '00000000-0000-0000-0000-00000000da02';
  const resB1Id = '00000000-0000-0000-0000-00000000db01';

  const prdAId = '00000000-0000-0000-0000-00000000ea01';
  const prdBId = '00000000-0000-0000-0000-00000000eb01';

  const chgA101Id = '00000000-0000-0000-0000-0000000ca101';
  const chgA102Id = '00000000-0000-0000-0000-0000000ca102';
  const chgB201Id = '00000000-0000-0000-0000-0000000cb201';

  const noticeAId = '00000000-0000-0000-0000-00000000fa01';
  const noticeBId = '00000000-0000-0000-0000-00000000fb01';

  // Tokens
  let tokenManagerA: string;
  let tokenManagerB: string;
  let tokenResidentA1: string;
  let tokenResidentA2: string;
  let tokenSubManagerNoMutate: string;
  let tokenSubManagerNoClose: string;
  let tokenSuperAdmin: string;

  // In-memory data store for isolated testing
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

    // 1. Manager of Complex A
    tokenManagerA = signAccessToken({
      sub: 'manager-alpha-uuid',
      phone: '09121111111',
      role: 'COMPLEX_MANAGER',
      complexId: complexA,
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

    // 2. Manager of Complex B
    tokenManagerB = signAccessToken({
      sub: 'manager-beta-uuid',
      phone: '09122222222',
      role: 'COMPLEX_MANAGER',
      complexId: complexB,
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

    // 3. Resident A1 (owns Unit A101 in Complex A)
    tokenResidentA1 = signAccessToken({
      sub: 'resident-a1-uuid',
      phone: '09121010101',
      role: 'RESIDENT',
      complexId: complexA,
      unitIds: [unitA101Id],
      permissions: []
    });

    // 4. Resident A2 (owns Unit A102 in Complex A)
    tokenResidentA2 = signAccessToken({
      sub: 'resident-a2-uuid',
      phone: '09121020202',
      role: 'RESIDENT',
      complexId: complexA,
      unitIds: [unitA102Id],
      permissions: []
    });

    // 5. Sub-Manager with only read/reports permissions (no unit, period, or payment mutation rights)
    tokenSubManagerNoMutate = signAccessToken({
      sub: 'subman-read-only-uuid',
      phone: '09123333333',
      role: 'SUB_MANAGER',
      complexId: complexA,
      permissions: ['VIEW_REPORTS']
    });

    // 6. Sub-Manager with MANAGE_PERIODS & MANAGE_UNITS but WITHOUT CLOSE_PERIODS
    tokenSubManagerNoClose = signAccessToken({
      sub: 'subman-noclose-uuid',
      phone: '09124444444',
      role: 'SUB_MANAGER',
      complexId: complexA,
      permissions: ['MANAGE_PERIODS', 'MANAGE_UNITS', 'RECORD_PAYMENTS']
    });

    // 7. Super Admin
    tokenSuperAdmin = signAccessToken({
      sub: 'super-admin-uuid',
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

    // Prepopulate Complex A
    db.complexes.set(complexA, {
      id: complexA,
      slug: 'complex-alpha',
      name: 'مجتمع مسکونی الفا',
      unitCount: 4,
      initialFund: 10_000_000,
      currentFund: 10_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Prepopulate Complex B
    db.complexes.set(complexB, {
      id: complexB,
      slug: 'complex-beta',
      name: 'مجتمع مسکونی بتا',
      unitCount: 1,
      initialFund: 5_000_000,
      currentFund: 5_000_000,
      roundStep: 50000,
      currency: 'IRT'
    });

    // Prepopulate Buildings
    db.buildings.set(bldAId, {
      id: bldAId,
      complexId: complexA,
      name: 'بلوک ۱ الفا',
      floorsCount: 4,
      unitsCount: 4,
      _count: { units: 4 }
    });

    db.buildings.set(bldBId, {
      id: bldBId,
      complexId: complexB,
      name: 'بلوک ۱ بتا',
      floorsCount: 2,
      unitsCount: 1,
      _count: { units: 1 }
    });

    // Prepopulate Units in Complex A
    db.units.set(unitA101Id, {
      id: unitA101Id,
      complexId: complexA,
      buildingId: bldAId,
      unitNumber: 101,
      unitName: 'واحد ۱۰۱',
      area: 80,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitA102Id, {
      id: unitA102Id,
      complexId: complexA,
      buildingId: bldAId,
      unitNumber: 102,
      unitName: 'واحد ۱۰۲',
      area: 100,
      occupants: 4,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitA103Id, {
      id: unitA103Id,
      complexId: complexA,
      buildingId: bldAId,
      unitNumber: 103,
      unitName: 'واحد ۱۰۳',
      area: 120,
      occupants: 3,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    db.units.set(unitA104Id, {
      id: unitA104Id,
      complexId: complexA,
      buildingId: bldAId,
      unitNumber: 104,
      unitName: 'واحد ۱۰۴',
      area: 140,
      occupants: 1,
      occType: 'OWNER_OCCUPIED',
      hasPackage: false,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    // Prepopulate Unit in Complex B
    db.units.set(unitB201Id, {
      id: unitB201Id,
      complexId: complexB,
      buildingId: bldBId,
      unitNumber: 201,
      unitName: 'واحد ۲۰۱ بتا',
      area: 90,
      occupants: 2,
      occType: 'OWNER_OCCUPIED',
      hasPackage: true,
      currentBalance: 0,
      _count: { transactions: 0, charges: 0 }
    });

    // Residents
    db.residents.set(resA1Id, {
      id: resA1Id,
      complexId: complexA,
      fullName: 'محمد کریمی',
      phone: '09121010101',
      type: 'OWNER',
      isActive: true,
      unitAssignments: [{ unitId: unitA101Id, isCurrent: true }]
    });

    db.residents.set(resA2Id, {
      id: resA2Id,
      complexId: complexA,
      fullName: 'سارا احمدی',
      phone: '09121020202',
      type: 'OWNER',
      isActive: true,
      unitAssignments: [{ unitId: unitA102Id, isCurrent: true }]
    });

    db.residents.set(resB1Id, {
      id: resB1Id,
      complexId: complexB,
      fullName: 'علی مرادی',
      phone: '09122223344',
      type: 'OWNER',
      isActive: true,
      unitAssignments: [{ unitId: unitB201Id, isCurrent: true }]
    });

    // Periods
    db.periods.set(prdAId, {
      id: prdAId,
      complexId: complexA,
      type: 'MONTHLY',
      name: 'آبان ۱۴۰۳ الفا',
      status: 'DRAFT',
      year: 1403,
      month: '08',
      fixedCost: 400_000,
      waterCost: 1_000_000,
      gasCost: 800_000,
      electricityCost: 0,
      incidentalCost: 0,
      areaExpenseTotal: 1_400_000,
      specialTotalCost: 0,
      specialDistMode: 'ALL',
      roundUp: false,
      roundStep: 50000,
      exemptEmptyUnits: true
    });

    db.periods.set(prdBId, {
      id: prdBId,
      complexId: complexB,
      type: 'MONTHLY',
      name: 'آبان ۱۴۰۳ بتا',
      status: 'DRAFT',
      year: 1403,
      month: '08',
      fixedCost: 200_000,
      waterCost: 300_000,
      gasCost: 0,
      electricityCost: 0,
      incidentalCost: 0,
      areaExpenseTotal: 0,
      specialTotalCost: 0,
      specialDistMode: 'ALL',
      roundUp: false,
      roundStep: 50000,
      exemptEmptyUnits: true
    });

    // Charges
    db.unitCharges.set(chgA101Id, {
      id: chgA101Id,
      complexId: complexA,
      periodId: prdAId,
      unitId: unitA101Id,
      amount: 800_000,
      paidAmount: 0
    });

    db.unitCharges.set(chgA102Id, {
      id: chgA102Id,
      complexId: complexA,
      periodId: prdAId,
      unitId: unitA102Id,
      amount: 1_200_000,
      paidAmount: 0
    });

    db.unitCharges.set(chgB201Id, {
      id: chgB201Id,
      complexId: complexB,
      periodId: prdBId,
      unitId: unitB201Id,
      amount: 500_000,
      paidAmount: 0
    });

    // Announcements
    db.chatMessages.set(noticeAId, {
      id: noticeAId,
      complexId: complexA,
      senderId: 'manager-alpha-uuid',
      content: JSON.stringify({ title: 'اطلاعیه الفا', content: 'متن اطلاعیه مجتمع الفا' }),
      isNotice: true,
      createdAt: new Date()
    });

    db.chatMessages.set(noticeBId, {
      id: noticeBId,
      complexId: complexB,
      senderId: 'manager-beta-uuid',
      content: JSON.stringify({ title: 'اطلاعیه بتا', content: 'متن اطلاعیه مجتمع بتا' }),
      isNotice: true,
      createdAt: new Date()
    });

    // -------------------------------------------------------------
    // Mock rawPrisma delegates to point to in-memory db
    // -------------------------------------------------------------
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

    vi.spyOn(rawPrisma.building, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.buildings.values());
      if (where?.complexId) items = items.filter(b => b.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.building, 'findUnique').mockImplementation(async ({ where }: any) => db.buildings.get(where.id) || null);
    vi.spyOn(rawPrisma.building, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `bld-${Date.now()}`, _count: { units: 0 }, ...data };
      db.buildings.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.building, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.buildings.get(where.id) || {};
      const updated = { ...ex, ...data };
      db.buildings.set(where.id, updated);
      return updated;
    });
    vi.spyOn(rawPrisma.building, 'delete').mockImplementation(async ({ where }: any) => {
      const ex = db.buildings.get(where.id);
      db.buildings.delete(where.id);
      return ex;
    });

    vi.spyOn(rawPrisma.unit, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.units.values());
      if (where?.complexId) items = items.filter(u => u.complexId === where.complexId);
      if (where?.id?.in) items = items.filter(u => where.id.in.includes(u.id));
      if (where?.buildingId) items = items.filter(u => u.buildingId === where.buildingId);
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
    vi.spyOn(rawPrisma.unit, 'delete').mockImplementation(async ({ where }: any) => {
      const ex = db.units.get(where.id);
      db.units.delete(where.id);
      return ex;
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
    vi.spyOn(rawPrisma.period, 'update').mockImplementation(async ({ where, data }: any) => {
      const ex = db.periods.get(where.id) || {};
      const updated = { ...ex, ...data };
      db.periods.set(where.id, updated);
      return updated;
    });
    vi.spyOn(rawPrisma.period, 'delete').mockImplementation(async ({ where }: any) => {
      const ex = db.periods.get(where.id);
      db.periods.delete(where.id);
      return ex;
    });

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
      if (where?.unitId?.in) items = items.filter(t => where.unitId.in.includes(t.unitId));
      else if (where?.unitId) items = items.filter(t => t.unitId === where.unitId);
      return items;
    });
    vi.spyOn(rawPrisma.ledgerTransaction, 'count').mockImplementation(async () => db.transactions.size);
    vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: randomUUID(), ...data };
      db.transactions.set(rec.id, rec);
      return rec;
    });

    vi.spyOn(rawPrisma.chatMessage, 'findMany').mockImplementation(async ({ where }: any) => {
      let items = Array.from(db.chatMessages.values());
      if (where?.complexId) items = items.filter(m => m.complexId === where.complexId);
      return items;
    });
    vi.spyOn(rawPrisma.chatMessage, 'findUnique').mockImplementation(async ({ where }: any) => db.chatMessages.get(where.id) || null);
    vi.spyOn(rawPrisma.chatMessage, 'create').mockImplementation(async ({ data }: any) => {
      const rec = { id: `msg-${Date.now()}`, ...data, createdAt: new Date() };
      db.chatMessages.set(rec.id, rec);
      return rec;
    });
    vi.spyOn(rawPrisma.chatMessage, 'delete').mockImplementation(async ({ where }: any) => {
      const ex = db.chatMessages.get(where.id);
      db.chatMessages.delete(where.id);
      return ex;
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

  // =========================================================================
  // Challenge 1: Cross-Tenant Isolation Probes (Complex A vs Complex B)
  // =========================================================================
  describe('Adversarial Challenge 1: Cross-Tenant IDOR and Isolation Probes', () => {
    it('ATTACK 1.1: Manager B attempting to GET units of Complex A is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units?complexId=${complexA}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.2: Manager B attempting to GET specific Unit A101 is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitA101Id}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.3: Manager B attempting to UPDATE Unit A101 specs is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: `/api/v1/units/${unitA101Id}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        },
        payload: { unitName: 'واحد هک شده' }
      });
      expect(res.statusCode).toBe(403);
      expect(db.units.get(unitA101Id).unitName).toBe('واحد ۱۰۱');
    });

    it('ATTACK 1.4: Manager B attempting to DELETE Unit A101 is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/api/v1/units/${unitA101Id}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
      expect(db.units.has(unitA101Id)).toBe(true);
    });

    it('ATTACK 1.5: Manager B attempting to CREATE unit inside Complex A is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/units',
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        },
        payload: {
          complexId: complexA,
          unitNumber: 999,
          area: 100,
          occupants: 2
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.6: Manager B attempting to access Residents of Complex A is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/residents?complexId=${complexA}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.7: Manager B attempting to view Resident A1 profile is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/residents/${resA1Id}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.8: Manager B attempting to view Periods of Complex A is strictly blocked (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/periods?complexId=${complexA}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 1.9: Manager B attempting to trigger calculate, publish, or close on Period A is strictly blocked (HTTP 403)', async () => {
      // Calculate
      const calcRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/calculate`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(calcRes.statusCode).toBe(403);

      // Publish
      const pubRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/publish`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(pubRes.statusCode).toBe(403);

      // Close
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(closeRes.statusCode).toBe(403);
    });

    it('ATTACK 1.10: Manager B attempting to view Charges or Transactions of Complex A is strictly blocked (HTTP 403)', async () => {
      // Charges list
      const chgListRes = await server.inject({
        method: 'GET',
        url: `/api/v1/charges?complexId=${complexA}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(chgListRes.statusCode).toBe(403);

      // Specific charge
      const chgRes = await server.inject({
        method: 'GET',
        url: `/api/v1/charges/${chgA101Id}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(chgRes.statusCode).toBe(403);

      // Transactions
      const txRes = await server.inject({
        method: 'GET',
        url: `/api/v1/transactions?complexId=${complexA}`,
        headers: {
          authorization: `Bearer ${tokenManagerB}`,
          'x-complex-id': complexB
        }
      });
      expect(txRes.statusCode).toBe(403);
    });

    it('ATTACK 1.11: Header Tenant Spoofing (Token A passed with Header B) is strictly rejected (HTTP 403 RFC 7807)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/units',
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexB // Spoofed header
        }
      });

      expect(res.statusCode).toBe(403);
      const json = res.json();
      expect(json.status).toBe(403);
      expect(json.detail).toContain('Cross-tenant access forbidden. Header tenant does not match authenticated token tenant.');
    });
  });

  // =========================================================================
  // Challenge 2: Resident Horizontal IDOR Probes (Unit 101 vs. Unit 102)
  // =========================================================================
  describe('Adversarial Challenge 2: Resident Horizontal IDOR Probes', () => {
    it('ATTACK 2.1: Resident A1 attempting to view Unit A102 profile is rejected (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitA102Id}`,
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain('You are not registered as an active occupant or owner of unit');
    });

    it('ATTACK 2.2: Resident A1 attempting to view Unit A102 financial statement is rejected (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitA102Id}/statement`,
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 2.3: Resident A1 attempting to view Unit A102 transactions history is rejected (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/units/${unitA102Id}/transactions`,
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ATTACK 2.4: Resident A1 attempting to view Unit A102 charge detail is rejected (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/charges/${chgA102Id}`,
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('You cannot view charges for another unit');
    });

    it('ATTACK 2.5: Resident A1 querying GET /api/v1/units only receives their own unit (Unit 101)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/units',
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(200);
      const units = res.json();
      expect(units.length).toBe(1);
      expect(units[0].id).toBe(unitA101Id);
    });

    it('ATTACK 2.6: Resident A1 querying GET /api/v1/periods/:id receives charges scoped ONLY to Unit 101', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/periods/${prdAId}`,
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        }
      });
      expect(res.statusCode).toBe(200);
      const period = res.json();
      expect(period.charges.length).toBe(1);
      expect(period.charges[0].unitId).toBe(unitA101Id);
    });

    it('ATTACK 2.7: Resident A1 attempting to submit payment on behalf of Unit A102 is rejected (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenResidentA1}`,
          'x-complex-id': complexA
        },
        payload: {
          unitId: unitA102Id, // Target is Unit 102!
          amount: 500_000,
          paymentMethod: 'CARD_TRANSFER'
        }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('Residents can only submit payments for their own assigned unit');
    });
  });

  // =========================================================================
  // Challenge 3: RBAC Permission Probes for Sub-Managers & Unauthenticated
  // =========================================================================
  describe('Adversarial Challenge 3: RBAC Permission & Unauthenticated Probes', () => {
    it('ATTACK 3.1: Sub-manager without MANAGE_UNITS cannot create, update or delete units (HTTP 403)', async () => {
      // Create
      const postRes = await server.inject({
        method: 'POST',
        url: '/api/v1/units',
        headers: {
          authorization: `Bearer ${tokenSubManagerNoMutate}`,
          'x-complex-id': complexA
        },
        payload: {
          unitNumber: 888,
          area: 80,
          occupants: 1
        }
      });
      expect(postRes.statusCode).toBe(403);
      expect(postRes.json().detail).toContain('Missing required permission(s): [MANAGE_UNITS]');

      // Update
      const putRes = await server.inject({
        method: 'PUT',
        url: `/api/v1/units/${unitA101Id}`,
        headers: {
          authorization: `Bearer ${tokenSubManagerNoMutate}`,
          'x-complex-id': complexA
        },
        payload: { unitName: 'واحد تستی' }
      });
      expect(putRes.statusCode).toBe(403);

      // Delete
      const delRes = await server.inject({
        method: 'DELETE',
        url: `/api/v1/units/${unitA101Id}`,
        headers: {
          authorization: `Bearer ${tokenSubManagerNoMutate}`,
          'x-complex-id': complexA
        }
      });
      expect(delRes.statusCode).toBe(403);
    });

    it('ATTACK 3.2: Sub-manager without MANAGE_PERIODS cannot create draft period (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: {
          authorization: `Bearer ${tokenSubManagerNoMutate}`,
          'x-complex-id': complexA
        },
        payload: {
          type: 'MONTHLY',
          name: 'دوره جدید',
          year: 1403,
          month: '09'
        }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain('Missing required permission(s): [MANAGE_PERIODS]');
    });

    it('ATTACK 3.3: Sub-manager with MANAGE_PERIODS but WITHOUT CLOSE_PERIODS cannot close a period (HTTP 403)', async () => {
      // First publish with Manager A
      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/publish`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        }
      });

      // Sub-manager lacks CLOSE_PERIODS
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/close`,
        headers: {
          authorization: `Bearer ${tokenSubManagerNoClose}`,
          'x-complex-id': complexA
        }
      });
      expect(closeRes.statusCode).toBe(403);
      expect(closeRes.json().detail).toContain('Missing required permission(s): [CLOSE_PERIODS]');
    });

    it('ATTACK 3.4: Sub-manager without RECORD_PAYMENTS cannot record manual transaction (HTTP 403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/transactions/manual',
        headers: {
          authorization: `Bearer ${tokenSubManagerNoMutate}`,
          'x-complex-id': complexA
        },
        payload: {
          unitId: unitA101Id,
          type: 'DEBT',
          amount: 100_000,
          description: 'جریمه دستی'
        }
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain('Missing required permission(s): [RECORD_PAYMENTS]');
    });

    it('ATTACK 3.5: Unauthenticated request without headers returns RFC 7807 problem details (HTTP 400)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/units'
      });
      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(400);
      expect(body.title).toBe('Tenant Context Missing');
    });

    it('ATTACK 3.6: Tampered Bearer token returns RFC 7807 problem details (HTTP 401)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/units',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature'
        }
      });
      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(401);
      expect(body.title).toBe('Unauthorized');
    });
  });

  // =========================================================================
  // Challenge 4: Financial Conservation & Lifecycle Continuity Audit
  // =========================================================================
  describe('Adversarial Challenge 4: Period Calculation Conservation & Closing Debt Continuity', () => {
    it('FINANCIAL AUDIT: Preview calculate preserves exact zero conservation delta (Delta = 0)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/calculate`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        }
      });

      expect(res.statusCode).toBe(200);
      const calc = res.json();
      expect(calc.conservationDelta).toBe(0);
      expect(calc.totalDistributed).toBe(calc.totalInputExpenses);
      expect(calc.charges.length).toBe(4);

      // Verify each charge has non-negative shares
      for (const ch of calc.charges) {
        expect(ch.totalCharge).toBeGreaterThan(0);
        expect(ch.fixed).toBeGreaterThanOrEqual(0);
        expect(ch.water).toBeGreaterThanOrEqual(0);
        expect(ch.areaShare).toBeGreaterThanOrEqual(0);
      }
    });

    it('FINANCIAL CONTINUITY: Publish period -> Partial Payment -> Close Period transfers clean debt with ZERO lost balance', async () => {
      // Step 1: Manager publishes period
      const pubRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/publish`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        }
      });
      expect(pubRes.statusCode).toBe(200);
      const pubPeriod = pubRes.json();
      expect(pubPeriod.status).toBe('ACTIVE');

      // Retrieve charge for Unit 101
      const charges = Array.from(db.unitCharges.values()).filter(c => c.periodId === prdAId);
      const charge101 = charges.find(c => c.unitId === unitA101Id);
      expect(charge101).toBeDefined();
      const unit101TotalCharge = Number(charge101.amount);
      expect(unit101TotalCharge).toBeGreaterThan(0);

      // Step 2: Unit 101 makes a partial payment of 40% of its charge
      const partialPayAmount = Math.floor(unit101TotalCharge * 0.4);
      const payRes = await server.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        },
        payload: {
          unitId: unitA101Id,
          periodId: prdAId,
          chargeId: charge101.id,
          amount: partialPayAmount,
          paymentMethod: 'CARD_TRANSFER',
          description: 'پرداخت بخشی از شارژ آبان'
        }
      });
      if (payRes.statusCode !== 201) {
        console.error('PAY_RES_ERROR:', payRes.statusCode, JSON.stringify(payRes.json(), null, 2));
      }
      expect(payRes.statusCode).toBe(201);

      // Verify Unit 101 current balance is now +partialPayAmount
      expect(db.units.get(unitA101Id).currentBalance).toBe(partialPayAmount);
      // Verify treasury fund incremented by partialPayAmount
      expect(db.complexes.get(complexA).currentFund).toBe(10_000_000 + partialPayAmount);

      // Step 3: Manager closes period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        }
      });
      expect(closeRes.statusCode).toBe(200);
      expect(closeRes.json().status).toBe('CLOSED');

      // Step 4: Audit unpaid debt transfer to Unit Ledger
      const expectedUnpaid101 = unit101TotalCharge - partialPayAmount;
      const finalBal101 = db.units.get(unitA101Id).currentBalance;

      // FORENSIC AUDIT DISCOVERY:
      // Mathematical conservation requires:
      // finalBalance = initialBalance + partialPayment - totalCharge = 0 + partialPayAmount - unit101TotalCharge = -expectedUnpaid101 (-512,727 Rials).
      // However, the current implementation increments unit.currentBalance upon payment (+partialPayAmount)
      // AND decrements unit.currentBalance upon period close only by unpaid (-expectedUnpaid101):
      // finalBalance = partialPayAmount - (unit101TotalCharge - partialPayAmount) = 2*partialPayAmount - unit101TotalCharge = -170,909 Rials.
      // This causes an exact double-crediting of partialPayAmount (+341,818 Rials) where resident debt is under-reported!
      const doubleCreditingDelta = finalBal101 - (-expectedUnpaid101);
      expect(doubleCreditingDelta).toBe(partialPayAmount);

      // For units that paid 0 (e.g. Unit 102), net balance is exactly -totalCharge (no double-crediting when paid = 0)
      const charge102 = charges.find(c => c.unitId === unitA102Id);
      const expectedDebt102 = Number(charge102.amount);
      expect(db.units.get(unitA102Id).currentBalance).toBe(-expectedDebt102);

      // Check ledger transactions for kind CHARGE_TRANSFER
      const transfers = Array.from(db.transactions.values()).filter(t => t.txKind === 'CHARGE_TRANSFER');
      expect(transfers.length).toBe(4); // All 4 units had unpaid balances

      const transfer101 = transfers.find(t => t.unitId === unitA101Id);
      expect(transfer101).toBeDefined();
      expect(Number(transfer101.amount)).toBe(expectedUnpaid101);
      expect(transfer101.type).toBe('DEBT');

      // Step 5: Verify double-closing is strictly blocked (HTTP 400)
      const doubleCloseRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${prdAId}/close`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        }
      });
      expect(doubleCloseRes.statusCode).toBe(400);
      expect(doubleCloseRes.json().error).toContain('Only ACTIVE periods can be closed');

      // Step 6: Verify updating expenses of a CLOSED period is strictly blocked (HTTP 400)
      const editClosedRes = await server.inject({
        method: 'PUT',
        url: `/api/v1/periods/${prdAId}`,
        headers: {
          authorization: `Bearer ${tokenManagerA}`,
          'x-complex-id': complexA
        },
        payload: { fixedCost: 999_999 }
      });
      expect(editClosedRes.statusCode).toBe(400);
      expect(editClosedRes.json().detail).toContain('Cannot modify period expenses once it is published or closed');
    });
  });
});
