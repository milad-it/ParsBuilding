# Dispatch: M3 Reviewer 2 (REST APIs, WebSocket & Client Services)

- **Archetype**: `teamwork_reviewer`
- **Role**: REST APIs & Systems Reviewer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md`

## Review Objective
Independently inspect, build, test, and review the Milestone 3 implementation with special focus on:
1. Fastify domain routes: `complexRoutes.ts`, `buildingRoutes.ts`, `unitRoutes.ts`, `residentRoutes.ts`, `periodRoutes.ts`, `chargeRoutes.ts`, `transactionRoutes.ts`, `announcementRoutes.ts`.
2. Fail-closed tenant isolation (`complexId` enforcement) and RBAC guards (`requireRole`, `requirePermission`).
3. Integration of `calculationEngine.ts` in `periodRoutes.ts` (/calculate preview, /publish freezing, /close debt transfer).
4. Dual-naming WebSocket broadcasting in `realtimeService.ts` (`domain:action` and legacy `SCREAMING_SNAKE`).
5. Client services: `client/src/services/api.ts` (Axios, 401 refresh queue), `migrationBridge.ts`, `websocket.ts`.
6. Execute independent verification commands:
   - `cd server && npm run typecheck`
   - `cd server && npm run build`
   - `cd server && npm test`
   - `cd tests_e2e && npm test`

## Deliverable
Write your complete handoff report with clear **APPROVE** or **REQUEST_CHANGES** verdict in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_2\handoff.md`

## 2026-11-01T14:10:12Z
You are M3 Reviewer 2 (REST APIs & Systems Reviewer).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_2\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_2\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
Read the Worker handoff in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md

Review tasks:
1. Review Fastify REST domain routes in `server/src/routes/`: complexes, buildings, units, residents, periods, charges, transactions, announcements.
2. Verify tenant isolation, RBAC permissions, RFC 7807 problem details, and immutable audit logging.
3. Review `calculationEngine.ts` integration in `periodRoutes.ts` and dual-naming WebSocket broadcasting in `realtimeService.ts`.
4. Review client services in `client/src/services/` (`api.ts`, `migrationBridge.ts`, `websocket.ts`).
5. Run server typecheck, server build, server tests (120 tests), and E2E tests (214 tests).
6. Write your complete handoff report with APPROVE or REQUEST_CHANGES in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_2\handoff.md
Once complete, send a message back to the orchestrator.
