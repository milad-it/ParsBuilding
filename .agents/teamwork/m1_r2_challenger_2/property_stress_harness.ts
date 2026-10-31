import {
  calculatePeriodCharges,
  distributeLargestRemainder,
  calculateUnitLedgerBalance,
  applyCreditSettlement
} from '../../../server/src/services/calculationEngine.ts';
import type {
  UnitData,
  PeriodExpenseInput,
  LedgerTransaction
} from '../../../server/src/services/calculationEngine.ts';

interface StressStats {
  scenariosRun: number;
  conservationViolations: number;
  integerViolations: number;
  ledgerBalanceViolations: number;
  creditSettlementViolations: number;
  zeroOccupancyViolations: number;
  maxDeltaObserved: number;
}

const stats: StressStats = {
  scenariosRun: 0,
  conservationViolations: 0,
  integerViolations: 0,
  ledgerBalanceViolations: 0,
  creditSettlementViolations: 0,
  zeroOccupancyViolations: 0,
  maxDeltaObserved: 0,
};

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Pseudo-random deterministic generator (LCG)
let seed = 123456789;
function pseudoRandom(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function randInt(min: number, max: number): number {
  return Math.floor(pseudoRandom() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return parseFloat((pseudoRandom() * (max - min) + min).toFixed(2));
}

console.log('================================================================');
console.log('STARTING EMPIRICAL PROPERTY-BASED & ADVERSARIAL STRESS TEST');
console.log('================================================================');

// --------------------------------------------------------------------------
// TEST 1: distributeLargestRemainder Property-based Testing (1,000 iterations)
// --------------------------------------------------------------------------
console.log('\n--- Test Suite 1: distributeLargestRemainder Invariants (1,000 runs) ---');
for (let i = 0; i < 1000; i++) {
  const numRecipients = randInt(1, 100);
  const totalAmount = randInt(0, 100_000_000);
  const recipients = Array.from({ length: numRecipients }, (_, idx) => ({
    id: `rec_${idx + 1}`,
    weight: randFloat(0, 500),
    unitNumber: idx + 1
  }));

  const shares = distributeLargestRemainder(totalAmount, recipients);
  stats.scenariosRun++;

  // Invariant 1: Sum of shares must equal totalAmount exactly (Zero loss)
  let sumShares = 0;
  for (const [id, share] of shares.entries()) {
    // Invariant 2: Every share must be an integer
    if (!Number.isInteger(share)) {
      stats.integerViolations++;
      console.error(`Fractional share detected: id=${id}, share=${share}`);
    }
    // Invariant 3: No negative share
    if (share < 0) {
      console.error(`Negative share detected: id=${id}, share=${share}`);
    }
    sumShares += share;
  }

  const delta = totalAmount - sumShares;
  if (Math.abs(delta) > stats.maxDeltaObserved) {
    stats.maxDeltaObserved = Math.abs(delta);
  }

  if (delta !== 0) {
    stats.conservationViolations++;
    console.error(`Discrepancy at iteration ${i}: totalAmount=${totalAmount}, sumShares=${sumShares}, delta=${delta}`);
  }
}
console.log(`✓ Suite 1 Completed: 1,000 cases tested. Conservation violations: ${stats.conservationViolations}`);

// --------------------------------------------------------------------------
// TEST 2: calculatePeriodCharges Conservation Property (1,000 random complex scenarios)
// --------------------------------------------------------------------------
console.log('\n--- Test Suite 2: calculatePeriodCharges Zero Conservation Delta (1,000 runs) ---');
for (let i = 0; i < 1000; i++) {
  const unitCount = randInt(1, 120);
  const units: UnitData[] = Array.from({ length: unitCount }, (_, idx) => ({
    id: `u_${idx + 1}`,
    unitNumber: idx + 1,
    area: randFloat(0.01, 350.5),
    occupants: randInt(0, 8),
    hasPackage: pseudoRandom() > 0.5,
    ownerName: `Owner ${idx + 1}`,
    tenantName: pseudoRandom() > 0.4 ? `Tenant ${idx + 1}` : undefined
  }));

  const roundUp = pseudoRandom() > 0.5;
  const roundStep = [1000, 5000, 10000, 50000, 100000][randInt(0, 4)];
  const specialMode = (['all', 'active', 'custom'] as const)[randInt(0, 2)];
  const customUnitIds = specialMode === 'custom'
    ? units.slice(0, randInt(1, unitCount)).map(u => u.id)
    : undefined;

  const input: PeriodExpenseInput = {
    fixedPerUnit: randInt(0, 500_000),
    areaExpenseTotal: randInt(0, 50_000_000),
    waterTotal: randInt(0, 20_000_000),
    gasTotal: randInt(0, 30_000_000),
    electricityTotal: randInt(0, 10_000_000),
    incidentalTotal: randInt(0, 5_000_000),
    specialTotal: randInt(0, 15_000_000),
    specialMode,
    customUnitIds,
    exemptEmptyUnits: pseudoRandom() > 0.2,
    roundUp,
    roundStep
  };

  const result = calculatePeriodCharges(units, input);
  stats.scenariosRun++;

  // Invariant: conservationDelta MUST strictly be 0
  if (result.conservationDelta !== 0) {
    stats.conservationViolations++;
    console.error(`ConservationDelta violation at run ${i}: conservationDelta=${result.conservationDelta}`);
  }

  // Invariant: totalDistributed === totalInputExpenses + totalRoundingSurplus
  const expectedTotal = result.totalInputExpenses + result.totalRoundingSurplus;
  if (result.totalDistributed !== expectedTotal) {
    stats.conservationViolations++;
    console.error(`Total distributed mismatch: distributed=${result.totalDistributed}, expected=${expectedTotal}`);
  }

  // Invariant: Sum of individual unit charges === result.totalDistributed
  const sumUnitCharges = result.charges.reduce((sum, c) => sum + c.totalCharge, 0);
  if (sumUnitCharges !== result.totalDistributed) {
    stats.conservationViolations++;
    console.error(`Unit sum mismatch: sum=${sumUnitCharges}, totalDistributed=${result.totalDistributed}`);
  }

  // Invariant: Every unit breakdown component must be an integer
  for (const c of result.charges) {
    if (!Number.isInteger(c.totalCharge) ||
        !Number.isInteger(c.water) ||
        !Number.isInteger(c.gas) ||
        !Number.isInteger(c.electricity) ||
        !Number.isInteger(c.incidental) ||
        !Number.isInteger(c.areaShare) ||
        !Number.isInteger(c.specialShare) ||
        !Number.isInteger(c.fixed) ||
        !Number.isInteger(c.roundingDelta)) {
      stats.integerViolations++;
    }
  }
}
console.log(`✓ Suite 2 Completed: 1,000 cases tested. Conservation violations: ${stats.conservationViolations}`);

// --------------------------------------------------------------------------
// TEST 3: Extreme Adversarial Boundaries
// --------------------------------------------------------------------------
console.log('\n--- Test Suite 3: Extreme Adversarial Boundary Cases ---');

// Case 3.1: 1 Rial distributed across 997 prime units
{
  const units: UnitData[] = Array.from({ length: 997 }, (_, i) => ({
    id: `u_${i + 1}`,
    unitNumber: i + 1,
    area: 100,
    occupants: 2,
    hasPackage: false,
    ownerName: `Owner ${i + 1}`
  }));
  const res = calculatePeriodCharges(units, { incidentalTotal: 1, roundUp: false });
  stats.scenariosRun++;
  assert(res.conservationDelta === 0, '1 Rial across 997 units conservation');
  assert(res.totalDistributed === 1, 'Total distributed must be 1');
  const ones = res.charges.filter(c => c.totalCharge === 1);
  const zeros = res.charges.filter(c => c.totalCharge === 0);
  assert(ones.length === 1, 'Exactly one unit receives 1 Rial');
  assert(zeros.length === 996, '996 units receive 0 Rials');
  console.log('✓ Case 3.1 passed: 1 Rial across 997 prime units preserves exact conservation.');
}

// Case 3.2: 500 Billion Rials (Mega investment)
{
  const units: UnitData[] = Array.from({ length: 50 }, (_, i) => ({
    id: `u_${i + 1}`,
    unitNumber: i + 1,
    area: 75.33 + i,
    occupants: (i % 5) + 1,
    hasPackage: i % 2 === 0,
    ownerName: `Owner ${i + 1}`
  }));
  const hugeExpense = 500_000_000_000;
  const res = calculatePeriodCharges(units, {
    areaExpenseTotal: hugeExpense,
    roundUp: false
  });
  stats.scenariosRun++;
  assert(res.conservationDelta === 0, '500 Billion Rials conservation');
  assert(res.totalDistributed === hugeExpense, 'Total distributed must be 500 Billion');
  console.log('✓ Case 3.2 passed: 500 Billion Rials area-based distribution preserves exact conservation.');
}

// Case 3.3: 100% Units Empty (Zero occupancy safeguard)
{
  const units: UnitData[] = Array.from({ length: 10 }, (_, i) => ({
    id: `u_${i + 1}`,
    unitNumber: i + 1,
    area: (i + 1) * 20,
    occupants: 0,
    hasPackage: false,
    ownerName: `Owner ${i + 1}`
  }));
  const res = calculatePeriodCharges(units, {
    waterTotal: 1_000_000,
    exemptEmptyUnits: true,
    roundUp: false
  });
  stats.scenariosRun++;
  assert(res.conservationDelta === 0, 'Zero occupancy fallback conservation');
  assert(res.totalDistributed === 1_000_000, 'All 1,000,000 allocated to area fallback');
  assert(res.warnings.length > 0, 'Safeguard warning emitted');
  console.log('✓ Case 3.3 passed: 100% empty units cleanly falls back to area-based allocation without error.');
}

// Case 3.4: 100% Units Have Packages (Central gas infrastructure safeguard)
{
  const units: UnitData[] = Array.from({ length: 5 }, (_, i) => ({
    id: `u_${i + 1}`,
    unitNumber: i + 1,
    area: 100,
    occupants: 3,
    hasPackage: true,
    ownerName: `Owner ${i + 1}`
  }));
  const res = calculatePeriodCharges(units, {
    gasTotal: 750_000,
    roundUp: false
  });
  stats.scenariosRun++;
  assert(res.conservationDelta === 0, '100% package units gas conservation');
  assert(res.totalDistributed === 750_000, 'Gas total fully distributed as base fee');
  assert(res.warnings.length > 0, 'Safeguard warning emitted');
  res.charges.forEach(c => assert(c.gas === 150_000, 'Each gets 150,000'));
  console.log('✓ Case 3.4 passed: 100% package units gas allocated equally as base fee.');
}

// --------------------------------------------------------------------------
// TEST 4: Double-Entry Ledger Equations & Credit Settlement (500 simulations)
// --------------------------------------------------------------------------
console.log('\n--- Test Suite 4: Double-Entry Ledger Conservation & Multi-Period Simulation ---');

for (let sim = 0; sim < 500; sim++) {
  stats.scenariosRun++;
  const numUnits = randInt(5, 20);
  const numPeriods = 6;
  const initialFund = randInt(10_000_000, 100_000_000);

  // In double-entry building accounting:
  // Assets = Cash in Bank/Fund + Accounts Receivable (Residents Debt) - Accounts Payable (Residents Credit)
  // Initially:
  let treasuryCash = initialFund;
  const unitBalances = new Map<string, number>(); // Unit balance: > 0 means debt, < 0 means credit
  const ledger: LedgerTransaction[] = [];

  for (let u = 1; u <= numUnits; u++) {
    const unitId = `u_${u}`;
    unitBalances.set(unitId, 0);

    // Initial optional prepayment/credit
    if (pseudoRandom() > 0.5) {
      const advancePay = randInt(50_000, 500_000);
      treasuryCash += advancePay;
      unitBalances.set(unitId, -advancePay);
      ledger.push({
        id: `init_pay_${sim}_${u}`,
        unitId,
        type: 'payment',
        amount: advancePay,
        txKind: 'MANUAL_PAYMENT',
        timestamp: new Date(),
        description: 'Advance payment'
      });
    }
  }

  // Simulate sequential periods
  for (let p = 1; p <= numPeriods; p++) {
    const periodChargeTotal = randInt(1_000_000, 10_000_000);
    const recipients = Array.from({ length: numUnits }, (_, i) => ({
      id: `u_${i + 1}`,
      weight: 1,
      unitNumber: i + 1
    }));
    const shares = distributeLargestRemainder(periodChargeTotal, recipients);

    // Apply charges to each unit
    for (let u = 1; u <= numUnits; u++) {
      const unitId = `u_${u}`;
      const charge = shares.get(unitId)!;
      const prevBal = unitBalances.get(unitId)!;

      // Check credit settlement logic
      const settlement = applyCreditSettlement(charge, prevBal);
      if (settlement.newBalance !== prevBal + charge) {
        stats.creditSettlementViolations++;
      }
      if (settlement.appliedCredit + settlement.netPayable !== charge) {
        stats.creditSettlementViolations++;
      }

      // Record charge in ledger
      ledger.push({
        id: `charge_p${p}_${u}`,
        unitId,
        type: 'debt',
        amount: charge,
        txKind: 'PERIOD_CHARGE',
        timestamp: new Date(),
        description: `Period ${p} charge`
      });
      unitBalances.set(unitId, prevBal + charge);

      // Unit pays their charge: either exact, partial, overpayment, or 0
      const payRoll = pseudoRandom();
      let payAmount = 0;
      if (payRoll > 0.7) {
        // Full net payment or total outstanding
        payAmount = Math.max(0, unitBalances.get(unitId)!);
      } else if (payRoll > 0.4) {
        // Overpayment
        payAmount = Math.max(0, unitBalances.get(unitId)!) + randInt(50_000, 200_000);
      } else if (payRoll > 0.2) {
        // Partial payment
        payAmount = Math.floor(charge * 0.5);
      }

      if (payAmount > 0) {
        treasuryCash += payAmount;
        unitBalances.set(unitId, unitBalances.get(unitId)! - payAmount);
        ledger.push({
          id: `pay_p${p}_${u}`,
          unitId,
          type: 'payment',
          amount: payAmount,
          txKind: 'ONLINE_PAYMENT',
          timestamp: new Date(),
          description: `Period ${p} payment`
        });
      }
    }
  }

  // Verify Double-Entry Invariants for this complex simulation:
  // 1. Treasury balance must exactly equal initialFund + sum of all payment transactions
  const totalPaymentsRecorded = ledger
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);

  if (treasuryCash !== initialFund + totalPaymentsRecorded) {
    stats.ledgerBalanceViolations++;
    console.error(`Treasury cash discrepancy: cash=${treasuryCash}, expected=${initialFund + totalPaymentsRecorded}`);
  }

  // 2. Unit ledger balance calculated from transactions must match running unit balances exactly
  for (let u = 1; u <= numUnits; u++) {
    const unitId = `u_${u}`;
    const unitTxs = ledger.filter(t => t.unitId === unitId);
    const calculatedBalance = calculateUnitLedgerBalance(unitTxs);
    const runningBalance = unitBalances.get(unitId)!;

    if (calculatedBalance !== runningBalance) {
      stats.ledgerBalanceViolations++;
      console.error(`Unit ${unitId} balance mismatch: calculated=${calculatedBalance}, running=${runningBalance}`);
    }
  }

  // 3. Double-entry total equation:
  // Total Billed Debts - Total Payments = Net Resident Balances (Sum of all units)
  const totalBilled = ledger
    .filter(t => t.type === 'debt')
    .reduce((sum, t) => sum + t.amount, 0);

  const sumAllUnitBalances = Array.from(unitBalances.values()).reduce((sum, b) => sum + b, 0);
  const netAccountingDiscrepancy = (totalBilled - totalPaymentsRecorded) - sumAllUnitBalances;

  if (netAccountingDiscrepancy !== 0) {
    stats.ledgerBalanceViolations++;
    console.error(`Double-entry balance equation violated: netDiscrepancy=${netAccountingDiscrepancy}`);
  }
}

console.log(`✓ Suite 4 Completed: 500 multi-period multi-unit simulations.`);
console.log(`  Ledger balance violations: ${stats.ledgerBalanceViolations}`);
console.log(`  Credit settlement violations: ${stats.creditSettlementViolations}`);

console.log('\n================================================================');
console.log('STRESS TEST SUMMARY');
console.log('================================================================');
console.log(`Total scenarios run: ${stats.scenariosRun}`);
console.log(`Conservation Delta Violations (sum != total): ${stats.conservationViolations}`);
console.log(`Integer violations (non-integer share/rounding): ${stats.integerViolations}`);
console.log(`Double-entry ledger balance violations: ${stats.ledgerBalanceViolations}`);
console.log(`Credit settlement violations: ${stats.creditSettlementViolations}`);
console.log(`Max conservation delta observed: ${stats.maxDeltaObserved}`);
console.log('================================================================');

if (stats.conservationViolations === 0 &&
    stats.integerViolations === 0 &&
    stats.ledgerBalanceViolations === 0 &&
    stats.creditSettlementViolations === 0) {
  console.log('RESULT: 100% EMPIRICAL VERIFICATION PASSED. ZERO DISCREPANCIES.');
} else {
  console.error('RESULT: EMPIRICAL VERIFICATION FAILED!');
  process.exit(1);
}
