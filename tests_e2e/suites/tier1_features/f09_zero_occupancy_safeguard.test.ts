import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePeriodExpensesOracle } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Feature 9: Bug Fix - Zero Occupancy Safeguard', () => {
  it('T1.9.1: should not drop occupant-based expenses when all units in a building have zero occupants', () => {
    // In legacy code: 0 occupants -> division by zero or NaN -> entire waterTotal disappeared!
    // In hardened engine: falls back to equal/area distribution, preserving conservation of money.
    const emptyUnits: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: false },
    ];

    const result = calculatePeriodExpensesOracle(emptyUnits, { waterTotal: 4_000_000 });
    assert.equal(result.totalDistributed, 4_000_000);
    assert.equal(result.conservationDelta, 0);
    assert.equal(result.charges[0].water, 2_000_000);
    assert.equal(result.charges[1].water, 2_000_000);
  });

  it('T1.9.2: should distribute occupant expenses only to active units when exemptEmptyUnits is enabled', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 4, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      waterTotal: 3_000_000,
      exemptEmptyUnits: true,
    });

    assert.equal(result.charges[0].water, 0);
    assert.equal(result.charges[1].water, 3_000_000);
    assert.equal(result.totalDistributed, 3_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.9.3: should continue charging area expenses to empty units even with 0 occupants (ماده ۴)', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 200, occupants: 3, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      areaExpenseTotal: 9_000_000,
      exemptEmptyUnits: true,
    });

    // 100 sqm out of 300 sqm = 1/3 = 3,000,000
    // 200 sqm out of 300 sqm = 2/3 = 6,000,000
    assert.equal(result.charges[0].areaShare, 3_000_000);
    assert.equal(result.charges[1].areaShare, 6_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.9.4: should apportion fixed base charges to empty units to cover common infrastructure', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 80, occupants: 0, hasPackage: true, ownerName: 'Owner 1', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 80, occupants: 0, hasPackage: true, ownerName: 'Owner 2', balance: 0, isOccupied: false },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 1, area: 80, occupants: 2, hasPackage: true, ownerName: 'Owner 3', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      fixedPerUnit: 500_000,
      incidentalTotal: 600_000,
    });

    for (const chg of result.charges) {
      assert.equal(chg.fixed, 500_000);
      assert.equal(chg.incidental, 200_000);
      assert.equal(chg.totalCharge, 700_000);
    }
    assert.equal(result.totalDistributed, 2_100_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.9.5: should route hybrid period expenses without arithmetic errors when multiple units are vacant', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'C', balance: 0, isOccupied: false },
      { id: 'u4', complexId: 'c1', buildingId: 'b1', unitNumber: 4, floor: 1, area: 100, occupants: 3, hasPackage: true, ownerName: 'D', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      fixedPerUnit: 200_000,
      areaExpenseTotal: 4_000_000,
      waterTotal: 5_000_000,
      exemptEmptyUnits: true,
    });

    // Units 2 & 4 split water (2 occupants & 3 occupants -> 2M and 3M)
    assert.equal(result.charges[0].water, 0);
    assert.equal(result.charges[1].water, 2_000_000);
    assert.equal(result.charges[2].water, 0);
    assert.equal(result.charges[3].water, 3_000_000);

    // All units get equal area share (1,000,000 each) and fixed share (200,000 each)
    for (const chg of result.charges) {
      assert.equal(chg.fixed, 200_000);
      assert.equal(chg.areaShare, 1_000_000);
    }
    assert.equal(result.conservationDelta, 0);
  });
});
