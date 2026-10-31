import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePeriodExpensesOracle } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Tier 2 Boundaries: Float Precision & Area Fractions', () => {
  it('T2.4.1: should handle irrational area ratios (1/3 and 2/3) with exact integer Rial conservation', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 33.333333, occupants: 1, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 66.666667, occupants: 1, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, { areaExpenseTotal: 10_000_000 });
    assert.equal(result.totalDistributed, 10_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.4.2: should apportion prime Rial amounts across fractional area measurements', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 74.45, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 89.15, occupants: 3, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 1, area: 112.80, occupants: 4, hasPackage: true, ownerName: 'C', balance: 0, isOccupied: true },
    ];

    // Prime expense: 17,999,993 Rials
    const primeExpense = 17_999_993;
    const result = calculatePeriodExpensesOracle(units, { areaExpenseTotal: primeExpense });

    assert.equal(result.totalDistributed, primeExpense);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.4.3: should support micro-fractional areas (0.01 sqm precision)', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100.01, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100.02, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, { areaExpenseTotal: 2_000_000 });
    assert.equal(result.totalDistributed, 2_000_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.4.4: should not suffer from JavaScript floating point accumulation errors (0.1 + 0.2 problem)', () => {
    // 0.1 + 0.2 in standard JS is 0.30000000000000004
    // Largest Remainder implementation must produce clean integers
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 0.1, occupants: 1, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 0.2, occupants: 1, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, { areaExpenseTotal: 300_000 });
    assert.equal(result.charges[0].areaShare, 100_000);
    assert.equal(result.charges[1].areaShare, 200_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.4.5: should round correctly to nearest step when using 50,000 Rial rounding rule', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    // Expense = 125,000 -> 62,500 each. With 50,000 step, 62,500 rounds up to 100,000 (delta: 37,500 each)
    const result = calculatePeriodExpensesOracle(units, {
      incidentalTotal: 125_000,
      roundUp: true,
      roundStep: 50_000,
    });

    assert.equal(result.charges[0].totalCharge, 100_000);
    assert.equal(result.charges[1].totalCharge, 100_000);
    assert.equal(result.totalDistributed, 200_000);
    assert.equal(result.conservationDelta, 0);
  });
});
