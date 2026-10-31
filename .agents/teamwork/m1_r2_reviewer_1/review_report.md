# Milestone 1 Iteration 2 (M1-R2) Independent Review & Adversarial Audit Report

**Reviewer**: `m1_r2_reviewer_1` (Roles: Reviewer, Critic)  
**Date**: 2026-10-31  
**Target Milestone**: M1-R2 Deliverables  
**Scope**: Server database configuration (`database.ts`), schema referential integrity (`schema.prisma`), tenant middleware (`tenant.ts`), error handler (`errorHandler.ts`), server tests (`server.test.ts`), and Tier 5 adversarial test suite (`m1_multitenant_schema_adversarial.test.ts`).

---

## 1. Quality Review Summary

**Verdict**: **APPROVE**

Worker 2 has completely addressed all defects identified during Milestone 1 Iteration 1 (M1-R1):
1. **Prisma Query Interception**: Extended `database.ts` to intercept all 15 Prisma operations (`findFirst`, `findFirstOrThrow`, `findMany`, `findUnique`, `findUniqueOrThrow`, `create`, `createMany`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`).
2. **Fail-Closed Security Model**: Enforced fail-closed behavior across all tenant queries. Any query executed without an authenticated `complexId` (unless caller is global SUPER_ADMIN) raises `TenantIsolationError`.
3. **Tenant Model Inclusions**: Added `'user'` and `'submanagerpermission'` into `TENANT_MODELS`, ensuring user profiles and permissions cannot leak across complexes.
4. **Referential Integrity & Safe Retention**:
   - Replaced `onDelete: Cascade` with `onDelete: Restrict` on `LedgerTransaction.unit` and `UnitCharge.unit` to guarantee that unit deletion cannot purge financial ledgers or past charge snapshots.
   - Replaced `onDelete: Cascade` with `onDelete: SetNull` on `ChatMessage.sender` and `ReceiptVerification.uploadedBy` (with nullable foreign keys `senderId String?` and `uploadedById String?`) to protect community notices and OCR payment proofs upon resident/manager user account deletion.
5. **Data Uniqueness Constraints**:
   - `Period`: Declares `@@unique([complexId, type, year, month])` to prevent race conditions or duplicate periods.
   - `Resident`: Declares `@@unique([complexId, phone])` preventing duplicate resident entries.
   - `UnitResident`: Declares `@@unique([complexId, unitId, residentId])` preventing duplicate resident-unit assignments.
6. **Fastify Tenant Middleware & RFC 7807 Compliance**:
   - `tenantMiddleware` rejects requests missing `x-complex-id` or `x-tenant-id` on protected endpoints with HTTP 400 Bad Request formatted as RFC 7807 `application/problem+json`.
   - `errorHandler` catches `TenantIsolationError` and formats as HTTP 403 Forbidden RFC 7807 problem details (`https://api.parsbuilding.com/errors/tenant-isolation-violation`).
   - Whitelist appropriately allows public endpoints (`/health`, `/api/v1/ping`, `/api/v1/auth/*`, `/favicon.ico`).

---

## 2. Integrity Audit

As required by reviewer and critic rules, the codebase was inspected for integrity violations:
- **Hardcoded test results or expected outputs embedded in source code**: None found. All calculation logic in `calculationEngine.ts` employs real mathematical formulas (Hare-Niemeyer Largest Remainder, fractional distributions, debit/credit reconciliations). All query scoping logic dynamically injects `complexId` from `AsyncLocalStorage`.
- **Dummy or facade implementations**: None found. All 15 Prisma operations are genuinely intercepted, validated, and delegated to either `findFirst`/`findFirstOrThrow` or raw client execution.
- **Shortcuts bypassing the intended task**: None found.
- **Fabricated verification outputs or logs**: None. All commands were independently executed and verified directly in PowerShell.
- **Self-certifying work without genuine independent verification**: Verified independently by running compiler typecheck, server tests, and full E2E test suite.

**Integrity Finding**: **NO INTEGRITY VIOLATION DETECTED**.

---

## 3. Findings

### Positive Findings (Good Practices)
1. **Dynamic Delegations for Unique Queries**: Prisma's client extensions disallow injecting extra `where` fields like `complexId` into `findUnique` if they are not part of the primary key / unique index. Worker 2 intelligently resolved this by delegating `findUnique` to `rawPrisma.<model>.findFirst({ where: { ...whereAny, complexId } })` and `findUniqueOrThrow` to `rawPrisma.<model>.findFirstOrThrow(...)`. This prevents cross-tenant enumeration and leaks while remaining fully type-safe.
2. **Pre-lookup Validation for Single-Row Mutations**: For `update`, `delete`, and `upsert` queries targeting an `id`, the extension queries `rawPrisma.<model>.findUnique` for `complexId` before executing the mutation, throwing `TenantIsolationError` immediately if the record belongs to another complex.
3. **RFC 7807 Error Standardization**: Using `application/problem+json` for tenant missing context (400) and tenant isolation violation (403) adheres to modern API engineering standards.

### Minor Finding (Non-blocking note for Milestone 2 / 3)
- **Soft Delete Guidance**: Because `onDelete: Restrict` is now enforced on `Unit -> LedgerTransaction` and `Unit -> UnitCharge`, attempting to hard-delete a unit that contains transaction history will throw Prisma error `P2003`. In M2/M3, the API layer should implement soft-archiving (`isActive: false` or `isArchived: true`) rather than performing hard deletions on units.

---

## 4. Verified Claims

| # | Worker Claim | Verification Method | Result | Notes |
|---|--------------|---------------------|--------|-------|
| 1 | `npx.cmd prisma generate` generates valid client | Executed in `server/` | **PASS** | Generated Prisma Client (v5.22.0) in 427ms |
| 2 | `npx.cmd prisma validate` validates schema | Executed in `server/` | **PASS** | Schema is valid |
| 3 | `npm.cmd run typecheck` passes with zero errors | Executed in `server/` | **PASS** | `tsc --noEmit` exited with code 0 |
| 4 | `npm.cmd run build` succeeds | Executed in `server/` | **PASS** | `rimraf dist && tsc` exited with code 0 |
| 5 | `npm.cmd test` passes 20/20 unit tests | Executed in `server/` | **PASS** | 2 test files passed, 20/20 tests passed in 1.25s |
| 6 | Tier 5 adversarial test suite passes 17/17 tests | Executed via Node test runner | **PASS** | 17/17 security invariants verified |
| 7 | Full E2E test suite passes 187/187 tests | Executed via Node test runner | **PASS** | 38 suites passed, 187/187 tests passed (0 fail, 0 skipped) |

---

## 5. Adversarial Challenge & Stress-Test Report

### Overall Risk Assessment: **LOW**

### Adversarial Challenges Evaluated

#### Challenge 1: Cross-Tenant Identifier Spoofing via `where` Clause
- **Assumption Challenged**: An attacker or rogue developer might supply `{ where: { id: 'target_id', complexId: 'victim_complex' } }`.
- **Stress-Test Analysis**: In `database.ts`:
  ```typescript
  args.where = { ...(args.where || {}), complexId };
  ```
  Because `complexId` (from authenticated context) is spread after `args.where`, any caller-provided `complexId` is unconditionally overridden.
- **Result**: **PASS** (Protected against identifier spoofing).

#### Challenge 2: Mass Update / Delete Blast Radius
- **Assumption Challenged**: `updateMany` or `deleteMany` could wipe out records across multiple complexes if called without explicit `complexId`.
- **Stress-Test Analysis**: `updateMany` and `deleteMany` are both intercepted. `enforceTenantScope` rejects queries without `complexId` (fail-closed), and injects `complexId` into `where`.
- **Result**: **PASS** (Blast radius restricted to active tenant only).

#### Challenge 3: Financial History Destruction upon Unit Deletion
- **Assumption Challenged**: Deleting a unit might cascade and purge all resident billing and ledger records.
- **Stress-Test Analysis**: Both `LedgerTransaction` and `UnitCharge` define `unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)`. Deleting a unit with existing charges or transactions is blocked at the database engine level.
- **Result**: **PASS** (Historical financial records preserved).

#### Challenge 4: Loss of Public Announcements or Payment Proofs on User Account Removal
- **Assumption Challenged**: If a user account is removed, notices or payment receipts might be lost.
- **Stress-Test Analysis**: Foreign keys `ChatMessage.senderId` and `ReceiptVerification.uploadedById` are nullable (`String?`) with `onDelete: SetNull`. Bulletin notices and receipt images are preserved with `senderId: null`.
- **Result**: **PASS** (Audit evidence and bulletin announcements preserved).

#### Challenge 5: Race Condition on Duplicate Monthly Billing Period Creation
- **Assumption Challenged**: Concurrent API calls could create two `Period` records for the same month, double-billing residents.
- **Stress-Test Analysis**: `Period` has `@@unique([complexId, type, year, month])`. Any concurrent attempt to create an identical period will fail with database constraint violation `P2002`.
- **Result**: **PASS** (Race condition eliminated).

---

## 6. Coverage Gaps & Unverified Items
- **None**: All M1-R2 remediation requirements and dependent test suites were executed and verified independently.
