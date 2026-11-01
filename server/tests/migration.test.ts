/**
 * Lossless Data Migration Engine & Reconciliation Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrationService } from '../src/services/migrationService';
import { rawPrisma } from '../src/config/database';

describe('MigrationService: Lossless Data Migration & Reconciliation Engine', () => {
  let inMemoryDb: {
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

  beforeEach(() => {
    inMemoryDb = {
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
          if (where.id) return inMemoryDb.complexes.get(where.id) || null;
          if (where.slug) {
            for (const c of inMemoryDb.complexes.values()) {
              if (c.slug === where.slug) return c;
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const record = { id: data.id || `cpx-${Date.now()}`, ...data };
          inMemoryDb.complexes.set(record.id, record);
          return record;
        }),
        update: vi.fn(async ({ where, data }) => {
          const existing = inMemoryDb.complexes.get(where.id) || {};
          const updated = { ...existing, ...data };
          inMemoryDb.complexes.set(where.id, updated);
          return updated;
        })
      },
      building: {
        findFirst: vi.fn(async ({ where }) => {
          for (const b of inMemoryDb.buildings.values()) {
            if (b.complexId === where.complexId) return b;
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const record = { id: `bld-${Date.now()}-${Math.random()}`, ...data };
          inMemoryDb.buildings.set(record.id, record);
          return record;
        })
      },
      unit: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.complexId_unitNumber) {
            const { complexId, unitNumber } = where.complexId_unitNumber;
            for (const u of inMemoryDb.units.values()) {
              if (u.complexId === complexId && u.unitNumber === unitNumber) return u;
            }
          }
          return null;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, unitNumber } = where.complexId_unitNumber;
          let existing = null;
          for (const u of inMemoryDb.units.values()) {
            if (u.complexId === complexId && u.unitNumber === unitNumber) {
              existing = u;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.units.set(existing.id, updated);
            return updated;
          } else {
            const record = { id: `unit-${Date.now()}-${Math.random()}`, ...create };
            inMemoryDb.units.set(record.id, record);
            return record;
          }
        }),
        findMany: vi.fn(async ({ where }) => {
          const list = [];
          for (const u of inMemoryDb.units.values()) {
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
          for (const r of inMemoryDb.residents.values()) {
            if (r.complexId === complexId && r.phone === phone) {
              existing = r;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.residents.set(existing.id, updated);
            return updated;
          } else {
            const record = { id: `res-${Date.now()}-${Math.random()}`, ...create };
            inMemoryDb.residents.set(record.id, record);
            return record;
          }
        })
      },
      unitResident: {
        upsert: vi.fn(async ({ create, update, where }) => {
          const { complexId, unitId, residentId } = where.complexId_unitId_residentId;
          const key = `${complexId}_${unitId}_${residentId}`;
          const existing = inMemoryDb.unitResidents.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.unitResidents.set(key, updated);
            return updated;
          }
          const record = { id: `ur-${Date.now()}`, ...create };
          inMemoryDb.unitResidents.set(key, record);
          return record;
        })
      },
      period: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...data };
          inMemoryDb.periods.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, type, year, month } = where.complexId_type_year_month;
          let existing = null;
          for (const p of inMemoryDb.periods.values()) {
            if (p.complexId === complexId && p.type === type && p.year === year && p.month === month) {
              existing = p;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.periods.set(existing.id, updated);
            return updated;
          }
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...create };
          inMemoryDb.periods.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async ({ where }) => {
          for (const [id, p] of inMemoryDb.periods.entries()) {
            if (!where?.complexId || p.complexId === where.complexId) {
              inMemoryDb.periods.delete(id);
            }
          }
        }),
        findMany: vi.fn(async () => Array.from(inMemoryDb.periods.values()))
      },
      unitCharge: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `chg-${Date.now()}-${Math.random()}`, ...data };
          inMemoryDb.unitCharges.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { periodId, unitId } = where.periodId_unitId;
          let existing = null;
          for (const ch of inMemoryDb.unitCharges.values()) {
            if (ch.periodId === periodId && ch.unitId === unitId) {
              existing = ch;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.unitCharges.set(existing.id, updated);
            return updated;
          }
          const record = { id: `chg-${Date.now()}-${Math.random()}`, ...create };
          inMemoryDb.unitCharges.set(record.id, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(inMemoryDb.unitCharges.values()))
      },
      ledgerTransaction: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...data };
          inMemoryDb.transactions.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { transactionId } = where;
          let existing = null;
          for (const tx of inMemoryDb.transactions.values()) {
            if (tx.transactionId === transactionId) {
              existing = tx;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryDb.transactions.set(existing.id, updated);
            return updated;
          }
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...create };
          inMemoryDb.transactions.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async ({ where }) => {
          for (const [id, tx] of inMemoryDb.transactions.entries()) {
            if (!where?.complexId || tx.complexId === where.complexId) {
              if (!where?.transactionId?.startsWith || tx.transactionId.startsWith(where.transactionId.startsWith)) {
                inMemoryDb.transactions.delete(id);
              }
            }
          }
        }),
        findMany: vi.fn(async () => Array.from(inMemoryDb.transactions.values()))
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          const record = { id: BigInt(inMemoryDb.auditLogs.length + 1), ...data, createdAt: new Date() };
          inMemoryDb.auditLogs.push(record);
          return record;
        })
      }
    };

    vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
      // Snapshot state for rollback simulation
      const snapshot = {
        complexes: new Map(inMemoryDb.complexes),
        buildings: new Map(inMemoryDb.buildings),
        units: new Map(inMemoryDb.units),
        residents: new Map(inMemoryDb.residents),
        unitResidents: new Map(inMemoryDb.unitResidents),
        periods: new Map(inMemoryDb.periods),
        unitCharges: new Map(inMemoryDb.unitCharges),
        transactions: new Map(inMemoryDb.transactions),
        auditLogs: [...inMemoryDb.auditLogs]
      };

      try {
        return await cb(mockTx);
      } catch (err) {
        // Rollback state on error
        inMemoryDb.complexes = snapshot.complexes;
        inMemoryDb.buildings = snapshot.buildings;
        inMemoryDb.units = snapshot.units;
        inMemoryDb.residents = snapshot.residents;
        inMemoryDb.unitResidents = snapshot.unitResidents;
        inMemoryDb.periods = snapshot.periods;
        inMemoryDb.unitCharges = snapshot.unitCharges;
        inMemoryDb.transactions = snapshot.transactions;
        inMemoryDb.auditLogs = snapshot.auditLogs;
        throw err;
      }
    });
  });

  it('should import legacy units with Persian numerals and area losslessly', async () => {
    const complexId = 'mig-test-1';
    const payload = {
      initialFund: 10_000_000,
      units: [
        { vahed: 1, metraj: '۸۵٫۵', tedad: '۳', name: 'قاسمی', balance: '-500000' },
        { vahed: 2, metraj: '۱۲۰', tedad: '۴', name: 'رحمانی', balance: '1200000' },
      ],
      periods: []
    };

    const result = await migrationService.executeMigration(complexId, payload);
    expect(result.success).toBe(true);
    expect(result.unitsImported).toBe(2);
    expect(result.fundDiscrepancy).toBe(0);
    expect(result.debtDiscrepancy).toBe(0);

    const units = Array.from(inMemoryDb.units.values());
    expect(units.length).toBe(2);
    expect(units[0]?.area).toBe(85.5);
    expect(units[0]?.occupants).toBe(3);
    expect(units[0]?.currentBalance).toBe(-500000);
    expect(units[1]?.currentBalance).toBe(1200000);

    // Verify audit logs recorded
    const migrationAudit = inMemoryDb.auditLogs.find(l => l.action === 'MIGRATION');
    expect(migrationAudit).toBeDefined();
    expect(migrationAudit.entityType).toBe('Complex');
  });

  it('should reconcile treasury ending cash balance with zero fund discrepancy', async () => {
    const complexId = 'mig-test-2';
    const payload = {
      initialFund: 20_000_000,
      units: [{ vahed: 1, metraj: 100, tedad: 2, name: 'واحد تست' }],
      periods: [
        {
          title: 'دی ماه ۱۴۰۳',
          totalExpenses: 5_000_000,
          payments: [{ amount: 4_000_000 }, { amount: 1_000_000 }],
        }
      ]
    };

    const result = await migrationService.executeMigration(complexId, payload);
    expect(result.success).toBe(true);
    expect(result.periodsImported).toBe(1);
    expect(result.transactionsImported).toBe(2);
    // Calculated: 20M initial + 5M payments - 5M expenses = 20M
    expect(result.calculatedEndingFund).toBe(20_000_000);
    expect(result.fundDiscrepancy).toBe(0);

    const complex = inMemoryDb.complexes.get(complexId);
    expect(complex.currentFund).toBe(20_000_000);
  });

  it('should map legacy field aliases (vahed->unitNumber, metraj->area) and slash decimals correctly', async () => {
    const complexId = 'mig-test-3';
    const payload = {
      initialFund: 0,
      units: [{ vahed: '۵۰۲', metraj: '۱۳۲/۵', tedad: '۲', name: 'احمدپور' }],
      periods: []
    };

    await migrationService.executeMigration(complexId, payload);
    const unit = Array.from(inMemoryDb.units.values())[0];

    expect(unit.unitNumber).toBe(502);
    expect(unit.area).toBe(132.5);
    expect(unit.occupants).toBe(2);
    expect(unit.unitName).toBe('احمدپور');
  });

  it('should handle zero-occupancy empty units (tedad: 0) with VACANT occupancy status', async () => {
    const complexId = 'mig-test-4';
    const payload = {
      initialFund: 0,
      units: [
        { vahed: 1, metraj: 80, tedad: '۰', name: 'مالک خالی' },
        { vahed: 2, metraj: 80, tedad: '۲', name: 'ساکن فعال' }
      ],
      periods: []
    };

    await migrationService.executeMigration(complexId, payload);
    const units = Array.from(inMemoryDb.units.values());
    const u1 = units.find(u => u.unitNumber === 1);
    const u2 = units.find(u => u.unitNumber === 2);

    expect(u1.occupants).toBe(0);
    expect(u1.occType).toBe('VACANT');
    expect(u2.occupants).toBe(2);
    expect(u2.occType).toBe('OWNER_OCCUPIED');
  });

  it('should rollback cleanly with ACID transaction if reconciliation assertion fails', async () => {
    const complexId = 'mig-fail-1';
    const malformedPayload = {
      initialFund: 10_000_000,
      expectedEndingFund: 999_999_999, // Impossible expected ending fund deliberately causing discrepancy
      units: [
        { vahed: 1, metraj: 100, tedad: 2, name: 'واحد لغو شده' }
      ],
      periods: []
    };

    await expect(
      migrationService.executeMigration(complexId, malformedPayload)
    ).rejects.toThrow(/reconciliation failed/i);

    // Verify ACID rollback: zero records committed for this complex
    const unitsAfterFail = Array.from(inMemoryDb.units.values()).filter(u => u.complexId === complexId);
    expect(unitsAfterFail.length).toBe(0);

    const complexAfterFail = inMemoryDb.complexes.get(complexId);
    expect(complexAfterFail).toBeUndefined();
  });
});
