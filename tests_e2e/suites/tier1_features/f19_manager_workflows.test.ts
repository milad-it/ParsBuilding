import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 19: Friction-Free Manager Workflows', () => {
  it('T1.19.1: should support frictionless unit creation and batch occupant update', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Workflow Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 3, unitsCount: 3 });

    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 110, occupants: 3, ownerName: 'B' });

    harness.updateUnit(u1.id, { occupants: 4 });
    harness.updateUnit(u2.id, { occupants: 1 });

    assert.equal(harness.getUnit(u1.id)?.occupants, 4);
    assert.equal(harness.getUnit(u2.id)?.occupants, 1);
  });

  it('T1.19.2: should support one-click period charge generation with real-time preview', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Preview Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    // Preview calculation without closing period
    const preview = harness.calculatePeriodExpenses(cpx.id, { fixedPerUnit: 500_000, waterTotal: 1_000_000 });
    assert.equal(preview.charges.length, 2);
    assert.equal(preview.totalDistributed, 2_000_000);
    assert.equal(preview.conservationDelta, 0);
  });

  it('T1.19.3: should complete seamless end-of-month period closing workflow', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Closing Complex', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: 500_000 });

    const { period, settlement } = harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Farvardin 1404',
      startDate: '2025-03-21',
      endDate: '2025-04-20',
      expenses: { fixedPerUnit: 1_500_000 },
    });

    assert.equal(period.isClosed, true);
    // 500k credit was applied, leaving 1,000,000 debt
    assert.equal(harness.getUnit(unit.id)?.balance, -1_000_000);
    assert.equal(settlement.totalCollectedFromCredit, 500_000);
  });

  it('T1.19.4: should provide instant payment registration and receipt logging', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Payment Log Complex', initialFund: 5_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: -1_000_000 });

    const tx = harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 1_000_000,
      description: 'Settling outstanding balance',
    });

    assert.equal(tx.amount, 1_000_000);
    assert.equal(harness.getUnit(unit.id)?.balance, 0);
    assert.equal(harness.getTreasuryBalance(cpx.id), 6_000_000);
  });

  it('T1.19.5: should generate clear building financial ledger statements for manager audits', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Summary Complex', initialFund: 8_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.recordPayment({ complexId: cpx.id, unitId: u1.id, amount: 2_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 3_000_000 });

    const totalBalance = harness.getTreasuryBalance(cpx.id);
    assert.equal(totalBalance, 13_000_000);
  });
});
