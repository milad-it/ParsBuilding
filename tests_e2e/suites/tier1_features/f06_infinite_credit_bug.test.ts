import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';
import { applyPeriodClosingOracle } from '../../src/oracle.ts';
import type { Unit, UnitChargeOutput } from '../../src/types.ts';

describe('Feature 6: Bug Fix - Infinite Credit Bug Resolution', () => {
  it('T1.6.1: should reduce resident positive credit monotonically when period charge is applied', () => {
    // Resident starts with 5,000,000 credit. Period charge is 2,000,000.
    // In buggy code: balance was reset or remained 5,000,000 forever.
    // Correct behavior: balance drops to 3,000,000.
    const unit: Unit = {
      id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 101, floor: 1, area: 100, occupants: 2, hasPackage: true,
      ownerName: 'Moradi', balance: 5_000_000, isOccupied: true,
    };
    const charges: UnitChargeOutput[] = [{
      unitId: 'u1', unitNumber: 101, fixed: 2_000_000, water: 0, gas: 0, electricity: 0, incidental: 0,
      areaShare: 0, specialShare: 0, roundingDelta: 0, totalCharge: 2_000_000,
    }];

    const settlement = applyPeriodClosingOracle([unit], charges, 10_000_000);
    assert.equal(settlement.updatedUnits[0].balance, 3_000_000);
    assert.equal(settlement.totalCollectedFromCredit, 2_000_000);
  });

  it('T1.6.2: should transition credit to debt when period charge exceeds existing credit', () => {
    // Initial credit 1,000,000. Charge is 3,500,000.
    // New balance must be -2,500,000 (debt).
    const unit: Unit = {
      id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 102, floor: 1, area: 100, occupants: 2, hasPackage: true,
      ownerName: 'Ahmadi', balance: 1_000_000, isOccupied: true,
    };
    const charges: UnitChargeOutput[] = [{
      unitId: 'u2', unitNumber: 102, fixed: 3_500_000, water: 0, gas: 0, electricity: 0, incidental: 0,
      areaShare: 0, specialShare: 0, roundingDelta: 0, totalCharge: 3_500_000,
    }];

    const settlement = applyPeriodClosingOracle([unit], charges, 5_000_000);
    assert.equal(settlement.updatedUnits[0].balance, -2_500_000);
    assert.equal(settlement.totalCollectedFromCredit, 1_000_000);
    assert.equal(settlement.totalNewDebts, 2_500_000);
  });

  it('T1.6.3: should exhaust credit to exact zero when charge equals credit exactly', () => {
    const unit: Unit = {
      id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 103, floor: 1, area: 100, occupants: 2, hasPackage: true,
      ownerName: 'Rezaei', balance: 2_000_000, isOccupied: true,
    };
    const charges: UnitChargeOutput[] = [{
      unitId: 'u3', unitNumber: 103, fixed: 2_000_000, water: 0, gas: 0, electricity: 0, incidental: 0,
      areaShare: 0, specialShare: 0, roundingDelta: 0, totalCharge: 2_000_000,
    }];

    const settlement = applyPeriodClosingOracle([unit], charges, 5_000_000);
    assert.equal(settlement.updatedUnits[0].balance, 0);
    assert.equal(settlement.totalCollectedFromCredit, 2_000_000);
    assert.equal(settlement.totalNewDebts, 0);
  });

  it('T1.6.4: should track sequential period closings through TestHarness without credit resurrection', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Credit Tower', initialFund: 10_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({
      complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 2,
      ownerName: 'Resident X', initialBalance: 6_000_000,
    });

    // Period 1: charge 2,000,000 -> balance becomes 4,000,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Period 1', startDate: '2026-01-01', endDate: '2026-01-31',
      expenses: { fixedPerUnit: 2_000_000 },
    });
    assert.equal(harness.getUnit(unit.id)?.balance, 4_000_000);

    // Period 2: charge 2,000,000 -> balance becomes 2,000,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Period 2', startDate: '2026-02-01', endDate: '2026-02-28',
      expenses: { fixedPerUnit: 2_000_000 },
    });
    assert.equal(harness.getUnit(unit.id)?.balance, 2_000_000);

    // Period 3: charge 3,000,000 -> balance becomes -1,000,000
    harness.createAndClosePeriod({
      complexId: cpx.id, title: 'Period 3', startDate: '2026-03-01', endDate: '2026-03-31',
      expenses: { fixedPerUnit: 3_000_000 },
    });
    assert.equal(harness.getUnit(unit.id)?.balance, -1_000_000);
  });

  it('T1.6.5: should never produce negative credit or positive debt anomalies', () => {
    const unitInDebt: Unit = {
      id: 'u4', complexId: 'c1', buildingId: 'b1', unitNumber: 104, floor: 1, area: 100, occupants: 2, hasPackage: true,
      ownerName: 'Debtor', balance: -500_000, isOccupied: true,
    };
    const charges: UnitChargeOutput[] = [{
      unitId: 'u4', unitNumber: 104, fixed: 1_000_000, water: 0, gas: 0, electricity: 0, incidental: 0,
      areaShare: 0, specialShare: 0, roundingDelta: 0, totalCharge: 1_000_000,
    }];

    const settlement = applyPeriodClosingOracle([unitInDebt], charges, 5_000_000);
    // Balance deepens from -500k to -1,500k
    assert.equal(settlement.updatedUnits[0].balance, -1_500_000);
    assert.equal(settlement.totalCollectedFromCredit, 0);
    assert.equal(settlement.totalNewDebts, 1_500_000);
  });
});
