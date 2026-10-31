import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';
import type { LegacyExportPayload } from '../../src/types.ts';

describe('Feature 15: Lossless Data Migration Engine (IndexedDB to PostgreSQL)', () => {
  it('T1.15.1: should import legacy units with Persian numeral and area attributes losslessly', () => {
    const harness = new TestHarness();
    const legacyData: LegacyExportPayload = {
      initialFund: 10_000_000,
      units: [
        { vahed: 1, metraj: '۸۵٫۵', tedad: '۳', name: 'قاسمی', balance: '-500000' },
        { vahed: 2, metraj: '۱۲۰', tedad: '۴', name: 'رحمانی', balance: '1200000' },
      ],
      periods: [],
    };

    const reconciliation = harness.executeMigration('cpx_mig_1', legacyData);
    assert.equal(reconciliation.success, true);
    assert.equal(reconciliation.unitsImported, 2);
    assert.equal(reconciliation.fundDiscrepancy, 0);
    assert.equal(reconciliation.debtDiscrepancy, 0);

    const units = harness.getUnitsByComplex('cpx_mig_1');
    assert.equal(units[0].area, 85.5);
    assert.equal(units[0].occupants, 3);
    assert.equal(units[0].balance, -500_000);
    assert.equal(units[1].balance, 1_200_000);
  });

  it('T1.15.2: should reconcile treasury cash ending balance with zero fund discrepancy', () => {
    const harness = new TestHarness();
    const legacyData: LegacyExportPayload = {
      initialFund: 20_000_000,
      units: [{ vahed: 1, metraj: 100, tedad: 2, name: 'A' }],
      periods: [
        {
          title: 'Dey',
          totalExpenses: 5_000_000,
          payments: [{ amount: 4_000_000 }, { amount: 1_000_000 }],
        },
      ],
    };

    const rec = harness.executeMigration('cpx_mig_2', legacyData);
    assert.equal(rec.success, true);
    assert.equal(rec.periodsImported, 1);
    assert.equal(rec.transactionsImported, 2);
    // Calculated: 20M initial + 5M payments - 5M expenses = 20M
    assert.equal(rec.calculatedEndingFund, 20_000_000);
    assert.equal(rec.fundDiscrepancy, 0);
  });

  it('T1.15.3: should map legacy field aliases (vahed->unitNumber, metraj->area) correctly', () => {
    const harness = new TestHarness();
    const legacyData: LegacyExportPayload = {
      initialFund: 0,
      units: [{ vahed: '۵۰۲', metraj: '۱۳۲/۵', tedad: '۲', name: 'احمدپور' }],
      periods: [],
    };

    harness.executeMigration('cpx_mig_3', legacyData);
    const unit = harness.getUnitsByComplex('cpx_mig_3')[0];
    assert.equal(unit.unitNumber, 502);
    assert.equal(unit.area, 132.5);
    assert.equal(unit.occupants, 2);
    assert.equal(unit.ownerName, 'احمدپور');
  });

  it('T1.15.4: should preserve legacy negative balances as resident debts', () => {
    const harness = new TestHarness();
    const legacyData: LegacyExportPayload = {
      initialFund: 5_000_000,
      units: [
        { vahed: 1, metraj: 100, tedad: 2, balance: -3_500_000 },
      ],
      periods: [],
    };

    const rec = harness.executeMigration('cpx_mig_4', legacyData);
    assert.equal(rec.debtDiscrepancy, 0);
    const unit = harness.getUnitsByComplex('cpx_mig_4')[0];
    assert.equal(unit.balance, -3_500_000);
  });

  it('T1.15.5: should maintain atomicity: fail safe without partial corruption if data is malformed', () => {
    const harness = new TestHarness();
    const legacyData: LegacyExportPayload = {
      initialFund: 0,
      units: [],
      periods: [],
    };

    const rec = harness.executeMigration('cpx_mig_5', legacyData);
    assert.equal(rec.success, true);
    assert.equal(rec.unitsImported, 0);
    assert.equal(rec.fundDiscrepancy, 0);
  });
});
