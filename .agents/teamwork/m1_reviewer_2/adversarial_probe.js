const {
  distributeLargestRemainder,
  calculatePeriodCharges,
  calculateUnitLedgerBalance,
  applyCreditSettlement
} = require('../../../server/dist/services/calculationEngine.js');
const {
  toEnDigit,
  parseDecimal,
  parseIntegerCurrency,
  formatCurrency
} = require('../../../server/dist/utils/numberUtils.js');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    console.error(`FAIL: ${message}`);
  }
}

console.log('=== STARTING ADVERSARIAL STRESS TEST PROBE ===\n');

// 1. Extreme Scale & Trillion Rial Integrity
console.log('--- Test 1: Mega Trillion Rial Distribution ---');
{
  const units = Array.from({ length: 500 }, (_, i) => ({
    id: `u_${i + 1}`,
    unitNumber: i + 1,
    area: 50 + (i % 150),
    occupants: (i % 6),
    hasPackage: i % 3 === 0,
    ownerName: `Owner ${i + 1}`
  }));

  const expense = 500_000_000_000; // 500 Billion Rials
  const res = calculatePeriodCharges(units, {
    areaExpenseTotal: expense,
    waterTotal: 25_000_000_000,
    gasTotal: 15_000_000_000,
    incidentalTotal: 10_000_000_000,
    fixedPerUnit: 5_000_000
  });

  assert(res.conservationDelta === 0, `Conservation delta must be 0, got ${res.conservationDelta}`);
  assert(res.charges.length === 500, `Must return 500 charges, got ${res.charges.length}`);
  
  let allIntegers = true;
  for (const c of res.charges) {
    if (!Number.isInteger(c.totalCharge) || !Number.isInteger(c.areaShare) || !Number.isInteger(c.water)) {
      allIntegers = false;
      break;
    }
  }
  assert(allIntegers, 'All charge outputs must be strictly integers');
}

// 2. 10,000 Randomized Monte-Carlo Iterations
console.log('--- Test 2: 10,000 Randomized Monte Carlo Invariance Check ---');
{
  let zeroDeltaViolations = 0;
  let nanViolations = 0;
  let nonIntegerViolations = 0;

  for (let trial = 0; trial < 10000; trial++) {
    const unitCount = Math.floor(Math.random() * 20) + 1; // 1 to 20 units
    const units = Array.from({ length: unitCount }, (_, i) => ({
      id: `u_${i + 1}`,
      unitNumber: i + 1,
      area: Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 300) + 20,
      occupants: Math.random() < 0.3 ? 0 : Math.floor(Math.random() * 8),
      hasPackage: Math.random() < 0.5,
      ownerName: `Owner ${i + 1}`
    }));

    const roundUp = Math.random() < 0.3;
    const input = {
      fixedPerUnit: Math.random() < 0.5 ? Math.floor(Math.random() * 1000000) : 0,
      waterTotal: Math.random() < 0.5 ? Math.floor(Math.random() * 5000000) : 0,
      gasTotal: Math.random() < 0.5 ? Math.floor(Math.random() * 5000000) : 0,
      incidentalTotal: Math.random() < 0.5 ? Math.floor(Math.random() * 2000000) : 0,
      areaExpenseTotal: Math.random() < 0.5 ? Math.floor(Math.random() * 10000000) : 0,
      roundUp,
      roundStep: 50000,
      exemptEmptyUnits: Math.random() < 0.5
    };

    const res = calculatePeriodCharges(units, input);
    if (res.conservationDelta !== 0) zeroDeltaViolations++;
    for (const chg of res.charges) {
      if (isNaN(chg.totalCharge)) nanViolations++;
      if (!Number.isInteger(chg.totalCharge)) nonIntegerViolations++;
    }
  }

  assert(zeroDeltaViolations === 0, `Zero delta violations across 10,000 trials: ${zeroDeltaViolations}`);
  assert(nanViolations === 0, `NaN violations: ${nanViolations}`);
  assert(nonIntegerViolations === 0, `Non-integer violations: ${nonIntegerViolations}`);
}

// 3. Persian / Arabic Digit Stress & Unicode Adversarial Inputs
console.log('--- Test 3: Persian/Arabic Numeral & Unicode Normalization ---');
{
  // Mixed Unicode string with Arabic 8 (\u0668), Persian 8 (\u06F8), ASCII 8
  assert(toEnDigit('\u0668') === '8', 'Arabic 8 must map to 8');
  assert(toEnDigit('\u06F8') === '8', 'Persian 8 must map to 8');
  assert(toEnDigit('۰۱۲۳۴۵۶۷۸۹') === '0123456789', 'Persian 0-9 must map to 0123456789');
  assert(toEnDigit('٠١٢٣٤٥٦٧٨٩') === '0123456789', 'Arabic 0-9 must map to 0123456789');

  // Unicode ZWNJ, LTR/RTL marks, separators
  const complexPersianString = '\u200C۱,۵۰۰,۰۰۰\u200E';
  assert(parseIntegerCurrency(complexPersianString) === 1500000, `Should parse complex formatted Persian amount, got ${parseIntegerCurrency(complexPersianString)}`);

  // Fractional area parsing
  assert(parseDecimal('۱۲۰٫۷۵') === 120.75, 'Should parse Arabic decimal separator momayyez');
  assert(parseDecimal('۸۵/۴') === 85.4, 'Should parse slash decimal');
  assert(parseDecimal('  ۹۹.۹۹  ') === 99.99, 'Should parse ASCII decimal with whitespace');
}

// 4. Double-Entry Credit Settlement & Edge Transitions
console.log('--- Test 4: Credit Settlement Edge Cases ---');
{
  // Case A: Resident has exactly 0 balance
  const s0 = applyCreditSettlement(50000, 0);
  assert(s0.appliedCredit === 0, 'No credit available when balance 0');
  assert(s0.netPayable === 50000, 'Net payable should be 50000');
  assert(s0.newBalance === 50000, 'New balance should be 50000');

  // Case B: Resident has debt (+30,000)
  const sDebt = applyCreditSettlement(50000, 30000);
  assert(sDebt.appliedCredit === 0, 'No credit available when in debt');
  assert(sDebt.netPayable === 50000, 'Net payable should be 50000');
  assert(sDebt.newBalance === 80000, 'New balance should be 80000');

  // Case C: Resident has large credit (-1,000,000)
  const sCred = applyCreditSettlement(200000, -1000000);
  assert(sCred.appliedCredit === 200000, 'Applied credit should be 200000');
  assert(sCred.netPayable === 0, 'Net payable should be 0');
  assert(sCred.newBalance === -800000, 'New balance should be -800000');
}

// 5. Deterministic Tie-Breaking Verification
console.log('--- Test 5: Deterministic Tie Breaking ---');
{
  // 5 units with identical weight: 1, 1, 1, 1, 1
  // Total 7 Rials -> base 1 each (total 5). Deficit 2.
  // Units with lower unitNumber (1 and 2) must receive the 2 extra units deterministically.
  const shares = distributeLargestRemainder(7, [
    { id: 'u5', weight: 1, unitNumber: 5 },
    { id: 'u1', weight: 1, unitNumber: 1 },
    { id: 'u3', weight: 1, unitNumber: 3 },
    { id: 'u2', weight: 1, unitNumber: 2 },
    { id: 'u4', weight: 1, unitNumber: 4 },
  ]);

  assert(shares.get('u1') === 2, `u1 should get 2, got ${shares.get('u1')}`);
  assert(shares.get('u2') === 2, `u2 should get 2, got ${shares.get('u2')}`);
  assert(shares.get('u3') === 1, `u3 should get 1, got ${shares.get('u3')}`);
  assert(shares.get('u4') === 1, `u4 should get 1, got ${shares.get('u4')}`);
  assert(shares.get('u5') === 1, `u5 should get 1, got ${shares.get('u5')}`);
}

console.log(`\n=== PROBE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) process.exit(1);
