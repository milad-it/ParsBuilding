import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 1: Multi-Tenant Database Schema & Scoping', () => {
  it('T1.1.1: should create independent complexes with unique identifiers and funds', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Tower A', initialFund: 10_000_000 });
    const cpx2 = harness.createComplex({ name: 'Tower B', initialFund: 25_000_000 });

    assert.notEqual(cpx1.id, cpx2.id);
    assert.equal(cpx1.currentFund, 10_000_000);
    assert.equal(cpx2.currentFund, 25_000_000);
  });

  it('T1.1.2: should maintain strict unit isolation scoped by complexId', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Complex 1' });
    const cpx2 = harness.createComplex({ name: 'Complex 2' });

    const bld1 = harness.createBuilding({ complexId: cpx1.id, name: 'Bld 1', floorsCount: 3, unitsCount: 3 });
    const bld2 = harness.createBuilding({ complexId: cpx2.id, name: 'Bld 2', floorsCount: 3, unitsCount: 3 });

    harness.createUnit({ complexId: cpx1.id, buildingId: bld1.id, unitNumber: 101, floor: 1, area: 120, occupants: 3, ownerName: 'User 1' });
    harness.createUnit({ complexId: cpx1.id, buildingId: bld1.id, unitNumber: 102, floor: 1, area: 95, occupants: 2, ownerName: 'User 2' });
    harness.createUnit({ complexId: cpx2.id, buildingId: bld2.id, unitNumber: 101, floor: 1, area: 150, occupants: 4, ownerName: 'User 3' });

    const cpx1Units = harness.getUnitsByComplex(cpx1.id);
    const cpx2Units = harness.getUnitsByComplex(cpx2.id);

    assert.equal(cpx1Units.length, 2);
    assert.equal(cpx2Units.length, 1);
    assert.equal(cpx1Units.every(u => u.complexId === cpx1.id), true);
    assert.equal(cpx2Units.every(u => u.complexId === cpx2.id), true);
  });

  it('T1.1.3: should enforce unique unit numbers within a building while allowing duplicate across complexes', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Complex A' });
    const cpx2 = harness.createComplex({ name: 'Complex B' });

    const bld1 = harness.createBuilding({ complexId: cpx1.id, name: 'B1', floorsCount: 2, unitsCount: 2 });
    const bld2 = harness.createBuilding({ complexId: cpx2.id, name: 'B2', floorsCount: 2, unitsCount: 2 });

    const u1 = harness.createUnit({ complexId: cpx1.id, buildingId: bld1.id, unitNumber: 201, floor: 2, area: 100, occupants: 2, ownerName: 'Owner A' });
    const u2 = harness.createUnit({ complexId: cpx2.id, buildingId: bld2.id, unitNumber: 201, floor: 2, area: 110, occupants: 3, ownerName: 'Owner B' });

    assert.equal(u1.unitNumber, u2.unitNumber);
    assert.notEqual(u1.complexId, u2.complexId);
    assert.notEqual(u1.id, u2.id);
  });

  it('T1.1.4: should support tenant context validation for user access control', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Tenant Alpha' });
    const cpx2 = harness.createComplex({ name: 'Tenant Beta' });

    const managerAlpha = harness.createUser({ username: 'mgr_a', role: 'COMPLEX_MANAGER', complexId: cpx1.id });
    const superAdmin = harness.createUser({ username: 'super', role: 'SUPER_ADMIN' });

    assert.equal(harness.verifyTenantIsolation(managerAlpha, cpx1.id), true);
    assert.equal(harness.verifyTenantIsolation(managerAlpha, cpx2.id), false);
    assert.equal(harness.verifyTenantIsolation(superAdmin, cpx1.id), true);
    assert.equal(harness.verifyTenantIsolation(superAdmin, cpx2.id), true);
  });

  it('T1.1.5: should retain full relational integrity across complex, building, unit, and transactions', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Grand Towers', initialFund: 5_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Tower 1', floorsCount: 5, unitsCount: 5 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 501, floor: 5, area: 140, occupants: 4, ownerName: 'Soleimani' });

    const tx = harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 1_200_000,
      description: 'Monthly advance charge',
    });

    assert.equal(tx.complexId, cpx.id);
    assert.equal(tx.unitId, unit.id);
    assert.equal(unit.buildingId, bld.id);
    assert.equal(bld.complexId, cpx.id);

    const unitInDb = harness.getUnit(unit.id);
    assert.equal(unitInDb?.balance, 1_200_000);
  });
});
