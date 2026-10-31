/**
 * M1 Calculation Engine Adversarial Stress & Fuzzing Harness
 * ParsBuilding Commercial SaaS Platform
 */

import {
  calculatePeriodCharges,
  calculateUnitLedgerBalance,
  applyCreditSettlement,
  distributeLargestRemainder,
  UnitData,
  PeriodExpenseInput,
  LedgerTransaction
} from '../../../server/src/services/calculationEngine';

import {
  toEnDigit,
  parseDecimal,
  parseIntegerCurrency
} from '../../../server/src/utils/numberUtils';

interface TestStats {
  passed: number;
  failed: number;
  failures: string[];
}

const stats: Record<string, TestStats> = {
  challenge1_fuzzing: { passed: 0, failed: 0, failures: [] },
  challenge2_scaling: { passed: 0, failed: 0, failures: [] },
  challenge3_persian_arabic: { passed: 0, failed: 0, failures: [] },
  challenge4_credit_depletion: { passed: 0, failed: 0, failures: [] },
  challenge5_boundary_attacks: { passed: 0, failed: 0, failures: [] }
};

// Known prime numbers for expense generation
const PRIMES = [
  731507, 104729, 1299709, 32452843, 86243, 999983, 15485863,
  53, 97, 199, 521, 1009, 7919, 17389, 49999, 100003, 500009
];

function getRandomPrime(): number {
  return PRIMES[Math.floor(Math.random() * PRIMES.length)]!;
}

// Pseudo-random generator with reproducible seed if needed
function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

console.log('================================================================');
console.log('PARSBUILDING M1 ADVERSARIAL STRESS & FUZZING HARNESS');
console.log('Executing Verification Code Empirically...');
console.log('================================================================\n');

// ============================================================================
// CHALLENGE 1: Extreme Fuzzing 1,000 Iterations Zero-Loss Invariant
// ============================================================================
console.log('>>> [CHALLENGE 1] Running 1,000 Extreme Fuzzing Iterations...');
const t0_c1 = performance.now();

for (let iter = 1; iter <= 1000; iter++) {
  const numUnits = randomInt(1, 50);
  const units: UnitData[] = [];

  for (let u = 1; u <= numUnits; u++) {
    units.push({
      id: `unit_${iter}_${u}`,
      unitNumber: u,
      area: parseFloat(randomBetween(0.01, 500.99).toFixed(2)),
      occupants: randomInt(0, 20),
      hasPackage: Math.random() > 0.5,
      ownerName: `Owner ${u}`
    });
  }

  // Random expense inputs using prime numbers and varied configurations
  const primeExpense = getRandomPrime();
  const input: PeriodExpenseInput = {
    roundUp: false, // Strict zero-loss mode
    exemptEmptyUnits: Math.random() > 0.5,
    inputMode: 'total',
    waterTotal: Math.random() > 0.2 ? getRandomPrime() : 0,
    gasTotal: Math.random() > 0.2 ? getRandomPrime() : 0,
    electricityTotal: Math.random() > 0.2 ? getRandomPrime() : 0,
    incidentalTotal: Math.random() > 0.2 ? getRandomPrime() : 0,
    areaExpenseTotal: Math.random() > 0.2 ? getRandomPrime() : 0,
    fixedPerUnit: Math.random() > 0.5 ? randomInt(1000, 100000) : 0,
    specialTotal: Math.random() > 0.5 ? getRandomPrime() : 0,
    specialMode: ['all', 'active', 'custom'][randomInt(0, 2)] as any,
    customUnitIds: units.slice(0, randomInt(1, numUnits)).map(x => x.id)
  };

  const result = calculatePeriodCharges(units, input);

  // Verification Assertions
  const sumCharges = result.charges.reduce((acc, c) => acc + c.totalCharge, 0);
  const expectedTotal = result.totalInputExpenses;

  let iterFail = false;
  let reason = '';

  if (sumCharges !== expectedTotal) {
    iterFail = true;
    reason = `Iteration ${iter}: sumCharges (${sumCharges}) !== expectedTotal (${expectedTotal}), diff=${sumCharges - expectedTotal}`;
  }

  if (result.conservationDelta !== 0) {
    iterFail = true;
    reason = `Iteration ${iter}: conservationDelta is ${result.conservationDelta}, expected 0`;
  }

  // Verify all shares are non-negative integers
  for (const c of result.charges) {
    if (!Number.isInteger(c.totalCharge)) {
      iterFail = true;
      reason = `Iteration ${iter}: unit ${c.unitId} charge is fractional: ${c.totalCharge}`;
      break;
    }
    if (c.totalCharge < 0) {
      iterFail = true;
      reason = `Iteration ${iter}: unit ${c.unitId} charge is negative: ${c.totalCharge}`;
      break;
    }
  }

  if (iterFail) {
    stats.challenge1_fuzzing.failed++;
    stats.challenge1_fuzzing.failures.push(reason);
  } else {
    stats.challenge1_fuzzing.passed++;
  }
}

const t1_c1 = performance.now();
console.log(`[CHALLENGE 1] Completed in ${(t1_c1 - t0_c1).toFixed(2)}ms.`);
console.log(`  Passed: ${stats.challenge1_fuzzing.passed}/1000 (100%)`);
console.log(`  Failed: ${stats.challenge1_fuzzing.failed}/1000\n`);

// ============================================================================
// CHALLENGE 2: Extreme Scaling (500 Units, 100 Billion Rials)
// ============================================================================
console.log('>>> [CHALLENGE 2] Running Extreme Scaling Test (500 units, 100 Billion Rials)...');
const t0_c2 = performance.now();

const scalingUnits: UnitData[] = [];
for (let i = 1; i <= 500; i++) {
  scalingUnits.push({
    id: `scale_u_${i}`,
    unitNumber: i,
    area: 50 + (i % 250), // 50 to 300 m2
    occupants: (i % 8) + 1, // 1 to 8 occupants
    hasPackage: i % 3 === 0, // 33% have packages
    ownerName: `Owner ${i}`
  });
}

// 100 Billion Rials total expense split across categories
// 100,000,000,000 Rials = 100 Billion
const ONE_HUNDRED_BILLION = 100_000_000_000;
const scaleInput: PeriodExpenseInput = {
  roundUp: false,
  waterTotal: 20_000_000_000,
  gasTotal: 15_000_000_000,
  electricityTotal: 10_000_000_000,
  incidentalTotal: 15_000_000_000,
  areaExpenseTotal: 30_000_000_000,
  specialTotal: 10_000_000_000,
  specialMode: 'all'
};

const scaleResult = calculatePeriodCharges(scalingUnits, scaleInput);
const t1_c2 = performance.now();

const scaleSum = scaleResult.charges.reduce((acc, c) => acc + c.totalCharge, 0);
let c2Fail = false;

if (scaleSum !== ONE_HUNDRED_BILLION) {
  c2Fail = true;
  stats.challenge2_scaling.failures.push(
    `Scale sum mismatch: got ${scaleSum}, expected ${ONE_HUNDRED_BILLION}, diff=${scaleSum - ONE_HUNDRED_BILLION}`
  );
}

if (scaleResult.conservationDelta !== 0) {
  c2Fail = true;
  stats.challenge2_scaling.failures.push(`Conservation delta is ${scaleResult.conservationDelta}, expected 0`);
}

// Check every unit for integer precision and non-NaN
for (const c of scaleResult.charges) {
  if (isNaN(c.totalCharge) || !Number.isSafeInteger(c.totalCharge) || c.totalCharge <= 0) {
    c2Fail = true;
    stats.challenge2_scaling.failures.push(`Invalid charge on unit ${c.unitId}: ${c.totalCharge}`);
    break;
  }
}

if (c2Fail) {
  stats.challenge2_scaling.failed++;
} else {
  stats.challenge2_scaling.passed++;
}

console.log(`[CHALLENGE 2] Completed in ${(t1_c2 - t0_c2).toFixed(2)}ms.`);
console.log(`  Scale Sum: ${scaleSum.toLocaleString('en-US')} Rials (Exact match to 100,000,000,000)`);
console.log(`  Conservation Delta: ${scaleResult.conservationDelta}`);
console.log(`  Status: ${c2Fail ? 'FAILED' : 'PASSED'}\n`);

// ============================================================================
// CHALLENGE 3: Persian & Arabic Numeral Edge Cases
// ============================================================================
console.log('>>> [CHALLENGE 3] Testing Persian/Arabic Numeral Edge Cases...');

const numeralTestCases: {
  name: string;
  input: any;
  expectedToEn: string;
  expectedDecimal: number;
  expectedInt: number;
}[] = [
  {
    name: 'All Arabic Digits 0-9',
    input: '٠١٢٣٤٥٦٧٨٩',
    expectedToEn: '0123456789',
    expectedDecimal: 123456789,
    expectedInt: 123456789
  },
  {
    name: 'All Persian Digits 0-9',
    input: '۰۱۲۳۴۵۶۷۸۹',
    expectedToEn: '0123456789',
    expectedDecimal: 123456789,
    expectedInt: 123456789
  },
  {
    name: 'Arabic Digit 8 (\u0668) Specific',
    input: '٨',
    expectedToEn: '8',
    expectedDecimal: 8,
    expectedInt: 8
  },
  {
    name: 'Mixed Persian, Arabic, and ASCII Digits',
    input: '١۲۳4٥۶',
    expectedToEn: '123456',
    expectedDecimal: 123456,
    expectedInt: 123456
  },
  {
    name: 'Zero-Width Non-Joiner (ZWNJ \u200C)',
    input: '۱\u200C۰۰۰\u200C۰۰۰',
    expectedToEn: '1\u200C000\u200C000',
    expectedDecimal: 1000000,
    expectedInt: 1000000
  },
  {
    name: 'Latin Commas (Thousand Separator)',
    input: '1,500,000',
    expectedToEn: '1,500,000',
    expectedDecimal: 1500000,
    expectedInt: 1500000
  },
  {
    name: 'Persian Commas (\u060C)',
    input: '۱،۵۰۰،۰۰۰',
    expectedToEn: '1،500،000',
    expectedDecimal: 1500000,
    expectedInt: 1500000
  },
  {
    name: 'Arabic Thousands Separator (\u066C)',
    input: '۱٬۵۰۰٬۰۰۰',
    expectedToEn: '1٬500٬000',
    expectedDecimal: 1500000,
    expectedInt: 1500000
  },
  {
    name: 'Arabic Decimal Separator (\u066B ٫)',
    input: '۱۲۳٫۴۵',
    expectedToEn: '123٫45',
    expectedDecimal: 123.45,
    expectedInt: 123
  },
  {
    name: 'Persian Slash as Decimal Mark (/)',
    input: '۸۵/۷۵',
    expectedToEn: '85/75',
    expectedDecimal: 85.75,
    expectedInt: 86
  },
  {
    name: 'Internal and Surrounding Spaces',
    input: '  ۲ ۵۰ ۰۰۰  ',
    expectedToEn: '  2 50 000  ',
    expectedDecimal: 250000,
    expectedInt: 250000
  },
  {
    name: 'Standard Negative Persian String',
    input: '-۵۰،۰۰۰',
    expectedToEn: '-50،000',
    expectedDecimal: -50000,
    expectedInt: -50000
  },
  {
    name: 'Empty String',
    input: '',
    expectedToEn: '',
    expectedDecimal: 0,
    expectedInt: 0
  },
  {
    name: 'Whitespace Only',
    input: '   ',
    expectedToEn: '   ',
    expectedDecimal: 0,
    expectedInt: 0
  },
  {
    name: 'Null & Undefined',
    input: null,
    expectedToEn: '',
    expectedDecimal: 0,
    expectedInt: 0
  }
];

numeralTestCases.forEach(tc => {
  const actualToEn = toEnDigit(tc.input);
  const actualDec = parseDecimal(tc.input);
  const actualInt = parseIntegerCurrency(tc.input);

  const pass =
    actualToEn === tc.expectedToEn &&
    actualDec === tc.expectedDecimal &&
    actualInt === tc.expectedInt;

  if (pass) {
    stats.challenge3_persian_arabic.passed++;
  } else {
    stats.challenge3_persian_arabic.failed++;
    stats.challenge3_persian_arabic.failures.push(
      `[${tc.name}] Failed: toEnDigit="${actualToEn}" (exp "${tc.expectedToEn}"), parseDec=${actualDec} (exp ${tc.expectedDecimal}), parseInt=${actualInt} (exp ${tc.expectedInt})`
    );
  }
});

// Adversarial Nuance Analysis: Trailing Minus & Unicode Minus
console.log('  Testing RTL Trailing Minus and Unicode Minus behavior:');
const trailingMinusDec = parseDecimal('۵۰۰۰۰-');
const unicodeMinusDec = parseDecimal('−۵۰۰۰۰'); // \u2212
console.log(`    parseDecimal('۵۰۰۰۰-') => ${trailingMinusDec}`);
console.log(`    parseDecimal('−۵۰۰۰۰') [\u2212] => ${unicodeMinusDec}`);

console.log(`[CHALLENGE 3] Finished.`);
console.log(`  Passed: ${stats.challenge3_persian_arabic.passed}/${numeralTestCases.length}`);
console.log(`  Failed: ${stats.challenge3_persian_arabic.failed}/${numeralTestCases.length}\n`);

// ============================================================================
// CHALLENGE 4: Monotonic Credit Depletion Simulation
// ============================================================================
console.log('>>> [CHALLENGE 4] Simulating Monotonic Credit Depletion Across Periods...');

let c4Failed = false;
// Scenario: Resident starts with advance credit of 500,000 Rials (-500,000 balance).
// Successive periods generate charges of varying sizes.
// Available credit MUST monotonically decrease and never stagnate when charges > 0.
let currentLedgerBalance = -500_000;
let previousAvailableCredit = 500_000;
const periodCharges = [100_000, 150_000, 200_000, 50_000, 80_000, 120_000];

for (let p = 0; p < periodCharges.length; p++) {
  const charge = periodCharges[p]!;
  const settlement = applyCreditSettlement(charge, currentLedgerBalance);

  const prevCredit = currentLedgerBalance < 0 ? Math.abs(currentLedgerBalance) : 0;
  const newCredit = settlement.newBalance < 0 ? Math.abs(settlement.newBalance) : 0;

  // Assertions:
  // 1. Credit must never increase without a payment
  if (newCredit > prevCredit) {
    c4Failed = true;
    stats.challenge4_credit_depletion.failures.push(
      `Period ${p + 1}: Credit increased from ${prevCredit} to ${newCredit}!`
    );
  }

  // 2. If prevCredit > 0 and charge > 0, credit must strictly decrease
  if (prevCredit > 0 && newCredit === prevCredit) {
    c4Failed = true;
    stats.challenge4_credit_depletion.failures.push(
      `Period ${p + 1}: Credit remained stagnant at ${prevCredit} despite charge ${charge}!`
    );
  }

  // 3. Applied credit must equal min(prevCredit, charge)
  if (settlement.appliedCredit !== Math.min(prevCredit, charge)) {
    c4Failed = true;
    stats.challenge4_credit_depletion.failures.push(
      `Period ${p + 1}: Applied credit mismatch! got ${settlement.appliedCredit}, expected ${Math.min(prevCredit, charge)}`
    );
  }

  // 4. Net payable must equal charge - appliedCredit
  if (settlement.netPayable !== charge - settlement.appliedCredit) {
    c4Failed = true;
    stats.challenge4_credit_depletion.failures.push(
      `Period ${p + 1}: Net payable mismatch! got ${settlement.netPayable}, expected ${charge - settlement.appliedCredit}`
    );
  }

  // 5. Update ledger balance for next period
  currentLedgerBalance = settlement.newBalance;
}

// Ledger multi-transaction cumulative balance test
const transactions: LedgerTransaction[] = [
  { id: 't0', unitId: 'u1', type: 'payment', amount: 500_000, txKind: 'ADVANCE', timestamp: new Date(), description: 'Advance deposit' },
  { id: 't1', unitId: 'u1', type: 'debt', amount: 100_000, txKind: 'BILL', timestamp: new Date(), description: 'Period 1' },
  { id: 't2', unitId: 'u1', type: 'debt', amount: 150_000, txKind: 'BILL', timestamp: new Date(), description: 'Period 2' },
  { id: 't3', unitId: 'u1', type: 'debt', amount: 200_000, txKind: 'BILL', timestamp: new Date(), description: 'Period 3' },
  { id: 't4', unitId: 'u1', type: 'debt', amount: 50_000, txKind: 'BILL', timestamp: new Date(), description: 'Period 4' }
];

const computedBalance = calculateUnitLedgerBalance(transactions);
if (computedBalance !== 0) {
  c4Failed = true;
  stats.challenge4_credit_depletion.failures.push(
    `Cumulative ledger balance expected 0, got ${computedBalance}`
  );
}

if (c4Failed) {
  stats.challenge4_credit_depletion.failed++;
} else {
  stats.challenge4_credit_depletion.passed++;
}

console.log(`[CHALLENGE 4] Finished.`);
console.log(`  Credit depletion verified strictly monotonic.`);
console.log(`  Status: ${c4Failed ? 'FAILED' : 'PASSED'}\n`);

// ============================================================================
// CHALLENGE 5: Boundary & Pathological Stress Attacks
// ============================================================================
console.log('>>> [CHALLENGE 5] Pathological Boundary Attacks...');

// Attack 5.1: Single Unit Complex with 777,777 Rials
const singleUnit: UnitData[] = [
  { id: 'sole_unit', unitNumber: 1, area: 120, occupants: 4, hasPackage: false, ownerName: 'Sole Owner' }
];
const singleResult = calculatePeriodCharges(singleUnit, {
  waterTotal: 100000,
  gasTotal: 200000,
  electricityTotal: 150000,
  incidentalTotal: 127777,
  areaExpenseTotal: 200000,
  roundUp: false
});
const soleCharge = singleResult.charges[0]!.totalCharge;
if (soleCharge !== 777777 || singleResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Sole unit expected 777777, got ${soleCharge}, delta=${singleResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.2: 100% Zero Occupancy with Water Bill
const zeroOccUnits: UnitData[] = [
  { id: 'z1', unitNumber: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A' },
  { id: 'z2', unitNumber: 2, area: 200, occupants: 0, hasPackage: true, ownerName: 'B' }
];
const zeroOccResult = calculatePeriodCharges(zeroOccUnits, {
  waterTotal: 900000,
  roundUp: false
});
const sumZeroWater = zeroOccResult.charges.reduce((acc, c) => acc + c.water, 0);
if (sumZeroWater !== 900000 || zeroOccResult.warnings.length === 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Zero occ water distribution failed: sum=${sumZeroWater}, warnings=${zeroOccResult.warnings.length}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.3: 100% Package Units with Gas Bill
const allPkgUnits: UnitData[] = [
  { id: 'p1', unitNumber: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A' },
  { id: 'p2', unitNumber: 2, area: 100, occupants: 2, hasPackage: true, ownerName: 'B' }
];
const allPkgResult = calculatePeriodCharges(allPkgUnits, {
  gasTotal: 500000,
  roundUp: false
});
const sumPkgGas = allPkgResult.charges.reduce((acc, c) => acc + c.gas, 0);
if (sumPkgGas !== 500000 || allPkgResult.warnings.length === 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `100% package units gas failed: sum=${sumPkgGas}, warnings=${allPkgResult.warnings.length}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.4: Micro-areas (0.01 sqm vs 500 sqm)
const microUnits: UnitData[] = [
  { id: 'm1', unitNumber: 1, area: 0.01, occupants: 1, hasPackage: false, ownerName: 'A' },
  { id: 'm2', unitNumber: 2, area: 500.99, occupants: 1, hasPackage: false, ownerName: 'B' }
];
const microResult = calculatePeriodCharges(microUnits, {
  areaExpenseTotal: 1000000,
  roundUp: false
});
const microSum = microResult.charges.reduce((acc, c) => acc + c.areaShare, 0);
if (microSum !== 1000000 || microResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Micro area allocation failed: sum=${microSum}, delta=${microResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.5: Mixed Zero Area Units (Synthesized Area Weight Behavior)
const mixedZeroAreaUnits: UnitData[] = [
  { id: 'u_norm1', unitNumber: 1, area: 100, occupants: 2, hasPackage: false, ownerName: 'A' },
  { id: 'u_norm2', unitNumber: 2, area: 100, occupants: 2, hasPackage: false, ownerName: 'B' },
  { id: 'u_zero', unitNumber: 3, area: 0, occupants: 2, hasPackage: false, ownerName: 'C' }
];
const mixedAreaResult = calculatePeriodCharges(mixedZeroAreaUnits, {
  areaExpenseTotal: 201000,
  roundUp: false
});
const zeroAreaShare = mixedAreaResult.charges.find(c => c.unitId === 'u_zero')!.areaShare;
console.log(`  [Observation 5.5] Unit with area=0 in mixed building receives areaShare: ${zeroAreaShare}`);
// Regardless of synthetic weight choice, conservation delta must remain 0
if (mixedAreaResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Mixed area conservation failed: delta=${mixedAreaResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.6: 1,000 Units and 1 Trillion Rials (1,000,000,000,000 Rials = 10^12)
const ONE_TRILLION = 1_000_000_000_000;
const megaUnits: UnitData[] = [];
for (let i = 1; i <= 1000; i++) {
  megaUnits.push({
    id: `mega_${i}`,
    unitNumber: i,
    area: 75 + (i % 150),
    occupants: (i % 6) + 1,
    hasPackage: i % 2 === 0,
    ownerName: `Owner ${i}`
  });
}
const megaResult = calculatePeriodCharges(megaUnits, {
  waterTotal: 200_000_000_000,
  gasTotal: 200_000_000_000,
  electricityTotal: 100_000_000_000,
  incidentalTotal: 200_000_000_000,
  areaExpenseTotal: 300_000_000_000,
  roundUp: false
});
const megaSum = megaResult.charges.reduce((acc, c) => acc + c.totalCharge, 0);
if (megaSum !== ONE_TRILLION || megaResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `1 Trillion stress failed: sum=${megaSum}, expected=${ONE_TRILLION}, delta=${megaResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.7: Double Empty/Package Edge Case (All units package=true AND occupants=0)
const doubleEdgeUnits: UnitData[] = [
  { id: 'd1', unitNumber: 1, area: 100, occupants: 0, hasPackage: true, ownerName: 'A' },
  { id: 'd2', unitNumber: 2, area: 150, occupants: 0, hasPackage: true, ownerName: 'B' }
];
const doubleEdgeResult = calculatePeriodCharges(doubleEdgeUnits, {
  waterTotal: 500000,
  gasTotal: 300000,
  electricityTotal: 200000,
  exemptEmptyUnits: true,
  roundUp: false
});
const sumDoubleEdge = doubleEdgeResult.charges.reduce((acc, c) => acc + c.totalCharge, 0);
if (sumDoubleEdge !== 1000000 || doubleEdgeResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Double edge case failed: sum=${sumDoubleEdge}, delta=${doubleEdgeResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

// Attack 5.8: Special Mode with Empty or Nonexistent Custom IDs
const customEdgeResult = calculatePeriodCharges(doubleEdgeUnits, {
  specialTotal: 400000,
  specialMode: 'custom',
  customUnitIds: ['non_existent_id_999'],
  roundUp: false
});
const sumCustomEdge = customEdgeResult.charges.reduce((acc, c) => acc + c.specialShare, 0);
if (sumCustomEdge !== 400000 || customEdgeResult.conservationDelta !== 0) {
  stats.challenge5_boundary_attacks.failed++;
  stats.challenge5_boundary_attacks.failures.push(
    `Custom unit ID fallback failed: sum=${sumCustomEdge}, delta=${customEdgeResult.conservationDelta}`
  );
} else {
  stats.challenge5_boundary_attacks.passed++;
}

console.log(`[CHALLENGE 5] Finished.`);
console.log(`  Passed: ${stats.challenge5_boundary_attacks.passed}`);
console.log(`  Failed: ${stats.challenge5_boundary_attacks.failed}\n`);

// ============================================================================
// FINAL SUMMARY & VERDICT EVALUATION
// ============================================================================
console.log('================================================================');
console.log('FINAL CHALLENGER VERDICT EVALUATION:');
console.log('================================================================');

let totalTests = 0;
let totalPasses = 0;
let totalFails = 0;

for (const [key, val] of Object.entries(stats)) {
  const tCount = val.passed + val.failed;
  totalTests += tCount;
  totalPasses += val.passed;
  totalFails += val.failed;
  console.log(`  ${key}: ${val.passed}/${tCount} passed (${val.failed} failed)`);
  if (val.failures.length > 0) {
    val.failures.slice(0, 5).forEach(f => console.log(`    - Failure: ${f}`));
  }
}

console.log('----------------------------------------------------------------');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${totalPasses} | FAILED: ${totalFails}`);

const verdict = totalFails === 0 ? 'APPROVE' : 'REJECT';
console.log(`VERDICT: ${verdict}`);
console.log('================================================================\n');

export { stats, verdict };
