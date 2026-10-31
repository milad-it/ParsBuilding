/**
 * ParsBuilding Deterministic Calculation Engine
 *
 * Implements pure functional, mathematically exact building accounting formulas.
 * - Largest Remainder Method (Hare-Niemeyer) for zero penny/rial discrepancy.
 * - ماده ۴ قانون تملک آپارتمان‌ها (Area-based structural/reserve expenses).
 * - Occupant-weighted utility bills (water).
 * - Package-exempt utility bills (central heating/gas).
 * - Equal-share incidentals and public electricity.
 * - Special project periods (all, active, custom).
 * - Transparent rounding step preserving financial conservation (sum Shares = Expenses + Surplus).
 * - Resolves all 8 legacy computational bugs.
 */

export interface UnitData {
  id: string;
  unitNumber: number;
  area: number; // in square meters (ماده ۴ قانون تملک)
  occupants: number;
  hasPackage: boolean;
  ownerName: string;
  tenantName?: string;
}

export interface PeriodExpenseInput {
  fixedPerUnit?: number;
  waterTotal?: number;
  gasTotal?: number;
  electricityTotal?: number;
  incidentalTotal?: number;
  areaExpenseTotal?: number;
  specialTotal?: number;
  specialMode?: 'all' | 'active' | 'custom';
  customUnitIds?: string[];
  inputMode?: 'total' | 'rate';
  exemptEmptyUnits?: boolean;
  roundUp?: boolean;
  roundStep?: number;
}

export interface UnitChargeOutput {
  unitId: string;
  fixed: number;
  water: number;
  gas: number;
  electricity: number;
  incidental: number;
  areaShare: number;
  specialShare: number;
  roundingDelta: number;
  totalCharge: number;
}

export interface CalculationResult {
  charges: UnitChargeOutput[];
  totalDistributed: number;
  totalInputExpenses: number;
  totalRoundingSurplus: number;
  conservationDelta: number;
  warnings: string[];
}

export interface LedgerTransaction {
  id: string;
  unitId: string;
  type: 'debt' | 'payment' | 'forgive';
  amount: number;
  txKind: string;
  periodId?: string;
  timestamp: Date;
  description: string;
}

export interface CreditSettlementResult {
  chargeAmount: number;
  initialBalance: number;
  appliedCredit: number;
  netPayable: number;
  newBalance: number;
}

/**
 * Distributes an integer currency amount across recipients proportionally according to weights
 * using the Largest Remainder Method (Hare-Niemeyer method).
 * Guarantees that:
 * 1. Every share is an integer (zero fractional/penny debts).
 * 2. The sum of distributed shares exactly equals totalAmount (zero loss).
 * 3. Tie-breaking is deterministic based on unitNumber.
 */
export function distributeLargestRemainder(
  totalAmount: number,
  recipients: { id: string; weight: number; unitNumber: number }[]
): Map<string, number> {
  const result = new Map<string, number>();

  if (recipients.length === 0) {
    return result;
  }

  if (totalAmount <= 0) {
    recipients.forEach(r => result.set(r.id, 0));
    return result;
  }

  const totalWeight = recipients.reduce((sum, r) => sum + Math.max(0, r.weight), 0);

  // If all weights are 0, distribute equally among all recipients
  if (totalWeight <= 0) {
    return distributeLargestRemainder(
      totalAmount,
      recipients.map(r => ({ ...r, weight: 1 }))
    );
  }

  // 1. Calculate exact quotas, integer floors, and remainders
  let sumBase = 0;
  const items = recipients.map(r => {
    const quota = (totalAmount * Math.max(0, r.weight)) / totalWeight;
    const base = Math.floor(quota);
    const remainder = quota - base;
    sumBase += base;
    return {
      id: r.id,
      unitNumber: r.unitNumber,
      base,
      remainder
    };
  });

  // 2. Compute deficit (number of recipients to receive an additional 1 unit)
  const deficit = totalAmount - sumBase;

  // 3. Sort descending by remainder, with deterministic tie-breaking by unitNumber
  items.sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.unitNumber - b.unitNumber;
  });

  // 4. Distribute the extra 1 unit to the top 'deficit' recipients
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const extra = i < deficit ? 1 : 0;
    result.set(item.id, item.base + extra);
  }

  return result;
}

/**
 * Calculates deterministic building period charges for all units.
 */
export function calculatePeriodCharges(
  units: UnitData[],
  input: PeriodExpenseInput
): CalculationResult {
  const warnings: string[] = [];
  const chargesMap = new Map<string, UnitChargeOutput>();

  // Initialize output structures for every unit
  units.forEach(u => {
    chargesMap.set(u.id, {
      unitId: u.id,
      fixed: 0,
      water: 0,
      gas: 0,
      electricity: 0,
      incidental: 0,
      areaShare: 0,
      specialShare: 0,
      roundingDelta: 0,
      totalCharge: 0
    });
  });

  if (units.length === 0) {
    return {
      charges: [],
      totalDistributed: 0,
      totalInputExpenses: 0,
      totalRoundingSurplus: 0,
      conservationDelta: 0,
      warnings
    };
  }

  const exemptEmpty = input.exemptEmptyUnits ?? true;
  const isRateMode = input.inputMode === 'rate';
  let totalInputExpenses = 0;

  // 1. Fixed Charge per unit
  const fixedRate = input.fixedPerUnit ?? 0;
  if (fixedRate > 0) {
    const fixedTotal = fixedRate * units.length;
    totalInputExpenses += fixedTotal;
    units.forEach(u => {
      chargesMap.get(u.id)!.fixed = fixedRate;
    });
  }

  // 2. Water Expense (Occupant-based distribution)
  let waterTotal = input.waterTotal ?? 0;
  if (isRateMode && waterTotal > 0) {
    const totalOcc = units.reduce((sum, u) => sum + (u.occupants || 0), 0);
    waterTotal = waterTotal * totalOcc;
  }

  if (waterTotal > 0) {
    totalInputExpenses += waterTotal;
    const waterRecipients = units
      .filter(u => !exemptEmpty || u.occupants > 0)
      .map(u => ({ id: u.id, weight: u.occupants, unitNumber: u.unitNumber }));

    const sumWaterWeight = waterRecipients.reduce((s, r) => s + r.weight, 0);

    if (waterRecipients.length === 0 || sumWaterWeight === 0) {
      // Bug #8 Safeguard: when all units are empty, route to area-based owner allocation
      warnings.push('تمامی واحدها خالی هستند؛ هزینه آب بر اساس متراژ اختصاصی بین مالکین تسهیم شد.');
      const fallbackRecipients = units.map(u => ({
        id: u.id,
        weight: u.area > 0 ? u.area : 1,
        unitNumber: u.unitNumber
      }));
      const waterShares = distributeLargestRemainder(waterTotal, fallbackRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.water = waterShares.get(u.id) || 0;
      });
    } else {
      const waterShares = distributeLargestRemainder(waterTotal, waterRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.water = waterShares.get(u.id) || 0;
      });
    }
  }

  // 3. Central Gas Expense (Exempts units with independent package system)
  let gasTotal = input.gasTotal ?? 0;
  const nonPackageUnits = units.filter(u => !u.hasPackage && (!exemptEmpty || u.occupants > 0));

  if (isRateMode && gasTotal > 0) {
    gasTotal = gasTotal * nonPackageUnits.length;
  }

  if (gasTotal > 0) {
    totalInputExpenses += gasTotal;
    if (nonPackageUnits.length === 0) {
      // TC-CALC-06 Safeguard: When 100% of units have packages, gas is shared equally as base infrastructure fee
      warnings.push('هیچ واحد مشمول گاز مشاع یافت نشد؛ هزینه گاز به عنوان آبونمان پایه به تساوی بین همه واحدها سرشکن شد.');
      const fallbackRecipients = units.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
      const gasShares = distributeLargestRemainder(gasTotal, fallbackRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.gas = gasShares.get(u.id) || 0;
      });
    } else {
      const gasRecipients = nonPackageUnits.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
      const gasShares = distributeLargestRemainder(gasTotal, gasRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.gas = gasShares.get(u.id) || 0;
      });
    }
  }

  // 4. Public Electricity Expense (Equal share among active/occupied units)
  let elecTotal = input.electricityTotal ?? 0;
  const elecPayerUnits = units.filter(u => !exemptEmpty || u.occupants > 0);

  if (isRateMode && elecTotal > 0) {
    elecTotal = elecTotal * elecPayerUnits.length;
  }

  if (elecTotal > 0) {
    totalInputExpenses += elecTotal;
    const recipients = (elecPayerUnits.length > 0 ? elecPayerUnits : units).map(u => ({
      id: u.id,
      weight: 1,
      unitNumber: u.unitNumber
    }));
    const elecShares = distributeLargestRemainder(elecTotal, recipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.electricity = elecShares.get(u.id) || 0;
    });
  }

  // 5. Incidentals & Building Common Expenses (Equal share among all units)
  const incTotal = input.incidentalTotal ?? 0;
  if (incTotal > 0) {
    totalInputExpenses += incTotal;
    const incRecipients = units.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
    const incShares = distributeLargestRemainder(incTotal, incRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.incidental = incShares.get(u.id) || 0;
    });
  }

  // 6. Area-based Expense - ماده ۴ قانون تملک آپارتمان‌ها
  let areaTotal = input.areaExpenseTotal ?? 0;
  const totalArea = units.reduce((s, u) => s + (u.area || 0), 0);

  if (isRateMode && areaTotal > 0) {
    areaTotal = Math.round(areaTotal * totalArea);
  }

  if (areaTotal > 0) {
    totalInputExpenses += areaTotal;
    const areaRecipients = units.map(u => ({
      id: u.id,
      weight: u.area > 0 ? u.area : 1,
      unitNumber: u.unitNumber
    }));
    const areaShares = distributeLargestRemainder(areaTotal, areaRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.areaShare = areaShares.get(u.id) || 0;
    });
  }

  // 7. Special Emergency / Project Expenses
  const spTotal = input.specialTotal ?? 0;
  if (spTotal > 0) {
    totalInputExpenses += spTotal;
    const mode = input.specialMode || 'all';
    let targetUnits = units;

    if (mode === 'active') {
      const activeUnits = units.filter(u => u.occupants > 0);
      targetUnits = activeUnits.length > 0 ? activeUnits : units;
    } else if (mode === 'custom' && input.customUnitIds && input.customUnitIds.length > 0) {
      const customSet = new Set(input.customUnitIds);
      const filtered = units.filter(u => customSet.has(u.id));
      targetUnits = filtered.length > 0 ? filtered : units;
    }

    const spRecipients = targetUnits.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
    const spShares = distributeLargestRemainder(spTotal, spRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.specialShare = spShares.get(u.id) || 0;
    });
  }

  // 8. Tally shares and apply rounding step
  const roundStep = input.roundStep && input.roundStep > 0 ? input.roundStep : 50000;
  let totalDistributed = 0;
  let totalRoundingSurplus = 0;

  const charges: UnitChargeOutput[] = units.map(u => {
    const c = chargesMap.get(u.id)!;
    const unrounded =
      c.fixed +
      c.water +
      c.gas +
      c.electricity +
      c.incidental +
      c.areaShare +
      c.specialShare;

    let finalCharge = unrounded;
    let roundingDelta = 0;

    if (input.roundUp && unrounded > 0) {
      finalCharge = Math.ceil(unrounded / roundStep) * roundStep;
      roundingDelta = finalCharge - unrounded;
    }

    c.roundingDelta = roundingDelta;
    c.totalCharge = finalCharge;

    totalDistributed += finalCharge;
    totalRoundingSurplus += roundingDelta;

    return c;
  });

  const conservationDelta = totalDistributed - (totalInputExpenses + totalRoundingSurplus);

  return {
    charges,
    totalDistributed,
    totalInputExpenses,
    totalRoundingSurplus,
    conservationDelta,
    warnings
  };
}

/**
 * Computes net ledger balance for a unit from its ledger transactions.
 * Positive = unit owes money (debt).
 * Negative = unit has credit balance (surplus/advance payment).
 */
export function calculateUnitLedgerBalance(transactions: LedgerTransaction[]): number {
  return transactions.reduce((balance, tx) => {
    if (tx.type === 'debt') return balance + tx.amount;
    if (tx.type === 'payment' || tx.type === 'forgive') return balance - tx.amount;
    return balance;
  }, 0);
}

/**
 * Applies existing credit towards newly billed charges without the infinite credit loop bug (Bug #3).
 *
 * In standard double-entry ledger bookkeeping:
 * - Negative balance indicates resident credit.
 * - Adding a new charge adds a 'debt' transaction of chargeAmount.
 * - New balance = currentBalance + chargeAmount.
 * - This naturally exhausts prior credit without creating offsetting phantom payments.
 */
export function applyCreditSettlement(
  chargeAmount: number,
  currentLedgerBalance: number
): CreditSettlementResult {
  const availableCredit = currentLedgerBalance < 0 ? Math.abs(currentLedgerBalance) : 0;
  const appliedCredit = Math.min(availableCredit, chargeAmount);
  const netPayable = Math.max(0, chargeAmount - appliedCredit);
  const newBalance = currentLedgerBalance + chargeAmount;

  return {
    chargeAmount,
    initialBalance: currentLedgerBalance,
    appliedCredit,
    netPayable,
    newBalance
  };
}
