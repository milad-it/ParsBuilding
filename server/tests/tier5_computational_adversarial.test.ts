/**
 * Tier 5 White-Box Computational & Backend Hardening Test Suite
 *
 * Empirical verification of:
 * 1. Zero Occupants & Empty Buildings (100% vacant complex, single unit, multi-utility fallback safeguards)
 * 2. Extreme Decimal Areas & Micro-Areas (irrational 1/3 sqm, 0.0001 sqm micro-units, high precision)
 * 3. Indivisible Prime Remainder Redistribution (Hare-Niemeyer Largest Remainder, zero penny discrepancy, tie-breaking)
 * 4. Multi-Currency Scale & Extreme Numbers (500 Billion Rials, 1 Trillion Rials, MAX_SAFE_INTEGER bounds)
 * 5. Monotonic Credit Depletion & Double-Entry Ledger Invariant (monotonic credit exhaustion, debt transition)
 * 6. Lossless Migration Engine Hardening (100% vacant units, 100 Billion Rials scale, duplicate rejection, ΔFund=0 & ΔDebts=0)
 * 7. Backend Concurrency & Route Stress (high-frequency concurrent payments, zero-charge period lifecycle, cross-tenant concurrency)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';
import {
  calculatePeriodCharges,
  calculateUnitLedgerBalance,
  applyCreditSettlement,
  distributeLargestRemainder,
  UnitData,
  PeriodExpenseInput,
  LedgerTransaction
} from '../src/services/calculationEngine';
import { migrationService, MigrationReconciliationError } from '../src/services/migrationService';

describe('Tier 5 Adversarial: Computational Engine & Backend Hardening', () => {

  // =========================================================================
  // SECTION 1: PURE MATHEMATICAL & COMPUTATIONAL ENGINE HARDENING
  // =========================================================================
  describe('Suite 1: Computational Engine Edge Cases & Mathematical Invariants', () => {

    it('T5.1.1 [Empty & Boundary Building]: 0 units array returns empty charges with exact zero delta', () => {
      const input: PeriodExpenseInput = {
        fixedPerUnit: 100_000,
        waterTotal: 500_000,
        gasTotal: 300_000,
        electricityTotal: 200_000,
        incidentalTotal: 150_000,
        areaExpenseTotal: 1_000_000,
        specialTotal: 2_000_000
      };

      const result = calculatePeriodCharges([], input);

      expect(result.charges).toHaveLength(0);
      expect(result.totalDistributed).toBe(0);
      expect(result.totalInputExpenses).toBe(0);
      expect(result.totalRoundingSurplus).toBe(0);
      expect(result.conservationDelta).toBe(0);
    });

    it('T5.1.2 [Single Unit Building]: 1 unit absorbs 100% of all expenses with zero loss', () => {
      const singleUnit: UnitData[] = [
        { id: 'solo-1', unitNumber: 1, area: 125.5, occupants: 4, hasPackage: false, ownerName: 'مالک منفرد' }
      ];

      const input: PeriodExpenseInput = {
        fixedPerUnit: 250_000,
        waterTotal: 833_333,
        gasTotal: 412_789,
        electricityTotal: 198_450,
        incidentalTotal: 500_000,
        areaExpenseTotal: 1_777_777,
        specialTotal: 3_000_000
      };

      const expectedTotal = 250_000 + 833_333 + 412_789 + 198_450 + 500_000 + 1_777_777 + 3_000_000;
      const result = calculatePeriodCharges(singleUnit, input);

      expect(result.charges).toHaveLength(1);
      const c = result.charges[0]!;
      expect(c.fixed).toBe(250_000);
      expect(c.water).toBe(833_333);
      expect(c.gas).toBe(412_789);
      expect(c.electricity).toBe(198_450);
      expect(c.incidental).toBe(500_000);
      expect(c.areaShare).toBe(1_777_777);
      expect(c.specialShare).toBe(3_000_000);
      expect(c.totalCharge).toBe(expectedTotal);
      expect(result.totalDistributed).toBe(expectedTotal);
      expect(result.conservationDelta).toBe(0);
    });

    it('T5.1.3 [100% Vacant Complex - Multi-Utility Fallbacks]: All units vacant triggers safe fallbacks without NaN or drops', () => {
      const vacantUnits: UnitData[] = [
        { id: 'v1', unitNumber: 1, area: 80, occupants: 0, hasPackage: true, ownerName: 'خالی ۱' },
        { id: 'v2', unitNumber: 2, area: 120, occupants: 0, hasPackage: true, ownerName: 'خالی ۲' },
        { id: 'v3', unitNumber: 3, area: 200, occupants: 0, hasPackage: true, ownerName: 'خالی ۳' }
      ]; // Total area: 400 sqm

      const input: PeriodExpenseInput = {
        waterTotal: 1_000_000,
        gasTotal: 600_000,
        electricityTotal: 300_000,
        exemptEmptyUnits: true
      };

      const result = calculatePeriodCharges(vacantUnits, input);

      // 1. Water fallback: apportioned by area
      expect(result.warnings.some(w => w.includes('آب بر اساس متراژ'))).toBe(true);
      const c1 = result.charges.find(c => c.unitId === 'v1')!;
      const c2 = result.charges.find(c => c.unitId === 'v2')!;
      const c3 = result.charges.find(c => c.unitId === 'v3')!;

      // 80/400 * 1M = 200k, 120/400 * 1M = 300k, 200/400 * 1M = 500k
      expect(c1.water).toBe(200_000);
      expect(c2.water).toBe(300_000);
      expect(c3.water).toBe(500_000);

      // 2. Gas fallback: 100% packages -> shared equally as infrastructure fee (200k each)
      expect(result.warnings.some(w => w.includes('گاز مشاع یافت نشد'))).toBe(true);
      expect(c1.gas).toBe(200_000);
      expect(c2.gas).toBe(200_000);
      expect(c3.gas).toBe(200_000);

      // 3. Electricity fallback: all units vacant -> divided equally (100k each)
      expect(c1.electricity).toBe(100_000);
      expect(c2.electricity).toBe(100_000);
      expect(c3.electricity).toBe(100_000);

      // 4. Conservation
      expect(result.conservationDelta).toBe(0);
      expect(result.totalDistributed).toBe(1_900_000);
    });

    it('T5.1.4 [Extreme Decimal & Micro-Areas]: Apportions expenses across fractional & micro square meters', () => {
      const units: UnitData[] = [
        { id: 'micro', unitNumber: 1, area: 0.0001, occupants: 1, hasPackage: false, ownerName: 'میکرو کیوسک' },
        { id: 'standard', unitNumber: 2, area: 100.333333, occupants: 3, hasPackage: false, ownerName: 'واحد متوسط' },
        { id: 'penthouse', unitNumber: 3, area: 899.666567, occupants: 5, hasPackage: false, ownerName: 'پنت‌هاوس بزرگ' }
      ]; // Total area: 1,000.000000 sqm

      const input: PeriodExpenseInput = {
        areaExpenseTotal: 10_000_000,
        roundUp: false
      };

      const result = calculatePeriodCharges(units, input);

      expect(result.conservationDelta).toBe(0);
      expect(result.totalDistributed).toBe(10_000_000);

      const microCharge = result.charges.find(c => c.unitId === 'micro')!;
      const stdCharge = result.charges.find(c => c.unitId === 'standard')!;
      const pentCharge = result.charges.find(c => c.unitId === 'penthouse')!;

      // Micro unit gets its integer quota
      expect(microCharge.areaShare).toBeGreaterThanOrEqual(1); // 0.0001 / 1000 * 10M = 1 Rial
      expect(Number.isInteger(microCharge.areaShare)).toBe(true);
      expect(Number.isInteger(stdCharge.areaShare)).toBe(true);
      expect(Number.isInteger(pentCharge.areaShare)).toBe(true);
      expect(microCharge.areaShare + stdCharge.areaShare + pentCharge.areaShare).toBe(10_000_000);
    });

    it('T5.1.5 [Indivisible Prime Apportionment]: 1 Rial across 7 units & 1,000,000,007 Rials across 17 units', () => {
      // 1 Rial across 7 units
      const units7: UnitData[] = Array.from({ length: 7 }, (_, i) => ({
        id: `u7-${i + 1}`,
        unitNumber: i + 1,
        area: 100,
        occupants: 2,
        hasPackage: false,
        ownerName: `واحد ${i + 1}`
      }));

      const res1Rial = calculatePeriodCharges(units7, { incidentalTotal: 1, roundUp: false });
      expect(res1Rial.totalDistributed).toBe(1);
      expect(res1Rial.conservationDelta).toBe(0);

      // Exactly 1 unit gets 1 Rial (unit 1 due to tie-break on unitNumber), others get 0
      const unit1Charge = res1Rial.charges.find(c => c.unitId === 'u7-1')!;
      expect(unit1Charge.incidental).toBe(1);
      const otherCharges = res1Rial.charges.filter(c => c.unitId !== 'u7-1');
      otherCharges.forEach(c => expect(c.incidental).toBe(0));

      // 1,000,000,007 Rials across 17 units
      const units17: UnitData[] = Array.from({ length: 17 }, (_, i) => ({
        id: `u17-${i + 1}`,
        unitNumber: i + 1,
        area: 100,
        occupants: 2,
        hasPackage: false,
        ownerName: `واحد ${i + 1}`
      }));

      const primeTotal = 1_000_000_007;
      const resPrime = calculatePeriodCharges(units17, { incidentalTotal: primeTotal, roundUp: false });
      expect(resPrime.totalDistributed).toBe(primeTotal);
      expect(resPrime.conservationDelta).toBe(0);

      // 1,000,000,007 / 17 = 58,823,529.8235...
      // Integer base = 58,823,529. Deficit = 14 units get +1 Rial (58,823,530), 3 get 58,823,529
      const highShares = resPrime.charges.filter(c => c.incidental === 58_823_530);
      const lowShares = resPrime.charges.filter(c => c.incidental === 58_823_529);
      expect(highShares).toHaveLength(14);
      expect(lowShares).toHaveLength(3);
      expect(14 * 58_823_530 + 3 * 58_823_529).toBe(primeTotal);
    });

    it('T5.1.6 [Multi-Currency Scale & Massive Numbers]: 500 Billion Rials with rounding step preserves exact conservation', () => {
      const units20: UnitData[] = Array.from({ length: 20 }, (_, i) => ({
        id: `u20-${i + 1}`,
        unitNumber: i + 1,
        area: 80 + i * 10,
        occupants: 1 + (i % 4),
        hasPackage: i % 2 === 0,
        ownerName: `واحد ${i + 1}`
      }));

      const massiveInput: PeriodExpenseInput = {
        fixedPerUnit: 10_000_000, // 200M total
        waterTotal: 50_000_000_000, // 50 Billion
        gasTotal: 70_000_000_000, // 70 Billion
        electricityTotal: 30_000_000_000, // 30 Billion
        incidentalTotal: 50_000_000_000, // 50 Billion
        areaExpenseTotal: 200_000_000_000, // 200 Billion
        specialTotal: 100_000_000_000, // 100 Billion
        roundUp: true,
        roundStep: 50_000 // Round up to nearest 50,000 Rials
      };

      const result = calculatePeriodCharges(units20, massiveInput);

      expect(result.conservationDelta).toBe(0);
      expect(result.totalInputExpenses).toBe(500_200_000_000);
      expect(result.totalDistributed).toBe(result.totalInputExpenses + result.totalRoundingSurplus);

      // Verify all numbers are within safe integer range
      expect(Number.isSafeInteger(result.totalDistributed)).toBe(true);
      expect(Number.isSafeInteger(result.totalInputExpenses)).toBe(true);
      expect(Number.isSafeInteger(result.totalRoundingSurplus)).toBe(true);
      result.charges.forEach(c => {
        expect(Number.isSafeInteger(c.totalCharge)).toBe(true);
        expect(c.totalCharge % 50_000).toBe(0);
      });
    });

    it('T5.1.7 [Monotonic Credit Depletion]: Double-entry settlement strictly drains credit without phantom resurrection', () => {
      // Unit starts with positive credit (represented as negative balance: -5,000,000)
      let ledgerBalance = -5_000_000;

      // Charge 1: 3,000,000
      const s1 = applyCreditSettlement(3_000_000, ledgerBalance);
      expect(s1.appliedCredit).toBe(3_000_000);
      expect(s1.netPayable).toBe(0);
      expect(s1.newBalance).toBe(-2_000_000);
      ledgerBalance = s1.newBalance;

      // Charge 2: 2,500,000 (exceeds remaining 2,000,000 credit)
      const s2 = applyCreditSettlement(2_500_000, ledgerBalance);
      expect(s2.appliedCredit).toBe(2_000_000);
      expect(s2.netPayable).toBe(500_000);
      expect(s2.newBalance).toBe(500_000); // Transitions to debt (+500,000)
      ledgerBalance = s2.newBalance;

      // Charge 3: 1,000,000 (zero credit available)
      const s3 = applyCreditSettlement(1_000_000, ledgerBalance);
      expect(s3.appliedCredit).toBe(0);
      expect(s3.netPayable).toBe(1_000_000);
      expect(s3.newBalance).toBe(1_500_000); // Debt increases monotonically to 1,500,000
    });

    it('T5.1.8 [Adversarial Distribute Weights]: Handles 0 weights, negative weights, and empty recipients', () => {
      // Empty recipients
      const emptyRes = distributeLargestRemainder(100_000, []);
      expect(emptyRes.size).toBe(0);

      // Total amount <= 0
      const zeroAmt = distributeLargestRemainder(0, [{ id: '1', weight: 10, unitNumber: 1 }]);
      expect(zeroAmt.get('1')).toBe(0);

      const negAmt = distributeLargestRemainder(-50_000, [{ id: '1', weight: 10, unitNumber: 1 }]);
      expect(negAmt.get('1')).toBe(0);

      // All zero weights -> fallback to equal distribution
      const zeroWeights = distributeLargestRemainder(100, [
        { id: 'a', weight: 0, unitNumber: 1 },
        { id: 'b', weight: 0, unitNumber: 2 }
      ]);
      expect(zeroWeights.get('a')).toBe(50);
      expect(zeroWeights.get('b')).toBe(50);

      // Negative weights sanitized to 0
      const mixedWeights = distributeLargestRemainder(100, [
        { id: 'pos', weight: 5, unitNumber: 1 },
        { id: 'neg', weight: -10, unitNumber: 2 }
      ]);
      expect(mixedWeights.get('pos')).toBe(100);
      expect(mixedWeights.get('neg')).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 2: LOSSLESS MIGRATION SERVICE HARDENING (migrationService.ts)
  // =========================================================================
  describe('Suite 2: Lossless Data Migration Invariant Hardening', () => {
    let mockTx: any;
    let localDb: {
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

    beforeEach(() => {
      localDb = {
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
            if (where.id) return localDb.complexes.get(where.id) || null;
            if (where.slug) {
              for (const c of localDb.complexes.values()) {
                if (c.slug === where.slug) return c;
              }
            }
            return null;
          }),
          create: vi.fn(async ({ data }) => {
            const rec = { ...data };
            localDb.complexes.set(rec.id, rec);
            return rec;
          }),
          update: vi.fn(async ({ where, data }) => {
            const ex = localDb.complexes.get(where.id) || {};
            const updated = { ...ex, ...data };
            localDb.complexes.set(where.id, updated);
            return updated;
          })
        },
        building: {
          findFirst: vi.fn(async ({ where }) => {
            for (const b of localDb.buildings.values()) {
              if (b.complexId === where.complexId) return b;
            }
            return null;
          }),
          create: vi.fn(async ({ data }) => {
            const rec = { id: `bld-${Date.now()}`, ...data };
            localDb.buildings.set(rec.id, rec);
            return rec;
          })
        },
        unit: {
          upsert: vi.fn(async ({ where, create, update }) => {
            const key = `${where.complexId_unitNumber.complexId}:${where.complexId_unitNumber.unitNumber}`;
            let existing = localDb.units.get(key);
            if (existing) {
              existing = { ...existing, ...update };
            } else {
              existing = { id: `unit-${where.complexId_unitNumber.unitNumber}`, ...create };
            }
            localDb.units.set(key, existing);
            return existing;
          }),
          findMany: vi.fn(async ({ where }) => {
            return Array.from(localDb.units.values()).filter(u => u.complexId === where.complexId);
          })
        },
        resident: {
          upsert: vi.fn(async ({ where, create, update }) => {
            const key = `${where.complexId_phone.complexId}:${where.complexId_phone.phone}`;
            let existing = localDb.residents.get(key);
            if (existing) {
              existing = { ...existing, ...update };
            } else {
              existing = { id: `res-${where.complexId_phone.phone}`, ...create };
            }
            localDb.residents.set(key, existing);
            return existing;
          })
        },
        unitResident: {
          upsert: vi.fn(async () => ({}))
        },
        period: {
          upsert: vi.fn(async ({ where, create }) => {
            const rec = { id: `prd-${where.complexId_type_year_month.month}`, ...create };
            localDb.periods.set(rec.id, rec);
            return rec;
          }),
          deleteMany: vi.fn(async () => ({ count: 0 }))
        },
        unitCharge: {
          upsert: vi.fn(async () => ({}))
        },
        ledgerTransaction: {
          upsert: vi.fn(async ({ create }) => {
            localDb.transactions.set(create.transactionId, create);
            return create;
          }),
          deleteMany: vi.fn(async () => ({ count: 0 }))
        },
        auditLog: {
          create: vi.fn(async ({ data }) => {
            localDb.auditLogs.push(data);
            return data;
          })
        }
      };

      vi.spyOn(rawPrisma, '$transaction').mockImplementation(async (cb: any) => {
        return await cb(mockTx);
      });
    });

    it('T5.2.1 [100% Vacant Complex Migration]: Migrates complex where all units have 0 occupants', async () => {
      const complexId = 'cpx-mig-vacant';
      const payload = {
        complexName: 'مجتمع کاملاً نوساز و خالی',
        initialFund: 10_000_000,
        units: [
          { unitNumber: 1, area: 100, occupants: 0, balance: 0, hasPackage: true },
          { unitNumber: 2, area: 120, occupants: 0, balance: 0, hasPackage: true },
          { unitNumber: 3, area: 150, occupants: 0, balance: 0, hasPackage: false }
        ],
        expectedEndingFund: 10_000_000,
        expectedTotalDebts: 0
      };

      const result = await migrationService.executeMigration(complexId, payload as any);

      expect(result.success).toBe(true);
      expect(result.unitsImported).toBe(3);
      expect(result.fundDiscrepancy).toBe(0);
      expect(result.debtDiscrepancy).toBe(0);

      // Verify all units recorded with VACANT occupancy
      const units = Array.from(localDb.units.values());
      expect(units).toHaveLength(3);
      units.forEach(u => {
        expect(u.occupants).toBe(0);
        expect(u.occType).toBe('VACANT');
      });
    });

    it('T5.2.2 [Extreme Financial Scale Migration]: 100 Billion Rials with multi-period reconciliation', async () => {
      const complexId = 'cpx-mig-extreme';
      const payload = {
        complexName: 'مجتمع بزرگ تجاری پارس',
        initialFund: 100_000_000_000, // 100 Billion Rials
        units: [
          { unitNumber: 101, area: 250, occupants: 5, balance: -15_000_000_000 }, // 15B debt
          { unitNumber: 102, area: 300, occupants: 6, balance: -10_000_000_000 }, // 10B debt
          { unitNumber: 103, area: 400, occupants: 8, balance: 5_000_000_000 }   // 5B credit
        ],
        periods: [
          {
            title: 'دوره ویژه نوسازی چیلرها',
            totalExpenses: 20_000_000_000,
            isClosed: true,
            payments: [
              { amount: 12_000_000_000, unitId: 101 }
            ]
          }
        ],
        // Ending Fund = Initial (100B) + Payments (12B) - Expenses (20B) = 92 Billion
        expectedEndingFund: 92_000_000_000,
        // Debts = Units with balance < 0 (15B + 10B = 25 Billion)
        expectedTotalDebts: 25_000_000_000
      };

      const result = await migrationService.executeMigration(complexId, payload as any);

      expect(result.success).toBe(true);
      expect(result.calculatedEndingFund).toBe(92_000_000_000);
      expect(result.fundDiscrepancy).toBe(0);
      expect(result.debtDiscrepancy).toBe(0);
    });

    it('T5.2.3 [Reconciliation Mismatch Defense]: Rejects mismatched ending fund with MigrationReconciliationError', async () => {
      const complexId = 'cpx-mig-mismatch';
      const payload = {
        complexName: 'مجتمع عدم تطابق',
        initialFund: 5_000_000,
        units: [{ unitNumber: 1, area: 100, occupants: 2, balance: 0 }],
        expectedEndingFund: 999_999_999 // Intentionally mismatched!
      };

      await expect(migrationService.executeMigration(complexId, payload as any))
        .rejects
        .toThrow(MigrationReconciliationError);
    });

    it('T5.2.4 [Duplicate Unit Defense]: Rejects duplicate unit numbers during migration', async () => {
      const complexId = 'cpx-mig-dup';
      const payload = {
        complexName: 'مجتمع واحد تکراری',
        initialFund: 5_000_000,
        units: [
          { unitNumber: 101, area: 100, occupants: 2, balance: 0 },
          { unitNumber: 101, area: 100, occupants: 3, balance: 0 } // Duplicate 101!
        ]
      };

      await expect(migrationService.executeMigration(complexId, payload as any))
        .rejects
        .toThrow(/Duplicate unit number 101/);
    });
  });

  // =========================================================================
  // SECTION 3: BACKEND ROUTE INTEGRATION & CONCURRENCY HARDENING
  // =========================================================================
  describe('Suite 3: Backend Routes Concurrency & Period Lifecycle Hardening', () => {
    let server: FastifyInstance;
    let managerToken: string;
    let complexAlphaId = 'cpx-alpha-tier5';
    let unitAlpha1Id = '30000000-0000-0000-0000-000000000101';
    let unitAlpha2Id = '30000000-0000-0000-0000-000000000102';

    const db = {
      complexes: new Map<string, any>(),
      buildings: new Map<string, any>(),
      units: new Map<string, any>(),
      residents: new Map<string, any>(),
      periods: new Map<string, any>(),
      unitCharges: new Map<string, any>(),
      transactions: new Map<string, any>(),
      auditLogs: [] as any[]
    };

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      server = await buildServer();
      await server.ready();

      managerToken = signAccessToken({
        sub: 'mgr-tier5-uuid',
        phone: '09121111111',
        role: 'COMPLEX_MANAGER',
        complexId: complexAlphaId,
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
    });

    afterAll(async () => {
      await server.close();
    });

    beforeEach(() => {
      db.complexes.clear();
      db.buildings.clear();
      db.units.clear();
      db.residents.clear();
      db.periods.clear();
      db.unitCharges.clear();
      db.transactions.clear();
      db.auditLogs = [];

      db.complexes.set(complexAlphaId, {
        id: complexAlphaId,
        name: 'مجتمع الفا رتبه ۵',
        unitCount: 2,
        initialFund: 10_000_000,
        currentFund: 10_000_000,
        roundStep: 50000,
        currency: 'IRT'
      });

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

      db.units.set(unitAlpha2Id, {
        id: unitAlpha2Id,
        complexId: complexAlphaId,
        unitNumber: 102,
        unitName: 'واحد ۱۰۲',
        area: 120,
        occupants: 2,
        occType: 'OWNER_OCCUPIED',
        hasPackage: false,
        currentBalance: 0
      });

      // Spies for rawPrisma
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

      vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockImplementation(async ({ data }: any) => {
        const rec = { id: `tx-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
        db.transactions.set(rec.id, rec);
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

    it('T5.3.1 [High-Frequency Concurrent Payments]: 25 concurrent payments execute without lost updates', async () => {
      const initialFund = db.complexes.get(complexAlphaId).currentFund;
      const initialBalance = db.units.get(unitAlpha1Id).currentBalance;

      const paymentCount = 25;
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
            referenceNumber: `CONC-T5-${i}`,
            description: `واریز همزمان شماره ${i}`
          }
        })
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.statusCode).toBe(201);
      }

      const expectedFund = initialFund + paymentCount * paymentAmount;
      const expectedBalance = initialBalance + paymentCount * paymentAmount;

      expect(db.complexes.get(complexAlphaId).currentFund).toBe(expectedFund);
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(expectedBalance);
      expect(db.transactions.size).toBe(paymentCount);
    });

    it('T5.3.2 [Zero-Expense Period Lifecycle]: Full lifecycle with 0 expenses produces zero charges and zero unit debits', async () => {
      // 1. Create period with 0 expenses
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'دوره صفر ریالی آزمایشی',
          year: 1403,
          month: '11_zero',
          type: 'MONTHLY',
          fixedCost: 0,
          waterCost: 0,
          gasCost: 0,
          electricityCost: 0,
          incidentalCost: 0
        }
      });
      expect(createRes.statusCode).toBe(201);
      const periodId = createRes.json().id;

      // 2. Publish period
      const pubRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(pubRes.statusCode).toBe(200);

      // Charges created with 0 amount
      const charges = Array.from(db.unitCharges.values()).filter(c => c.periodId === periodId);
      expect(charges).toHaveLength(2);
      charges.forEach(c => expect(c.amount).toBe(0));

      // 3. Close period
      const closeRes = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(closeRes.statusCode).toBe(200);
      expect(closeRes.json().status).toBe('CLOSED');
      expect(closeRes.json().totalCollectedAmount).toBe(0);

      // Verify no ledger transactions generated for 0 charge
      const txs = Array.from(db.transactions.values()).filter(t => t.periodId === periodId);
      expect(txs).toHaveLength(0);

      // Verify unit balances remain exactly 0
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(0);
      expect(db.units.get(unitAlpha2Id).currentBalance).toBe(0);
    });

    it('T5.3.3 [Sequential Period Closing Idempotency]: Closing an already-closed period is safely blocked', async () => {
      // 1. Create and publish period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'دوره مسدودی ۱',
          year: 1403,
          month: '12_idem',
          type: 'MONTHLY',
          fixedCost: 100_000
        }
      });
      const periodId = createRes.json().id;

      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      // 2. First close -> HTTP 200
      const close1 = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(close1.statusCode).toBe(200);
      expect(close1.json().status).toBe('CLOSED');

      // 3. Second close -> HTTP 400 blocked
      const close2 = await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/close`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(close2.statusCode).toBe(400);
      expect(close2.json().error).toContain('Only ACTIVE periods can be closed');
    });

    it('T5.3.4 [Concurrent Period Close TOCTOU Analysis]: Verifies race condition resilience during simultaneous close attempts', async () => {
      // Create and publish period
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/periods',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'دوره آزمون مسدودی همزمان',
          year: 1403,
          month: '12_conc_close',
          type: 'MONTHLY',
          fixedCost: 200_000
        }
      });
      const periodId = createRes.json().id;

      await server.inject({
        method: 'POST',
        url: `/api/v1/periods/${periodId}/publish`,
        headers: { authorization: `Bearer ${managerToken}` }
      });

      const initialBal1 = db.units.get(unitAlpha1Id).currentBalance;
      const initialBal2 = db.units.get(unitAlpha2Id).currentBalance;

      // Two simultaneous close requests
      const [res1, res2] = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/api/v1/periods/${periodId}/close`,
          headers: { authorization: `Bearer ${managerToken}` }
        }),
        server.inject({
          method: 'POST',
          url: `/api/v1/periods/${periodId}/close`,
          headers: { authorization: `Bearer ${managerToken}` }
        })
      ]);

      // Exactly one request should succeed (200), the other should receive 400 (or if both serialized/handled, total debit strictly equals charge)
      const successCount = [res1, res2].filter(r => r.statusCode === 200).length;
      const errorCount = [res1, res2].filter(r => r.statusCode === 400).length;

      // Assert that unit balances are not double-debited
      // B_final must be initialBal - 200_000 (NOT initialBal - 400_000)
      const expectedBal1 = initialBal1 - 200_000;
      const expectedBal2 = initialBal2 - 200_000;

      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(expectedBal1);
      expect(db.units.get(unitAlpha2Id).currentBalance).toBe(expectedBal2);
    });

    it('T5.3.5 [Cross-Tenant Concurrency Isolation]: Concurrent mutations across separate complexes are fully isolated', async () => {
      const complexBetaId = 'cpx-beta-tier5';
      const unitBetaId = '30000000-0000-0000-0000-000000000201';

      db.complexes.set(complexBetaId, {
        id: complexBetaId,
        name: 'مجتمع بتا',
        unitCount: 1,
        initialFund: 5_000_000,
        currentFund: 5_000_000
      });

      db.units.set(unitBetaId, {
        id: unitBetaId,
        complexId: complexBetaId,
        unitNumber: 201,
        area: 100,
        occupants: 2,
        currentBalance: 0
      });

      const managerBetaToken = signAccessToken({
        sub: 'mgr-beta-uuid',
        phone: '09122222222',
        role: 'COMPLEX_MANAGER',
        complexId: complexBetaId,
        permissions: ['RECORD_PAYMENTS', 'MANAGE_PERIODS']
      });

      // Concurrently run payment in Alpha and payment in Beta
      const [resAlpha, resBeta] = await Promise.all([
        server.inject({
          method: 'POST',
          url: '/api/v1/payments',
          headers: { authorization: `Bearer ${managerToken}` },
          payload: {
            unitId: unitAlpha1Id,
            amount: 500_000,
            paymentMethod: 'CARD_TRANSFER'
          }
        }),
        server.inject({
          method: 'POST',
          url: '/api/v1/payments',
          headers: { authorization: `Bearer ${managerBetaToken}` },
          payload: {
            unitId: unitBetaId,
            amount: 750_000,
            paymentMethod: 'CARD_TRANSFER'
          }
        })
      ]);

      expect(resAlpha.statusCode).toBe(201);
      expect(resBeta.statusCode).toBe(201);

      // Verify strict isolation
      expect(db.units.get(unitAlpha1Id).currentBalance).toBe(resAlpha.json().amount);
      expect(db.units.get(unitBetaId).currentBalance).toBe(750_000);
      expect(db.complexes.get(complexBetaId).currentFund).toBe(5_000_000 + 750_000);
    });
  });
});

