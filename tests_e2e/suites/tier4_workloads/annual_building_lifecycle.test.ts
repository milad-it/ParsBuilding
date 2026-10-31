import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Tier 4 Workloads: Scenario W1 - Annual Building Fiscal Lifecycle', () => {
  it('T4.1.1: should initialize 20-unit residential complex with starting reserve fund', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Emerald Tower', initialFund: 100_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Tower 1', floorsCount: 5, unitsCount: 20 });

    for (let i = 1; i <= 20; i++) {
      harness.createUnit({
        complexId: cpx.id,
        buildingId: bld.id,
        unitNumber: 100 + i,
        floor: Math.floor((i - 1) / 4) + 1,
        area: 90 + (i % 4) * 20, // 90, 110, 130, 150 sqm
        occupants: (i % 3) + 2,   // 2, 3, 4 occupants
        ownerName: `Owner ${i}`,
        tenantName: i % 2 === 0 ? `Tenant ${i}` : undefined,
        initialBalance: 0,
      });
    }

    const units = harness.getUnitsByComplex(cpx.id);
    assert.equal(units.length, 20);
    assert.equal(harness.getTreasuryBalance(cpx.id), 100_000_000);
  });

  it('T4.1.2: should simulate full 12-month billing periods with seasonal utility variations', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Emerald Tower', initialFund: 50_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Tower 1', floorsCount: 2, unitsCount: 5 });

    for (let i = 1; i <= 5; i++) {
      harness.createUnit({
        complexId: cpx.id,
        buildingId: bld.id,
        unitNumber: 100 + i,
        floor: 1,
        area: 100,
        occupants: 3,
        ownerName: `Owner ${i}`,
        initialBalance: 0,
      });
    }

    const monthNames = [
      'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
      'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand',
    ];

    let totalYearExpenses = 0;

    for (let m = 0; m < 12; m++) {
      // Winter months (Dey, Bahman, Esfand) have higher gas; summer months (Tir, Mordad) have higher electricity
      const gasTotal = m >= 9 ? 15_000_000 : 3_000_000;
      const electricityTotal = (m >= 3 && m <= 5) ? 12_000_000 : 4_000_000;
      const fixedPerUnit = 500_000;

      const monthlyExpense = fixedPerUnit * 5 + gasTotal + electricityTotal;
      totalYearExpenses += monthlyExpense;

      const { period, calculation } = harness.createAndClosePeriod({
        complexId: cpx.id,
        title: `${monthNames[m]} 1404`,
        startDate: `2025-${String(m + 1).padStart(2, '0')}-01`,
        endDate: `2025-${String(m + 1).padStart(2, '0')}-28`,
        expenses: { fixedPerUnit, gasTotal, electricityTotal },
      });

      assert.equal(period.isClosed, true);
      assert.equal(calculation.conservationDelta, 0);
    }

    assert.ok(totalYearExpenses > 0);
  });

  it('T4.1.3: should handle continuous monthly resident payments and track debt aging', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Emerald Tower', initialFund: 20_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'Tower 1', floorsCount: 1, unitsCount: 3 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'Prompt Payer' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'Partial Payer' });
    const u3 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 3, floor: 1, area: 100, occupants: 2, ownerName: 'Delinquent Payer' });

    // Month 1: charge 1,000,000 each
    harness.createAndClosePeriod({ complexId: cpx.id, title: 'Month 1', startDate: '2026-01-01', endDate: '2026-01-31', expenses: { fixedPerUnit: 1_000_000 } });

    // U1 pays full (1,000,000), U2 pays half (500,000), U3 pays 0
    harness.recordPayment({ complexId: cpx.id, unitId: u1.id, amount: 1_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 500_000 });

    assert.equal(harness.getUnit(u1.id)?.balance, 0);
    assert.equal(harness.getUnit(u2.id)?.balance, -500_000);
    assert.equal(harness.getUnit(u3.id)?.balance, -1_000_000);

    // Month 2: charge 1,000,000 each
    harness.createAndClosePeriod({ complexId: cpx.id, title: 'Month 2', startDate: '2026-02-01', endDate: '2026-02-28', expenses: { fixedPerUnit: 1_000_000 } });

    // U1 pays 1M again, U2 pays 1.5M (clearing arrears + current), U3 pays 0
    harness.recordPayment({ complexId: cpx.id, unitId: u1.id, amount: 1_000_000 });
    harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 1_500_000 });

    assert.equal(harness.getUnit(u1.id)?.balance, 0);
    assert.equal(harness.getUnit(u2.id)?.balance, 0);
    assert.equal(harness.getUnit(u3.id)?.balance, -2_000_000); // 2 months debt accumulated
  });

  it('T4.1.4: should verify treasury fund reconciliation at fiscal year-end closing', () => {
    const harness = new TestHarness();
    const initialReserve = 50_000_000;
    const cpx = harness.createComplex({ name: 'Fiscal Tower', initialFund: initialReserve });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 2 });
    const u1 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2, ownerName: 'A' });
    const u2 = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 2, floor: 1, area: 100, occupants: 2, ownerName: 'B' });

    // 12 payments of 1,000,000 by each unit = 24,000,000 total received
    for (let m = 0; m < 12; m++) {
      harness.recordPayment({ complexId: cpx.id, unitId: u1.id, amount: 1_000_000 });
      harness.recordPayment({ complexId: cpx.id, unitId: u2.id, amount: 1_000_000 });
    }

    const expectedTreasury = initialReserve + 24_000_000;
    assert.equal(harness.getTreasuryBalance(cpx.id), expectedTreasury);
  });

  it('T4.1.5: should retain complete immutable audit trail of all 12 fiscal periods and payments', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Audit Year Tower' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const u = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 1, ownerName: 'Single' });

    for (let m = 1; m <= 12; m++) {
      harness.createAndClosePeriod({
        complexId: cpx.id,
        title: `M${m}`,
        startDate: `2026-${String(m).padStart(2, '0')}-01`,
        endDate: `2026-${String(m).padStart(2, '0')}-28`,
        expenses: { fixedPerUnit: 500_000 },
      });
      harness.recordPayment({ complexId: cpx.id, unitId: u.id, amount: 500_000 });
    }

    const logs = harness.getAuditLogs(cpx.id);
    const periodLogs = logs.filter(l => l.action === 'CLOSE_PERIOD');
    const paymentLogs = logs.filter(l => l.action === 'RECORD_PAYMENT');

    assert.equal(periodLogs.length, 12);
    assert.equal(paymentLogs.length, 12);
  });
});
