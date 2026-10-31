import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 3 Combinations: Multi-Tenant & Calculation Isolation', () => {
  it('T3.1.1: should isolate calculations and formulas across two concurrent tenants', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Tenant Alpha', initialFund: 10_000_000 });
    const cpx2 = harness.createComplex({ name: 'Tenant Beta', initialFund: 50_000_000 });

    const b1 = harness.createBuilding({ complexId: cpx1.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const b2 = harness.createBuilding({ complexId: cpx2.id, name: 'B2', floorsCount: 1, unitsCount: 2 });

    harness.createUnit({ complexId: cpx1.id, buildingId: b1.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A1' });
    harness.createUnit({ complexId: cpx1.id, buildingId: b1.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'A2' });

    harness.createUnit({ complexId: cpx2.id, buildingId: b2.id, unitNumber: 1, floor: 1, area: 200, occupants: 4, ownerName: 'B1' });
    harness.createUnit({ complexId: cpx2.id, buildingId: b2.id, unitNumber: 2, floor: 1, area: 300, occupants: 6, ownerName: 'B2' });

    // Cpx1 bills 1,000,000 fixed; Cpx2 bills 5,000,000 area-based
    const calc1 = harness.calculatePeriodExpenses(cpx1.id, { fixedPerUnit: 1_000_000 });
    const calc2 = harness.calculatePeriodExpenses(cpx2.id, { areaExpenseTotal: 5_000_000 });

    assert.equal(calc1.totalDistributed, 2_000_000);
    assert.equal(calc2.totalDistributed, 5_000_000);
    assert.equal(calc1.charges.length, 2);
    assert.equal(calc2.charges.length, 2);
    assert.equal(calc1.conservationDelta, 0);
    assert.equal(calc2.conservationDelta, 0);
  });

  it('T3.1.2: should prevent units from Tenant A from ever appearing in Tenant B period charges', () => {
    const harness = new TestHarness();
    const cpxA = harness.createComplex({ name: 'Tenant A' });
    const cpxB = harness.createComplex({ name: 'Tenant B' });

    const bA = harness.createBuilding({ complexId: cpxA.id, name: 'BA', floorsCount: 1, unitsCount: 1 });
    const bB = harness.createBuilding({ complexId: cpxB.id, name: 'BB', floorsCount: 1, unitsCount: 1 });

    const uA = harness.createUnit({ complexId: cpxA.id, buildingId: bA.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'UA' });
    const uB = harness.createUnit({ complexId: cpxB.id, buildingId: bB.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'UB' });

    const { period: periodB } = harness.createAndClosePeriod({
      complexId: cpxB.id,
      title: 'Month B',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 500_000 },
    });

    const unitIdsBilledInB = periodB.charges.map(c => c.unitId);
    assert.ok(unitIdsBilledInB.includes(uB.id));
    assert.ok(!unitIdsBilledInB.includes(uA.id));
  });

  it('T3.1.3: should ensure period closing in Tenant A does not alter resident balances in Tenant B', () => {
    const harness = new TestHarness();
    const cpxA = harness.createComplex({ name: 'Tenant A' });
    const cpxB = harness.createComplex({ name: 'Tenant B' });

    const bA = harness.createBuilding({ complexId: cpxA.id, name: 'BA', floorsCount: 1, unitsCount: 1 });
    const bB = harness.createBuilding({ complexId: cpxB.id, name: 'BB', floorsCount: 1, unitsCount: 1 });

    harness.createUnit({ complexId: cpxA.id, buildingId: bA.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'UA', initialBalance: 1_000_000 });
    const uB = harness.createUnit({ complexId: cpxB.id, buildingId: bB.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'UB', initialBalance: 3_000_000 });

    // Close period in Tenant A only
    harness.createAndClosePeriod({
      complexId: cpxA.id,
      title: 'A Period',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { fixedPerUnit: 1_000_000 },
    });

    // Unit B balance must remain strictly untouched
    assert.equal(harness.getUnit(uB.id)?.balance, 3_000_000);
  });

  it('T3.1.4: should maintain segregated treasury balances under concurrent operations', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'C1', initialFund: 10_000_000 });
    const cpx2 = harness.createComplex({ name: 'C2', initialFund: 20_000_000 });

    const b1 = harness.createBuilding({ complexId: cpx1.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const b2 = harness.createBuilding({ complexId: cpx2.id, name: 'B2', floorsCount: 1, unitsCount: 1 });

    const u1 = harness.createUnit({ complexId: cpx1.id, buildingId: b1.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx2.id, buildingId: b2.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.recordPayment({ complexId: cpx1.id, unitId: u1.id, amount: 5_000_000 });
    harness.recordPayment({ complexId: cpx2.id, unitId: u2.id, amount: 2_000_000 });

    assert.equal(harness.getTreasuryBalance(cpx1.id), 15_000_000);
    assert.equal(harness.getTreasuryBalance(cpx2.id), 22_000_000);
  });

  it('T3.1.5: should segregate audit logs completely between tenants', () => {
    const harness = new TestHarness();
    const cpxA = harness.createComplex({ name: 'CA' });
    const cpxB = harness.createComplex({ name: 'CB' });

    const bA = harness.createBuilding({ complexId: cpxA.id, name: 'BA', floorsCount: 1, unitsCount: 1 });
    const bB = harness.createBuilding({ complexId: cpxB.id, name: 'BB', floorsCount: 1, unitsCount: 1 });

    harness.createUnit({ complexId: cpxA.id, buildingId: bA.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    harness.createUnit({ complexId: cpxB.id, buildingId: bB.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    const logsA = harness.getAuditLogs(cpxA.id);
    const logsB = harness.getAuditLogs(cpxB.id);

    assert.ok(logsA.every(l => l.complexId === cpxA.id));
    assert.ok(logsB.every(l => l.complexId === cpxB.id));
    assert.equal(logsA.some(l => l.complexId === cpxB.id), false);
  });
});
