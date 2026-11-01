# Handoff Report: Milestone 3 Adversarial Security, RBAC & Continuity Verification

- **Agent**: M3 Challenger 2 (`teamwork_challenger`)
- **Role**: Adversarial Security & API Tester
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\`
- **Milestone**: Milestone 3 (Lossless Data Migration Engine & REST/Real-time API Contracts)
- **Verdict**: **REJECT** (Defect Found: Double-Crediting Accounting Flaw in Period Close)

---

## 1. Observation

### 1.1 Empirical Verification Test Suite
Created and executed Tier 5 Adversarial Test Suite in `server/tests/adversarialM3DomainSecurity.test.ts` (26 tests across 4 threat categories).

All 16 test files in `server/tests/` (162 tests) and all 47 test suites in `tests_e2e/suites/` (214 tests) were executed directly:
- `cd server && npm test`: **16 passed (162 tests passed, 100% green)**.
- `cd tests_e2e && npm test`: **47 passed (214 tests passed, 100% green)**.
- `cd server && npm run typecheck`: **0 errors**.
- `cd server && npm run build`: **0 errors**.

### 1.2 Verification Results Across Assigned Dimensions

| Dimension | Probes Executed | Observed Result | Status |
|---|---|---|---|
| **Cross-Tenant Isolation** | 11 attack vectors: Units, Residents, Periods, Calculations, Charges, Payments, Transactions, Buildings, Announcements, and Header Spoofing (`x-complex-id: beta` with token Alpha) | All foreign mutations and reads rejected with strict HTTP 403 Forbidden RFC 7807 problem details | **SECURE** |
| **Resident Horizontal IDOR** | 7 attack vectors: Unit profile, statements, transaction history, individual charges, global unit list scoping, period detail charges scoping, cross-unit payment submission | Resident strictly restricted to assigned unit; all cross-unit accesses rejected with HTTP 403 Forbidden | **SECURE** |
| **RBAC Guard Enforcement** | 6 attack vectors: Sub-managers lacking `MANAGE_UNITS`, `MANAGE_PERIODS`, `CLOSE_PERIODS`, `RECORD_PAYMENTS`, `BROADCAST_NOTICES`; unauthenticated requests; tampered JWT tokens | Unauthenticated requests return HTTP 400 (`Tenant Context Missing`) or 401 (`Unauthorized`); sub-managers lacking specific permission bits receive HTTP 403 | **SECURE** |
| **Calculation Conservation** | `POST /api/v1/periods/:id/calculate` on 4-unit hybrid period with area, occupant, and fixed costs | Output conservation delta $\Delta = 0$; $\sum Shares = TotalExpense$ | **SECURE** |
| **Period Closing & Debt Continuity** | `POST /publish` -> partial `POST /payments` -> `POST /close` | **CRITICAL DEFECT DETECTED**: Resident payment is double-credited to ledger balance, resulting in under-reported debt and building financial loss | **FAIL (DEFECT)** |

---

## 2. Logic Chain: Analysis of Defect DEFECT-M3-01

### 2.1 Direct Observations in Codebase
1. In `server/src/routes/transactionRoutes.ts` (lines 98–104):
   When a payment is received via `POST /api/v1/payments`:
   ```typescript
   // 2. Increment Unit balance (debt decreases, credit increases)
   const updatedUnit = await tx.unit.update({
     where: { id: body.unitId },
     data: {
       currentBalance: { increment: body.amount }
     }
   });
   ```
   If a unit with initial balance `0` pays `P = 341,818` towards an active period charge, `unit.currentBalance` immediately increments from `0` to `+341,818`.

2. In `server/src/routes/periodRoutes.ts` (lines 359–397):
   When a period is published via `POST /api/v1/periods/:id/publish`:
   `UnitCharge` records are created, but `unit.currentBalance` is **NOT** debited. The ledger balance remains `+341,818` after payment.

3. In `server/src/routes/periodRoutes.ts` (lines 463–495):
   When the period is closed via `POST /api/v1/periods/:id/close`:
   ```typescript
   const unpaid = chargeAmount - paidAmount;
   if (unpaid > 0) {
     await tx.ledgerTransaction.create({
       data: {
         ...
         txKind: TxKind.CHARGE_TRANSFER,
         type: TxType.DEBT,
         amount: unpaid,
         ...
       }
     });

     // Decrement balance (resident debt increases)
     await tx.unit.update({
       where: { id: charge.unitId },
       data: {
         currentBalance: { decrement: unpaid }
       }
     });
   }
   ```
   The unit's balance is decremented **only** by `unpaid = (chargeAmount - paidAmount)`.

### 2.2 Mathematical Deduction of the Inconsistency
Let:
- $B_0$: Starting unit balance (e.g. $0$)
- $C$: Total charge amount for period (e.g. $854,545$)
- $P$: Payment made by resident towards this period charge (e.g. $341,818$)
- Expected remaining debt after closing: $-(C - P) = -(854,545 - 341,818) = -512,727$.

Under the current implementation:
1. After payment:
   $$B_{paid} = B_0 + P = 0 + 341,818 = +341,818$$
2. On period close, only the unpaid balance $U = C - P = 512,727$ is decremented:
   $$B_{final} = B_{paid} - U = (+P) - (C - P) = 2P - C$$
   $$B_{final} = 2(341,818) - 854,545 = 683,636 - 854,545 = -170,909$$
3. Delta from correct balance:
   $$\Delta = B_{final} - (-(C - P)) = (2P - C) - (-C + P) = +P$$

The resident's debt was reduced by $2P$ instead of $P$!
- The resident owed $854,545$ and paid $341,818$.
- The ledger records their remaining debt as only $170,909$ instead of $512,727$.
- **The complex loses $341,818$ Rials in uncollected debt.**

### 2.3 Extreme Boundary Case: Full Payment ($P = C$)
If the resident pays the full charge $C = 854,545$ prior to period close:
- After payment: `unit.currentBalance` = $+854,545$.
- On close: `unpaid = C - P = 0`. No ledger debit is recorded.
- Final balance: `unit.currentBalance` = $+854,545$.
- Result: The resident paid their bill and now has **$+854,545$ phantom credit** on the building ledger, effectively granting them a free period next month.

---

## 3. Caveats

1. The Fastify REST routes, authentication token lifecycle, cross-tenant isolation guards, and RBAC bitmask authorizations are exceptionally robust and demonstrated zero failures across 24 test cases.
2. The deterministic `CalculationEngine` Hare-Niemeyer rounding algorithm is 100% lossless ($\Delta = 0$).
3. The defect is localized strictly to the financial ledger balance interaction between `POST /api/v1/payments` (`transactionRoutes.ts`) and `POST /api/v1/periods/:id/close` (`periodRoutes.ts`).

---

## 4. Conclusion & Required Remediation

### Verdict: **REJECT**

This verdict is issued because the accounting flaw violates Core Requirement R5 ("All building accounting logic, charge calculation formulas... resident debt/credit tracking, and financial statements... guarantee 100% mathematical accuracy") and reintroduces the double-counting/phantom credit condition prohibited by Feature 6 and Feature 7 of `PROJECT.md`.

### Required Fix for M3 Worker 1:
M3 Worker 1 must harmonize the accounting model using one of the following standard approaches:

- **Option A (Recommended Double-Entry Standard)**:
  In `periodRoutes.ts` (`POST /periods/:id/publish`):
  Debit the unit ledger upon publish by creating a `CHARGE` / `PERIOD_BILL` transaction for each unit and decrementing `unit.currentBalance` by `ch.totalCharge`.
  In `POST /periods/:id/close`:
  Do not decrement `unit.currentBalance` again. The unpaid balance is already naturally reflected because payments incremented `unit.currentBalance`.

- **Option B (Batch Transfer Upon Close)**:
  If charges are only debited upon period close, then in `periodRoutes.ts` (`POST /periods/:id/close`):
  Debit `unit.currentBalance` by the **full** `charge.amount` (not `unpaid`):
  $$B_{final} = B_{start} + P - C = -(C - P)$$
  This guarantees that $B_{final}$ exactly equals the unpaid remaining debt.

---

## 5. Verification Method

To verify the defect and test coverage:

1. **Run Full Adversarial Domain Suite**:
   ```cmd
   cmd /c "cd server && npx vitest run tests/adversarialM3DomainSecurity.test.ts"
   ```
   *Expected Result*: 26 passed. In Test 4.2 (`FINANCIAL CONTINUITY: Publish period -> Partial Payment -> Close Period transfers clean debt with ZERO lost balance`), inspect lines 1155–1170 verifying:
   `doubleCreditingDelta === partialPayAmount`.

2. **Run All Server Tests**:
   ```cmd
   cmd /c "cd server && npm test"
   ```
   *Expected Result*: 16 test files passed, 162 tests passed.

3. **Run E2E Tests**:
   ```cmd
   cmd /c "cd tests_e2e && npm test"
   ```
   *Expected Result*: 47 test suites passed, 214 tests passed.

4. **Verify TypeScript Compilation**:
   ```cmd
   cmd /c "cd server && npm run typecheck && npm run build"
   ```
   *Expected Result*: 0 errors.
