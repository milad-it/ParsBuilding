# Milestone 1 Iteration 2 (M1-R2) Accounting Regression Verification Report

**Auditor / Challenger**: `m1_r2_challenger_2` (teamwork_challenger: critic, specialist)  
**Date**: 2026-10-31 / 2026-11-01  
**Target Milestone**: Milestone 1 Iteration 2 (M1-R2) — Accounting & Calculation Regression Audit  
**Workspace**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui`  
**Verdict**: **`APPROVE`**

---

## 1. Executive Summary

As an empirical code-executing verifier, an exhaustive adversarial stress test and regression verification were executed to guarantee that M1-R2 remediation changes (Prisma tenant isolation interceptors, fail-closed middleware, referential integrity constraints) did not introduce any computational, accounting, or double-entry ledger regressions.

### Key Conclusions:
1. **Mathematical Conservation**: `conservationDelta === 0` holds strictly across all area-based (ماده ۴ قانون تملک آپارتمان‌ها), occupant-weighted, equal-share, and hybrid multi-tier expense calculations.
2. **Double-Entry Ledger Integrity**: Double-entry ledger balance equations (`EndingFund = InitialFund + TotalReceipts - TotalDisbursements` and `Sum(UnitBalances) = TotalDebts - TotalPayments`) hold with zero Rial discrepancy across hundreds of simulated multi-period cycles.
3. **No Cascading Rounding Leak**: Largest Remainder Method (Hare-Niemeyer) allocates every single indivisible Rial deterministically, ensuring that all individual unit shares are integers without penny or fractional accumulation errors.
4. **Referential Protection**: The schema changes in M1-R2 (`onDelete: Restrict` on `LedgerTransaction` and `UnitCharge`) actively reinforce accounting integrity by preventing accidental cascade-deletion of financial records.
5. **Test Matrix Status**:
   - `server`: **20/20** Vitest unit tests passed (100%).
   - `tests_e2e` calculation & boundary suites: **35/35** passed (100%).
   - `tests_e2e` full test suite: **187/187** tests passed across all 38 suites (100%).
   - Custom property-based stress harness: **2,504 / 2,504** randomized and adversarial scenarios passed with 0 violations.

---

## 2. Empirical Verification Evidence & Test Execution

### 2.1 Server Unit Test Suite
Command executed:
```bash
cd server ; npm.cmd test
```
Result:
```
 RUN  v2.1.9 D:/cursor projects/web sakhtemon - Copy - antig - Copy, last my ui/server

 ✓ tests/calculationEngine.test.ts (16 tests) 15ms
 ✓ tests/server.test.ts (4 tests) 67ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  1.32s
```
All 16 calculation engine unit tests passed, covering:
- TC-CALC-01: Equal share division without remainder
- TC-CALC-02: Rial conservation with Largest Remainder (Hare-Niemeyer)
- TC-CALC-03: Area-based distribution (ماده ۴ قانون تملک)
- TC-CALC-04: Occupant-based distribution (water billing)
- TC-CALC-05: Package-exempt central gas billing
- TC-CALC-06: 100% package units fallback infrastructure allocation
- TC-CALC-07: 100% empty units fallback area-based allocation
- TC-CALC-08: Elimination of infinite credit loop
- TC-CALC-09: Overpayment recording as resident credit
- TC-CALC-10: Anti-double-counting fund income
- TC-CALC-11: Data retention across restarts
- TC-CALC-12: Arabic digit 8 (`\u0668`) normalization
- TC-CALC-13: Decimal parsing for fractional areas and rates
- TC-CALC-14: Standard complex hybrid model
- TC-CALC-15: Fractional debt prevention
- TC-CALC-16: 50,000 Rial rounding rule with surplus accounting

### 2.2 Feature & Boundary E2E Test Suites
Command executed:
```bash
cd tests_e2e ; node --experimental-strip-types --test \
  "suites/tier1_features/f02_calculation_engine.test.ts" \
  "suites/tier1_features/f03_precision_remainder.test.ts" \
  "suites/tier2_boundaries/**/*.test.ts"
```
Result:
```
ℹ tests 35
ℹ suites 7
ℹ pass 35
ℹ fail 0
ℹ duration_ms 299.666
```
Breakdown:
- Feature 2 (Calculation Engine): 5/5 passed
- Feature 3 (Zero-Loss Precision & Remainder): 5/5 passed
- Tier 2 Boundaries (Arabic & Persian Numeral Stress): 5/5 passed
- Tier 2 Boundaries (Boundary Limits & High-Scale Overflows): 5/5 passed
- Tier 2 Boundaries (Extreme Currency Amounts & Range Limits): 5/5 passed
- Tier 2 Boundaries (Float Precision & Area Fractions): 5/5 passed
- Tier 2 Boundaries (Zero Occupancy & Vacant Units Stress): 5/5 passed

### 2.3 Additional Accounting & Credit Suites
Command executed:
```bash
cd tests_e2e ; node --experimental-strip-types --test \
  "suites/tier1_features/f06_infinite_credit_bug.test.ts" \
  "suites/tier1_features/f07_anti_double_counting.test.ts" \
  "suites/tier3_combinations/credit_pool_period_closing.test.ts"
```
Result:
- Feature 6 (Infinite Credit Bug Resolution): 5/5 passed
- Feature 7 (Anti-Double-Counting Fund Income): 5/5 passed
- Tier 3 Combinations (Credit Pool & Period Closing Lifecycle): 5/5 passed
- Total: 15/15 passed in 225ms.

### 2.4 Comprehensive Full Repository E2E Execution
Command executed:
```bash
cd tests_e2e ; npm.cmd test
```
Result:
- Total test files: 38
- Total test suites: 38
- Total test cases: 187
- Passing: 187 (100%)
- Failing: 0

---

## 3. Property-Based Stress Verification & Invariant Proofs

A dedicated property-based stress verification harness (`property_stress_harness.ts`) was executed directly against `server/src/services/calculationEngine.ts`.

### 3.1 Test Matrix & Invariant Checks

| Suite | Invariant Tested | Scenarios Run | Violations | Max Discrepancy |
|---|---|---|---|---|
| **Suite 1: Largest Remainder** | $\sum \text{Shares} = \text{TotalAmount}$, integer shares, non-negative | 1,000 | 0 | 0 Rials |
| **Suite 2: Period Charges** | `conservationDelta === 0`, $\sum \text{UnitCharges} = \text{Distributed}$, integer breakdown | 1,000 | 0 | 0 Rials |
| **Suite 3: Extreme Boundaries** | 1 Rial across 997 prime units; 500 Billion Rials; 100% empty units; 100% package units | 4 | 0 | 0 Rials |
| **Suite 4: Double-Entry Ledger** | $\Delta \text{Fund} = \sum \text{Receipts}$; $\text{Balance} = \sum \text{Debts} - \sum \text{Payments}$; Net Discrepancy = 0 | 500 | 0 | 0 Rials |
| **Total** | | **2,504** | **0** | **0 Rials** |

### 3.2 Detailed Stress Observations

1. **Indivisible Prime Distribution**:
   - Tested: 1 Rial distributed across 997 units.
   - Result: Exactly 1 unit was assigned 1 Rial (tie-broken deterministically by `unitNumber`), 996 units assigned 0 Rials. `conservationDelta === 0`.
2. **Mega Capital Investment**:
   - Tested: 500,000,000,000 Rials distributed across 50 units with irrational fractional areas.
   - Result: Exact sum conservation maintained within JavaScript integer safety (`Number.MAX_SAFE_INTEGER`), zero rounding loss.
3. **Empty Units Safeguard**:
   - When 100% of units have 0 occupants and water bill is present, the calculation engine emits a safeguard warning and cleanly re-routes expenses to exclusive area shares without division-by-zero (`NaN`) or dropped expenses.
4. **100% Package Units Safeguard**:
   - When all units are package-equipped and central gas bill is entered, gas is shared equally as base infrastructure fee without dropping the expense.
5. **Credit Monotonicity & Ledger Balance Equation**:
   - Across 500 randomized multi-period simulations (each with 5 to 20 units and 6 consecutive billing periods with varying payments, prepayments, partial payments, and zero payments):
     - $\text{TreasuryCash} = \text{InitialFund} + \sum \text{PaymentTransactions}$ held in 100% of cases.
     - $\text{UnitLedgerBalance} = \sum \text{UnitDebts} - \sum \text{UnitPayments}$ held in 100% of cases.
     - $(\sum \text{AllDebts} - \sum \text{AllPayments}) - \sum \text{AllUnitBalances} = 0$ held in 100% of cases.

---

## 4. Assessment of M1-R2 Schema/Middleware Changes

The changes committed in M1-R2 (`b93299a`):
1. **Schema Referential Rules (`schema.prisma`)**:
   - Changed `LedgerTransaction.unit` from `onDelete: Cascade` to `onDelete: Restrict`.
   - Changed `UnitCharge.unit` from `onDelete: Cascade` to `onDelete: Restrict`.
   - Changed `ChatMessage.sender` from `onDelete: Cascade` to `onDelete: SetNull`.
   - Changed `ReceiptVerification.uploadedBy` from `onDelete: Cascade` to `onDelete: SetNull`.
   - Added composite uniqueness on `Period`, `Resident`, `UnitResident`.
   *Assessment*: These changes actively protect financial auditability. Deleting a unit cannot accidentally destroy historical accounting entries.
2. **Prisma Tenant Query Interceptor (`database.ts`)**:
   - Added interceptors for `findUnique`, `findUniqueOrThrow`, `updateMany`, `deleteMany`, `upsert`, and `aggregate`.
   - Enforced fail-closed tenant scoping when context is absent on tenant-bound models.
   *Assessment*: The calculation engine operates purely on in-memory domain models passed to it; the tenant interceptor ensures that when data is persisted or retrieved from PostgreSQL, queries are strictly scoped by `complexId`.
3. **Fail-Closed Middleware (`tenant.ts`)**:
   - Protected routes (`/api/v1/*`) reject requests without valid tenant headers with RFC 7807 problem details.
   *Assessment*: Verified via `server/tests/server.test.ts`. Has no detrimental impact on calculations.

---

## 5. Formal Verdict

**VERDICT: `APPROVE`**

No accounting regressions, rounding errors, or calculation flaws were found. Milestone 1 Iteration 2 (M1-R2) is fully verified, robust, mathematically sound, and ready for progression to Milestone 2.
