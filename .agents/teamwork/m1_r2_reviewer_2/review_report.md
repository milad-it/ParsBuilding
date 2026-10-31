# Independent Security & Architecture Review Report: Milestone 1 Iteration 2 (M1-R2)

**Reviewer**: `m1_r2_reviewer_2` (Roles: reviewer, critic)  
**Date**: 2026-10-31T20:57:00Z  
**Verdict**: **APPROVE**  
**Integrity Assessment**: **NO INTEGRITY VIOLATIONS DETECTED** (Implementation is genuine, verified through independent compilation, static analysis, unit testing, Tier 5 adversarial tests, and live runtime probe execution).

---

## 1. Executive Summary

Milestone 1 Iteration 2 (M1-R2) delivers the remediation of multi-tenant isolation, database query interception, and schema referential integrity. As an independent reviewer and adversarial critic, I conducted a comprehensive inspection of the codebase, reproduced the entire test suite, executed an independent runtime adversarial probe (`test_probe.ts`), and verified all security invariants.

Every required objective has been implemented strictly and correctly:
1. **Prisma Extension**: All 15 Prisma operations (`findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`, `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `aggregate`, `groupBy`) are intercepted. The query interceptor operates **fail-closed**, throwing `TenantIsolationError` when an active tenant context with `complexId` is absent. `TENANT_MODELS` includes all tenant-owned entities (including `user` and `submanagerpermission`).
2. **Schema Referential Integrity**:
   - `LedgerTransaction.unit`: `onDelete: Restrict` prevents accidental destruction of historical financial accounting ledgers.
   - `UnitCharge.unit`: `onDelete: Restrict` prevents deletion of past billing records.
   - `ChatMessage.sender`: `senderId String?` with `onDelete: SetNull` preserves bulletin board announcements upon user account removal.
   - `ReceiptVerification.uploadedBy`: `uploadedById String?` with `onDelete: SetNull` preserves payment proofs and OCR audit trails.
   - Composite unique constraints: `@@unique([complexId, type, year, month])` on `Period`, `@@unique([complexId, phone])` on `Resident`, and `@@unique([complexId, unitId, residentId])` on `UnitResident`.
3. **Tenant Middleware & Error Formatting**:
   - Protected routes without `x-complex-id` or `x-tenant-id` are rejected fail-closed with **HTTP 400 Bad Request** using RFC 7807 Problem Details (`application/problem+json`).
   - Tenant isolation violations throw `TenantIsolationError` (HTTP 403) and are caught by `errorHandler.ts`, returning RFC 7807 problem details (`https://api.parsbuilding.com/errors/tenant-isolation-violation`).
   - Context is propagated cleanly across asynchronous request boundaries via `AsyncLocalStorage`.

---

## 2. Integrity Verification

In accordance with strict reviewer integrity instructions, the codebase was inspected for any fraudulent practices:
- **No hardcoded test results**: Test suites run against real schema definitions, TypeScript ASTs, Fastify HTTP injections, and Prisma Client instances.
- **No dummy or facade implementations**: `database.ts` contains real query wrapping and delegating logic; `schema.prisma` contains genuine Prisma DSL constraints; `tenant.ts` uses real `node:async_hooks` `AsyncLocalStorage`.
- **No task shortcuts**: All 15 Prisma operations are individually intercepted and handled.
- **Authentic test executions**:
  - `server`: 20/20 unit tests pass (16 calculation engine, 4 server & tenant middleware).
  - `tests_e2e`: 187/187 tests pass (170 Tiers 1-4, 17 Tier 5 adversarial tests).
  - Independent runtime probe: 15/15 operations verified fail-closed at runtime.

---

## 3. Objective-by-Objective Findings

### Objective 1: `server/src/config/database.ts` Query Interception & Fail-Closed Enforcement

| Operation | Intercepted | Implementation Mechanism | Fail-Closed Verified |
|---|---|---|---|
| `findMany` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `findFirst` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `findFirstOrThrow` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `findUnique` | YES | Delegated to `findFirst` with `complexId` scoping; returns `null` on cross-tenant mismatch | YES (throws `TenantIsolationError`) |
| `findUniqueOrThrow` | YES | Delegated to `findFirstOrThrow` with `complexId` scoping; throws `NotFoundError` on cross-tenant mismatch | YES (throws `TenantIsolationError`) |
| `count` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `create` | YES | Enforces `args.data.complexId = complexId`, overriding any spoofed tenant | YES (throws `TenantIsolationError`) |
| `createMany` | YES | Maps all records in `args.data` with `complexId` | YES (throws `TenantIsolationError`) |
| `update` | YES | Pre-validates record ownership via `findUnique({ select: { complexId } })`; blocks foreign updates | YES (throws `TenantIsolationError`) |
| `updateMany` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `delete` | YES | Pre-validates record ownership via `findUnique({ select: { complexId } })`; blocks foreign deletions | YES (throws `TenantIsolationError`) |
| `deleteMany` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `upsert` | YES | Overwrites `args.create.complexId`; rejects mismatched `where.complexId`; pre-validates target entity ownership | YES (throws `TenantIsolationError`) |
| `aggregate` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |
| `groupBy` | YES | Injects `complexId` into `args.where` | YES (throws `TenantIsolationError`) |

- **`TENANT_MODELS` Coverage**: All 13 tenant-scoped entities are enumerated: `building`, `unit`, `resident`, `unitresident`, `period`, `periodcustomunit`, `unitcharge`, `ledgertransaction`, `auditlog`, `chatmessage`, `receiptverification`, `submanagerpermission`, `user`.
- **Super Admin Bypass**: Verified that when `ctx?.role === 'SUPER_ADMIN' && !ctx.complexId`, global scoping bypass is granted. If a Super Admin passes `complexId`, queries are properly scoped to that complex.

### Objective 2: `server/prisma/schema.prisma` Referential Integrity & Constraints

- **`LedgerTransaction.unit`**: Verified `onDelete: Restrict` (Line 453). Units with transactions cannot be hard-deleted.
- **`UnitCharge.unit`**: Verified `onDelete: Restrict` (Line 420). Historical charge records are safeguarded.
- **`ChatMessage.sender`**: Verified `senderId String?` and `onDelete: SetNull` (Lines 502, 510). Bulletin board notices remain intact when users are deleted.
- **`ReceiptVerification.uploadedBy`**: Verified `uploadedById String?` and `onDelete: SetNull` (Lines 521, 536). Payment receipts and OCR verification data persist when users are removed.
- **`Period` Uniqueness**: Verified `@@unique([complexId, type, year, month])` (Line 360). Concurrent or duplicate period creations are prevented.
- **`Resident` Uniqueness**: Verified `@@unique([complexId, phone])` (Line 284). Duplicate residents with identical phone numbers in the same complex are forbidden.
- **`UnitResident` Uniqueness**: Verified `@@unique([complexId, unitId, residentId])` (Line 305). Duplicate active assignments are prevented.

### Objective 3: `server/src/middleware/tenant.ts` Fail-Closed HTTP Middleware & RFC 7807

- **Status Code**: Returns `HTTP 400 Bad Request` for protected routes without tenant header.
- **Content-Type**: Sets `application/problem+json`.
- **RFC 7807 Problem Details Payload**:
  ```json
  {
    "type": "https://api.parsbuilding.com/errors/tenant-context-missing",
    "title": "Tenant Context Missing",
    "status": 400,
    "detail": "Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource.",
    "instance": "/api/v1/units"
  }
  ```
- **Public Route Whitelist**: Strictly delimited to `/health`, `/api/v1/ping`, `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`, `/favicon.ico`. Protected endpoints cannot bypass middleware.

---

## 4. Adversarial Attack Surface Analysis

### Attack Scenario 1: Un-scoped Direct Execution Attack
- **Vector**: Malicious or negligent code calls `prisma.unit.findMany()` or `prisma.ledgerTransaction.deleteMany()` without initializing `TenantContext`.
- **Expected Defense**: Query immediately aborts without sending un-scoped SQL to PostgreSQL.
- **Stress-Test Result**: **PASS**. All 15 operations threw `TenantIsolationError: Fail-closed violation on <Model>.<Action>`.

### Attack Scenario 2: Cross-Tenant Identifier Guessing Mutation Attack
- **Vector**: Attacker in Tenant A knows the UUID of a Unit in Tenant B (`u-foreign`) and calls `prisma.unit.update({ where: { id: 'u-foreign' }, data: { unitNumber: 99 } })`.
- **Expected Defense**: Update pre-validation detects `existing.complexId !== context.complexId` and aborts.
- **Stress-Test Result**: **PASS**. Throws `TenantIsolationError: Cannot update Unit outside active tenant context`.

### Attack Scenario 3: Cross-Tenant Spoofed ID Injection Attack
- **Vector**: Attacker in Tenant A executes `prisma.unit.create({ data: { complexId: 'victim-complex-id', unitNumber: 101 } })`.
- **Expected Defense**: Extension overrides the injected `complexId` with the active context's `complexId`.
- **Stress-Test Result**: **PASS**. Verified that `args.data.complexId` is replaced with `tenant-complex-123`.

### Attack Scenario 4: Cross-Tenant Unique Query Leak
- **Vector**: Attacker calls `prisma.unit.findUnique({ where: { id: 'u-foreign' } })`.
- **Expected Defense**: Query is delegated to `findFirst` with `{ id: 'u-foreign', complexId: 'active-tenant' }`, returning `null`.
- **Stress-Test Result**: **PASS**. Query returned `null`. Cross-tenant record data was not leaked.

---

## 5. Architectural Caveats for Upcoming Milestones

1. **Direct `rawPrisma` Usage**:
   - `database.ts` exports both `prisma` (hardened extension) and `rawPrisma` (underlying client).
   - In M2 (Auth/RBAC) and M3 (APIs & Migration), all application controllers and services must import `prisma`. Importing `rawPrisma` bypasses tenant scoping and should be restricted to migrations or Super-Admin platform workers.
2. **Raw SQL Operations (`$queryRaw`)**:
   - Prisma Client extensions do not intercept `$queryRaw` or `$executeRaw`. Any raw SQL written in future milestones must explicitly include `WHERE complex_id = $1`.
3. **Handling Foreign Key Restrictions in REST APIs**:
   - Because `LedgerTransaction.unit` now has `onDelete: Restrict`, deleting a unit that has accounting records will trigger a database constraint violation (`P2003`). Unit management routes in M3 must catch this and advise soft-archival (`isActive: false`) rather than hard deletion.

---

## 6. Review Summary & Final Verdict

| Evaluation Dimension | Standard | Result |
|---|---|---|
| Correctness | Complete implementation of M1-R2 objectives | PASS |
| Security Hardening | Fail-closed tenant isolation & RFC 7807 compliance | PASS |
| Schema Integrity | Cascade deletion prevention on financial & audit records | PASS |
| Test Coverage | 20 server unit tests + 17 Tier 5 tests + 187 total E2E tests | PASS |
| Adversarial Resilience | Survives un-scoped calls, ID spoofing, cross-tenant mutation | PASS |
| Integrity Check | Zero facades, zero hardcoded shortcuts | PASS |

**FINAL VERDICT: APPROVE**
