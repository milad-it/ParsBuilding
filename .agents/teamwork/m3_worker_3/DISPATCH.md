# Dispatch: M3 Worker 3 (Milestone 3 Test Verification & Git Finalization)

- **Archetype**: `teamwork_worker`
- **Role**: Milestone 3 Finalization Engineer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_3\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Prior Worker Progress**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_2\progress.md`
- **Remediation Blueprints**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_1\handoff.md` (Authentic DB Debts Reconciliation & Ingestion Integrity)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_2\handoff.md` (Period Close Accounting Math & DEFECT-M3-01 Fix)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\handoff.md` (Cross-Tenant Security, Idempotency & Route Status Codes)

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & Responsibilities
1. **Investigate and Fix Test Verification Failure in `server/tests/domainApis.test.ts`**:
   - Worker 2 previously applied code remediations for M3 (commit `0558eaf`).
   - Run vitest on `server/tests/domainApis.test.ts`.
   - Update `domainApis.test.ts` mock for `rawPrisma.unit.upsert` / `$transaction` / `findMany` so that unit records created/upserted during `POST /api/v1/migration/import` persist distinct IDs (e.g., avoid `Date.now()` collision in fast loops by using `unit-${Date.now()}-${Math.random()}` or an incrementing counter) and are returned by `tx.unit.findMany({ where: { complexId } })` with their proper `currentBalance`.
   - Ensure the test `8. POST /api/v1/migration/import: should ingest legacy payload losslessly` passes cleanly.
2. **Execute Full Server Test Suite**:
   - Run `npm test` inside `server/`.
   - Verify that all 16 server test suites pass (164/164 tests passing, 0 failing).
3. **Execute Full E2E Test Suite**:
   - Run `npm test` inside `tests_e2e/`.
   - Verify that all 47 E2E test suites pass (214/214 tests passing, 0 failing).
4. **Git Commit & Push**:
   - Follow `AGENTS.md` / `GEMINI.md`: run `git status`, `git add .`, `git commit -m "fix(m3): update domainApis test mocks for db debt reconciliation and verify 100% test pass"`, and `git push origin main`.
   - Confirm push succeeds.
5. **Deliverable**:
   - Write complete handoff report to `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_3\handoff.md`.
   - Send completion message to orchestrator.
