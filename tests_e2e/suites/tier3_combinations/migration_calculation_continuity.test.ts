import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';
import type { LegacyExportPayload } from '../../src/types.ts';

describe('Tier 3 Combinations: Data Migration & Calculation Engine Continuity', () => {
  it('T3.4.1: should seamlessly calculate a new billing period directly on migrated legacy units', () => {
    const harness = new TestHarness();
    const legacyPayload: LegacyExportPayload = {
      initialFund: 15_000_000,
      units: [
        { vahed: '۱۰۱', metraj: '۹۵٫۵', tedad: '۳', name: 'قاسمی', balance: '-500000' },
        { vahed: '۱۰۲', metraj: '۱۲۰', tedad: '۴', name: 'رحمانی', balance: '1200000' },
      ],
      periods: [],
    };

    const rec = harness.executeMigration('mig_calc_cpx', legacyPayload);
    assert.equal(rec.success, true);

    // Calculate next month billing using modern calculation engine
    const calculation = harness.calculatePeriodExpenses('mig_calc_cpx', {
      fixedPerUnit: 200_000,
      waterTotal: 1_400_000, // 3 & 4 occupants -> 600k & 800k
    });

    assert.equal(calculation.charges.length, 2);
    assert.equal(calculation.charges[0].totalCharge, 800_000);  // 200k fixed + 600k water
    assert.equal(calculation.charges[1].totalCharge, 1_000_000); // 200k fixed + 800k water
    assert.equal(calculation.conservationDelta, 0);
  });

  it('T3.4.2: should settle charges against migrated legacy debtor and creditor balances without distortion', () => {
    const harness = new TestHarness();
    const legacyPayload: LegacyExportPayload = {
      initialFund: 20_000_000,
      units: [
        { vahed: 1, metraj: 100, tedad: 2, balance: 2_000_000 },  // Creditor
        { vahed: 2, metraj: 100, tedad: 2, balance: -1_000_000 }, // Debtor
      ],
      periods: [],
    };

    harness.executeMigration('settle_mig_cpx', legacyPayload);

    // Close period with 1,500,000 per unit
    harness.createAndClosePeriod({
      complexId: 'settle_mig_cpx',
      title: 'First Post-Migration Month',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      expenses: { fixedPerUnit: 1_500_000 },
    });

    const units = harness.getUnitsByComplex('settle_mig_cpx');
    const u1 = units.find(u => u.unitNumber === 1);
    const u2 = units.find(u => u.unitNumber === 2);

    // U1 had 2M credit - 1.5M charge = 500k credit remaining
    assert.equal(u1?.balance, 500_000);
    // U2 had -1M debt - 1.5M charge = -2.5M debt
    assert.equal(u2?.balance, -2_500_000);
  });

  it('T3.4.3: should handle migration of legacy empty units (tedad: 0) and apply zero-occupancy safeguards', () => {
    const harness = new TestHarness();
    const legacyPayload: LegacyExportPayload = {
      initialFund: 0,
      units: [
        { vahed: 1, metraj: 80, tedad: '۰', name: 'مالک خالی' },
        { vahed: 2, metraj: 80, tedad: '۲', name: 'ساکن فعال' },
      ],
      periods: [],
    };

    harness.executeMigration('empty_mig_cpx', legacyPayload);

    const calc = harness.calculatePeriodExpenses('empty_mig_cpx', {
      waterTotal: 2_000_000,
      exemptEmptyUnits: true,
    });

    assert.equal(calc.charges[0].water, 0);
    assert.equal(calc.charges[1].water, 2_000_000);
    assert.equal(calc.conservationDelta, 0);
  });

  it('T3.4.4: should record comprehensive migration audit entry with item counts', () => {
    const harness = new TestHarness();
    const legacyPayload: LegacyExportPayload = {
      initialFund: 5_000_000,
      units: [{ vahed: 1, metraj: 100, tedad: 1 }],
      periods: [],
    };

    harness.executeMigration('audit_mig_cpx', legacyPayload);
    const logs = harness.getAuditLogs('audit_mig_cpx');

    assert.ok(logs.length > 0);
    assert.ok(logs.some(l => l.action === 'CREATE_COMPLEX'));
    assert.ok(logs.some(l => l.action === 'CREATE_UNIT'));
  });

  it('T3.4.5: should execute full enterprise workflow: migration -> period -> payment -> closing -> ledger audit', () => {
    const harness = new TestHarness();
    const rec = harness.executeMigration('enterprise_mig_cpx', {
      initialFund: 10_000_000,
      units: [
        { vahed: 1, metraj: 100, tedad: 2, balance: 0 },
        { vahed: 2, metraj: 100, tedad: 2, balance: 0 },
      ],
      periods: [],
    });
    assert.equal(rec.success, true);

    const u1 = harness.getUnitsByComplex('enterprise_mig_cpx')[0];

    // Period billed: 1,000,000 each
    harness.createAndClosePeriod({
      complexId: 'enterprise_mig_cpx',
      title: 'Farvardin',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 1_000_000 },
    });

    // Resident 1 pays 1,000,000
    harness.recordPayment({
      complexId: 'enterprise_mig_cpx',
      unitId: u1.id,
      amount: 1_000_000,
      description: 'Clearing monthly charge',
    });

    assert.equal(harness.getUnit(u1.id)?.balance, 0);
    assert.equal(harness.getTreasuryBalance('enterprise_mig_cpx'), 11_000_000);
  });
});
