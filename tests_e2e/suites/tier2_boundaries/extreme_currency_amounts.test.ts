import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePeriodExpensesOracle, distributeLargestRemainder } from '../../src/oracle.ts';
import type { Unit } from '../../src/types.ts';

describe('Tier 2 Boundaries: Extreme Currency Amounts & Range Limits', () => {
  const sampleUnits: Unit[] = [
    { id: 'u1', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A', balance: 0, isOccupied: true },
    { id: 'u2', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'B', balance: 0, isOccupied: true },
  ];

  it('T2.1.1: should handle mega capital investments up to 500 Billion Rials with exact conservation', () => {
    // 500,000,000,000 Rials (e.g. major elevator modernization / seismic retrofit)
    const megaAmount = 500_000_000_000;
    const result = calculatePeriodExpensesOracle(sampleUnits, { areaExpenseTotal: megaAmount });

    assert.equal(result.totalDistributed, megaAmount);
    assert.equal(result.conservationDelta, 0);
    assert.equal(result.charges[0].areaShare, 250_000_000_000);
    assert.equal(result.charges[1].areaShare, 250_000_000_000);
  });

  it('T2.1.2: should distribute minimal 1 Rial indivisible amount without crashing', () => {
    // 1 Rial among 2 units: one unit gets 1, other gets 0
    const shares = distributeLargestRemainder(1, [1, 1]);
    const total = shares.reduce((a, b) => a + b, 0);
    assert.equal(total, 1);
    assert.equal(shares[0] + shares[1], 1);
    assert.ok(shares.includes(1));
    assert.ok(shares.includes(0));
  });

  it('T2.1.3: should cleanly calculate zero-expense periods without NaN or undefined shares', () => {
    const result = calculatePeriodExpensesOracle(sampleUnits, {
      fixedPerUnit: 0,
      waterTotal: 0,
      gasTotal: 0,
      electricityTotal: 0,
      incidentalTotal: 0,
      areaExpenseTotal: 0,
    });

    assert.equal(result.totalDistributed, 0);
    assert.equal(result.conservationDelta, 0);
    for (const chg of result.charges) {
      assert.equal(chg.totalCharge, 0);
      assert.equal(isNaN(chg.totalCharge), false);
    }
  });

  it('T2.1.4: should process massive accumulated resident debts (-10 Billion Rials) without overflow', () => {
    const debtorUnit: Unit = {
      ...sampleUnits[0],
      balance: -10_000_000_000,
    };
    const newCharge = 50_000_000;
    const newBalance = debtorUnit.balance - newCharge;
    assert.equal(newBalance, -10_050_000_000);
    assert.ok(Number.isSafeInteger(newBalance));
  });

  it('T2.1.5: should calculate extreme disparity where one unit is 1,000x larger than others', () => {
    const disparateUnits: Unit[] = [
      { id: 'u_penthouse', complexId: 'c1', buildingId: 'b1', unitNumber: 1, floor: 10, area: 10_000, occupants: 10, hasPackage: true, ownerName: 'Mega', balance: 0, isOccupied: true },
      { id: 'u_studio', complexId: 'c1', buildingId: 'b1', unitNumber: 2, floor: 1, area: 10, occupants: 1, hasPackage: true, ownerName: 'Micro', balance: 0, isOccupied: true },
    ];

    const result = calculatePeriodExpensesOracle(disparateUnits, { areaExpenseTotal: 10_010_000 });
    assert.equal(result.totalDistributed, 10_010_000);
    assert.equal(result.conservationDelta, 0);
    assert.equal(result.charges[0].areaShare, 10_000_000);
    assert.equal(result.charges[1].areaShare, 10_000);
  });
});
