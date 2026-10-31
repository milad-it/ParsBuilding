# BRIEFING — 2026-10-31T20:25:00Z

## Mission
Implement Milestone 1 (M1): Backend Foundation, Multi-Tenant Database Schema, and Core Deterministic Computational Engine in `server/`.

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_worker_1\
- Original parent: 748ca4e1-43f0-41a9-ac48-b939be1d06a0
- Milestone: M1 (Backend Foundation, Multi-Tenant Schema, Calculation Engine)

## 🔒 Key Constraints
- Exclusively own and write to `server/**` and `.agents/teamwork/m1_worker_1/**`.
- DO NOT CHEAT: Genuine implementation, no hardcoded test assertions, no facades.
- Windows PowerShell: Use `npm.cmd` and `npx.cmd`.
- Git rule: `git status`, `git add`, `git commit -m "..."`, `git push origin main`.
- Zero calculation discrepancy: Hare-Niemeyer / Largest Remainder Method for penny/Rial preservation ($\sum Shares = TotalExpense$).

## Current Parent
- Conversation ID: 748ca4e1-43f0-41a9-ac48-b939be1d06a0
- Updated: 2026-10-31T20:25:00Z

## Task Summary
- **What to build**: Fastify + TypeScript backend foundation, 15-model multi-tenant Prisma schema with RLS composite indices and cascade rules, `numberUtils.ts` (Persian/Arabic numerals fix, digit 8 fix), `calculationEngine.ts` (Hare-Niemeyer exact sum distribution, occupant-based, area-based, packages, special periods), tenant middleware, error handling, Fastify healthcheck server, Vitest test suite with 15 test scenarios.
- **Success criteria**: Clean compilation with `npm.cmd run build`, all tests pass with `npm.cmd test`, prisma generates cleanly, git commit & push executed.
- **Interface contracts**: PROJECT.md, m1_setup_plan.md, m1_schema_plan.md, m1_calculation_plan.md.
- **Code layout**: `server/src/`, `server/prisma/`, `server/tests/`.

## Key Decisions Made
- Used Fastify v4 + TypeScript with strict CommonJS build output and native ESM TS authoring.
- Implemented Largest Remainder (Hare-Niemeyer) method with deterministic tie-breaking by `unitNumber`.
- Established pure, decoupled calculation engine supporting ماده ۴ قانون تملک, occupant-based water, package-exempt gas, and credit settlement without infinite loops.
- Implemented AsyncLocalStorage-backed tenant context middleware and Prisma multi-tenant query extension.
- Added Fastify in-process inject test suite for `/health` and `/api/v1/ping`.

## Artifact Index
- `.agents/teamwork/m1_worker_1/DISPATCH.md` — Initial dispatch instructions
- `.agents/teamwork/m1_worker_1/progress.md` — Liveness & task execution tracker
- `.agents/teamwork/m1_worker_1/BRIEFING.md` — Situational awareness memory
- `.agents/teamwork/m1_worker_1/handoff.md` — Final handoff report

## Change Tracker
- **Files created**:
  - `server/package.json`
  - `server/tsconfig.json`
  - `server/vitest.config.ts`
  - `server/.env.example`
  - `server/.env`
  - `server/.gitignore`
  - `server/prisma/schema.prisma`
  - `server/src/types/index.ts`
  - `server/src/utils/numberUtils.ts`
  - `server/src/services/calculationEngine.ts`
  - `server/src/middleware/tenant.ts`
  - `server/src/config/env.ts`
  - `server/src/config/database.ts`
  - `server/src/middleware/errorHandler.ts`
  - `server/src/routes/index.ts`
  - `server/src/index.ts`
  - `server/tests/calculationEngine.test.ts`
  - `server/tests/server.test.ts`
- **Build status**: PASS (`tsc --noEmit` clean, `rimraf dist && tsc` clean)
- **Test status**: PASS (18/18 tests pass in 1.55s)
- **Git status**: Committed (`08a383e`) and pushed to `origin main`

## Quality Status
- **Build/test result**: All 18 tests pass (100% precision).
- **Lint status**: Zero TypeScript or compilation errors.
- **Tests added**: `calculationEngine.test.ts` (16 tests for 15 matrix scenarios + rounding), `server.test.ts` (2 tests for server bootstrap & healthcheck).
