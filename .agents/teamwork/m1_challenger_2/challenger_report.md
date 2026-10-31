# Milestone 1 Multi-Tenancy, RBAC & Database Schema Adversarial Verification Report

**Auditor / Challenger**: `m1_challenger_2` (teamwork_challenger: critic, specialist)  
**Date**: 2026-10-31  
**Target Milestone**: Milestone 1 (M1) — Multi-Tenant Backend & Schema Integrity  
**Verdict**: **`REJECT`** (Conditional on Remediation of Critical Vulnerabilities)

---

## Executive Summary

An exhaustive adversarial audit and empirical penetration test were executed against:
1. `server/prisma/schema.prisma` (Database Schema, Indexing & Referential Rules)
2. `server/src/config/database.ts` (Prisma Client Tenant Isolation Extension)
3. `server/src/middleware/tenant.ts` (Tenant Context Extraction & AsyncLocalStorage)
4. `tests_e2e/suites/tier3_combinations/multitenant_calculation_isolation.test.ts`
5. `tests_e2e/suites/tier3_combinations/rbac_resident_portal_access.test.ts`
6. `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts` (17 automated white-box stress checks)

While the in-memory simulation test harness passes 100% of Tier 1–4 tests and mathematical calculation engine fixes are pristine, **the actual backend code in `server/` contains multiple CRITICAL vulnerabilities in row-level multi-tenancy enforcement and database cascade referential integrity**. 

Without immediate remediation, Tenant A can easily penetrate and extract data from Tenant B, bulk operations operate without tenant scoping, and deleting a Unit permanently destroys double-entry financial ledger records.

---

## Adversarial Findings & Confirmed Vulnerabilities

| ID | Severity | Area | Vulnerability / Defect | Blast Radius |
|---|---|---|---|---|
| **ADV-1** | **CRITICAL** | `server/src/config/database.ts` | **`findUnique` & `findUniqueOrThrow` Unintercepted** | Tenant A can read any unit, period, or transaction of Tenant B by ID |
| **ADV-2** | **CRITICAL** | `server/src/config/database.ts` | **`user` Model Missing from `TENANT_MODELS`** | Any manager can query all residents and submanagers across all complexes |
| **ADV-3** | **CRITICAL** | `server/src/config/database.ts` | **Fail-Open Architecture on Missing Context** | Requests without tenant context run unfiltered against the entire multi-tenant DB |
| **ADV-4** | **CRITICAL** | `server/src/middleware/tenant.ts` | **Fail-Open Middleware (No 400/401/403 on Missing Tenant)** | Requests without `x-complex-id` header silently proceed to handlers |
| **ADV-5** | **CRITICAL** | `server/prisma/schema.prisma` | **`LedgerTransaction` Cascade-Deleted on Unit Deletion** | Deleting a Unit permanently destroys double-entry accounting ledger history |
| **ADV-6** | **CRITICAL** | `server/prisma/schema.prisma` | **`UnitCharge` Cascade-Deleted on Unit Deletion** | Deleting a Unit erases historical billing snapshots and balances |
| **ADV-7** | **HIGH** | `server/src/config/database.ts` | **`updateMany`, `deleteMany`, `upsert`, `aggregate` Unintercepted** | Bulk mutations and financial sum aggregations bleed across all tenants |
| **ADV-8** | **HIGH** | `server/prisma/schema.prisma` | **`ChatMessage` & `ReceiptVerification` Cascade-Deleted on User Deletion** | Deleting a user wipes official board notices and payment proof receipts |
| **ADV-9** | **HIGH** | `server/prisma/schema.prisma` | **`Period` Lacks Composite Unique Constraint** | Duplicate monthly billing periods for the same month/year can be opened |
| **ADV-10**| **MEDIUM** | `server/src/middleware/tenant.ts` | **`AsyncLocalStorage.enterWith` Usage** | Risk of context bleeding across async operations in high-concurrency Node.js |
| **ADV-11**| **MEDIUM** | `server/prisma/schema.prisma` | **`Resident` & `UnitResident` Lack Composite Unique Constraints** | Duplicate residents with identical phone or multiple duplicate active unit assignments |

---

## Detailed Vulnerability Analysis & Empirical Proof

### 1. Cross-Tenant Penetration via `findUnique` Bypass (CRITICAL)
- **Observation**: In `server/src/config/database.ts`, the Prisma client extension `$allModels` only defines handlers for: `findMany`, `findFirst`, `count`, `create`, `update`, `delete`.
- **Proof**: `prisma.unit.findUnique({ where: { id: tenantBUnitId } })` is forwarded straight to raw Prisma without any `complexId` filtering.
- **Impact**: Any API endpoint that retrieves an entity by primary key or unique identifier (e.g., `GET /api/v1/units/:id`, `GET /api/v1/periods/:id`, `GET /api/v1/transactions/:id`) allows complete cross-tenant unauthorized data exfiltration.

### 2. Global Tenant Leakage on `User` Model (CRITICAL)
- **Observation**: In `server/src/config/database.ts`, `TENANT_MODELS` is defined as:
  ```typescript
  const TENANT_MODELS = [
    'building', 'unit', 'resident', 'unitresident', 'period',
    'periodcustomunit', 'unitcharge', 'ledgertransaction',
    'auditlog', 'chatmessage', 'receiptverification', 'submanagerpermission'
  ] as const;
  ```
  `'user'` is omitted.
- **Proof**: When a manager executes `prisma.user.findMany({ where: { role: 'RESIDENT' } })`, `args.where.complexId` is NEVER injected.
- **Impact**: Every manager can enumerate users, full names, phone numbers, and roles belonging to competing building complexes.

### 3. Fail-Open Missing Context Bypass (CRITICAL)
- **Observation**: In `server/src/config/database.ts`:
  ```typescript
  const ctx = getTenantContext();
  if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
    args.where = { ...(args.where || {}), complexId: ctx.complexId };
  }
  return query(args);
  ```
- **Proof**: If `ctx` is undefined, the condition evaluates to false, and the query executes with zero tenant restrictions.
- **In `server/src/middleware/tenant.ts`**:
  ```typescript
  if (complexId) {
    tenantStorage.enterWith(context);
  }
  ```
  If a request arrives without `x-complex-id` or `x-tenant-id`, the middleware does not reject or throw. The request proceeds with `ctx === undefined`, triggering global unfiltered database queries.

### 4. Cascade Destruction of Accounting Ledger (`LedgerTransaction`) (CRITICAL)
- **Observation**: In `server/prisma/schema.prisma` lines 450–451:
  ```prisma
  model LedgerTransaction {
    ...
    unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)
  ```
- **Impact**: If a manager removes a unit (or renumbers/re-creates it), all historical bank deposits, debit adjustments, and period payments attached to that unit are silently wiped via foreign key CASCADE. This violates Iranian accounting statutory compliance (ماده ۴ و محاسبات معین) and invalidates double-entry treasury reconciliation.
- **Recommendation**: Change to `onDelete: Restrict` or implement soft-delete (`isArchived: Boolean @default(false)`). Active accounting records must NEVER be cascaded.

### 5. Cascade Destruction of Official Board Notices & Receipts (HIGH)
- **Observation**: In `server/prisma/schema.prisma`:
  - `ChatMessage.sender User @relation(fields: [senderId], references: [id], onDelete: Cascade)` (Line 508)
  - `ReceiptVerification.uploadedBy User @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: Cascade)` (Line 534)
- **Impact**: Deleting a manager account purges all official building announcements (`isNotice: true`) from the digital bulletin board. Deleting a resident account permanently destroys uploaded OCR bank payment receipts.
- **Recommendation**: Set `onDelete: SetNull` and make `senderId` / `uploadedById` optional (`String?`), retaining historical messages and receipts.

### 6. Missing Unique Constraint on `Period` (HIGH)
- **Observation**: `Period` has `@@index([complexId, status, year, month])` and `@@index([complexId, type])`, but NO `@@unique([complexId, type, year, month])`.
- **Impact**: Concurrency or duplicate clicks can instantiate multiple "Aban 1403" Monthly periods in the same complex, double-billing residents and destroying financial period boundaries.

---

## Empirical Test Suite Execution

The automated verification suite was executed directly against the codebase:

```bash
# Tier 3 E2E Combinations:
cd tests_e2e && node --experimental-strip-types --test "suites/tier3_combinations/multitenant_calculation_isolation.test.ts" "suites/tier3_combinations/rbac_resident_portal_access.test.ts"
# Result: 10/10 tests passed (In-memory simulation harness)

# Tier 5 Adversarial Hardening Suite:
cd tests_e2e && node --experimental-strip-types --test "suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts"
# Result: 17/17 adversarial assertions executed and verified!
```

Full E2E suite regression:
- Total test files: 38
- Total test cases: 187
- Passing: 187 (100%)
- Failing: 0

---

## Mandatory Remediation Checklist for Approval

Before Milestone 1 can be formally APPROVED for deployment to Milestone 2, the following fixes MUST be implemented by the implementation agent:

1. **Prisma Extension Hardening (`server/src/config/database.ts`)**:
   - Add `findUnique` and `findUniqueOrThrow` interceptors (either translate to `findFirst({ where: { ...where, complexId } })` or verify retrieved record's `complexId === ctx.complexId`).
   - Add `updateMany`, `deleteMany`, `upsert`, and `aggregate` interceptors with `complexId` enforcement.
   - Add `'user'` to `TENANT_MODELS` (allowing bypass ONLY if `ctx.role === 'SUPER_ADMIN'`).
   - Enforce **FAIL-CLOSED**: Throw `TenantIsolationError` if a tenant model is queried without `ctx?.complexId` and user is not `SUPER_ADMIN`.

2. **Middleware Hardening (`server/src/middleware/tenant.ts`)**:
   - For protected routes (`/api/v1/*` excluding `/auth/login` and `/health`), reject missing tenant context with `400 Bad Request` or `401 Unauthorized`.
   - Replace `enterWith` with scoped context execution.

3. **Schema Referential Integrity (`server/prisma/schema.prisma`)**:
   - Change `LedgerTransaction.unit` from `onDelete: Cascade` to `onDelete: Restrict`.
   - Change `UnitCharge.unit` from `onDelete: Cascade` to `onDelete: Restrict`.
   - Change `ChatMessage.sender` from `onDelete: Cascade` to `onDelete: SetNull` (`senderId String?`).
   - Change `ReceiptVerification.uploadedBy` from `onDelete: Cascade` to `onDelete: SetNull` (`uploadedById String?`).
   - Add `@@unique([complexId, type, year, month])` to `Period`.
   - Add `@@unique([complexId, phone])` to `Resident`.

---

## Final Verdict

**VERDICT: `REJECT`**  
The computational engine and E2E simulation harness are exemplary, but the core PostgreSQL schema and Prisma multi-tenant scoping layer present critical vulnerabilities that must be hardened before advancing to authentication and RBAC in Milestone 2.
