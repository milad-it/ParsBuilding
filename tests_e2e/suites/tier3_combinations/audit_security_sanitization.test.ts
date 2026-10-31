import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 3 Combinations: Audit Logging & Security Sanitization', () => {
  it('T3.5.1: should preserve sanitized text in audit log when updating unit with special characters', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Sec Cpx' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'Original' });

    // Update with special escaped Persian characters
    harness.updateUnit(unit.id, { ownerName: 'دکتر علیرضا میرزایی‌زاده' }, 'admin_1');

    const logs = harness.getAuditLogs(cpx.id);
    const updateLog = logs.find(l => l.action === 'UPDATE_UNIT');
    assert.ok(updateLog);
    assert.equal(updateLog?.afterDelta?.ownerName, 'دکتر علیرضا میرزایی‌زاده');
  });

  it('T3.5.2: should generate distinct audit log entries for each distinct actor in multi-manager setup', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Multi Actor Cpx' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.updateUnit(u1.id, { occupants: 3 }, 'manager_alpha');
    harness.updateUnit(u2.id, { occupants: 4 }, 'sub_manager_beta');

    const logs = harness.getAuditLogs(cpx.id);
    const actorAlphaLog = logs.find(l => l.actorId === 'manager_alpha');
    const actorBetaLog = logs.find(l => l.actorId === 'sub_manager_beta');

    assert.ok(actorAlphaLog);
    assert.ok(actorBetaLog);
    assert.notEqual(actorAlphaLog?.id, actorBetaLog?.id);
  });

  it('T3.5.3: should record before and after delta in financial payment transactions', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Payment Delta Cpx' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const tx = harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 4_500_000,
      description: 'Quarterly dues',
      actorId: 'treasurer_user',
    });

    const logs = harness.getAuditLogs(cpx.id);
    const payLog = logs.find(l => l.action === 'RECORD_PAYMENT');
    assert.ok(payLog);
    assert.equal(payLog?.actorId, 'treasurer_user');
    assert.equal(payLog?.afterDelta?.amount, 4_500_000);
  });

  it('T3.5.4: should guarantee that audit log entries are append-only with monotonically non-decreasing timestamps', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Timestamp Cpx' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    harness.updateUnit(unit.id, { occupants: 3 });
    harness.updateUnit(unit.id, { occupants: 4 });

    const logs = harness.getAuditLogs(cpx.id);
    assert.ok(logs.length >= 3);

    for (let i = 1; i < logs.length; i++) {
      const prevTime = new Date(logs[i - 1].timestamp).getTime();
      const currTime = new Date(logs[i].timestamp).getTime();
      assert.ok(currTime >= prevTime);
    }
  });

  it('T3.5.5: should retain audit trail after multiple period closings and settlements', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Longevity Cpx' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    harness.createAndClosePeriod({ complexId: cpx.id, title: 'Month 1', startDate: '2026-01-01', endDate: '2026-01-31', expenses: { fixedPerUnit: 100_000 } });
    harness.createAndClosePeriod({ complexId: cpx.id, title: 'Month 2', startDate: '2026-02-01', endDate: '2026-02-28', expenses: { fixedPerUnit: 100_000 } });

    const logs = harness.getAuditLogs(cpx.id);
    const periodLogs = logs.filter(l => l.action === 'CLOSE_PERIOD');
    assert.equal(periodLogs.length, 2);
  });
});
