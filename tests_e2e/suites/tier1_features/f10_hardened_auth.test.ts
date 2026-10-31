import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 10: Hardened Authentication & JWT Token Management', () => {
  it('T1.10.1: should generate secure bearer token upon valid user creation', () => {
    const harness = new TestHarness();
    const user = harness.createUser({
      username: 'manager_tehran',
      role: 'COMPLEX_MANAGER',
      complexId: 'cpx_1',
    });

    assert.ok(user.token);
    assert.match(user.token, /^jwt_token_/);
  });

  it('T1.10.2: should isolate tokens by role and user identity', () => {
    const harness = new TestHarness();
    const manager = harness.createUser({ username: 'mgr', role: 'COMPLEX_MANAGER', complexId: 'cpx_1' });
    const resident = harness.createUser({ username: 'res', role: 'RESIDENT', complexId: 'cpx_1', unitId: 'u1' });

    assert.notEqual(manager.token, resident.token);
    assert.match(manager.token!, /COMPLEX_MANAGER/);
    assert.match(resident.token!, /RESIDENT/);
  });

  it('T1.10.3: should validate tenant binding in token payload', () => {
    const harness = new TestHarness();
    const userA = harness.createUser({ username: 'user_a', role: 'COMPLEX_MANAGER', complexId: 'tenant_a' });
    const userB = harness.createUser({ username: 'user_b', role: 'COMPLEX_MANAGER', complexId: 'tenant_b' });

    assert.equal(harness.verifyTenantIsolation(userA, 'tenant_a'), true);
    assert.equal(harness.verifyTenantIsolation(userA, 'tenant_b'), false);
    assert.equal(harness.verifyTenantIsolation(userB, 'tenant_b'), true);
    assert.equal(harness.verifyTenantIsolation(userB, 'tenant_a'), false);
  });

  it('T1.10.4: should grant Super Admin global cross-tenant access authority', () => {
    const harness = new TestHarness();
    const superAdmin = harness.createUser({ username: 'root_admin', role: 'SUPER_ADMIN' });

    assert.equal(harness.verifyTenantIsolation(superAdmin, 'tenant_a'), true);
    assert.equal(harness.verifyTenantIsolation(superAdmin, 'tenant_b'), true);
    assert.equal(harness.verifyTenantIsolation(superAdmin, 'tenant_xyz'), true);
  });

  it('T1.10.5: should reject resident token when attempting management operations', () => {
    const harness = new TestHarness();
    const resident = harness.createUser({
      username: 'resident_1',
      role: 'RESIDENT',
      complexId: 'cpx_1',
      unitId: 'unit_1',
    });

    assert.equal(harness.checkPermission(resident, 'MANAGE_UNITS'), false);
    assert.equal(harness.checkPermission(resident, 'CLOSE_PERIODS'), false);
    assert.equal(harness.checkPermission(resident, 'MANAGE_EXPENSES'), false);
  });
});
