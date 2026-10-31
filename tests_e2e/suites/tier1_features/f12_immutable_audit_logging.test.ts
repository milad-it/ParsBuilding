import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 12: Immutable Audit Logging Trail', () => {
  it('T1.12.1: should automatically record audit log when a new unit is created', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Bld A', floorsCount: 2, unitsCount: 2 });

    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 101,
      floor: 1,
      area: 95,
      occupants: 3,
      ownerName: 'Golshani',
    });

    const logs = harness.getAuditLogs(cpx.id);
    const unitLog = logs.find(l => l.action === 'CREATE_UNIT' && l.entityId === unit.id);
    assert.ok(unitLog);
    assert.equal(unitLog?.entityType, 'Unit');
    assert.equal(unitLog?.afterDelta?.unitNumber, 101);
  });

  it('T1.12.2: should capture beforeDelta and afterDelta upon unit update', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Delta Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 1,
      floor: 1,
      area: 80,
      occupants: 1,
      ownerName: 'Former Tenant',
    });

    harness.updateUnit(unit.id, { occupants: 3, tenantName: 'New Family' }, 'mgr_user_42');

    const logs = harness.getAuditLogs(cpx.id);
    const updateLog = logs.find(l => l.action === 'UPDATE_UNIT' && l.entityId === unit.id);
    assert.ok(updateLog);
    assert.equal(updateLog?.actorId, 'mgr_user_42');
    assert.equal(updateLog?.beforeDelta?.occupants, 1);
    assert.equal(updateLog?.afterDelta?.occupants, 3);
    assert.equal(updateLog?.afterDelta?.tenantName, 'New Family');
  });

  it('T1.12.3: should log period closing event with full financial snapshot', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Period Audit' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const { period } = harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Dey 1404',
      startDate: '2025-12-22',
      endDate: '2026-01-20',
      expenses: { fixedPerUnit: 1_500_000 },
      actorId: 'admin_audit',
    });

    const logs = harness.getAuditLogs(cpx.id);
    const periodLog = logs.find(l => l.action === 'CLOSE_PERIOD' && l.entityId === period.id);
    assert.ok(periodLog);
    assert.equal(periodLog?.actorId, 'admin_audit');
    assert.equal(periodLog?.afterDelta?.title, 'Dey 1404');
    assert.equal(periodLog?.afterDelta?.totalExpenses, 1_500_000);
  });

  it('T1.12.4: should record payment transactions with timestamp and actor', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Payment Audit' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const tx = harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 5_000_000,
      description: 'Annual parking contribution',
      actorId: 'cashier_1',
    });

    const logs = harness.getAuditLogs(cpx.id);
    const txLog = logs.find(l => l.action === 'RECORD_PAYMENT' && l.entityId === tx.id);
    assert.ok(txLog);
    assert.equal(txLog?.actorId, 'cashier_1');
    assert.equal(txLog?.afterDelta?.amount, 5_000_000);
  });

  it('T1.12.5: should isolate audit log queries strictly by complexId', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Complex One' });
    const cpx2 = harness.createComplex({ name: 'Complex Two' });

    const b1 = harness.createBuilding({ complexId: cpx1.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const b2 = harness.createBuilding({ complexId: cpx2.id, name: 'B2', floorsCount: 1, unitsCount: 1 });

    harness.createUnit({ complexId: cpx1.id, buildingId: b1.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'User 1' });
    harness.createUnit({ complexId: cpx2.id, buildingId: b2.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'User 2' });

    const logs1 = harness.getAuditLogs(cpx1.id);
    const logs2 = harness.getAuditLogs(cpx2.id);

    assert.ok(logs1.length > 0);
    assert.ok(logs2.length > 0);
    assert.equal(logs1.every(l => l.complexId === cpx1.id), true);
    assert.equal(logs2.every(l => l.complexId === cpx2.id), true);
  });
});
