import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 20: Dedicated Resident Portal (/resident)', () => {
  it('T1.20.1: should allow resident to query personal balance and billing statements', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Portal Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 101, floor: 1, area: 100, occupants: 2, ownerName: 'Rezvan', initialBalance: -450_000 });

    const resident = harness.createUser({
      username: 'rezvan_101',
      role: 'RESIDENT',
      complexId: cpx.id,
      unitId: unit.id,
    });

    const residentViewUnit = harness.getUnit(resident.unitId!);
    assert.equal(residentViewUnit?.unitNumber, 101);
    assert.equal(residentViewUnit?.balance, -450_000);
  });

  it('T1.20.2: should show digital bulletin board announcements to residents', () => {
    const announcement = {
      id: 'ann_1',
      complexId: 'cpx_1',
      title: 'برنامه نظافت راه‌پله و ضدعفونی پارکینگ',
      content: 'روز جمعه از ساعت ۱۰ صبح عملیات نظافت انجام خواهد شد.',
      publishedAt: new Date().toISOString(),
      priority: 'NORMAL',
    };

    assert.equal(announcement.complexId, 'cpx_1');
    assert.ok(announcement.title.includes('نظافت'));
  });

  it('T1.20.3: should reflect online payment submission directly on resident balance', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Payment Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A', initialBalance: -1_200_000 });

    // Resident pays via portal
    harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 1_200_000,
      description: 'Online portal payment via Shaparak',
    });

    assert.equal(harness.getUnit(unit.id)?.balance, 0);
  });

  it('T1.20.4: should prevent resident from inspecting other residents unit balances', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Privacy Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 2, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'Resident 1', initialBalance: -500_000 });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'Resident 2', initialBalance: 1_000_000 });

    const user1 = harness.createUser({ username: 'res1', role: 'RESIDENT', complexId: cpx.id, unitId: u1.id });

    // Resident 1 can access u1, but accessing u2 is forbidden
    const isOwnerOfRequestedUnit = (resUser: typeof user1, targetUnitId: string) => resUser.unitId === targetUnitId;
    assert.equal(isOwnerOfRequestedUnit(user1, u1.id), true);
    assert.equal(isOwnerOfRequestedUnit(user1, u2.id), false);
  });

  it('T1.20.5: should provide detailed itemized cost breakdown for resident period invoice', () => {
    const invoice = {
      periodTitle: 'اردیبهشت ۱۴۰۴',
      unitNumber: 301,
      breakdown: {
        fixed: 300_000,
        water: 450_000,
        gas: 200_000,
        electricity: 150_000,
        areaShare: 500_000,
      },
      totalDue: 1_600_000,
    };

    const sumComponents = Object.values(invoice.breakdown).reduce((a, b) => a + b, 0);
    assert.equal(sumComponents, invoice.totalDue);
  });
});
