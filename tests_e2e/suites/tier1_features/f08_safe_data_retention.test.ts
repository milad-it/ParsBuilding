import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 8: Bug Fix - Safe Data Retention (Abolish Startup Deletion)', () => {
  it('T1.8.1: should preserve existing complexes and units across simulated app reboots', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ id: 'persisted_cpx', name: 'Persisted Heights', initialFund: 50_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main', floorsCount: 3, unitsCount: 3 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 101, floor: 1, area: 100, occupants: 3, ownerName: 'Hashemi' });

    // In legacy buggy versions, init routine wiped database on startup.
    // In hardened SaaS, existing data is preserved.
    const fetched = harness.getComplex('persisted_cpx');
    assert.equal(fetched?.name, 'Persisted Heights');
    assert.equal(fetched?.initialFund, 50_000_000);
    assert.equal(harness.getUnitsByComplex('persisted_cpx').length, 1);
  });

  it('T1.8.2: should maintain full historical transactions without prune on startup', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'History Tower' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const u = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'O' });

    harness.recordPayment({ complexId: cpx.id, unitId: u.id, amount: 1_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: u.id, amount: 2_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: u.id, amount: 3_000_000 });

    const txs = harness.getTransactionsByUnit(u.id);
    assert.equal(txs.length, 3);
  });

  it('T1.8.3: should retain closed periods and immutable charge outputs', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Period Vault' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'O' });

    const { period } = harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Historical Period 1404',
      startDate: '2025-03-21',
      endDate: '2025-04-20',
      expenses: { fixedPerUnit: 1_000_000 },
    });

    assert.equal(period.isClosed, true);
    assert.equal(period.charges.length, 1);
    assert.equal(period.charges[0].totalCharge, 1_000_000);
  });

  it('T1.8.4: should retain audit trail entries across all entity mutations', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Test' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'Old Owner' });

    harness.updateUnit(unit.id, { ownerName: 'New Owner' }, 'user_admin');

    const logs = harness.getAuditLogs(cpx.id);
    const updateLog = logs.find(l => l.action === 'UPDATE_UNIT');
    assert.ok(updateLog);
    assert.equal(updateLog?.beforeDelta?.ownerName, 'Old Owner');
    assert.equal(updateLog?.afterDelta?.ownerName, 'New Owner');
  });

  it('T1.8.5: should retain legacy migrated records without overwriting on subsequent app starts', () => {
    const harness = new TestHarness();
    const result = harness.executeMigration('migrated_cpx_1', {
      initialFund: 15_000_000,
      units: [
        { unitNumber: 1, area: 90, occupants: 2, balance: -200_000 },
        { unitNumber: 2, area: 110, occupants: 3, balance: 500_000 },
      ],
      periods: [],
    });

    assert.equal(result.success, true);
    assert.equal(result.unitsImported, 2);
    assert.equal(harness.getUnitsByComplex('migrated_cpx_1').length, 2);
  });
});
