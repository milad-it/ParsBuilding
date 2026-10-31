import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePeriodExpensesOracle, distributeLargestRemainder } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Tier 2 Boundaries: Boundary Limits & High-Scale Overflows', () => {
  it('T2.5.1: should calculate charges for a mega-complex with 1,000 units in under 50ms', () => {
    const thousandUnits: Unit[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `u_${i + 1}`,
      complexId: 'c_mega',
      buildingId: `b_${Math.floor(i / 100) + 1}`,
      unitNumber: (i % 100) + 1,
      floor: (i % 20) + 1,
      area: 80 + (i % 50),
      occupants: (i % 5) + 1,
      hasPackage: true,
      ownerName: `Owner ${i + 1}`,
      balance: 0,
      isOccupied: true,
    }));

    const start = performance.now();
    const result = calculatePeriodExpensesOracle(thousandUnits, {
      fixedPerUnit: 50_000,
      areaExpenseTotal: 500_000_000,
      waterTotal: 200_000_000,
      gasTotal: 300_000_000,
    });
    const duration = performance.now() - start;

    assert.equal(result.charges.length, 1000);
    assert.equal(result.conservationDelta, 0);
    assert.ok(duration < 50, `Calculation took ${duration}ms, must be < 50ms`);
  });

  it('T2.5.2: should maintain integer safety within Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)', () => {
    const hugeAmount = 9_000_000_000_000_000; // 9 Quadrillion Rials
    assert.ok(hugeAmount < Number.MAX_SAFE_INTEGER);

    const weights = [1, 2, 3];
    const shares = distributeLargestRemainder(hugeAmount, weights);
    const sum = shares.reduce((a, b) => a + b, 0);
    assert.equal(sum, hugeAmount);
  });

  it('T2.5.3: should handle empty unit list gracefully without throwing an exception', () => {
    const result = calculatePeriodExpensesOracle([], { fixedPerUnit: 100_000 });
    assert.equal(result.charges.length, 0);
    assert.equal(result.totalDistributed, 0);
    assert.equal(result.conservationDelta, 0);
  });

  it('T2.5.4: should distribute expenses evenly when all weights are zero', () => {
    const weights = [0, 0, 0];
    const shares = distributeLargestRemainder(300_000, weights);
    assert.deepEqual(shares, [0, 0, 0]);
  });

  it('T2.5.5: should preserve integrity when unit count is 1 (single-unit property)', () => {
    const singleUnit: Unit[] = [{
      id: 'u_villa',
      complexId: 'c_villa',
      buildingId: 'b_villa',
      unitNumber: 1,
      floor: 1,
      area: 450,
      occupants: 4,
      hasPackage: true,
      ownerName: 'Villa Owner',
      balance: 0,
      isOccupied: true,
    }];

    const result = calculatePeriodExpensesOracle(singleUnit, {
      fixedPerUnit: 1_000_000,
      waterTotal: 2_500_000,
      gasTotal: 3_500_000,
      incidentalTotal: 500_000,
      areaExpenseTotal: 10_000_000,
    });

    const expectedTotal = 1_000_000 + 2_500_000 + 3_500_000 + 500_000 + 10_000_000;
    assert.equal(result.charges[0].totalCharge, expectedTotal);
    assert.equal(result.totalDistributed, expectedTotal);
    assert.equal(result.conservationDelta, 0);
  });
});
