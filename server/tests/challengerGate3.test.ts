/**
 * Empirical Gate 3 Challenger Stress Suite
 * Testing duplicate unit variations, DB balance deviations, and rollback invariants.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { migrationService, MigrationReconciliationError } from '../src/services/migrationService';

describe('Gate 3 Challenger Stress Testing: Migration & Debt Reconciliation', () => {
  let server: FastifyInstance;

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
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const record = { id: data.id || `cpx-${Date.now()}-${Math.random()}`, ...data };
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
          const record = { id: `ur-${Date.now()}-${Math.random()}`, ...create };
          db.unitResidents.set(key, record);
          return record;
        })
      },
      period: {
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, type, year, month } = where.complexId_type_year_month;
          let existing = null;
          for (const p of db.periods.values()) {
            if (p.complexId === complexId && p.type === type && p.year === year && p.month === month) {
              existing = p;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.periods.set(existing.id, updated);
            return updated;
          }
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...create };
          db.periods.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async () => {})
      },
      unitCharge: {
        upsert: vi.fn(async () => ({}))
      },
      ledgerTransaction: {
        upsert: vi.fn(async ({ create, update, where }) => {
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...create };
          db.transactions.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async () => {})
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          const record = { id: BigInt(db.auditLogs.length + 1), ...data, createdAt: new Date() };
          db.auditLogs.push(record);
          return record;
        })
      }
    };

    vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
      const snapshot = {
        complexes: new Map(db.complexes),
        buildings: new Map(db.buildings),
        units: new Map(db.units),
        residents: new Map(db.residents),
        unitResidents: new Map(db.unitResidents),
        periods: new Map(db.periods),
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
        db.transactions = snapshot.transactions;
        db.auditLogs = snapshot.auditLogs;
        throw err;
      }
    });
  });

  // CHALLENGE 1: Duplicate unit number variations
  describe('Adversarial Unit Ingestion: Number formats and duplicate collision', () => {
    it('MUST reject duplicate unit when one is Persian numeral and one is English numeral', async () => {
      const complexId = 'cpx-dup-mixed-digits';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 5, metraj: 100, balance: -100_000, name: 'واحد ۵ انگلیسی' },
          { vahed: '۵', metraj: 100, balance: -200_000, name: 'واحد ۵ فارسی' }
        ],
        periods: []
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(MigrationReconciliationError);

      // Verify zero orphan units in db
      expect(Array.from(db.units.values()).filter(u => u.complexId === complexId).length).toBe(0);
    });

    it('MUST reject duplicate unit when one has leading zeros string ("07" vs 7)', async () => {
      const complexId = 'cpx-dup-leading-zeros';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: '07', metraj: 85, balance: -50_000, name: 'واحد ۰۷ با صفر پیشین' },
          { vahed: 7, metraj: 85, balance: -150_000, name: 'واحد ۷ عددی' }
        ],
        periods: []
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(MigrationReconciliationError);

      expect(Array.from(db.units.values()).filter(u => u.complexId === complexId).length).toBe(0);
    });

    it('MUST reject duplicate unit with Arabic 8 vs English 8 ("\u0668" vs 8)', async () => {
      const complexId = 'cpx-dup-arabic8';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: '\u0668', metraj: 90, balance: -300_000, name: 'واحد ۸ عربی' },
          { vahed: 8, metraj: 90, balance: -400_000, name: 'واحد ۸ عددی' }
        ],
        periods: []
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(MigrationReconciliationError);

      expect(Array.from(db.units.values()).filter(u => u.complexId === complexId).length).toBe(0);
    });
  });

  // CHALLENGE 2: Database debt query divergence & rollback
  describe('Authentic PostgreSQL Debt Conservation Query & DB Divergence', () => {
    it('MUST rollback cleanly when tx.unit.findMany reports balance deviation from legacyDebtsSum', async () => {
      const complexId = 'cpx-db-divergence-1';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 1, metraj: 100, balance: -500_000, name: 'واحد ۱' },
          { vahed: 2, metraj: 100, balance: -500_000, name: 'واحد ۲' }
        ],
        periods: []
      };

      // Simulate a DB divergence during tx.unit.findMany:
      // Suppose unit 2 was somehow saved with balance -450_000 instead of -500_000
      mockTx.unit.findMany = vi.fn(async () => [
        { id: 'u1', unitNumber: 1, currentBalance: -500_000 },
        { id: 'u2', unitNumber: 2, currentBalance: -450_000 } // Divergent by 50,000 Rials!
      ]);

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(/Resident debts reconciliation failed: ΔDebts = 50000 Rials/i);

      // Verify that rollback reverted complex and units
      expect(db.complexes.has(complexId)).toBe(false);
    });

    it('MUST rollback cleanly when tx.unit.findMany returns fewer units than submitted', async () => {
      const complexId = 'cpx-db-dropped-unit';
      const payload = {
        initialFund: 0,
        units: [
          { vahed: 1, metraj: 100, balance: -100_000 },
          { vahed: 2, metraj: 100, balance: -200_000 },
          { vahed: 3, metraj: 100, balance: -300_000 }
        ],
        periods: []
      };

      // Simulate a dropped row in database (only 2 units returned)
      mockTx.unit.findMany = vi.fn(async () => [
        { id: 'u1', unitNumber: 1, currentBalance: -100_000 },
        { id: 'u2', unitNumber: 2, currentBalance: -200_000 }
      ]);

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(/Unit count mismatch: 3 units submitted, but 2 persisted in database/i);

      expect(db.complexes.has(complexId)).toBe(false);
    });
  });

  // CHALLENGE 3: Expected debts vs calculated debts reconciliation
  describe('Expected Debts and Expected Ending Fund Reconciliation', () => {
    it('MUST reject when expectedTotalDebts is 0 but units have active debts', async () => {
      const complexId = 'cpx-zero-expected-debts';
      const payload = {
        initialFund: 0,
        expectedTotalDebts: 0, // Ledger claims zero debts
        units: [
          { vahed: 1, metraj: 100, balance: -1_500_000 } // Reality: 1,500,000 debt
        ],
        periods: []
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(/Resident debts reconciliation failed: ΔDebts = 1500000 Rials/i);
    });

    it('MUST succeed when expectedTotalDebts matches exact sum of negative balances', async () => {
      const complexId = 'cpx-matching-debts';
      const payload = {
        initialFund: 2_000_000,
        expectedEndingFund: 2_000_000,
        expectedTotalDebts: 3_250_000,
        units: [
          { vahed: 1, metraj: 100, balance: -1_250_000 },
          { vahed: 2, metraj: 100, balance: -2_000_000 },
          { vahed: 3, metraj: 100, balance: 500_000 } // Credit is not debt
        ],
        periods: []
      };

      const result = await migrationService.executeMigration(complexId, payload as any);
      expect(result.success).toBe(true);
      expect(result.debtDiscrepancy).toBe(0);
      expect(result.fundDiscrepancy).toBe(0);
    });

    it('MUST reject when expectedEndingFund is 0 but treasury has positive balance', async () => {
      const complexId = 'cpx-zero-expected-fund';
      const payload = {
        initialFund: 5_000_000,
        expectedEndingFund: 0, // Ledger claims empty fund
        units: [{ vahed: 1, metraj: 100, balance: 0 }],
        periods: []
      };

      await expect(
        migrationService.executeMigration(complexId, payload as any)
      ).rejects.toThrow(/Treasury fund reconciliation failed: ΔFund = 5000000 Rials/i);
    });
  });
});
