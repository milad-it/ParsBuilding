# Dispatch: M3 Challenger 1 (Adversarial Data Migration & Reconciliation Stress Testing)

- **Archetype**: `teamwork_challenger`
- **Role**: Adversarial Migration Tester
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md`

## Adversarial Verification Objective
Empirically challenge the `migrationService.ts` and `migrationRoutes.ts` with adversarial stress cases:
1. **Financial Discrepancy Injections**:
   - Intentionally tamper with payment amounts or expense totals so $\Delta Fund \neq 0$. Verify that the migration immediately throws `MigrationReconciliationError`, fails with HTTP 422 Problem Details, and cleanly rolls back without creating orphan records.
   - Intentionally tamper with unit balances so $\Delta Debts \neq 0$. Verify strict failure.
2. **Extreme Edge Cases**:
   - Mixed Persian digits (`'۱۲۳'`), Arabic 8 (`'٨'`), decimal formats (`'۸۵٫۵'`, `'۱۳۲/۵'`), zero areas, zero occupants.
   - Duplicate unit numbers, empty/missing phone numbers, duplicate phone numbers across units.
   - Extremely large values (billions of Rials) and negative initial fund balances.
3. **Execute builds & tests**:
   - `cd server && npm test`
   - Run adversarial probes and report results.

## Deliverable
Write your complete handoff report with clear **APPROVE** or **REJECT** verdict in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\handoff.md`


## 2026-11-01T14:10:20Z
Received dispatch from f119ffc6-97e5-4dda-bea3-4b8fe97c83df:
You are M3 Challenger 1 (Adversarial Migration Tester).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
Read the Worker handoff in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md

Adversarial tasks:
1. Challenge `migrationService.ts` and `migrationRoutes.ts` with financial discrepancy injections:
   - Tamper with payment amounts / expense sums so Delta Fund != 0. Verify that it throws MigrationReconciliationError, returns HTTP 422 Problem Details, and rolls back cleanly without orphan records.
   - Tamper with resident balances so Delta Debts != 0. Verify rejection.
2. Test extreme edge cases: Persian digits, Arabic 8, decimal formats, zero occupancy, duplicate unit numbers, empty/duplicate phones, large values.
3. Run server tests and adversarial tests.
4. Write your complete handoff report with APPROVE or REJECT in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\handoff.md
Once complete, send a message back to the orchestrator.
