import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 3 Combinations: RBAC & Resident Portal Access Security', () => {
  it('T3.2.1: should deny resident token when calling manager unit creation API', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Security Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const resident = harness.createUser({
      username: 'resident_attacker',
      role: 'RESIDENT',
      complexId: cpx.id,
      unitId: unit.id,
    });

    const canCreateUnit = harness.checkPermission(resident, 'MANAGE_UNITS');
    assert.equal(canCreateUnit, false);
  });

  it('T3.2.2: should allow sub-manager with MANAGE_UNITS to edit units but block period closing', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'SubManager Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const subMgr = harness.createUser({
      username: 'unit_supervisor',
      role: 'SUB_MANAGER',
      complexId: cpx.id,
      permissions: ['MANAGE_UNITS'],
    });

    assert.equal(harness.checkPermission(subMgr, 'MANAGE_UNITS'), true);
    assert.equal(harness.checkPermission(subMgr, 'CLOSE_PERIODS'), false);

    // Update succeeds
    harness.updateUnit(unit.id, { occupants: 3 }, subMgr.id);
    assert.equal(harness.getUnit(unit.id)?.occupants, 3);
  });

  it('T3.2.3: should allow sub-manager with VERIFY_RECEIPTS to approve payment while blocking financial reports', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Receipt Complex' });

    const receiptAgent = harness.createUser({
      username: 'receipt_checker',
      role: 'SUB_MANAGER',
      complexId: cpx.id,
      permissions: ['VERIFY_RECEIPTS'],
    });

    assert.equal(harness.checkPermission(receiptAgent, 'VERIFY_RECEIPTS'), true);
    assert.equal(harness.checkPermission(receiptAgent, 'VIEW_FINANCIAL_REPORTS'), false);
    assert.equal(harness.checkPermission(receiptAgent, 'VIEW_AUDIT_LOGS'), false);
  });

  it('T3.2.4: should prevent resident in Complex 1 from accessing resident statements in Complex 2', () => {
    const harness = new TestHarness();
    const cpx1 = harness.createComplex({ name: 'Building 1' });
    const cpx2 = harness.createComplex({ name: 'Building 2' });

    const resident1 = harness.createUser({
      username: 'resident_one',
      role: 'RESIDENT',
      complexId: cpx1.id,
      unitId: 'u1',
    });

    assert.equal(harness.verifyTenantIsolation(resident1, cpx1.id), true);
    assert.equal(harness.verifyTenantIsolation(resident1, cpx2.id), false);
  });

  it('T3.2.5: should enforce that sub-managers without VIEW_AUDIT_LOGS cannot inspect system history', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Guard Complex' });

    const subMgr = harness.createUser({
      username: 'clerk',
      role: 'SUB_MANAGER',
      complexId: cpx.id,
      permissions: ['MANAGE_ANNOUNCEMENTS'],
    });

    assert.equal(harness.checkPermission(subMgr, 'VIEW_AUDIT_LOGS'), false);
  });
});
