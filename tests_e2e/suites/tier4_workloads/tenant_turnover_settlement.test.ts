import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 4 Workloads: Scenario W2 - Tenant Turnover & Deposit/Credit Settlement', () => {
  it('T4.2.1: should calculate final pro-rata settlement for outgoing tenant with credit balance', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Turnover Heights' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 204,
      floor: 2,
      area: 120,
      occupants: 3,
      ownerName: 'Malek',
      tenantName: 'Mostajer (Outgoing)',
      initialBalance: 4_500_000, // 4.5M prepaid credit
    });

    // Final departure billing: 1,500,000 utilities
    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Final Settlement Period',
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      expenses: { fixedPerUnit: 1_500_000 },
    });

    const refreshed = harness.getUnit(unit.id);
    // 4.5M credit - 1.5M charges = 3,000,000 refundable surplus
    assert.equal(refreshed?.balance, 3_000_000);
  });

  it('T4.2.2: should refund outgoing tenant surplus credit and reset unit balance to zero', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Turnover Heights', initialFund: 20_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 204,
      floor: 2,
      area: 120,
      occupants: 3,
      ownerName: 'Malek',
      tenantName: 'Mostajer',
      initialBalance: 3_000_000,
    });

    // Refund: balance decreases by 3,000,000 to reach 0
    harness.updateUnit(unit.id, { balance: 0, tenantName: undefined, isOccupied: false, occupants: 0 });

    const clearedUnit = harness.getUnit(unit.id);
    assert.equal(clearedUnit?.balance, 0);
    assert.equal(clearedUnit?.tenantName, undefined);
    assert.equal(clearedUnit?.occupants, 0);
  });

  it('T4.2.3: should onboard new incoming tenant with zero debt and pristine ledger history', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Turnover Heights' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 204,
      floor: 2,
      area: 120,
      occupants: 0,
      ownerName: 'Malek',
      initialBalance: 0,
      isOccupied: false,
    });

    // New tenant moves in
    harness.updateUnit(unit.id, {
      tenantName: 'New Tenant (Kaviani)',
      occupants: 2,
      isOccupied: true,
    }, 'manager_onboarding');

    const updated = harness.getUnit(unit.id);
    assert.equal(updated?.tenantName, 'New Tenant (Kaviani)');
    assert.equal(updated?.occupants, 2);
    assert.equal(updated?.balance, 0);
  });

  it('T4.2.4: should bill new tenant in their first monthly period correctly', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Turnover Heights' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id,
      buildingId: bld.id,
      unitNumber: 204,
      floor: 2,
      area: 120,
      occupants: 2,
      ownerName: 'Malek',
      tenantName: 'New Tenant',
      initialBalance: 0,
    });

    harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Khordad 1404',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      expenses: { fixedPerUnit: 1_200_000 },
    });

    assert.equal(harness.getUnit(unit.id)?.balance, -1_200_000);

    // New tenant pays via portal
    harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 1_200_000,
      description: 'First month maintenance fee',
    });

    assert.equal(harness.getUnit(unit.id)?.balance, 0);
  });

  it('T4.2.5: should preserve historical audit records of previous tenant mutations', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Turnover Heights' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 204, floor: 2, area: 120, occupants: 3, ownerName: 'M', tenantName: 'Old' });

    harness.updateUnit(unit.id, { tenantName: 'New', occupants: 2 }, 'admin_user');

    const logs = harness.getAuditLogs(cpx.id);
    const turnoverLog = logs.find(l => l.action === 'UPDATE_UNIT');
    assert.ok(turnoverLog);
    assert.equal(turnoverLog?.beforeDelta?.tenantName, 'Old');
    assert.equal(turnoverLog?.afterDelta?.tenantName, 'New');
  });
});
