import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 4 Workloads: Scenario W3 - Emergency Bulk Expense & Capital Assessment', () => {
  it('T4.3.1: should apportion 1,500,000,000 Rial emergency elevator overhaul strictly by unit floor and area', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Skyline Plaza', initialFund: 200_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main Tower', floorsCount: 3, unitsCount: 3 });

    // Ground floor (floor 1): 100 sqm, 2nd floor: 150 sqm, 3rd floor: 250 sqm (total 500 sqm)
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 101, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 201, floor: 2, area: 150, occupants: 3, ownerName: 'B' });
    const u3 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 301, floor: 3, area: 250, occupants: 4, ownerName: 'C' });

    const emergencyTotal = 1_500_000_000;
    const calculation = harness.calculatePeriodExpenses(cpx.id, {
      areaExpenseTotal: emergencyTotal,
    });

    // 100/500 = 20% = 300M, 150/500 = 30% = 450M, 250/500 = 50% = 750M
    assert.equal(calculation.charges[0].areaShare, 300_000_000);
    assert.equal(calculation.charges[1].areaShare, 450_000_000);
    assert.equal(calculation.charges[2].areaShare, 750_000_000);
    assert.equal(calculation.totalDistributed, 1_500_000_000);
    assert.equal(calculation.conservationDelta, 0);
  });

  it('T4.3.2: should split massive emergency expense into 3 equal monthly installment billings', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Skyline Plaza' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main Tower', floorsCount: 1, unitsCount: 2 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    // 600,000,000 emergency expense split into 3 monthly installments of 200,000,000
    const installmentAmount = 200_000_000;

    for (let installment = 1; installment <= 3; installment++) {
      const { period, calculation } = harness.createAndClosePeriod({
        complexId: cpx.id,
        title: `Elevator Repair Installment ${installment}/3`,
        startDate: `2026-0${installment}-01`,
        endDate: `2026-0${installment}-28`,
        expenses: { areaExpenseTotal: installmentAmount },
      });

      assert.equal(period.isClosed, true);
      assert.equal(calculation.totalDistributed, 200_000_000);
      assert.equal(calculation.charges[0].totalCharge, 100_000_000);
      assert.equal(calculation.charges[1].totalCharge, 100_000_000);
    }
  });

  it('T4.3.3: should combine emergency capital assessment with regular monthly operating expenses', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Skyline Plaza' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main Tower', floorsCount: 1, unitsCount: 2 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    const { calculation } = harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Operating + Emergency Combined',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: {
        fixedPerUnit: 1_000_000,     // Regular fixed
        waterTotal: 2_000_000,       // Regular water
        areaExpenseTotal: 50_000_000, // Emergency capital share
      },
    });

    const expectedTotal = 1_000_000 * 2 + 2_000_000 + 50_000_000;
    assert.equal(calculation.totalDistributed, expectedTotal);
    assert.equal(calculation.charges[0].totalCharge, expectedTotal / 2);
  });

  it('T4.3.4: should record installment collection receipts and update treasury liquid capital', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Skyline Plaza', initialFund: 0 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main Tower', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    harness.recordPayment({ complexId: cpx.id, unitId: u1.id, amount: 50_000_000, description: 'Emergency installment 1' });
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 50_000_000, description: 'Emergency installment 1' });

    assert.equal(harness.getTreasuryBalance(cpx.id), 100_000_000);
  });

  it('T4.3.5: should retain permanent audit trail of emergency resolutions and expenditures', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Skyline Plaza' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Main Tower', floorsCount: 1, unitsCount: 1 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });

    const { period } = harness.createAndClosePeriod({
      complexId: cpx.id,
      title: 'Emergency Elevator Period',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expenses: { areaExpenseTotal: 100_000_000 },
      actorId: 'super_admin_emergency',
    });

    const logs = harness.getAuditLogs(cpx.id);
    const emergencyLog = logs.find(l => l.action === 'CLOSE_PERIOD' && l.entityId === period.id);
    assert.ok(emergencyLog);
    assert.equal(emergencyLog?.actorId, 'super_admin_emergency');
  });
});
