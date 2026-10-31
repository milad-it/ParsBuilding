/**
 * Mathematical Oracle & Business Logic Specification for ParsBuilding SaaS
 * Serves as the authoritative ground truth for E2E opaque-box assertions.
 */

import type { Unit, PeriodExpenseInput, CalculationResult, UnitChargeOutput } from './types.ts';

/**
 * Normalizes Persian and Arabic numerals to standard ASCII digits.
 * Implements Feature 4: Correct mapping of Arabic 8 ('٨' -> '8').
 */
export function normalizeDigits(input: string | number): string {
  if (typeof input === 'number') return input.toString();
  if (!input) return '';

  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  let result = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const pIdx = persianDigits.indexOf(char);
    if (pIdx !== -1) {
      result += pIdx.toString();
      continue;
    }
    const aIdx = arabicDigits.indexOf(char);
    if (aIdx !== -1) {
      result += aIdx.toString();
      continue;
    }
    result += char;
  }
  return result;
}

/**
 * Parses numeric inputs supporting decimal fractions, Persian commas, and Arabic digits.
 * Implements Feature 5: Bug fix for decimal parsing.
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') return isNaN(input) ? 0 : input;

  const normalized = normalizeDigits(input.toString().trim())
    .replace(/٫/g, '.')
    .replace(/,/g, '')
    .replace(/\//g, '.');

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Implements the Largest Remainder Method (Hare-Niemeyer) for Rial integer conservation.
 * Implements Feature 3: Zero-loss precision, sum(distributed) === totalExpense.
 */
export function distributeLargestRemainder(
  totalAmount: number,
  weights: number[]
): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0 || totalAmount <= 0) {
    return weights.map(() => 0);
  }

  const rawShares = weights.map(w => (w * totalAmount) / totalWeight);
  const integerParts = rawShares.map(s => Math.floor(s));
  const remainders = rawShares.map((s, idx) => ({
    index: idx,
    remainder: s - integerParts[idx],
  }));

  const distributedSoFar = integerParts.reduce((sum, v) => sum + v, 0);
  let discrepancy = Math.round(totalAmount - distributedSoFar);

  // Sort remainders descending
  remainders.sort((a, b) => b.remainder - a.remainder);

  const finalShares = [...integerParts];
  for (let i = 0; i < discrepancy; i++) {
    const targetIdx = remainders[i % remainders.length].index;
    finalShares[targetIdx] += 1;
  }

  return finalShares;
}

/**
 * Pure Deterministic Calculation Engine
 * Implements Features 2, 3, 9.
 */
export function calculatePeriodExpensesOracle(
  units: Unit[],
  expenses: PeriodExpenseInput
): CalculationResult {
  if (!units || units.length === 0) {
    return {
      charges: [],
      totalDistributed: 0,
      totalInputExpenses: 0,
      conservationDelta: 0,
    };
  }

  const fixedPerUnit = expenses.fixedPerUnit || 0;
  const waterTotal = expenses.waterTotal || 0;
  const gasTotal = expenses.gasTotal || 0;
  const electricityTotal = expenses.electricityTotal || 0;
  const incidentalTotal = expenses.incidentalTotal || 0;
  const specialTotal = expenses.specialTotal || 0;
  const areaExpenseTotal = expenses.areaExpenseTotal || 0;

  const totalInputExpenses =
    fixedPerUnit * units.length +
    waterTotal +
    gasTotal +
    electricityTotal +
    incidentalTotal +
    specialTotal +
    areaExpenseTotal;

  // Occupants weighting (Feature 9: safeguard against zero occupancy)
  const totalOccupants = units.reduce((acc, u) => acc + (u.occupants || 0), 0);
  const occupantWeights = units.map(u => {
    if (expenses.exemptEmptyUnits && u.occupants === 0) return 0;
    if (totalOccupants === 0) {
      // Route to area or equal share so expense is never dropped
      return 1;
    }
    return u.occupants || 0;
  });

  // Area weighting
  const totalArea = units.reduce((acc, u) => acc + (u.area || 0), 0);
  const areaWeights = units.map(u => (totalArea > 0 ? u.area || 0 : 1));

  // Equal weighting
  const equalWeights = units.map(() => 1);

  // Special expense target weighting
  let specialWeights: number[] = [];
  if (expenses.specialMode === 'custom' && expenses.customUnitIds?.length) {
    specialWeights = units.map(u =>
      expenses.customUnitIds!.includes(u.id) ? 1 : 0
    );
  } else if (expenses.specialMode === 'active') {
    specialWeights = units.map(u => (u.isOccupied ? 1 : 0));
  } else {
    specialWeights = equalWeights;
  }

  // Distribute each component via Largest Remainder Method
  const waterShares = distributeLargestRemainder(waterTotal, occupantWeights);
  const gasShares = distributeLargestRemainder(gasTotal, occupantWeights);
  const electricityShares = distributeLargestRemainder(electricityTotal, equalWeights);
  const incidentalShares = distributeLargestRemainder(incidentalTotal, equalWeights);
  const areaShares = distributeLargestRemainder(areaExpenseTotal, areaWeights);
  const specialShares = distributeLargestRemainder(specialTotal, specialWeights);

  const charges: UnitChargeOutput[] = units.map((u, i) => {
    const fixed = fixedPerUnit;
    const water = waterShares[i] || 0;
    const gas = gasShares[i] || 0;
    const electricity = electricityShares[i] || 0;
    const incidental = incidentalShares[i] || 0;
    const areaShare = areaShares[i] || 0;
    const specialShare = specialShares[i] || 0;

    let subtotal =
      fixed + water + gas + electricity + incidental + areaShare + specialShare;

    let roundingDelta = 0;
    if (expenses.roundUp && expenses.roundStep && expenses.roundStep > 0) {
      const remainder = subtotal % expenses.roundStep;
      if (remainder !== 0) {
        roundingDelta = expenses.roundStep - remainder;
        subtotal += roundingDelta;
      }
    }

    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      fixed,
      water,
      gas,
      electricity,
      incidental,
      areaShare,
      specialShare,
      roundingDelta,
      totalCharge: subtotal,
    };
  });

  const totalDistributed = charges.reduce((acc, c) => acc + c.totalCharge, 0);
  const totalRounding = charges.reduce((acc, c) => acc + c.roundingDelta, 0);

  // Conservation assertion: totalDistributed strictly equals totalInputExpenses + roundingDelta
  const expectedTotal = totalInputExpenses + totalRounding;
  const conservationDelta = totalDistributed - expectedTotal;

  return {
    charges,
    totalDistributed,
    totalInputExpenses,
    conservationDelta,
  };
}

/**
 * Period Closing and Balance Settlement Oracle
 * Implements Feature 6 (Infinite Credit Fix) and Feature 7 (Anti-Double-Counting Fund Income).
 */
export function applyPeriodClosingOracle(
  units: Unit[],
  charges: UnitChargeOutput[],
  initialTreasuryFund: number
): {
  updatedUnits: Unit[];
  newTreasuryFund: number;
  totalCollectedFromCredit: number;
  totalNewDebts: number;
} {
  let totalCollectedFromCredit = 0;
  let totalNewDebts = 0;

  const updatedUnits = units.map(unit => {
    const charge = charges.find(c => c.unitId === unit.id);
    const amountDue = charge ? charge.totalCharge : 0;
    let balance = unit.balance || 0;

    // Apply charge against unit's balance:
    // If balance was positive (credit), credit is consumed by amountDue.
    // If balance was negative (debt), debt deepens.
    const newBalance = balance - amountDue;

    if (balance > 0) {
      // Credit was used towards payment
      const creditConsumed = Math.min(balance, amountDue);
      totalCollectedFromCredit += creditConsumed;
    }
    if (newBalance < 0) {
      totalNewDebts += Math.abs(newBalance);
    }

    return {
      ...unit,
      balance: newBalance,
    };
  });

  // Treasury fund retains manual deposits and collections;
  // Does not double-count future uncollected debts as immediate cash.
  const newTreasuryFund = initialTreasuryFund;

  return {
    updatedUnits,
    newTreasuryFund,
    totalCollectedFromCredit,
    totalNewDebts,
  };
}
