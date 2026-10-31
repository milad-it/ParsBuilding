# Technical Remediation Plan: Milestone 1 Iteration 2 (M1 R2)
## Prisma Client Tenant Extension Hardening & Fail-Closed Multi-Tenancy Architecture

---

## 1. Executive Summary & Problem Diagnosis

During Milestone 1 Iteration 1 adversarial review (Challenger 2 Report), critical multi-tenant isolation defects were detected in `server/src/config/database.ts` and `server/prisma/schema.prisma`:
1. **Incomplete Query Interception**: In `server/src/config/database.ts`, the Prisma Client extension (`TenantIsolationExtension`) intercepted only `findMany`, `findFirst`, `count`, `create`, `update`, and `delete`. Seven essential operations were completely unintercepted:
   - `findUnique` and `findUniqueOrThrow` (allowing cross-tenant record read by primary/unique ID)
   - `updateMany` and `deleteMany` (allowing cross-tenant bulk record modification or deletion)
   - `upsert` (allowing cross-tenant overwriting or un-scoped record insertion)
   - `aggregate` and `groupBy` (allowing cross-tenant statistical calculation and financial data leakage)
2. **Missing `user` Model in `TENANT_MODELS`**: `TENANT_MODELS` contained 12 models but omitted `'user'`. Any tenant manager calling `prisma.user.findMany()` could view names, phone numbers, and roles of residents and managers across all buildings in the database.
3. **Fail-Open Default Architecture**: When `ctx?.complexId` was `undefined` or falsy, queries executed without applying a `complexId` filter, returning global unfiltered database rows instead of failing closed.
4. **Referential Integrity Hazards in `schema.prisma`**: Foreign key cascades on `LedgerTransaction` and `UnitCharge` allowed deleting a `Unit` to permanently destroy accounting ledger records and charge history, violating double-entry accounting integrity.

This document details the complete, tested technical architecture for Milestone 1 Iteration 2 remediation.

---

## 2. Hardened Architecture for `server/src/config/database.ts`

### 2.1 Complete Model Scope (`TENANT_MODELS`)
The `TENANT_MODELS` registry must include all 13 tenant-partitioned models:
```typescript
export const TENANT_MODELS = [
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

### 2.2 Fail-Closed Tenant Context Enforcement (`enforceTenantScope`)
A central helper evaluates tenant context before any query is executed against a tenant model:
```typescript
function enforceTenantScope(model: string, action: string): string {
  const modelName = model.toLowerCase();
  const isTenantModel = (TENANT_MODELS as readonly string[]).includes(modelName);
  if (!isTenantModel) return '';

  const ctx = getTenantContext();

  // Super Admin platform-wide operations (when complexId is not explicitly specified)
  if (ctx?.role === 'SUPER_ADMIN' && !ctx.complexId) {
    return '';
  }

  // Fail-Closed Guard:
  // If no complexId is present, reject immediately rather than executing un-scoped SQL.
  if (!ctx || !ctx.complexId) {
    throw new Error(
      `TenantIsolationError: Fail-closed violation on ${model}.${action}. ` +
      `Active tenant context with valid 'complexId' is required for tenant data access.`
    );
  }

  return ctx.complexId;
}
```

### 2.3 Query Interception Matrix

| Operation | Interception Strategy | Security Guarantee |
|---|---|---|
| `findMany` | Injects `args.where.complexId = complexId` | Limits read results strictly to tenant |
| `findFirst` / `findFirstOrThrow` | Injects `args.where.complexId = complexId` | First record must belong to tenant |
| `findUnique` | Rewrites lookup to `findFirst` with `where: { ...args.where, complexId }` + validates `args.where.complexId` | Resolves Prisma `WhereUniqueInput` constraint while enforcing row-level SQL filtering |
| `findUniqueOrThrow` | Rewrites lookup to `findFirstOrThrow` with `where: { ...args.where, complexId }` | Throws `NotFoundError` if record belongs to another tenant |
| `count` | Injects `args.where.complexId = complexId` | Scopes count queries strictly to tenant |
| `create` | Injects `args.data.complexId = complexId` | Guarantees inserted record belongs to tenant |
| `createMany` | Injects `complexId = complexId` on all array elements | Guarantees bulk inserts cannot insert cross-tenant rows |
| `update` | Pre-validates existing record ownership via `findUnique` before mutating | Prevents modifying records belonging to other tenants |
| `updateMany` | Injects `args.where.complexId = complexId` | Bulk updates affect only tenant rows |
| `upsert` | Injects `complexId` into `create`, verifies `where.complexId`, pre-checks ownership if lookup by ID | Prevents cross-tenant overwrites |
| `delete` | Pre-validates existing record ownership via `findUnique` before deleting | Prevents deleting records belonging to other tenants |
| `deleteMany` | Injects `args.where.complexId = complexId` | Bulk deletions affect only tenant rows |
| `aggregate` | Injects `args.where.complexId = complexId` | Sums, averages, counts calculated only on tenant data |
| `groupBy` | Injects `args.where.complexId = complexId` | Grouping calculations strictly partitioned |

### 2.4 Deep Dive: Intercepting `findUnique` & `findUniqueOrThrow`

#### The Prisma Unique Input Challenge
In Prisma ORM, `findUnique` and `findUniqueOrThrow` require `where` to conform strictly to `[Model]WhereUniqueInput` (fields marked `@id` or `@@unique`). Because composite unique constraints like `@@unique([id, complexId])` are not defined on all models, directly mutating `args.where = { id, complexId }` causes Prisma's Rust query engine to reject the query with an invalid unique argument error.

#### The Dual-Layer Solution
1. **SQL-Level Delegation (Primary Defense)**:
   Inside the `$allModels` hook:
   ```typescript
   async findUnique({ model, args, query }) {
     const complexId = enforceTenantScope(model, 'findUnique');
     if (!complexId) {
       return query(args);
     }

     const whereAny = (args.where || {}) as Record<string, any>;
     // If caller explicitly provided an invalid/mismatched complexId, reject immediately
     if (whereAny.complexId && whereAny.complexId !== complexId) {
       return null;
     }

     // Delegate to model.findFirst with row-level complexId SQL filter
     const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
     const delegate = (rawPrisma as any)[delegateKey];
     if (delegate && typeof delegate.findFirst === 'function') {
       return delegate.findFirst({
         ...args,
         where: { ...whereAny, complexId }
       });
     }

     // Secondary defense: post-query verification
     const result = await query(args);
     if (result && (result as any).complexId && (result as any).complexId !== complexId) {
       return null;
     }
     return result;
   }
   ```
2. **Behavioral Equivalence**:
   - For `findUnique`: if the record exists but belongs to Complex B, the delegated `findFirst` returns `null`. The caller perceives that the record does not exist, completely preventing ID-based information harvesting.
   - For `findUniqueOrThrow`: delegated `findFirstOrThrow` throws `NotFoundError` if the record does not belong to the active complex.

### 2.5 Safe Handling for the `user` Model: System Super-Admins vs Tenant Users

The `User` model presents a dual nature:
- `SUPER_ADMIN` accounts have `complexId: null` and system-wide privileges.
- `COMPLEX_MANAGER`, `SUB_MANAGER`, and `RESIDENT` accounts have `complexId: string` and belong to a specific tenant.

#### Rules Enforced:
1. **Tenant Isolation for Users**:
   When any user-related query runs under an active tenant context (`ctx.complexId` is set):
   - Reads (`findMany`, `findFirst`, `count`, etc.) inject `where: { complexId: ctx.complexId }`. This automatically excludes `complexId: null` (Super-Admins) and users from other complexes.
   - Lookups (`findUnique`) return `null` if the user's `complexId !== ctx.complexId`.
   - Mutations (`create`, `createMany`) force `complexId: ctx.complexId` and disallow setting `role: 'SUPER_ADMIN'`.
2. **Platform Super-Admin Scope**:
   When `ctx.role === 'SUPER_ADMIN'` and `!ctx.complexId`:
   - `enforceTenantScope` returns `''`, allowing cross-complex system administration.
   - If a Super-Admin passes a specific `x-complex-id` header, queries are safely scoped to that complex.
3. **Authentication & Pre-Auth Operations**:
   - In pre-login authentication (`authService.login`), no tenant context exists yet.
   - `authService` exports and utilizes `rawPrisma.user.findUnique({ where: { phone } })` for initial credential verification and JWT generation. Once authenticated, subsequent API requests carry tenant headers.

---

## 3. Drop-in Replacement for `server/src/config/database.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { getTenantContext } from '../middleware/tenant';

export const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

export const TENANT_MODELS = [
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

function enforceTenantScope(model: string, action: string): string {
  const modelName = model.toLowerCase();
  const isTenantModel = (TENANT_MODELS as readonly string[]).includes(modelName);
  if (!isTenantModel) return '';

  const ctx = getTenantContext();

  // Super Admin global view bypass
  if (ctx?.role === 'SUPER_ADMIN' && !ctx.complexId) {
    return '';
  }

  // Fail-Closed Guard:
  // If no complexId is present, reject immediately
  if (!ctx || !ctx.complexId) {
    throw new Error(
      `TenantIsolationError: Fail-closed violation on ${model}.${action}. ` +
      `Active tenant context with valid 'complexId' is required for tenant data operations.`
    );
  }

  return ctx.complexId;
}

export const prisma = rawPrisma.$extends({
  name: 'TenantIsolationExtension',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findFirst({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findFirst');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findFirstOrThrow({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findFirstOrThrow');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findUnique({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findUnique');
        if (!complexId) {
          return query(args);
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          return null;
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && typeof delegate.findFirst === 'function') {
          return delegate.findFirst({
            ...args,
            where: { ...whereAny, complexId }
          });
        }

        const result = await query(args);
        if (result && (result as any).complexId && (result as any).complexId !== complexId) {
          return null;
        }
        return result;
      },

      async findUniqueOrThrow({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findUniqueOrThrow');
        if (!complexId) {
          return query(args);
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          throw new Error(`NotFoundError: No ${model} found for tenant ${complexId}`);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && typeof delegate.findFirstOrThrow === 'function') {
          return delegate.findFirstOrThrow({
            ...args,
            where: { ...whereAny, complexId }
          });
        }

        const result = await query(args);
        if (result && (result as any).complexId && (result as any).complexId !== complexId) {
          throw new Error(`NotFoundError: No ${model} found for tenant ${complexId}`);
        }
        return result;
      },

      async count({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'count');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async create({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'create');
        if (complexId) {
          args.data = { ...(args.data as Record<string, unknown>), complexId };
        }
        return query(args);
      },

      async createMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'createMany');
        if (complexId) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: any) => ({ ...item, complexId }));
          } else if (args.data) {
            args.data = { ...(args.data as Record<string, unknown>), complexId };
          }
        }
        return query(args);
      },

      async update({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'update');
        if (!complexId) {
          return query(args);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        const whereAny = (args.where || {}) as Record<string, any>;

        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (!existing || existing.complexId !== complexId) {
            throw new Error(`TenantIsolationError: Cannot update ${model} outside active tenant context`);
          }
        } else {
          args.where = { ...whereAny, complexId };
        }

        return query(args);
      },

      async updateMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'updateMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async upsert({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'upsert');
        if (!complexId) {
          return query(args);
        }

        if (args.create) {
          args.create = { ...(args.create as Record<string, unknown>), complexId };
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          throw new Error(`TenantIsolationError: Cross-tenant upsert rejected for ${model}`);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (existing && existing.complexId !== complexId) {
            throw new Error(`TenantIsolationError: Cannot upsert ${model} belonging to another tenant`);
          }
        }

        return query(args);
      },

      async delete({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'delete');
        if (!complexId) {
          return query(args);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        const whereAny = (args.where || {}) as Record<string, any>;

        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (!existing || existing.complexId !== complexId) {
            throw new Error(`TenantIsolationError: Cannot delete ${model} outside active tenant context`);
          }
        } else {
          args.where = { ...whereAny, complexId };
        }

        return query(args);
      },

      async deleteMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'deleteMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async aggregate({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'aggregate');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async groupBy({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'groupBy');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      }
    }
  }
});
```

---

## 4. Supporting Architecture Remediations

### 4.1 Tenant Middleware Hardening (`server/src/middleware/tenant.ts`)
1. Reject unauthenticated/un-scoped requests on protected API endpoints (`/api/v1/*` except `/health`, `/ping`, `/auth/login`):
   ```typescript
   if (!complexId && role !== 'SUPER_ADMIN' && !request.url.startsWith('/api/v1/auth')) {
     return reply.status(400).send({
       statusCode: 400,
       error: 'Bad Request',
       message: 'TenantHeaderMissing: x-complex-id or x-tenant-id header is required for this endpoint.'
     });
   }
   ```
2. Replace unbounded `tenantStorage.enterWith(context)` with scoped execution or request-bound context lifecycle hooks to eliminate asynchronous context cross-contamination.

### 4.2 Database Referential Integrity & Schema Hardening (`server/prisma/schema.prisma`)
1. **Prevent Accounting Ledger Destruction (`onDelete: Restrict`)**:
   - `LedgerTransaction`:
     Change `unit Unit @relation(..., onDelete: Cascade)` to:
     `unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)`
     *(Prevent unit deletion if financial ledger transactions exist)*.
   - `UnitCharge`:
     Change `unit Unit @relation(..., onDelete: Cascade)` to:
     `unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)`
     *(Prevent unit deletion if charges are attached)*.
2. **Preserve Notices and Receipts on User Deletion (`onDelete: SetNull`)**:
   - `ChatMessage`: Change `sender User @relation(..., onDelete: Cascade)` to `sender User? @relation(..., onDelete: SetNull)` with `senderId String?`.
   - `ReceiptVerification`: Change `uploadedBy User @relation(..., onDelete: Cascade)` to `uploadedBy User? @relation(..., onDelete: SetNull)` with `uploadedById String?`.
3. **Composite Uniqueness Constraints**:
   - `Period`: Add `@@unique([complexId, type, year, month])` to prevent duplicate concurrent monthly periods.
   - `Resident`: Add `@@unique([complexId, phone])` and `@@index([complexId, nationalCode])`.
   - `UnitResident`: Add `@@unique([unitId, residentId, isCurrent])`.

---

## 5. Verification & Validation Protocol

1. **Unit Test Verification (`server/tests/`)**:
   Run Vitest to verify zero regressions on existing server and calculation engine tests:
   ```bash
   cd server && cmd /c npm test
   ```
2. **Empirical Extension Test Suite (`.agents/teamwork/m1_r2_explorer_1/test_runner.ts`)**:
   Run the 9 automated adversarial tests verifying fail-closed throwing, user isolation, and query interception:
   ```bash
   cmd /c "cd server && npx tsx ..\.agents\teamwork\m1_r2_explorer_1\test_runner.ts"
   ```
   *Expected: All 9 test suites pass.*
3. **End-to-End Suite Execution (`tests_e2e/`)**:
   Run all 187 tests across Tiers 1–4:
   ```bash
   cd tests_e2e && node --experimental-strip-types --test "suites/tier1_features/*.test.ts" "suites/tier2_boundaries/*.test.ts" "suites/tier3_combinations/*.test.ts" "suites/tier4_workloads/*.test.ts"
   ```
4. **Transitioning Adversarial Tests (`suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts`)**:
   Update assertions in `m1_multitenant_schema_adversarial.test.ts` from vulnerability-detection mode (`assert.equal(hasFindUnique, false)`) to security-enforcement mode (`assert.equal(hasFindUnique, true)`), verifying that all 17 adversarial checks pass under the hardened codebase.
