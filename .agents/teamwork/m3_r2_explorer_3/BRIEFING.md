# BRIEFING — 2026-11-01T14:35:00Z

## Mission
Investigate and produce drop-in fixes for Migration Cross-Tenant Authorization, PreHandler Hook Order & Status Codes (401 vs 400 vs 403 vs 422), and Migration Idempotency.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Backend Security & API Route Researcher
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\
- Original parent: f119ffc6-97e5-4dda-bea3-4b8fe97c83df
- Milestone: M3-R2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Produce drop-in code recommendations and complete handoff report

## Current Parent
- Conversation ID: f119ffc6-97e5-4dda-bea3-4b8fe97c83df
- Updated: 2026-11-01T14:35:00Z

## Investigation State
- **Explored paths**:
  - `server/src/routes/migrationRoutes.ts`
  - `server/src/middleware/tenant.ts`
  - `server/src/middleware/rbac.ts`
  - `server/src/services/migrationService.ts`
  - `server/src/index.ts`
  - `server/prisma/schema.prisma`
  - `server/tests/migration.test.ts`
  - `server/tests/adversarialMigration.test.ts`
  - `server/tests/server.test.ts`
  - `client/src/services/migrationBridge.ts`
  - Prior reviewer and auditor reports (`m3_reviewer_1`, `m3_auditor_1`)
- **Key findings**:
  - **Cross-Tenant IDOR**: `migrationRoutes.ts` resolves `targetComplexId` from params/body/context, but never verifies `request.user.role === 'SUPER_ADMIN' || request.user.complexId === targetComplexId`. A manager of Complex A can execute migration into Complex B.
  - **PreHandler Hook Order & Status Codes**: `tenantMiddleware` runs as a server-level preHandler hook before route-level `authenticate`. When an unauthenticated caller sends a request with neither `x-complex-id` nor Bearer token, `tenantMiddleware` rejects with 400 `Tenant Context Missing`. When `x-complex-id` is provided without token, `authenticate` rejects with 401 `Unauthorized`. Furthermore, in ADV-1.4, cross-tenant authorization (403) correctly takes precedence over reconciliation failure (422) because security authorization must strictly precede domain calculation.
  - **Migration Idempotency**: `Period` has `@@unique([complexId, type, year, month])`. Currently `migrationService.ts` uses `tx.period.create` with `${month}_mig_${pIdx + 1}`, crashing on re-run with Prisma P2002. Additionally, `tx.ledgerTransaction.create` generates new random IDs (`Date.now() + Math.random()`), duplicating ledger transactions. Fix requires deterministic transaction IDs, `tx.period.upsert`, `tx.unitCharge.upsert`, and optional `overwrite: true` cleanup.
- **Unexplored areas**: None within Explorer 3 scope.

## Key Decisions Made
- Fully documented the 3 root causes and drafted exact drop-in code replacements for `migrationRoutes.ts`, `migrationService.ts`, and test mocks.

## Artifact Index
- DISPATCH.md — Dispatch instructions
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final handoff report with drop-in code recommendations
