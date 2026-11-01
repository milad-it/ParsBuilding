# Dispatch: M3 Reviewer 1 (Data Migration & Accounting Reconciliation)

- **Archetype**: `teamwork_reviewer`
- **Role**: Data Migration & Accounting Reviewer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md`

## Review Objective
Independently inspect, build, test, and review the Milestone 3 implementation with special focus on:
1. `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts`.
2. Mathematical reconciliation formulas:
   - Treasury fund conservation: $\Delta Fund = 0$
   - Resident debts conservation: $\Delta Debts = 0$
3. Atomic transaction execution inside `rawPrisma.$transaction` with complete rollback on reconciliation failure.
4. Persian numeral normalization (`toEnDigit`), Momayyez (٫) and slash decimal parsing, unique phone generation, and zero occupancy (`VACANT`) handling.
5. Execute independent verification commands:
   - `cd server && npm run typecheck`
   - `cd server && npm run build`
   - `cd server && npm test`
   - `cd tests_e2e && npm test`

## Deliverable
Write your complete handoff report with clear **APPROVE** or **REQUEST_CHANGES** verdict in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\handoff.md`

## 2026-11-01T14:10:06Z
[Message] timestamp=2026-11-01T14:10:06Z sender=f119ffc6-97e5-4dda-bea3-4b8fe97c83df priority=MESSAGE_PRIORITY_HIGH content=You are M3 Reviewer 1 (Data Migration & Accounting Reviewer).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
Read the Worker handoff in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md

Review tasks:
1. Review `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts`.
2. Verify mathematical reconciliation logic: Delta Fund = 0, Delta Debts = 0.
3. Verify atomic rawPrisma.$transaction and rollback behavior.
4. Run server typecheck, server build, server tests (120 tests), and E2E tests (214 tests).
5. Write your complete handoff report with APPROVE or REQUEST_CHANGES in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\handoff.md
Once complete, send a message back to the orchestrator.
