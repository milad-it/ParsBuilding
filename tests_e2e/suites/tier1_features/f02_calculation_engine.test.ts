import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';
import { calculatePeriodExpensesOracle } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Feature 2: Pure Deterministic Calculation Engine', () => {
  const sampleUnits: Unit[] = [
    { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
    { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 150, occupants: 3, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 2, area: 250, occupants: 5, hasPackage: false, ownerName: 'C', balance: 0, isOccupied: true },
  ];

  it('T1.2.1: should compute fixed charges equally per unit', () => {
    const result = calculatePeriodExpensesOracle(sampleUnits, { fixedPerUnit: 500_000 });
    assert.equal(result.charges.length, 3);
    for (const chg of result.charges) {
      assert.equal(chg.fixed, 500_000);
      assert.equal(chg.totalCharge, 500_000);
    }
    assert.equal(result.totalDistributed, 1_500_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.2.2: should apportion area-based expenses strictly by square meter ratio (ماده ۴)', () => {
    // Total area: 100 + 150 + 250 = 500 sqm. Ratios: 20%, 30%, 50%
    const result = calculatePeriodExpensesOracle(sampleUnits, { areaExpenseTotal: 10_000_000 });
    assert.equal(result.charges[0].areaShare, 2_000_000);
    assert.equal(result.charges[1].areaShare, 3_000_000);
    assert.equal(result.charges[2].areaShare, 5_000_000);
    assert.equal(result.totalDistributed, 10_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.2.3: should distribute water expense proportionally to occupant counts', () => {
    // Occupants: 2 + 3 + 5 = 10. Ratios: 20%, 30%, 50%
    const result = calculatePeriodExpensesOracle(sampleUnits, { waterTotal: 5_000_000 });
    assert.equal(result.charges[0].water, 1_000_000);
    assert.equal(result.charges[1].water, 1_500_000);
    assert.equal(result.charges[2].water, 2_500_000);
    assert.equal(result.totalDistributed, 5_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.2.4: should divide incidental and common electricity equally among units', () => {
    const result = calculatePeriodExpensesOracle(sampleUnits, {
      incidentalTotal: 300_000,
      electricityTotal: 600_000,
    });
    for (const chg of result.charges) {
      assert.equal(chg.incidental, 100_000);
      assert.equal(chg.electricity, 200_000);
      assert.equal(chg.totalCharge, 300_000);
    }
    assert.equal(result.totalDistributed, 900_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.2.5: should calculate composite multi-formula hybrid period expenses accurately', () => {
    const result = calculatePeriodExpensesOracle(sampleUnits, {
      fixedPerUnit: 100_000,
      areaExpenseTotal: 5_000_000,
      waterTotal: 2_000_000,
      incidentalTotal: 300_000,
    });

    // U1: 100k fixed + 1,000k area + 400k water + 100k inc = 1,600,000
    // U2: 100k fixed + 1,500k area + 600k water + 100k inc = 2,300,000
    // U3: 100k fixed + 2,500k area + 1,000k water + 100k inc = 3,700,000
    assert.equal(result.charges[0].totalCharge, 1_600_000);
    assert.equal(result.charges[1].totalCharge, 2_300_000);
    assert.equal(result.charges[2].totalCharge, 3_700_000);
    assert.equal(result.totalDistributed, 7_600_000);
    assert.equal(result.totalInputExpenses, 7_600_000);
    assert.equal(result.conservationDelta, 0);
  });
});
