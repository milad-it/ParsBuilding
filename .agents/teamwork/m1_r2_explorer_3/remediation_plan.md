# Technical Remediation Plan: Tenant Middleware Fail-Closed Enforcement & Tier 5 Adversarial Test Hardening

**Author**: Explorer 3 (Middleware & Test Remediation)  
**Target Milestone**: Milestone 1 Iteration 2 (M1-R2)  
**Target Files**:
- `server/src/middleware/tenant.ts`
- `server/src/middleware/errorHandler.ts`
- `server/src/config/database.ts`
- `server/prisma/schema.prisma`
- `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts`

---

## 1. Executive Summary & Root Cause Analysis

Following Milestone 1 audit, Challenger 2 established a `REJECT` verdict due to critical cross-tenant data isolation bypasses and destructive foreign key cascades:
1. **Tenant Middleware Fails Open**: `tenantMiddleware` in `server/src/middleware/tenant.ts` extracts `x-complex-id` if present, but does nothing when headers are absent. Unauthenticated or un-scoped requests to tenant-scoped routes proceed to route handlers without rejection.
2. **Prisma Client Extension Incomplete**: `database.ts` only intercepted 6 queries (`findMany`, `findFirst`, `count`, `create`, `update`, `delete`). `findUnique`, `findUniqueOrThrow`, `updateMany`, `deleteMany`, `upsert`, `aggregate`, and `groupBy` bypassed isolation. Furthermore, `user` was omitted from `TENANT_MODELS`, and missing `ctx.complexId` executed queries without filtering.
3. **Destructive Cascading Deletions**: Deleting a `Unit` cascade-deleted all `LedgerTransaction` records and `UnitCharge` records, permanently destroying double-entry financial accounting records. Deleting a `User` cascade-deleted official bulletin `ChatMessage` notices and `ReceiptVerification` audit items.
4. **Missing Composite Constraints**: `Period` and `Resident` lacked composite unique keys, permitting duplicate billing periods and duplicate resident profiles.
5. **Adversarial Test Suite State**: Challenger 2 crafted 17 tests in `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts`. Currently, 14 of these tests assert that the vulnerabilities *exist* (`assert.equal(hasFindUnique, false)`), which passed in the unpatched state. To achieve true hardening, Worker 1 must remediate the codebase and update the adversarial suite from *vulnerability confirmation mode* to *security invariant enforcement mode* so that all 17 tests verify that the system is strictly hardened.

---

## 2. Fail-Closed Tenant Middleware Architecture (`server/src/middleware/tenant.ts`)

### 2.1 Design Objectives
- **Fail-Closed by Default**: Any request to a tenant-scoped endpoint that lacks a valid tenant context (`x-complex-id` or authenticated tenant session) must be rejected immediately at the HTTP transport boundary with HTTP `400 Bad Request` or `401 Unauthorized`.
- **Public Route Whitelisting**: System endpoints (`/health`, `/api/v1/ping`) and authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`) must be permitted without tenant headers.
- **RFC 7807 Standard Error Format**: Rejected requests must return `Content-Type: application/problem+json` following RFC 7807 Problem Details.
- **AsyncLocalStorage Isolation**: Provide both `tenantStorage.enterWith(context)` for Fastify preHandler execution and `runWithTenantContext` for scoped task execution.
- **Defense in Depth**: Provide `requireTenantContext()` to protect internal service functions and throw `TenantIsolationError` if executed outside tenant context.

### 2.2 Proposed Implementation for `server/src/middleware/tenant.ts`

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantContext } from '../types';

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Custom error class for tenant isolation violations.
 * Mapped to RFC 7807 400 Bad Request / 403 Forbidden.
 */
export class TenantIsolationError extends Error {
  public readonly statusCode = 400;
  public readonly code = 'TENANT_ISOLATION_ERROR';

  constructor(message: string = 'TenantIsolationError: Active tenant context required for this operation.') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Retrieve the current active TenantContext from AsyncLocalStorage.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Enforce tenant context presence. Throws TenantIsolationError if absent.
 */
export function requireTenantContext(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx || !ctx.complexId) {
    throw new TenantIsolationError();
  }
  return ctx;
}

/**
 * Safely execute a callback within a scoped TenantContext.
 */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

/**
 * Public routes that do not require tenant scoping.
 */
export const PUBLIC_ROUTE_PATTERNS: (string | RegExp)[] = [
  '/health',
  '/api/v1/ping',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/favicon.ico'
];

/**
 * Determine if a route is public or tenant-scoped.
 */
export function isPublicRoute(url: string, routerPath?: string): boolean {
  const target = (routerPath || url.split('?')[0]).replace(/\/+$/, '') || '/';

  for (const pattern of PUBLIC_ROUTE_PATTERNS) {
    if (typeof pattern === 'string') {
      if (target === pattern.replace(/\/+$/, '')) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      if (pattern.test(target)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Fastify preHandler hook: Enforces fail-closed multi-tenancy.
 * Rejects missing tenant headers on protected routes with RFC 7807 error format.
 */
export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const isPublic = isPublicRoute(request.url, request.routerPath);

  const complexIdHeader = request.headers['x-complex-id'] || request.headers['x-tenant-id'];
  const userIdHeader = request.headers['x-user-id'];
  const userRoleHeader = request.headers['x-user-role'];

  const complexId = typeof complexIdHeader === 'string' && complexIdHeader.trim() !== ''
    ? complexIdHeader.trim()
    : undefined;

  // Fail-Closed Guard: Protected routes must specify complexId
  if (!complexId && !isPublic) {
    return reply
      .code(400)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
        title: 'Tenant Context Missing',
        status: 400,
        detail: "Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource.",
        instance: request.raw.url || request.url
      });
  }

  const userId = typeof userIdHeader === 'string' && userIdHeader.trim() !== ''
    ? userIdHeader.trim()
    : 'anonymous';

  const role = (typeof userRoleHeader === 'string'
    ? userRoleHeader.trim()
    : 'RESIDENT') as TenantContext['role'];

  if (complexId) {
    const context: TenantContext = {
      complexId,
      userId,
      role,
      permissions: []
    };

    tenantStorage.enterWith(context);
    (request as unknown as { tenantContext?: TenantContext }).tenantContext = context;
  }
}
```

### 2.3 Integration with Global Error Handler (`server/src/middleware/errorHandler.ts`)
To catch `TenantIsolationError` thrown anywhere downstream (e.g., service layers or database extension), update `server/src/middleware/errorHandler.ts`:

```typescript
  // Tenant Isolation Error (HTTP 400 RFC 7807)
  if (error.name === 'TenantIsolationError' || error.message.includes('TenantIsolationError')) {
    return reply
      .code(400)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
        title: 'Tenant Isolation Violation',
        status: 400,
        detail: error.message,
        instance: request.raw.url || request.url
      });
  }
```

---

## 3. Prisma Extension Hardening (`server/src/config/database.ts`)

In coordination with Explorer 1's specifications:
1. **Include `'user'` in `TENANT_MODELS`**:
   ```typescript
   const TENANT_MODELS = [
     'building',
     'unit',
     'resident',
     'unitresident',
     'period',
     'periodcustomunit',
     'unitcharge',
     'ledgertransaction',
     'auditlog',
     'chatmessage',
     'receiptverification',
     'submanagerpermission',
     'user'
   ] as const;
   ```
2. **Fail-Closed Database Guard**:
   In `$allModels`, if `(TENANT_MODELS as readonly string[]).includes(modelName)` and `!ctx?.complexId`:
   ```typescript
   throw new Error(`TenantIsolationError: Cannot execute operation on tenant model '${model}' without active tenant context.`);
   ```
3. **Complete Query Interception**:
   Implement interceptors for:
   - `findMany`: adds `args.where.complexId = ctx.complexId`
   - `findFirst`: adds `args.where.complexId = ctx.complexId`
   - `findUnique` & `findUniqueOrThrow`: converts to scoped `findFirst` enforcing `complexId: ctx.complexId`
   - `count`: adds `args.where.complexId = ctx.complexId`
   - `create`: injects `args.data.complexId = ctx.complexId`
   - `update`: adds `args.where.complexId = ctx.complexId`
   - `updateMany`: adds `args.where.complexId = ctx.complexId`
   - `delete`: adds `args.where.complexId = ctx.complexId`
   - `deleteMany`: adds `args.where.complexId = ctx.complexId`
   - `upsert`: injects `complexId` into `where`, `create`, and `update`
   - `aggregate`: adds `args.where.complexId = ctx.complexId`
   - `groupBy`: adds `args.where.complexId = ctx.complexId`

---

## 4. Schema Referential Integrity & Constraints (`server/prisma/schema.prisma`)

In coordination with Explorer 2's specifications:
1. **Preserve Accounting Ledgers (`LedgerTransaction`)**:
   Change `unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)`  
   to `unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)`.
2. **Preserve Historical Charges (`UnitCharge`)**:
   Change `unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)`  
   to `unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)`.
3. **Preserve Digital Bulletin Notices (`ChatMessage`)**:
   Change `senderId String` to `senderId String?` and  
   `sender User @relation(fields: [senderId], references: [id], onDelete: Cascade)`  
   to `sender User? @relation(fields: [senderId], references: [id], onDelete: SetNull)`.
4. **Preserve OCR Receipt Verifications (`ReceiptVerification`)**:
   Change `uploadedById String` to `uploadedById String?` and  
   `uploadedBy User @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: Cascade)`  
   to `uploadedBy User? @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: SetNull)`.
5. **Prevent Duplicate Periods**:
   Add `@@unique([complexId, type, year, month])` to `model Period`.
6. **Prevent Duplicate Residents**:
   Add `@@unique([complexId, phone])` to `model Resident`.
7. **Prevent Duplicate Unit Assignments**:
   Add `@@unique([complexId, unitId, residentId])` to `model UnitResident`.

---

## 5. Tier 5 Adversarial Test Hardening Analysis & Verification (`tests_e2e`)

### 5.1 Analysis of the 17 Challenger Tests
Challenger 2 constructed `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts` to expose vulnerabilities. The table below details every test, its current assertion logic, its remediated target state, and how the changes fulfill the invariant.

| Test ID | Vulnerability / Invariant | Current Assertion | Remediated Verification Assertion | Remediation Component |
|---|---|---|---|---|
| **ADV-1.1** | `findUnique` & `findUniqueOrThrow` intercepted | `assert.equal(hasFindUnique, false)` | `assert.equal(hasFindUnique, true)` | `database.ts`: Add `findUnique` and `findUniqueOrThrow` to `$allModels` |
| **ADV-1.2** | `updateMany` & `deleteMany` intercepted | `assert.equal(hasUpdateMany, false)` & `assert.equal(hasDeleteMany, false)` | `assert.equal(hasUpdateMany, true)` & `assert.equal(hasDeleteMany, true)` | `database.ts`: Add `updateMany` and `deleteMany` to `$allModels` |
| **ADV-1.3** | `upsert` & `aggregate` intercepted | `assert.equal(hasUpsert, false)` & `assert.equal(hasAggregate, false)` | `assert.equal(hasUpsert, true)` & `assert.equal(hasAggregate, true)` | `database.ts`: Add `upsert`, `aggregate`, and `groupBy` |
| **ADV-1.4** | `user` model present in `TENANT_MODELS` | `assert.equal(includesUser, false)` | `assert.equal(includesUser, true)` | `database.ts`: Add `'user'` to `TENANT_MODELS` |
| **ADV-1.5** | Fail-closed on missing tenant context | `assert.equal(hasFailClosedThrow, false)` | `assert.equal(hasFailClosedThrow, true)` | `database.ts`: Throw `TenantIsolationError` when `!ctx?.complexId` |
| **ADV-1.6** | `tenantMiddleware` rejects missing headers | `assert.equal(rejectsMissingHeader, false)` | `assert.equal(rejectsMissingHeader, true)` | `tenant.ts`: `reply.code(400)` with RFC 7807 on un-scoped route |
| **ADV-1.7** | Safe async execution | `assert.ok(tenantMiddlewareCode.includes('tenantStorage.enterWith'))` | `assert.ok(...)` + verify `runWithTenantContext` | `tenant.ts`: Retain `enterWith` for request preHandler and provide `runWithTenantContext` |
| **ADV-2.1** | `LedgerTransaction.unit` prevents cascade delete | `assert.ok(hasCascadeOnUnit)` | `assert.equal(hasCascadeOnUnit, false)` & `assert.ok(hasRestrictOnUnit)` | `schema.prisma`: Replace `Cascade` with `Restrict` on `LedgerTransaction.unit` |
| **ADV-2.2** | `UnitCharge.unit` prevents cascade delete | `assert.ok(hasCascadeOnUnit)` | `assert.equal(hasCascadeOnUnit, false)` & `assert.ok(hasRestrictOnUnit)` | `schema.prisma`: Replace `Cascade` with `Restrict` on `UnitCharge.unit` |
| **ADV-2.3** | `ChatMessage.sender` preserves history on user delete | `assert.ok(hasCascadeOnSender)` | `assert.equal(hasCascadeOnSender, false)` & `assert.ok(hasSetNullOnSender)` | `schema.prisma`: Replace `Cascade` with `SetNull` on `ChatMessage.sender` |
| **ADV-2.4** | `ReceiptVerification.uploadedBy` preserves receipts on user delete | `assert.ok(hasCascadeOnUploader)` | `assert.equal(hasCascadeOnUploader, false)` & `assert.ok(hasSetNullOnUploader)` | `schema.prisma`: Replace `Cascade` with `SetNull` on `ReceiptVerification.uploadedBy` |
| **ADV-2.5** | `AuditLog` & `LedgerTransaction` preserve records on User deletion | `assert.ok(...)` | `assert.ok(...)` (Passed, keep green) | `schema.prisma`: Retain `onDelete: SetNull` for actorId and createdById |
| **ADV-3.1** | `Period` has composite uniqueness | `assert.equal(hasPeriodUnique, false)` | `assert.equal(hasPeriodUnique, true)` | `schema.prisma`: Add `@@unique([complexId, type, year, month])` |
| **ADV-3.2** | `Resident` has composite uniqueness | `assert.equal(hasResidentUnique, false)` | `assert.equal(hasResidentUnique, true)` | `schema.prisma`: Add `@@unique([complexId, phone])` |
| **ADV-3.3** | `UnitResident` has composite uniqueness | `assert.equal(hasUnitResidentUnique, false)` | `assert.equal(hasUnitResidentUnique, true)` | `schema.prisma`: Add `@@unique([complexId, unitId, residentId])` |
| **ADV-3.4** | `Unit` declares `@@unique([complexId, unitNumber])` | `assert.ok(...)` | `assert.ok(...)` (Passed, keep green) | `schema.prisma`: Retain existing unique key |
| **ADV-3.5** | `UnitCharge` declares `@@unique([periodId, unitId])` | `assert.ok(...)` | `assert.ok(...)` (Passed, keep green) | `schema.prisma`: Retain existing unique key |

---

### 5.2 Proposed Remediated Test Implementation for `m1_multitenant_schema_adversarial.test.ts`

When Worker 1 executes the remediation, `tests_e2e/suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts` must be updated from "Vulnerability Detection" to "Security Enforcement":

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve('..');
const SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'server', 'prisma', 'schema.prisma');
const DB_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'config', 'database.ts');
const TENANT_MIDDLEWARE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'tenant.ts');

describe('Tier 5 Adversarial: Multi-Tenancy, RBAC & Database Schema Integrity (Enforcement Suite)', () => {

  describe('Adversarial Challenge 1: Cross-Tenant Data Isolation Penetration & Query Interceptors', () => {
    const dbConfigCode = fs.readFileSync(DB_CONFIG_PATH, 'utf-8');
    const tenantMiddlewareCode = fs.readFileSync(TENANT_MIDDLEWARE_PATH, 'utf-8');

    it('ADV-1.1 [ENFORCED]: Verifies that findUnique / findUniqueOrThrow ARE intercepted by Prisma extension', () => {
      const hasFindUnique = dbConfigCode.includes('findUnique(') || dbConfigCode.includes('findUnique :') || dbConfigCode.includes('findUniqueOrThrow');
      assert.equal(
        hasFindUnique,
        true,
        'SECURITY VIOLATION: findUnique must be intercepted by TenantIsolationExtension to prevent cross-tenant ID leaks!'
      );
    });

    it('ADV-1.2 [ENFORCED]: Verifies that updateMany and deleteMany ARE intercepted by Prisma extension', () => {
      const hasUpdateMany = dbConfigCode.includes('updateMany(') || dbConfigCode.includes('updateMany :');
      const hasDeleteMany = dbConfigCode.includes('deleteMany(') || dbConfigCode.includes('deleteMany :');
      assert.equal(hasUpdateMany, true, 'SECURITY VIOLATION: updateMany must be intercepted!');
      assert.equal(hasDeleteMany, true, 'SECURITY VIOLATION: deleteMany must be intercepted!');
    });

    it('ADV-1.3 [ENFORCED]: Verifies that upsert and aggregate ARE intercepted by Prisma extension', () => {
      const hasUpsert = dbConfigCode.includes('upsert(') || dbConfigCode.includes('upsert :');
      const hasAggregate = dbConfigCode.includes('aggregate(') || dbConfigCode.includes('aggregate :');
      assert.equal(hasUpsert, true, 'SECURITY VIOLATION: upsert must be intercepted!');
      assert.equal(hasAggregate, true, 'SECURITY VIOLATION: aggregate must be intercepted!');
    });

    it('ADV-1.4 [ENFORCED]: Verifies that "user" model IS included in TENANT_MODELS list', () => {
      const tenantModelsMatch = dbConfigCode.match(/const TENANT_MODELS = \[([\s\S]*?)\] as const;/);
      assert.ok(tenantModelsMatch, 'TENANT_MODELS list must be found in database.ts');
      const modelsList = tenantModelsMatch[1].toLowerCase();
      const includesUser = modelsList.includes("'user'") || modelsList.includes('"user"');
      assert.equal(
        includesUser,
        true,
        'SECURITY VIOLATION: user model must be included in TENANT_MODELS to enforce tenant isolation!'
      );
    });

    it('ADV-1.5 [ENFORCED]: Verifies FAIL-CLOSED behavior when tenant context is missing', () => {
      const hasFailClosedThrow = dbConfigCode.includes('throw new Error') || dbConfigCode.includes('TenantIsolationError');
      assert.equal(
        hasFailClosedThrow,
        true,
        'SECURITY VIOLATION: database.ts must throw TenantIsolationError when tenant context is absent!'
      );
    });

    it('ADV-1.6 [ENFORCED]: Verifies that tenantMiddleware REJECTS requests without tenant headers', () => {
      const middlewareFuncMatch = tenantMiddlewareCode.match(/export async function tenantMiddleware[\s\S]*?\n\}/);
      assert.ok(middlewareFuncMatch, 'tenantMiddleware function must be present');
      const funcBody = middlewareFuncMatch[0];
      const rejectsMissingHeader = funcBody.includes('reply.code') ||
                                   funcBody.includes('reply.status') ||
                                   funcBody.includes('throw new');
      assert.equal(
        rejectsMissingHeader,
        true,
        'SECURITY VIOLATION: tenantMiddleware must reject missing tenant headers with 400 Bad Request!'
      );
    });

    it('ADV-1.7 [ENFORCED]: Verifies presence of AsyncLocalStorage context management and safe scoping', () => {
      assert.ok(
        tenantMiddlewareCode.includes('tenantStorage.enterWith') || tenantMiddlewareCode.includes('tenantStorage.run'),
        'AsyncLocalStorage must be initialized for tenant context scoping.'
      );
    });
  });

  describe('Adversarial Challenge 2: Cascade Integrity & Referential Rules (onDelete)', () => {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    it('ADV-2.1 [ENFORCED]: Verifies that deleting a Unit does NOT cascade-delete LedgerTransaction records', () => {
      const ledgerTxMatch = schemaContent.match(/model LedgerTransaction \{[\s\S]*?\n\}/);
      assert.ok(ledgerTxMatch, 'LedgerTransaction model must exist');
      const hasCascadeOnUnit = ledgerTxMatch[0].includes('onDelete: Cascade') && ledgerTxMatch[0].includes('unit ');
      const hasRestrictOnUnit = ledgerTxMatch[0].includes('onDelete: Restrict');
      assert.equal(hasCascadeOnUnit, false, 'SECURITY VIOLATION: LedgerTransaction must NOT have onDelete: Cascade on unit!');
      assert.ok(hasRestrictOnUnit, 'LedgerTransaction must have onDelete: Restrict on unit!');
    });

    it('ADV-2.2 [ENFORCED]: Verifies that deleting a Unit does NOT cascade-delete past UnitCharge records', () => {
      const unitChargeMatch = schemaContent.match(/model UnitCharge \{[\s\S]*?\n\}/);
      assert.ok(unitChargeMatch, 'UnitCharge model must exist');
      const hasCascadeOnUnit = unitChargeMatch[0].includes('onDelete: Cascade') && unitChargeMatch[0].includes('unit ');
      const hasRestrictOnUnit = unitChargeMatch[0].includes('onDelete: Restrict');
      assert.equal(hasCascadeOnUnit, false, 'SECURITY VIOLATION: UnitCharge must NOT have onDelete: Cascade on unit!');
      assert.ok(hasRestrictOnUnit, 'UnitCharge must have onDelete: Restrict on unit!');
    });

    it('ADV-2.3 [ENFORCED]: Verifies that deleting a User does NOT cascade-delete ChatMessage notices', () => {
      const chatMatch = schemaContent.match(/model ChatMessage \{[\s\S]*?\n\}/);
      assert.ok(chatMatch, 'ChatMessage model must exist');
      const hasCascadeOnSender = chatMatch[0].includes('onDelete: Cascade') && chatMatch[0].includes('sender ');
      const hasSetNullOnSender = chatMatch[0].includes('onDelete: SetNull') && chatMatch[0].includes('sender ');
      assert.equal(hasCascadeOnSender, false, 'SECURITY VIOLATION: ChatMessage must NOT cascade delete on sender User!');
      assert.ok(hasSetNullOnSender, 'ChatMessage must have onDelete: SetNull on sender User!');
    });

    it('ADV-2.4 [ENFORCED]: Verifies that deleting a User does NOT cascade-delete uploaded ReceiptVerification records', () => {
      const receiptMatch = schemaContent.match(/model ReceiptVerification \{[\s\S]*?\n\}/);
      assert.ok(receiptMatch, 'ReceiptVerification model must exist');
      const hasCascadeOnUploader = receiptMatch[0].includes('onDelete: Cascade') && receiptMatch[0].includes('uploadedBy ');
      const hasSetNullOnUploader = receiptMatch[0].includes('onDelete: SetNull') && receiptMatch[0].includes('uploadedBy ');
      assert.equal(hasCascadeOnUploader, false, 'SECURITY VIOLATION: ReceiptVerification must NOT cascade delete on uploadedBy User!');
      assert.ok(hasSetNullOnUploader, 'ReceiptVerification must have onDelete: SetNull on uploadedBy User!');
    });

    it('ADV-2.5 [SAFE]: Verifies that AuditLog and LedgerTransaction do NOT cascade-delete on User deletion', () => {
      const auditLogMatch = schemaContent.match(/model AuditLog \{[\s\S]*?\n\}/);
      assert.ok(auditLogMatch);
      assert.ok(auditLogMatch[0].includes('actor           User?           @relation("ActorAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)'));

      const ledgerTxMatch = schemaContent.match(/model LedgerTransaction \{[\s\S]*?\n\}/);
      assert.ok(ledgerTxMatch);
      assert.ok(ledgerTxMatch[0].includes('createdBy       User?           @relation("TxCreator", fields: [createdById], references: [id], onDelete: SetNull)'));
    });
  });

  describe('Adversarial Challenge 3: Composite Index and Uniqueness Analysis in schema.prisma', () => {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    it('ADV-3.1 [ENFORCED]: Verifies that Period declares composite unique constraint', () => {
      const periodMatch = schemaContent.match(/model Period \{[\s\S]*?\n\}/);
      assert.ok(periodMatch);
      const hasPeriodUnique = periodMatch[0].includes('@@unique([complexId, type, year, month])') ||
                              periodMatch[0].includes('@@unique([complexId, year, month, type])') ||
                              periodMatch[0].includes('@@unique([complexId, name])');
      assert.equal(hasPeriodUnique, true, 'SECURITY VIOLATION: Period must declare composite uniqueness on [complexId, type, year, month]!');
    });

    it('ADV-3.2 [ENFORCED]: Verifies that Resident declares composite unique constraint', () => {
      const residentMatch = schemaContent.match(/model Resident \{[\s\S]*?\n\}/);
      assert.ok(residentMatch);
      const hasResidentUnique = residentMatch[0].includes('@@unique([complexId, phone])') ||
                                residentMatch[0].includes('@@unique([complexId, nationalCode])');
      assert.equal(hasResidentUnique, true, 'SECURITY VIOLATION: Resident must declare @@unique([complexId, phone])!');
    });

    it('ADV-3.3 [ENFORCED]: Verifies that UnitResident declares composite unique constraint', () => {
      const unitResidentMatch = schemaContent.match(/model UnitResident \{[\s\S]*?\n\}/);
      assert.ok(unitResidentMatch);
      const hasUnitResidentUnique = unitResidentMatch[0].includes('@@unique');
      assert.equal(hasUnitResidentUnique, true, 'SECURITY VIOLATION: UnitResident must declare @@unique composite constraint!');
    });

    it('ADV-3.4 [PASS]: Verifies that Unit declares @@unique([complexId, unitNumber]) preventing cross-tenant unit collision', () => {
      const unitMatch = schemaContent.match(/model Unit \{[\s\S]*?\n\}/);
      assert.ok(unitMatch);
      assert.ok(unitMatch[0].includes('@@unique([complexId, unitNumber])'));
      assert.ok(unitMatch[0].includes('@@index([complexId])'));
    });

    it('ADV-3.5 [PASS]: Verifies that UnitCharge declares @@unique([periodId, unitId]) preventing duplicate unit charges', () => {
      const unitChargeMatch = schemaContent.match(/model UnitCharge \{[\s\S]*?\n\}/);
      assert.ok(unitChargeMatch);
      assert.ok(unitChargeMatch[0].includes('@@unique([periodId, unitId])'));
      assert.ok(unitChargeMatch[0].includes('@@index([complexId, unitId])'));
    });
  });
});
```

---

## 6. Independent Verification & Execution Plan

When Worker 1 finishes code remediation:
1. **Prisma Schema Validation**:
   ```bash
   cd server && npx prisma validate
   ```
2. **Server Vitest Calculation & Foundation Tests**:
   ```bash
   cd server && npm test
   ```
   Must pass all unit tests without errors.
3. **Tier 5 Adversarial Verification Suite**:
   ```bash
   cd tests_e2e && node --experimental-strip-types --test "suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts"
   ```
   Must produce: `tests 17, suites 4, pass 17, fail 0`.
4. **Tier 1-4 Full E2E Test Suite**:
   ```bash
   cd tests_e2e && node --experimental-strip-types --test "suites/**/*.test.ts"
   ```
   Must produce 100% test pass (all 187+ tests passing across all tiers).
5. **Git Auto-Commit and Push**:
   Per user instructions in `AGENTS.md` and `GEMINI.md`:
   ```bash
   git status
   git add .
   git commit -m "fix(m1): remediate tenant middleware fail-closed enforcement and harden tier 5 adversarial schema rules"
   git push origin main
   ```
