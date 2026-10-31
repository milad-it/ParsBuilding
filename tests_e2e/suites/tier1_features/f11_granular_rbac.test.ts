import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 11: Granular Role-Based Access Control (RBAC)', () => {
  it('T1.11.1: should allow Complex Manager full operational permissions within their complex', () => {
    const harness = new TestHarness();
    const mgr = harness.createUser({
      username: 'manager_full',
      role: 'COMPLEX_MANAGER',
      complexId: 'cpx_1',
    });

    assert.equal(harness.checkPermission(mgr, 'MANAGE_UNITS'), true);
    assert.equal(harness.checkPermission(mgr, 'MANAGE_RESIDENTS'), true);
    assert.equal(harness.checkPermission(mgr, 'MANAGE_EXPENSES'), true);
    assert.equal(harness.checkPermission(mgr, 'CLOSE_PERIODS'), true);
    assert.equal(harness.checkPermission(mgr, 'VIEW_FINANCIAL_REPORTS'), true);
    assert.equal(harness.checkPermission(mgr, 'VIEW_AUDIT_LOGS'), true);
  });

  it('T1.11.2: should restrict Sub-Manager with limited permissions to granted actions only', () => {
    const harness = new TestHarness();
    const subMgr = harness.createUser({
      username: 'sub_announcements',
      role: 'SUB_MANAGER',
      complexId: 'cpx_1',
      permissions: ['MANAGE_ANNOUNCEMENTS', 'VIEW_FINANCIAL_REPORTS'],
    });

    assert.equal(harness.checkPermission(subMgr, 'MANAGE_ANNOUNCEMENTS'), true);
    assert.equal(harness.checkPermission(subMgr, 'VIEW_FINANCIAL_REPORTS'), true);
    // Denied permissions:
    assert.equal(harness.checkPermission(subMgr, 'CLOSE_PERIODS'), false);
    assert.equal(harness.checkPermission(subMgr, 'MANAGE_UNITS'), false);
    assert.equal(harness.checkPermission(subMgr, 'VIEW_AUDIT_LOGS'), false);
  });

  it('T1.11.3: should support specialized Sub-Manager for AI receipt verification and payments', () => {
    const harness = new TestHarness();
    const receiptVerifier = harness.createUser({
      username: 'sub_receipts',
      role: 'SUB_MANAGER',
      complexId: 'cpx_1',
      permissions: ['VERIFY_RECEIPTS'],
    });

    assert.equal(harness.checkPermission(receiptVerifier, 'VERIFY_RECEIPTS'), true);
    assert.equal(harness.checkPermission(receiptVerifier, 'CLOSE_PERIODS'), false);
  });

  it('T1.11.4: should prevent Sub-Manager from accessing resources belonging to a different complex', () => {
    const harness = new TestHarness();
    const subMgr = harness.createUser({
      username: 'sub_alpha',
      role: 'SUB_MANAGER',
      complexId: 'cpx_alpha',
      permissions: ['MANAGE_UNITS'],
    });

    assert.equal(harness.verifyTenantIsolation(subMgr, 'cpx_alpha'), true);
    assert.equal(harness.verifyTenantIsolation(subMgr, 'cpx_beta'), false);
  });

  it('T1.11.5: should enforce strict Resident boundaries allowing only personal ledger and announcements', () => {
    const harness = new TestHarness();
    const resident = harness.createUser({
      username: 'resident_suite_4',
      role: 'RESIDENT',
      complexId: 'cpx_1',
      unitId: 'unit_4',
    });

    assert.equal(harness.checkPermission(resident, 'MANAGE_EXPENSES'), false);
    assert.equal(harness.checkPermission(resident, 'CLOSE_PERIODS'), false);
    assert.equal(harness.checkPermission(resident, 'VIEW_AUDIT_LOGS'), false);
  });
});
