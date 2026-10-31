import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePeriodExpensesOracle } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Tier 2 Boundaries: Zero Occupancy & Vacant Units Stress', () => {
  it('T2.2.1: should handle 100% vacant 10-unit building with zero occupants across all units', () => {
    const allVacant: Unit[] = Array.from({ length: 10 }, (_, i) => ({
      id: `u_${i + 1}`,
      complexId: 'c1',
      buildingId: 'b1',
      unitNumber: i + 1,
      floor: Math.floor(i / 2) + 1,
      area: 100,
      occupants: 0,
      hasPackage: true,
      ownerName: `Owner ${i + 1}`,
      balance: 0,
      isOccupied: false,
    }));

    const result = calculatePeriodExpensesOracle(allVacant, {
      fixedPerUnit: 100_000,
      waterTotal: 1_000_000,
      gasTotal: 2_000_000,
      incidentalTotal: 500_000,
      areaExpenseTotal: 3_000_000,
    });

    const expectedTotal = 10 * 100_000 + 1_000_000 + 2_000_000 + 500_000 + 3_000_000;
    assert.equal(result.totalDistributed, expectedTotal);
    assert.equal(result.conservationDelta, 0);

    for (const chg of result.charges) {
      assert.equal(chg.totalCharge > 0, true);
    }
  });

  it('T2.2.2: should allocate 100% of occupant charges to solitary active resident when 99 units are vacant', () => {
    const units: Unit[] = Array.from({ length: 100 }, (_, i) => ({
      id: `u_${i + 1}`,
      complexId: 'c1',
      buildingId: 'b1',
      unitNumber: i + 1,
      floor: 1,
      area: 100,
      occupants: i === 0 ? 3 : 0,
      hasPackage: true,
      ownerName: `Owner ${i + 1}`,
      balance: 0,
      isOccupied: i === 0,
    }));

    const result = calculatePeriodExpensesOracle(units, {
      waterTotal: 15_000_000,
      exemptEmptyUnits: true,
    });

    assert.equal(result.charges[0].water, 15_000_000);
    for (let i = 1; i < 100; i++) {
      assert.equal(result.charges[i].water, 0);
    }
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.2.3: should handle unit with 0 area without NaN division error', () => {
    const zeroAreaUnit: Unit = {
      id: 'u_zero_area',
      complexId: 'c1',
      buildingId: 'b1',
      unitNumber: 999,
      floor: 0,
      area: 0, // e.g. dedicated janitor closet
      occupants: 1,
      hasPackage: false,
      ownerName: 'Janitor',
      balance: 0,
      isOccupied: true,
    };
    const regularUnit: Unit = {
      id: 'u_regular',
      complexId: 'c1',
      buildingId: 'b1',
      unitNumber: 1,
      floor: 1,
      area: 100,
      occupants: 2,
      hasPackage: true,
      ownerName: 'Resident',
      balance: 0,
      isOccupied: true,
    };

    const result = calculatePeriodExpensesOracle([zeroAreaUnit, regularUnit], {
      areaExpenseTotal: 5_000_000,
    });

    assert.equal(result.charges[0].areaShare, 0);
    assert.equal(result.charges[1].areaShare, 5_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.2.4: should distribute special assessment to active units only', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'Vacant', balance: 0, isOccupied: false },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'Active 1', balance: 0, isOccupied: true },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 1, area: 100, occupants: 3, hasPackage: true, ownerName: 'Active 2', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      specialTotal: 2_000_000,
      specialMode: 'active',
    });

    assert.equal(result.charges[0].specialShare, 0);
    assert.equal(result.charges[1].specialShare, 1_000_000);
    assert.equal(result.charges[2].specialShare, 1_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.2.5: should correctly target custom selected unit IDs for special charges', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'C', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      specialTotal: 6_000_000,
      specialMode: 'custom',
      customUnitIds: ['u1', 'u3'],
    });

    assert.equal(result.charges[0].specialShare, 3_000_000);
    assert.equal(result.charges[1].specialShare, 0);
    assert.equal(result.charges[2].specialShare, 3_000_000);
    assert.equal(result.conservationDelta, 0);
  });
});
