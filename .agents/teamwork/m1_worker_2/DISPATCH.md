## 2026-10-31T20:34:21Z
You are a teamwork_worker assigned to implement Milestone 1 Iteration 2 (M1-R2) Remediation: Multi-Tenant Prisma Extension Hardening, Schema Referential Integrity, and Fail-Closed Middleware.

### Identity & Workspace
- Archetype: teamwork_worker
- Role: M1 Remediation Implementation Worker
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_worker_2\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- File Ownership: You exclusively own `server/**` and `tests_e2e/suites/tier5_adversarial/**`.

### MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Mandatory Instructions
1. First, read `ORIGINAL_REQUEST.md` and `PROJECT.md`.
2. Read the 3 technical remediation plans from the M1-R2 Explorers:
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_r2_explorer_1\remediation_plan.md` (and `test_hardened_extension.ts`)
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_r2_explorer_2\remediation_plan.md` (and `schema_remediation.patch`)
   - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_r2_explorer_3\remediation_plan.md`
3. Maintain your heartbeat and status in `progress.md` with timestamps.
4. On Windows PowerShell, use `npm.cmd` and `npx.cmd`.
5. Follow AGENTS.md / GEMINI.md git rules: `git status`, `git add .`, commit with descriptive message, and push to `origin main`.

### Remediation Tasks
1. `server/src/config/database.ts`:
   - Implement the complete query interception architecture from `m1_r2_explorer_1/remediation_plan.md` covering all 15 Prisma operations (`findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`, `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `aggregate`, `groupBy`).
   - Add `'user'` and `'submanagerpermission'` to `TENANT_MODELS`.
   - Implement `enforceTenantScope` fail-closed logic throwing `TenantIsolationError` when tenant context is missing.
   - For `findUnique` and `findUniqueOrThrow`, transform `where` to include `complexId` or delegate to `findFirst` with `complexId` scoping.
2. `server/prisma/schema.prisma`:
   - Update `LedgerTransaction.unit` and `UnitCharge.unit` relations to `onDelete: Restrict`.
   - Update `ChatMessage.sender` and `ReceiptVerification.uploadedBy` relations to `onDelete: SetNull` (with optional `senderId String?` and `uploadedById String?`).
   - Add `@@unique([complexId, type, year, month])` to `Period`.
   - Add `@@unique([complexId, phone])` to `Resident`.
   - Re-generate Prisma Client: `cd server && npx.cmd prisma generate`.
3. `server/src/middleware/tenant.ts`:
   - Implement fail-closed `tenantMiddleware` per `m1_r2_explorer_3/remediation_plan.md` rejecting missing tenant headers with 400 Bad Request RFC 7807 on protected routes.
   - Update `server/src/middleware/errorHandler.ts` to format `TenantIsolationError` with HTTP 403 Forbidden RFC 7807 problem details.
4. `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts`:
   - Update the 17 tests to assert that these security invariants hold (e.g. `findUnique` throws or scopes to tenant, `Cascade` is absent and `Restrict`/`SetNull` is present, fail-closed throws).
5. Build and Test Verification:
   - Run `cd server && npm.cmd test` (all tests pass).
   - Run `cd server && npm.cmd run typecheck` (clean, 0 errors).
   - Run `cd server && npm.cmd run build` (clean, 0 errors).
   - Run `cd tests_e2e && node --experimental-strip-types --test "suites/**/*.test.ts"` (all pass).
6. Git Commit & Push:
   - Check `git status`, stage changes, commit with clear message, and push to `origin main`.
7. Deliver `handoff.md` with command outputs and verification details.
