import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 4 Workloads: Scenario W4 - Multi-Complex Enterprise SaaS Management', () => {
  it('T4.4.1: should model a master complex containing 3 distinct residential towers', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Ferdowsi Residential Complex', initialFund: 300_000_000 });

    const towerA = harness.createBuilding({ complexId: cpx.id, name: 'Tower A (Alborz)', floorsCount: 10, unitsCount: 20 });
    const towerB = harness.createBuilding({ complexId: cpx.id, name: 'Tower B (Damavand)', floorsCount: 10, unitsCount: 20 });
    const towerC = harness.createBuilding({ complexId: cpx.id, name: 'Tower C (Zagros)', floorsCount: 10, unitsCount: 20 });

    assert.equal(towerA.complexId, cpx.id);
    assert.equal(towerB.complexId, cpx.id);
    assert.equal(towerC.complexId, cpx.id);
  });

  it('T4.4.2: should calculate cross-tower shared expenses (security, landscaping) across all units', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Ferdowsi Residential Complex' });

    const tA = harness.createBuilding({ complexId: cpx.id, name: 'Tower A', floorsCount: 1, unitsCount: 2 });
    const tB = harness.createBuilding({ complexId: cpx.id, name: 'Tower B', floorsCount: 1, unitsCount: 2 });

    harness.createUnit({ complexId: cpx.id, buildingId: tA.id, unitNumber: 101, floor: 1, area: 100, occupants: 2, ownerName: 'A1' });
    harness.createUnit({ complexId: cpx.id, buildingId: tA.id, unitNumber: 102, floor: 1, area: 100, occupants: 2, ownerName: 'A2' });
    harness.createUnit({ complexId: cpx.id, buildingId: tB.id, unitNumber: 201, floor: 1, area: 100, occupants: 2, ownerName: 'B1' });
    harness.createUnit({ complexId: cpx.id, buildingId: tB.id, unitNumber: 202, floor: 1, area: 100, occupants: 2, ownerName: 'B2' });

    // Shared complex security contract: 8,000,000 Rials divided equally
    const calculation = harness.calculatePeriodExpenses(cpx.id, {
      incidentalTotal: 8_000_000,
    });

    assert.equal(calculation.charges.length, 4);
    for (const chg of calculation.charges) {
      assert.equal(chg.incidental, 2_000_000);
    }
    assert.equal(calculation.totalDistributed, 8_000_000);
    assert.equal(calculation.conservationDelta, 0);
  });

  it('T4.4.3: should isolate tower sub-managers with specific operational delegation', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Ferdowsi Complex' });
    const towerA = harness.createBuilding({ complexId: cpx.id, name: 'Tower A', floorsCount: 5, unitsCount: 10 });

    const subManagerTowerA = harness.createUser({
      username: 'submgr_tower_a',
      role: 'SUB_MANAGER',
      complexId: cpx.id,
      permissions: ['MANAGE_UNITS', 'MANAGE_RESIDENTS'],
    });

    assert.equal(harness.checkPermission(subManagerTowerA, 'MANAGE_UNITS'), true);
    assert.equal(harness.checkPermission(subManagerTowerA, 'CLOSE_PERIODS'), false);
  });

  it('T4.4.4: should generate consolidated master complex balance sheet aggregating all towers', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Ferdowsi Master', initialFund: 150_000_000 });
    const bldA = harness.createBuilding({ complexId: cpx.id, name: 'Tower A', floorsCount: 1, unitsCount: 1 });
    const bldB = harness.createBuilding({ complexId: cpx.id, name: 'Tower B', floorsCount: 1, unitsCount: 1 });

    const uA = harness.createUnit({ complexId: cpx.id, buildingId: bldA.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const uB = harness.createUnit({ complexId: cpx.id, buildingId: bldB.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.recordPayment({ complexId: cpx.id, unitId: uA.id, amount: 10_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: uB.id, amount: 15_000_000 });

    const consolidatedFund = harness.getTreasuryBalance(cpx.id);
    assert.equal(consolidatedFund, 175_000_000);
  });

  it('T4.4.5: should retain enterprise audit events across multiple towers under unified tenant context', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Enterprise Cpx' });
    const bA = harness.createBuilding({ complexId: cpx.id, name: 'Tower 1', floorsCount: 1, unitsCount: 1 });
    const bB = harness.createBuilding({ complexId: cpx.id, name: 'Tower 2', floorsCount: 1, unitsCount: 1 });

    const uA = harness.createUnit({ complexId: cpx.id, buildingId: bA.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const uB = harness.createUnit({ complexId: cpx.id, buildingId: bB.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.updateUnit(uA.id, { occupants: 3 }, 'actor_tower_1');
    harness.updateUnit(uB.id, { occupants: 4 }, 'actor_tower_2');

    const logs = harness.getAuditLogs(cpx.id);
    assert.ok(logs.some(l => l.actorId === 'actor_tower_1'));
    assert.ok(logs.some(l => l.actorId === 'actor_tower_2'));
  });
});
