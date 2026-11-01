# Dispatch: M3-R2 Explorer 3 (Cross-Tenant Security, Idempotency & Route Status Codes)

- **Archetype**: `teamwork_explorer`
- **Role**: Backend Security & API Route Researcher
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Previous Gate Findings**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\handoff.md`
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_auditor_1\handoff.md`

## Problem & Investigation Objectives
1. **Migration Cross-Tenant Authorization Guard**:
   - In `server/src/routes/migrationRoutes.ts` (lines 40–55), ensure non-super-admins can only migrate into their own complex:
     `if (request.user.role !== 'SUPER_ADMIN' && request.user.complexId !== targetComplexId)` -> HTTP 403 Forbidden RFC 7807 problem details.
2. **Order of PreHandler & Status Codes**:
   - In `ADV-5.1`: Unauthenticated call to `POST /api/v1/migration/import` returned 400 (`Tenant Context Missing`) before checking authentication (expected 401 Unauthorized).
   - In `ADV-1.4`: Injected discrepancy returned 403 instead of 422 Problem Details on scoped migration route.
   - Investigate Fastify route hook order (`preHandler: [authenticate, requireRole(...)]`) to ensure deterministic RFC 7807 status codes (401 for unauthenticated, 403 for unauthorized, 422 for reconciliation failure).
3. **Migration Idempotency**:
   - Review period uniqueness on re-migration (`@@unique([complexId, type, year, month])`) and prevent duplicate ledger transaction generation if migration is re-run on the same complex.

## Deliverable
Write your complete handoff report with drop-in code recommendations in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\handoff.md`
