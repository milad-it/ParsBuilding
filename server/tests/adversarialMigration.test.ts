/**
 * ParsBuilding Milestone 3: Adversarial Data Migration & Financial Reconciliation Test Suite
 *
 * EMPIRICAL ADVERSARIAL HARNESS:
 * 1. Financial Discrepancy Injections:
 *    - Tampered payments & expenses (ΔFund != 0) -> MigrationReconciliationError, HTTP 422 Problem Details, Rollback.
 *    - Debts conservation & resident balance tampering (ΔDebts != 0).
 * 2. Extreme Localized Numerical Probes:
 *    - Persian digits ('۰'-'۹'), Arabic 8 ('٨'), Momayyez ('٫'), slash ('/').
 *    - Zero occupancy, zero area, large values (billions of Rials), negative initial fund balances.
 * 3. Identity & Contact Stress Testing:
 *    - Empty phones, synthetic generation, multi-unit single-owner residency.
 * 4. ACID Transaction & Zero Orphan Rollback Audits.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { migrationService, MigrationReconciliationError } from '../src/services/migrationService';
import { signAccessToken } from '../src/services/authService';
import { toEnDigit, parseDecimal, parseIntegerCurrency } from '../src/utils/numberUtils';

describe('Adversarial Verification: Milestone 3 Data Migration & Financial Reconciliation', () => {
  let server: FastifyInstance;
  let superAdminToken: string;
  let managerToken: string;
  let residentToken: string;

  // In-memory relational database state
  let db: {
    complexes: Map<string, any>;
    buildings: Map<string, any>;
    units: Map<string, any>;
    residents: Map<string, any>;
    unitResidents: Map<string, any>;
    periods: Map<string, any>;
    unitCharges: Map<string, any>;
    transactions: Map<string, any>;
    auditLogs: any[];
  };

  let mockTx: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await buildServer();
    await server.ready();

    superAdminToken = signAccessToken({
      sub: 'admin-uuid',
      phone: '09120000000',
      role: 'SUPER_ADMIN',
      permissions: ['*']
    });

    managerToken = signAccessToken({
      sub: 'manager-uuid',
      phone: '09121111111',
      role: 'COMPLEX_MANAGER',
      complexId: 'cpx-adv-test',
      permissions: ['MANAGE_SETTINGS', 'MANAGE_FINANCES']
    });

    residentToken = signAccessToken({
      sub: 'resident-uuid',
      phone: '09122222222',
      role: 'RESIDENT',
      complexId: 'cpx-adv-test',
      permissions: []
    });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    db = {
      complexes: new Map(),
      buildings: new Map(),
      units: new Map(),
      residents: new Map(),
      unitResidents: new Map(),
      periods: new Map(),
      unitCharges: new Map(),
      transactions: new Map(),
      auditLogs: []
    };

    mockTx = {
      complex: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.id) return db.complexes.get(where.id) || null;
          if (where.slug) {
            for (const c of db.complexes.values()) {
              if (c.slug === where.slug) return c;
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const record = { id: data.id || `cpx-${Date.now()}`, ...data };
          db.complexes.set(record.id, record);
          return record;
        }),
        update: vi.fn(async ({ where, data }) => {
          const existing = db.complexes.get(where.id) || {};
          const updated = { ...existing, ...data };
          db.complexes.set(where.id, updated);
          return updated;
        })
      },
      building: {
        findFirst: vi.fn(async ({ where }) => {
          for (const b of db.buildings.values()) {
            if (b.complexId === where.complexId) return b;
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const record = { id: `bld-${Date.now()}-${Math.random()}`, ...data };
          db.buildings.set(record.id, record);
          return record;
        })
      },
      unit: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.id) return db.units.get(where.id) || null;
          if (where.complexId_unitNumber) {
            const { complexId, unitNumber } = where.complexId_unitNumber;
            for (const u of db.units.values()) {
              if (u.complexId === complexId && u.unitNumber === unitNumber) return u;
            }
          }
          return null;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, unitNumber } = where.complexId_unitNumber;
          let existing = null;
          for (const u of db.units.values()) {
            if (u.complexId === complexId && u.unitNumber === unitNumber) {
              existing = u;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.units.set(existing.id, updated);
            return updated;
          } else {
            const record = { id: `unit-${Date.now()}-${Math.random()}`, ...create };
            db.units.set(record.id, record);
            return record;
          }
        }),
        findMany: vi.fn(async ({ where }) => {
          const list = [];
          for (const u of db.units.values()) {
            if (!where?.complexId || u.complexId === where.complexId) {
              list.push(u);
            }
          }
          return list;
        })
      },
      resident: {
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, phone } = where.complexId_phone;
          let existing = null;
          for (const r of db.residents.values()) {
            if (r.complexId === complexId && r.phone === phone) {
              existing = r;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.residents.set(existing.id, updated);
            return updated;
          } else {
            const record = { id: `res-${Date.now()}-${Math.random()}`, ...create };
            db.residents.set(record.id, record);
            return record;
          }
        }),
        findMany: vi.fn(async ({ where }) => {
          const list = [];
          for (const r of db.residents.values()) {
            if (!where?.complexId || r.complexId === where.complexId) {
              list.push(r);
            }
          }
          return list;
        })
      },
      unitResident: {
        upsert: vi.fn(async ({ create, update, where }) => {
          const { complexId, unitId, residentId } = where.complexId_unitId_residentId;
          const key = `${complexId}_${unitId}_${residentId}`;
          const existing = db.unitResidents.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            db.unitResidents.set(key, updated);
            return updated;
          }
          const record = { id: `ur-${Date.now()}`, ...create };
          db.unitResidents.set(key, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(db.unitResidents.values()))
      },
      period: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...data };
          db.periods.set(record.id, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(db.periods.values()))
      },
      unitCharge: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `chg-${Date.now()}-${Math.random()}`, ...data };
          db.unitCharges.set(record.id, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(db.unitCharges.values()))
      },
      ledgerTransaction: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...data };
          db.transactions.set(record.id, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(db.transactions.values()))
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          const record = { id: BigInt(db.auditLogs.length + 1), ...data, createdAt: new Date() };
          db.auditLogs.push(record);
          return record;
        })
      }
    };

    // Spy on rawPrisma.$transaction with atomic snapshot rollback simulation
    vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
      const snapshot = {
        complexes: new Map(db.complexes),
        buildings: new Map(db.buildings),
        units: new Map(db.units),
        residents: new Map(db.residents),
        unitResidents: new Map(db.unitResidents),
        periods: new Map(db.periods),
        unitCharges: new Map(db.unitCharges),
        transactions: new Map(db.transactions),
        auditLogs: [...db.auditLogs]
      };

      try {
        return await cb(mockTx);
      } catch (err) {
        db.complexes = snapshot.complexes;
        db.buildings = snapshot.buildings;
        db.units = snapshot.units;
        db.residents = snapshot.residents;
        db.unitResidents = snapshot.unitResidents;
        db.periods = snapshot.periods;
        db.unitCharges = snapshot.unitCharges;
        db.transactions = snapshot.transactions;
        db.auditLogs = snapshot.auditLogs;
        throw err;
      }
    });
  });

  // ==========================================================================
  // SECTION 1: FINANCIAL DISCREPANCY INJECTION (ΔFund != 0)
  // ==========================================================================
  describe('Challenge 1: Financial Discrepancy Injection & Treasury Reconciliation', () => {
    it('ADV-1.1: Tampered Payment Amount Injection (1 Rial delta) MUST throw MigrationReconciliationError', async () => {
      const complexId = 'adv-tampered-pay-1';
      const payload = {
        initialFund: 10_000_000,
        expectedEndingFund: 15_000_000,
        units: [{ vahed: 1, metraj: 100, name: 'واحد تستی' }],
        periods: [
          {
            title: 'دوره تستی',
            totalExpenses: 2_000_000,
            // Payments should be 7_000_000 to match 10M + 7M - 2M = 15M
            // Adversarial injection: payment is 6_999_999 (1 Rial discrepancy)
            payments: [{ amount: 6_999_999 }]
          }
        ]
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(MigrationReconciliationError);

      try {
        await migrationService.executeMigration(complexId, payload as any);
      } catch (err: any) {
        expect(err.statusCode).toBe(422);
        expect(err.message).toMatch(/Treasury fund reconciliation failed: ΔFund = 1 Rials/i);
      }
    });

    it('ADV-1.2: Tampered Expense Sum Injection MUST throw MigrationReconciliationError', async () => {
      const complexId = 'adv-tampered-exp-1';
      const payload = {
        initialFund: 5_000_000,
        expectedEndingFund: 3_000_000,
        units: [{ vahed: 1, metraj: 100, name: 'واحد تستی' }],
        periods: [
          {
            title: 'دوره دی',
            // Expected expenses = 2_000_000. Tampered to 2_500_000 (ΔFund = 500,000)
            totalExpenses: 2_500_000,
            payments: []
          }
        ]
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(/Treasury fund reconciliation failed: ΔFund = 500000 Rials/i);
    });

    it('ADV-1.3: HTTP 422 Problem Details on REST endpoint with Clean Rollback', async () => {
      const targetComplexId = 'adv-rest-discrepancy-cpx';
      const payload = {
        complexId: targetComplexId,
        initialFund: 10_000_000,
        expectedEndingFund: 99_000_000, // Deliberate discrepancy
        units: [
          { vahed: 1, metraj: 90, tedad: 2, name: 'واحد ۱', balance: 0 },
          { vahed: 2, metraj: 110, tedad: 3, name: 'واحد ۲', balance: 0 }
        ],
        periods: []
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'x-complex-id': targetComplexId
        },
        payload
      });

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);

      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/migration-failed');
      expect(problem.status).toBe(422);
      expect(problem.title).toBe('Migration Reconciliation Failure');
      expect(problem.detail).toMatch(/Treasury fund reconciliation failed/i);

      // Verify ZERO orphan records in database
      expect(db.complexes.has(targetComplexId)).toBe(false);
      expect(Array.from(db.units.values()).filter(u => u.complexId === targetComplexId).length).toBe(0);
      expect(Array.from(db.residents.values()).filter(r => r.complexId === targetComplexId).length).toBe(0);
      expect(db.auditLogs.filter(l => l.complexId === targetComplexId).length).toBe(0);
    });

    it('ADV-1.4: Scoped route POST /api/v1/complexes/:complexId/migrate also enforces 422 Problem Details', async () => {
      const targetComplexId = 'cpx-adv-test'; // Matches managerToken.complexId
      const payload = {
        initialFund: 1_000_000,
        expectedEndingFund: 2_000_000, // Discrepancy (expected 2M vs calculated 1M)
        units: [{ vahed: 1, metraj: 50, name: 'واحد تک' }],
        periods: []
      };

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/complexes/${targetComplexId}/migrate`,
        headers: {
          authorization: `Bearer ${managerToken}`,
          'x-complex-id': targetComplexId
        },
        payload
      });

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(db.complexes.has(targetComplexId)).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 2: RESIDENT DEBTS CONSERVATION & TAMPERING (ΔDebts != 0)
  // ==========================================================================
  describe('Challenge 2: Resident Debts Conservation & Duplicate Unit Overwrite', () => {
    it('ADV-2.1: Conservation of negative balances (resident debts)', async () => {
      const complexId = 'adv-debts-cpx-1';
      const payload = {
        initialFund: 1_000_000,
        units: [
          { vahed: 1, metraj: 80, balance: -350_000 },
          { vahed: 2, metraj: 90, balance: -650_000 },
          { vahed: 3, metraj: 100, balance: 200_000 } // Creditor (positive balance)
        ],
        periods: []
      };

      const result = await migrationService.executeMigration(complexId, payload as any);
      expect(result.success).toBe(true);
      expect(result.debtDiscrepancy).toBe(0);

      const importedUnits = Array.from(db.units.values()).filter(u => u.complexId === complexId);
      const negativeSum = importedUnits
        .filter(u => u.currentBalance < 0)
        .reduce((sum, u) => sum + Math.abs(u.currentBalance), 0);

      // Debts should strictly equal 350_000 + 650_000 = 1_000_000
      expect(negativeSum).toBe(1_000_000);
    });

    it('ADV-2.2: Duplicate Unit Number Overwrite & Debt Leakage Analysis', async () => {
      const complexId = 'adv-dup-unit-cpx';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 10, metraj: 80, balance: -400_000, name: 'واحد ۱۰ مالک اول' },
          { vahed: 10, metraj: 85, balance: -200_000, name: 'واحد ۱۰ مالک دوم' }
        ],
        periods: []
      };

      // Both units have the same unitNumber (10)
      const result = await migrationService.executeMigration(complexId, payload as any);

      const dbUnits = Array.from(db.units.values()).filter(u => u.complexId === complexId);
      // Because Unit has @@unique([complexId, unitNumber]), the second unit overwrote the first in DB
      expect(dbUnits.length).toBe(1);
      expect(dbUnits[0]?.area).toBe(85);
      expect(dbUnits[0]?.currentBalance).toBe(-200_000);

      // CRITICAL FINDING: migrationService counted 2 units and summed 400K + 200K = 600K
      // Both legacyDebtsSum and migratedDebtsSum equal 600K in-memory:
      expect(result.unitsImported).toBe(2);
      expect(result.debtDiscrepancy).toBe(0);

      // But in the actual DB, the total resident debt is ONLY 200_000!
      // 400,000 Rials of debt vanished from the DB while migration reported 0 discrepancy!
      const actualDbDebts = dbUnits
        .filter(u => u.currentBalance < 0)
        .reduce((sum, u) => sum + Math.abs(u.currentBalance), 0);
      expect(actualDbDebts).toBe(200_000);
      expect(actualDbDebts).not.toBe(600_000);
    });

    it('ADV-2.3: Empirical Proof: migrationService cannot detect resident debt discrepancies from payload', async () => {
      const complexId = 'adv-tampered-debts-cpx';
      // Manager knows from legacy books that total debts should be 5,000,000 Rials
      // But units only have 3,000,000 Rials in debt (2,000,000 Rials missing/tampered)
      const payloadWithExpectedDebts = {
        initialFund: 0,
        expectedTotalDebts: 5_000_000,
        units: [
          { vahed: 1, metraj: 100, balance: -1_000_000 },
          { vahed: 2, metraj: 100, balance: -2_000_000 }
        ],
        periods: []
      };

      // In current implementation, migrationService ignores expectedTotalDebts completely:
      // Both legacyDebtsSum and migratedDebtsSum are computed from Math.abs(balance) in the same loop.
      // So debtDiscrepancy is always 0 and it succeeds without detecting the 2M missing debt!
      const result = await migrationService.executeMigration(complexId, payloadWithExpectedDebts as any);
      expect(result.success).toBe(true);
      expect(result.debtDiscrepancy).toBe(0); // Tautology: always 0!
    });
  });

  // ==========================================================================
  // SECTION 3: EXTREME LOCALIZED NUMERICAL PROBES
  // ==========================================================================
  describe('Challenge 3: Extreme Localized Numerical Formats & Boundary Values', () => {
    it('ADV-3.1: Mixed Persian digits and Arabic 8 (code 1640) in numbers, areas, and currency', async () => {
      // Testing Arabic 8 (\u0668) specifically
      const arabic8 = '\u0668';
      expect(toEnDigit(arabic8)).toBe('8');
      expect(toEnDigit('۱' + arabic8 + '۳')).toBe('183');

      const complexId = 'adv-arabic8-cpx';
      const payload = {
        initialFund: '۲' + arabic8 + '۰۰۰۰۰۰', // 28,000,000 in mixed digits (2 + 8 + 6 zeros)
        units: [
          {
            vahed: arabic8, // Unit 8
            metraj: arabic8 + '۵٫۵', // 85.5
            tedad: arabic8, // 8 occupants
            balance: '-' + arabic8 + '۰۰۰۰۰' // -800,000
          }
        ],
        periods: []
      };

      const result = await migrationService.executeMigration(complexId, payload as any);
      expect(result.success).toBe(true);

      const unit = Array.from(db.units.values()).find(u => u.complexId === complexId);
      expect(unit).toBeDefined();
      expect(unit.unitNumber).toBe(8);
      expect(unit.area).toBe(85.5);
      expect(unit.occupants).toBe(8);
      expect(unit.currentBalance).toBe(-800_000);

      const complex = db.complexes.get(complexId);
      expect(complex.initialFund).toBe(28_000_000);
    });

    it('ADV-3.2: Momayyez (٫) and Slash (/) Decimal Separators Preservation', async () => {
      expect(parseDecimal('۸۵٫۵')).toBe(85.5);
      expect(parseDecimal('۱۳۲/۵')).toBe(132.5);
      expect(parseDecimal('۱,۲۵۰/۷۵')).toBe(1250.75);

      const complexId = 'adv-decimals-cpx';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 1, metraj: '۸۵٫۵', name: 'ممیز' },
          { vahed: 2, metraj: '۱۳۲/۵', name: 'اسلش' },
          { vahed: 3, metraj: '۱۵۰.۷۵', name: 'نقطه استاندارد' }
        ],
        periods: []
      };

      await migrationService.executeMigration(complexId, payload as any);
      const units = Array.from(db.units.values()).filter(u => u.complexId === complexId);

      expect(units.find(u => u.unitNumber === 1)?.area).toBe(85.5);
      expect(units.find(u => u.unitNumber === 2)?.area).toBe(132.5);
      expect(units.find(u => u.unitNumber === 3)?.area).toBe(150.75);
    });

    it('ADV-3.3: Zero Occupancy (tedad: 0, "۰") and Zero Area (metraj: 0)', async () => {
      const complexId = 'adv-zero-occ-cpx';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 101, metraj: 0, tedad: 0, name: 'واحد صفر عددی' },
          { vahed: 102, metraj: '۰', tedad: '۰', name: 'واحد صفر فارسی' }
        ],
        periods: []
      };

      await migrationService.executeMigration(complexId, payload as any);
      const units = Array.from(db.units.values()).filter(u => u.complexId === complexId);

      const u1 = units.find(u => u.unitNumber === 101);
      const u2 = units.find(u => u.unitNumber === 102);

      expect(u1?.occupants).toBe(0);
      expect(u1?.occType).toBe('VACANT');
      expect(u1?.area).toBe(0);

      expect(u2?.occupants).toBe(0);
      expect(u2?.occType).toBe('VACANT');
      expect(u2?.area).toBe(0);
    });

    it('ADV-3.4: Extremely Large Values (50 Billion Rials) and Negative Initial Fund', async () => {
      const complexId = 'adv-huge-values-cpx';
      const fiftyBillion = 50_000_000_000;
      const initialDeficit = -250_000_000;

      const payload = {
        initialFund: initialDeficit,
        units: [{ vahed: 1, metraj: 500, name: 'پنت‌هاوس تجاری' }],
        periods: [
          {
            title: 'دوره تعمیرات کلی',
            totalExpenses: 20_000_000_000,
            payments: [{ amount: fiftyBillion }]
          }
        ]
      };

      const result = await migrationService.executeMigration(complexId, payload as any);
      expect(result.success).toBe(true);

      // Ending fund = -250M + 50B - 20B = 29,750,000,000
      const expectedEnding = initialDeficit + fiftyBillion - 20_000_000_000;
      expect(result.calculatedEndingFund).toBe(expectedEnding);
      expect(result.fundDiscrepancy).toBe(0);

      const complex = db.complexes.get(complexId);
      expect(complex.currentFund).toBe(expectedEnding);
    });
  });

  // ==========================================================================
  // SECTION 4: IDENTITY, PHONE NUMBER & MULTI-UNIT RELATIONSHIP STRESS TESTING
  // ==========================================================================
  describe('Challenge 4: Identity & Contact Stress Testing', () => {
    it('ADV-4.1: Missing or empty phone numbers generate distinct synthetic 0900 phones', async () => {
      const complexId = 'adv-phone-gen-cpx';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 5, ownerPhone: '', name: 'بدون شماره ۵' },
          { vahed: 12, ownerPhone: undefined, name: 'بدون شماره ۱۲' }
        ],
        periods: []
      };

      await migrationService.executeMigration(complexId, payload as any);

      const residents = Array.from(db.residents.values()).filter(r => r.complexId === complexId);
      expect(residents.length).toBe(2);

      const res5 = residents.find(r => r.phone === '09000000005');
      const res12 = residents.find(r => r.phone === '09000000012');

      expect(res5).toBeDefined();
      expect(res12).toBeDefined();
    });

    it('ADV-4.2: Same owner phone owning multiple units establishes links without unique collision', async () => {
      const complexId = 'adv-multi-unit-owner-cpx';
      const sharedPhone = '09129998877';

      const payload = {
        initialFund: 0,
        units: [
          { vahed: 201, ownerPhone: sharedPhone, name: 'سرمایه‌گذار - واحد ۲۰۱' },
          { vahed: 202, ownerPhone: sharedPhone, name: 'سرمایه‌گذار - واحد ۲۰۲' }
        ],
        periods: []
      };

      const result = await migrationService.executeMigration(complexId, payload as any);
      expect(result.success).toBe(true);
      expect(result.unitsImported).toBe(2);

      // Only ONE resident record should exist for this phone in the complex
      const residents = Array.from(db.residents.values()).filter(r => r.complexId === complexId);
      expect(residents.length).toBe(1);
      expect(residents[0]?.phone).toBe(sharedPhone);

      // But TWO UnitResident links should exist, one for each unit
      const links = Array.from(db.unitResidents.values()).filter(ur => ur.complexId === complexId);
      expect(links.length).toBe(2);
      expect(links[0]?.residentId).toBe(residents[0]?.id);
      expect(links[1]?.residentId).toBe(residents[0]?.id);
      expect(links[0]?.unitId).not.toBe(links[1]?.unitId);
    });
  });

  // ==========================================================================
  // SECTION 5: SECURITY & TENANT AUTHORIZATION IN MIGRATION REST ROUTES
  // ==========================================================================
  describe('Challenge 5: Security Hardening & RBAC Isolation on Migration Routes', () => {
    it('ADV-5.1: Unauthenticated call to POST /api/v1/migration/import MUST be rejected (400 if tenant missing, 401 if header provided without token)', async () => {
      // 1. Without any tenant header or token -> Fail-closed tenant middleware returns 400 Problem Details
      const resWithoutHeader = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        payload: {
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(resWithoutHeader.statusCode).toBe(400);
      expect(resWithoutHeader.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(resWithoutHeader.json().type).toBe('https://api.parsbuilding.com/errors/tenant-context-missing');

      // 2. With x-complex-id header but without Bearer auth token -> Authenticate guard returns 401 Problem Details
      const resWithHeader = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          'x-complex-id': 'cpx-unauth-test'
        },
        payload: {
          complexId: 'cpx-unauth-test',
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(resWithHeader.statusCode).toBe(401);
      expect(resWithHeader.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(resWithHeader.json().type).toBe('https://api.parsbuilding.com/errors/unauthorized');
    });

    it('ADV-5.2: RESIDENT role call to POST /api/v1/migration/import MUST return 403 Forbidden Problem Details', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${residentToken}`,
          'x-complex-id': 'cpx-adv-test'
        },
        payload: {
          complexId: 'cpx-adv-test',
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/forbidden');
      expect(problem.status).toBe(403);
      expect(problem.detail).toMatch(/managerial privileges/i);
    });

    it('ADV-5.3: Missing complexId MUST return 400 Bad Request Problem Details', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/migration/import',
        headers: {
          authorization: `Bearer ${superAdminToken}`
          // No x-complex-id header, no complexId in payload
        },
        payload: {
          initialFund: 0,
          units: [],
          periods: []
        }
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const problem = res.json();
      expect(problem.type).toBe('https://api.parsbuilding.com/errors/missing-complex-id');
      expect(problem.status).toBe(400);
    });
  });
});
