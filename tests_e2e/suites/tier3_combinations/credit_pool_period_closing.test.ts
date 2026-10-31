import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 3 Combinations: Credit Pool & Period Closing Lifecycle', () => {
  it('T3.3.1: should maintain continuous balance continuity across 3 sequential billing cycles', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Sequential Tower', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: 3_000_000 });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B', initialBalance: 0 });

    // Cycle 1: Fixed charge 1,000,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Month 1', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 1_000_000 },
    });
    assert.equal(harness.getUnit(u1.id)?.balance, 2_000_000);
    assert.equal(harness.getUnit(u2.id)?.balance, -1_000_000);

    // Cycle 2: Fixed charge 1,000,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Month 2', startDate: '2026-02-01', endDate: '2026-02-28',
      expenses: { fixedPerUnit: 1_000_000 },
    });
    assert.equal(harness.getUnit(u1.id)?.balance, 1_000_000);
    assert.equal(harness.getUnit(u2.id)?.balance, -2_000_000);

    // Cycle 3: Fixed charge 1,500,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Month 3', startDate: '2026-03-01', endDate: '2026-03-31',
      expenses: { fixedPerUnit: 1_500_000 },
    });
    assert.equal(harness.getUnit(u1.id)?.balance, -500_000);
    assert.equal(harness.getUnit(u2.id)?.balance, -3_500_000);
  });

  it('T3.3.2: should apply mid-cycle prepayment and auto-offset against subsequent period charge', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Prepayment Tower' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: 0 });

    // Resident prepays 5,000,000 in cash
    harness.recordPayment({ complexId: cpx.id, unitId: unit.id, amount: 5_000_000 });
    assert.equal(harness.getUnit(unit.id)?.balance, 5_000_000);

    // Period 1 arrives with 2,000,000 charge
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'P1', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 2_000_000 },
    });
    assert.equal(harness.getUnit(unit.id)?.balance, 3_000_000);

    // Period 2 arrives with 2,000,000 charge
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'P2', startDate: '2026-02-01', endDate: '2026-02-28',
      expenses: { fixedPerUnit: 2_000_000 },
    });
    assert.equal(harness.getUnit(unit.id)?.balance, 1_000_000);
  });

  it('T3.3.3: should track exact treasury conservation when some units pay cash while others consume credit', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Mixed Tower', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'Credit Unit', initialBalance: 4_000_000 });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'Cash Unit', initialBalance: 0 });

    // U2 pays 2,000,000 cash upfront
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 2_000_000 });
    assert.equal(harness.getTreasuryBalance(cpx.id), 12_000_000);

    // Period charges 2,000,000 per unit
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Month 1', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 2_000_000 },
    });

    assert.equal(harness.getUnit(u1.id)?.balance, 2_000_000);
    assert.equal(harness.getUnit(u2.id)?.balance, 0);
    // Treasury remains 12,000,000
    assert.equal(harness.getTreasuryBalance(cpx.id), 12_000_000);
  });

  it('T3.3.4: should prevent period closing from resetting custom unit attributes', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Attributes Tower' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 10, floor: 3, area: 115.5, occupants: 4, hasPackage: false, ownerName: 'Mr. X',
    });

    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Closing Test', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 500_000 },
    });

    const refreshed = harness.getUnit(unit.id);
    assert.equal(refreshed?.area, 115.5);
    assert.equal(refreshed?.occupants, 4);
    assert.equal(refreshed?.hasPackage, false);
    assert.equal(refreshed?.ownerName, 'Mr. X');
  });

  it('T3.3.5: should correctly generate period charge transaction entries for every unit', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Tx Log Tower' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    const { period } = harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Tx Period', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 750_000 },
    });

    const u1Txs = harness.getTransactionsByUnit(u1.id);
    const u2Txs = harness.getTransactionsByUnit(u2.id);

    assert.equal(u1Txs.length, 1);
    assert.equal(u2Txs.length, 1);
    assert.equal(u1Txs[0].type, 'PERIOD_CHARGE');
    assert.equal(u1Txs[0].amount, 750_000);
    assert.equal(u1Txs[0].periodId, period.id);
  });
});
