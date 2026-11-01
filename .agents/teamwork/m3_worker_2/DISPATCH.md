# Dispatch: M3 Worker 2 (Milestone 3 Remediation Worker)

- **Archetype**: `teamwork_worker`
- **Role**: Full-Stack Remediation Engineer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Remediation Blueprints**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_1\handoff.md` (Authentic DB Debts Reconciliation & Ingestion Integrity)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_2\handoff.md` (Period Close Accounting Math & DEFECT-M3-01 Fix)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\handoff.md` (Cross-Tenant Security, Idempotency & Route Status Codes)

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Remediation Tasks
1. **Authentic PostgreSQL Debt Reconciliation** in `server/src/services/migrationService.ts`:
   - Replace in-memory `migratedDebtsSum` with authentic database query: `const persistedUnits = await tx.unit.findMany({ where: { complexId } })` and sum negative balances.
   - Assert $\Delta Debts = |TotalDebts_{PostgreSQL} - TotalDebts_{Legacy}| = 0$.
   - Explicitly support and reconcile against `expectedTotalDebts` if provided in payload.
   - Detect and reject duplicate unit numbers in payload to prevent silent debt drop.
   - Support `expectedEndingFund` if provided in payload.
   - Ensure migration idempotency via `tx.period.upsert` and deterministic transaction IDs.
2. **Period Close Accounting Balance Remediation (DEFECT-M3-01)** in `server/src/routes/periodRoutes.ts`:
   - In `POST /api/v1/periods/:id/close`, decrement unit balance by `chargeAmount` ($C$) so that $B_{\text{final}} = B_0 + P - C = -unpaid$, eliminating the double-crediting bug.
3. **Cross-Tenant IDOR Guard & Fastify Hook Order** in `server/src/routes/migrationRoutes.ts`:
   - Enforce: `if (request.user.role !== 'SUPER_ADMIN' && request.user.complexId !== targetComplexId)` returning HTTP 403.
   - Return HTTP 401 for unauthenticated requests before context evaluation.
4. **Number Parsing & Formatting** in `server/src/utils/numberUtils.ts`:
   - Strip Unicode control characters (`\u200E`, `\u200C`) and fix multi-dot thousand separator parsing (`28.000.000` -> `28_000_000`).
   - Trim whitespace-only phones (`"   "`).
5. **Testing & Verification**:
   - Run typecheck (`npm run typecheck`) and build (`npm run build`).
   - Run all server tests (`npm test` in `server`) — ensure all 16 test files pass (162+ tests).
   - Run all E2E tests (`npm test` in `tests_e2e`) — ensure all 47 suites pass (214+ tests).
   - Commit and push to GitHub `origin/main` per AGENTS.md / GEMINI.md protocol.

## Deliverable
Write your complete handoff report in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_2\handoff.md`
