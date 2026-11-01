# Dispatch: M3 Worker 1 (Lossless Data Migration & Real-Time REST/WebSocket API Integration)

- **Archetype**: `teamwork_worker`
- **Role**: Full-Stack Backend & Integration Engineer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Explorer Reports**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\handoff.md` (Migration & Reconciliation)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_2\handoff.md` (REST & WebSocket APIs)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\handoff.md` (Client API & Migration Bridge)

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement Milestone 3:
1. Lossless Data Migration Engine in `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts` with strict reconciliation assertions ($\Delta Fund = 0, \Delta Debts = 0$) inside atomic `rawPrisma.$transaction`.
2. Full REST API routes for all building entities (Complexes, Buildings, Units, Residents, Periods with `CalculationEngine` charges, Charges, Ledger Transactions, Announcements) in `server/src/routes/` and register them in `server/src/routes/index.ts`.
3. Wire real-time WebSocket event broadcasting in `server/src/services/realtimeService.ts` for all mutation events.
4. Client API client (`client/src/services/api.ts`) with automatic 401 refresh interceptor, client migration bridge (`client/src/services/migrationBridge.ts`), and WebSocket listener (`client/src/services/websocket.ts`).
5. Write and execute comprehensive unit & integration tests (`server/tests/migration.test.ts`, `server/tests/domainApis.test.ts`), and run all server tests + E2E tests to verify zero regressions.
6. Commit and push all changes to GitHub origin/main per AGENTS.md / GEMINI.md protocol.

## Deliverable
Write your complete handoff report in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md`
