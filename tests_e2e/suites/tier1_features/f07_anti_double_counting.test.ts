import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 7: Bug Fix - Anti-Double-Counting Fund Income', () => {
  it('T1.7.1: should increment treasury cash fund only when actual payment transaction is recorded', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Alpha Complex', initialFund: 5_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A',
    });

    assert.equal(harness.getTreasuryBalance(cpx.id), 5_000_000);

    harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 2_000_000,
      description: 'Advance charge deposit',
    });

    assert.equal(harness.getTreasuryBalance(cpx.id), 7_000_000);
  });

  it('T1.7.2: should not artificially double-count treasury fund when closing a period with existing credit', () => {
    // When a resident paid 2,000,000 cash earlier, fund grew from 5M to 7M.
    // When period closes with 2,000,000 charge against this credit, fund must STAY 7M, NOT become 9M!
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Beta Complex', initialFund: 5_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A',
    });

    // Resident pays 2,000,000 advance
    harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 2_000_000,
    });
    assert.equal(harness.getTreasuryBalance(cpx.id), 7_000_000);

    // Period closes with 2,000,000 charge
    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Month 1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 2_000_000 },
    });

    // Treasury fund must remain exactly 7,000,000 (no double-counting)
    assert.equal(harness.getTreasuryBalance(cpx.id), 7_000_000);
  });

  it('T1.7.3: should not record uncollected resident debt as liquid cash fund', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Gamma Complex', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A',
      initialBalance: 0,
    });

    // Period billed 3,000,000. Resident didn't pay yet (balance = -3M).
    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Month 1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 3_000_000 },
    });

    assert.equal(harness.getUnit(unit.id)?.balance, -3_000_000);
    // Cash fund remains 10M, not 13M
    assert.equal(harness.getTreasuryBalance(cpx.id), 10_000_000);
  });

  it('T1.7.4: should increase treasury cash only when the indebted resident actually pays', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Delta Complex', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A',
      initialBalance: 0,
    });

    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Month 1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 4_000_000 },
    });

    assert.equal(harness.getTreasuryBalance(cpx.id), 10_000_000);

    // Resident settles 4,000,000 debt
    harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 4_000_000,
      description: 'Debt settlement',
    });

    assert.equal(harness.getUnit(unit.id)?.balance, 0);
    assert.equal(harness.getTreasuryBalance(cpx.id), 14_000_000);
  });

  it('T1.7.5: should maintain exact treasury accounting reconciliation across mixed payments', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Reconciliation Complex', initialFund: 20_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 2, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: 1_000_000 });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B', initialBalance: 0 });

    // Additional manual payment for U2: 2,000,000
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 2_000_000 });

    // Treasury is 20M + 2M = 22M
    assert.equal(harness.getTreasuryBalance(cpx.id), 22_000_000);

    // Close period with 1,500,000 charge per unit
    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Period Q1',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      expenses: { fixedPerUnit: 1_500_000 },
    });

    // U1 had 1M -> now -500k (debt)
    // U2 had 2M -> now +500k (credit)
    assert.equal(harness.getUnit(u1.id)?.balance, -500_000);
    assert.equal(harness.getUnit(u2.id)?.balance, 500_000);

    // Treasury remains 22M
    assert.equal(harness.getTreasuryBalance(cpx.id), 22_000_000);
  });
});
