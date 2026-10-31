import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distributeLargestRemainder, calculatePeriodExpensesOracle } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Feature 3: Zero-Loss Precision & Remainder Distribution', () => {
  it('T1.3.1: should preserve exact sum with Hare-Niemeyer Largest Remainder for indivisible prime numbers', () => {
    // 10 Rials distributed across 3 equal units: 3.333... each. Remainders allocate 4, 3, 3.
    const shares = distributeLargestRemainder(10, [1, 1, 1]);
    const total = shares.reduce((acc, s) => acc + s, 0);
    assert.equal(total, 10);
    assert.deepEqual(shares, [4, 3, 3]);
  });

  it('T1.3.2: should distribute 100,000 Rials across 7 units with exact zero conservation delta', () => {
    const weights = [1, 1, 1, 1, 1, 1, 1];
    const shares = distributeLargestRemainder(100_000, weights);
    const sum = shares.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100_000);
    // 100000 / 7 = 14285.714... 5 units get 14286, 2 get 14285
    assert.equal(shares.filter(s => s === 14286).length, 5);
    assert.equal(shares.filter(s => s === 14285).length, 2);
  });

  it('T1.3.3: should handle multi-tier expense calculations without losing a single Rial', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 73, occupants: 3, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 89, occupants: 4, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
      { id: 'u3', complexId: 'c1', buildingId: 'b1', unitNumber: 3, floor: 2, area: 111, occupants: 1, hasPackage: true, ownerName: 'C', balance: 0, isOccupied: true },
      { id: 'u4', complexId: 'c1', buildingId: 'b1', unitNumber: 4, floor: 2, area: 127, occupants: 5, hasPackage: true, ownerName: 'D', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(units, {
      areaExpenseTotal: 12_345_678,
      waterTotal: 7_890_123,
      incidentalTotal: 1_234_567,
    });

    const expectedTotal = 12_345_678 + 7_890_123 + 1_234_567;
    assert.equal(result.totalDistributed, expectedTotal);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.3.4: should honor optional roundUp with exact recorded roundingDelta', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];

    // Expense = 310,000 -> 155,000 each. With roundStep=50,000, 155,000 rounds up to 200,000 (delta = 45,000)
    const result = calculatePeriodExpensesOracle(units, {
      incidentalTotal: 310_000,
      roundUp: true,
      roundStep: 50_000,
    });

    assert.equal(result.charges[0].totalCharge, 200_000);
    assert.equal(result.charges[0].roundingDelta, 45_000);
    assert.equal(result.charges[1].totalCharge, 200_000);
    assert.equal(result.charges[1].roundingDelta, 45_000);
    assert.equal(result.conservationDelta, 0);
  });

  it('T1.3.5: should produce identical deterministic outputs across repeated invocations', () => {
    const units: Unit[] = [
      { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 105, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
      { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 125, occupants: 3, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
    ];
    const input = { waterTotal: 3_333_333, areaExpenseTotal: 5_555_555 };

    const run1 = calculatePeriodExpensesOracle(units, input);
    const run2 = calculatePeriodExpensesOracle(units, input);

    assert.deepEqual(run1, run2);
    assert.equal(run1.conservationDelta, 0);
  });
});
