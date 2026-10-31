## 2026-10-31T19:52:21Z
You are a teamwork_worker assigned to implement Milestone 1 (M1): Backend Foundation, Multi-Tenant Database Schema, and Core Deterministic Computational Engine.

### Identity & Workspace
- Archetype: teamwork_worker
- Role: M1 Backend & Core Worker
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_worker_1\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- File Ownership: You exclusively own and write to `server/**`. Do not touch other directories.

### MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` and `PROJECT.md` completely.
2. Read the 3 technical plans produced by the M1 Explorers:
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_1\m1_setup_plan.md`
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_2\m1_schema_plan.md`
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_3\m1_calculation_plan.md`
3. Maintain your heartbeat and status in `progress.md` inside your working directory with timestamps (`Last visited: [timestamp]`).
4. Note on Windows: PowerShell restricts `.ps1` execution. ALWAYS execute npm and npx commands via `npm.cmd` and `npx.cmd` (e.g. `npm.cmd install`, `npx.cmd prisma generate`, `npm.cmd test`).
5. Project Git Rules (AGENTS.md / GEMINI.md): After making your changes, verify `git status`, add the files (`git add .` or specific files), commit with a clear and descriptive Persian/English message, and push to GitHub (`git push origin main`).

### Implementation Tasks
1. Scaffolding in `server/`:
   - `server/package.json` (Fastify, TypeScript, Prisma, Vitest, Zod, @node-rs/argon2, etc. per `m1_setup_plan.md`)
   - `server/tsconfig.json`
   - `server/vitest.config.ts`
   - `server/.env.example` and `server/.env`
2. Prisma Schema:
   - `server/prisma/schema.prisma` containing all 15 models with row-level `complexId` tenant isolation, composite indexes, and cascading/referential rules per `m1_schema_plan.md`.
3. Number Utilities & Calculation Engine:
   - `server/src/utils/numberUtils.ts`: Fix Arabic digit 8 typo (`'٠١٢٣٤٥٦٧٨٩'`), proper decimal preservation in parsing, currency formatting, and rounding helpers.
   - `server/src/services/calculationEngine.ts`: Complete, deterministic calculation engine supporting area-based (ماده ۴ قانون تملک), occupant-based, package-exempt gas, equal-share incidentals, special periods (all, active, custom), Largest Remainder Method (Hare-Niemeyer) for zero loss ($\sum Shares = TotalExpense$), and rounding steps without breaking conservation. Resolves infinite credit, double-counting, ghost debts, and zero-occupancy bugs per `m1_calculation_plan.md`.
4. Tenant Context & Server Entry:
   - `server/src/middleware/tenant.ts`: AsyncLocalStorage tenant context injection and Prisma extension.
   - `server/src/config/env.ts` & `server/src/middleware/errorHandler.ts`.
   - `server/src/index.ts`: Fastify server setup with plugins and healthcheck route.
5. Automated Unit Test Suite:
   - `server/tests/calculationEngine.test.ts`: Implement all 15 test scenarios from the Test Case Matrix.
6. Build & Test Verification:
   - Install dependencies in `server/` via `npm.cmd install`.
   - Run `npx.cmd prisma generate --schema=server/prisma/schema.prisma`.
   - Run `npm.cmd test` or `npx.cmd vitest run` and confirm all 15 calculation tests pass with 100% precision.
   - Run `npm.cmd run build` (tsc) and confirm clean TypeScript compilation.
7. Git Commit & Push:
   - Perform git commit and push to `origin main` per project rules.
8. Deliver `handoff.md` with:
   - Full list of files created/modified
   - Build and test commands executed and their exact console outputs
   - Verification of the 15 test matrix scenarios
   - Git commit hash and push status
   - Send completion message to orchestrator.
