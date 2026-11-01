# Handoff Report: Cross-Tenant Security, Idempotency & Route Status Codes (M3-R2 Explorer 3)

- **Agent**: M3-R2 Explorer 3 (`teamwork_explorer`)
- **Role**: Backend Security & API Route Researcher
- **Target Deliverable**: Milestone 3 Remediation (Cross-Tenant Authorization, PreHandler Hook Lifecycle, Migration Idempotency)
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_3\`
- **Date**: 2026-11-01T14:40:00Z
- **Status**: **COMPLETE / READY FOR WORKER IMPLEMENTATION**

---

## Executive Summary

This investigation analyzed three critical backend issues in Milestone 3:
1. **Cross-Tenant IDOR in Migration Routes**: In `server/src/routes/migrationRoutes.ts`, managers can target any `complexId` in the path or body because the handler verifies roles (`COMPLEX_MANAGER`, `SUB_MANAGER`) but fails to verify that `request.user.role === 'SUPER_ADMIN' || request.user.complexId === targetComplexId`.
2. **Fastify PreHandler Hook Lifecycle & Deterministic Status Codes**: Traced why `POST /api/v1/migration/import` returned HTTP 400 (`Tenant Context Missing`) instead of HTTP 401 (`Unauthorized`) when called without headers, and why adversarial challenge ADV-1.4 returned HTTP 403 instead of HTTP 422 when an unauthorized complex ID was injected. Demonstrated the deterministic status code hierarchy: **401 (Unauthenticated) → 403 (Cross-tenant / Unauthorized Role) → 400 (Bad Request / Missing ComplexId) → 422 (Reconciliation Failure) → 200 (Success)**.
3. **Migration Idempotency & Prisma Unique Constraint Violations**: Re-running migration on the same complex throws Prisma P2002 errors on `Period`'s `@@unique([complexId, type, year, month])` because `uniqueMonth = ${month}_mig_${pIdx + 1}` is static, while `tx.ledgerTransaction.create` generates new random IDs (`Date.now() + Math.random()`), creating duplicate ledger transactions. Formulated an idempotent upsert architecture with deterministic transaction keys and optional `overwrite: true` cleanup.

Complete drop-in code recommendations with exact line numbers and diffs are provided below.

---

## 1. Observation

### 1.1 Observation 1: Missing Cross-Tenant Authorization Guard in `migrationRoutes.ts`
- **File**: `server/src/routes/migrationRoutes.ts`
- **Lines 22–56**:
  ```typescript
  const handleMigration = async (request: any, reply: any) => {
    const tenantCtx = getTenantContext();
    const body = request.body as z.infer<typeof migrationBodySchema>;
    const params = request.params as { complexId?: string; id?: string };

    const targetComplexId = params.complexId || params.id || body.complexId || tenantCtx?.complexId;

    if (!targetComplexId) {
      return reply.code(400).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/missing-complex-id',
        title: 'Bad Request',
        status: 400,
        detail: 'A valid complexId is required to execute migration.',
        instance: request.raw.url || request.url,
      });
    }

    // Role check if authenticated
    if (request.user) {
      const { role, permissions } = request.user;
      const isAllowed = role === 'SUPER_ADMIN' ||
        role === 'COMPLEX_MANAGER' ||
        (role === 'SUB_MANAGER' && (permissions.includes('MANAGE_SETTINGS') || permissions.includes('MANAGE_FINANCES')));

      if (!isAllowed) {
        return reply.code(403).header('Content-Type', 'application/problem+json').send({
          type: 'https://api.parsbuilding.com/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Migration requires managerial privileges (SUPER_ADMIN, COMPLEX_MANAGER, or MANAGE_SETTINGS).',
          instance: request.raw.url || request.url,
        });
      }
    }
  ```
- **Verbatim Evidence**:
  - `targetComplexId` resolves from `params.complexId`, `params.id`, `body.complexId`, or `tenantCtx?.complexId`.
  - When `request.user` is populated (e.g. `COMPLEX_MANAGER` of Complex A), `isAllowed` evaluates to `true`.
  - There is zero comparison between `request.user.complexId` and `targetComplexId`.
  - A manager belonging to Complex A can provide `params.complexId = 'complex-B'` or `body.complexId = 'complex-B'`. The request proceeds to `migrationService.executeMigration('complex-B', ...)` without rejection.

---

### 1.2 Observation 2: Fastify Hook Lifecycle Order (400 vs 401 vs 403 vs 422)
- **Files**:
  - `server/src/index.ts` (lines 35–37)
  - `server/src/middleware/tenant.ts` (lines 85–192)
  - `server/src/middleware/rbac.ts` (lines 76–133)
  - `server/src/routes/migrationRoutes.ts` (lines 76–85)
- **Verbatim Evidence**:
  1. In `server/src/index.ts:36`:
     ```typescript
     // Tenant hook
     server.addHook('preHandler', tenantMiddleware);
     ```
     `tenantMiddleware` is registered as a **global server preHandler hook**.
  2. In Fastify's lifecycle, global `preHandler` hooks execute **before** route-level `preHandler` hooks (`preHandler: [authenticate]`).
  3. In `server/src/middleware/tenant.ts:182-192`:
     ```typescript
     // 4. Unauthenticated Request Path
     // Fail-Closed Guard: Protected routes without tenant header must be rejected
     if (!trimmedHeader && !isPublic) {
       return reply.code(400)
         .header('Content-Type', 'application/problem+json')
         .send({
           type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
           title: 'Tenant Context Missing',
           status: 400,
           detail: "Missing required 'x-complex-id' or 'x-tenant-id' header or Bearer authorization token for tenant-scoped resource.",
           instance: request.raw.url || request.url
         });
     }
     ```
  4. When an unauthenticated caller sends `POST /api/v1/migration/import` with **no headers** (`Authorization` is absent and `x-complex-id` is absent):
     - `tenantMiddleware` checks `!trimmedHeader && !isPublic` (since `/api/v1/migration/import` is not in `PUBLIC_ROUTE_PATTERNS`).
     - `tenantMiddleware` immediately halts execution and returns **HTTP 400 Bad Request** (`tenant-context-missing`).
     - The route-level `authenticate` hook in `preHandler: [authenticate]` is **never reached**.
  5. When an unauthenticated caller sends `POST /api/v1/migration/import` with `x-complex-id: cpx-1` but **without a Bearer token**:
     - `trimmedHeader` is present, so `tenantMiddleware` does not short-circuit with 400.
     - Execution advances to the route-level `authenticate` preHandler hook (`server/src/middleware/rbac.ts:93-101`), which returns **HTTP 401 Unauthorized** (`unauthorized`).
  6. In `ADV-1.4` (`server/tests/adversarialMigration.test.ts:370-392`):
     - When testing `/api/v1/complexes/:complexId/migrate` with injected discrepancy, if the caller's JWT token belongs to a different complex than the target URL parameter or header, `tenantMiddleware` (line 143) detects `trimmedHeader !== user.complexId` and returns **HTTP 403 Forbidden**.
     - Because security authorization (403) runs before the route handler, the migration calculation is aborted before reaching the discrepancy check (422).
     - When the token matches the target complex (`cpx-adv-test`), authorization passes, migration executes, catches `MigrationReconciliationError`, and returns **HTTP 422 Problem Details**.

---

### 1.3 Observation 3: Period Unique Constraint & Transaction Duplication on Re-Migration
- **Files**:
  - `server/src/services/migrationService.ts` (lines 261–275, 298–311, 325–339, 354–372)
  - `server/prisma/schema.prisma` (lines 360, 423, 439)
- **Verbatim Evidence**:
  1. In `server/prisma/schema.prisma`:
     - Line 360: `@@unique([complexId, type, year, month])` on `model Period`.
     - Line 423: `@@unique([periodId, unitId])` on `model UnitCharge`.
     - Line 439: `transactionId String @unique` on `model LedgerTransaction`.
  2. In `server/src/services/migrationService.ts`:
     - Lines 298–301:
       ```typescript
       const uniqueMonth = `${month}_mig_${pIdx + 1}`;

       const createdPeriod = await tx.period.create({
         data: {
           complexId,
           type: periodType,
           name: p.title || p.name || `دوره ${pIdx + 1}`,
           status: periodStatus,
           year,
           month: uniqueMonth,
           totalExpenseAmount: periodExpense,
           frozenExpenses: p.frozenExpenses || p.expenses || null,
         }
       });
       ```
     - Lines 261–273:
       ```typescript
       await tx.ledgerTransaction.create({
         data: {
           complexId,
           unitId: createdUnit.id,
           transactionId: t.transactionId || `tx-leg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
           txKind,
           type: txType,
           amount: txAmt,
           date: t.date ? new Date(t.date) : new Date(),
           description: t.desc || t.description || 'تراکنش قدیمی کلاینت',
           paymentMethod: PaymentMethod.CARD_TRANSFER,
         }
       });
       ```
     - Lines 325–338:
       ```typescript
       await tx.ledgerTransaction.create({
         data: {
           complexId,
           unitId: targetUnitId,
           periodId: createdPeriod.id,
           transactionId: pay.transactionId || `tx-pay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
           txKind: TxKind.MANUAL,
           type: TxType.PAYMENT,
           amount: payAmt,
           date: pay.date ? new Date(pay.date) : new Date(),
           description: pay.desc || pay.description || `پرداخت شارژ دوره ${createdPeriod.name}`,
           paymentMethod: PaymentMethod.CARD_TRANSFER,
         }
       });
       ```
  3. **Consequences on Repeated Execution**:
     - When `executeMigration` is executed a second time on the same `complexId`:
       - `tx.period.create` attempts to insert a record with identical `[complexId, periodType, year, uniqueMonth]`. Prisma throws `P2002: Unique constraint failed on the fields: (complexId, type, year, month)`.
       - If `t.transactionId` was provided in the legacy payload, `tx.ledgerTransaction.create` throws `P2002: Unique constraint failed on the fields: (transactionId)`.
       - If `t.transactionId` was NOT provided, `tx.ledgerTransaction.create` generates new random IDs (`tx-leg-${Date.now()}...`), creating duplicate financial transactions and distorting the general ledger.
       - If periods were somehow reused, `tx.unitCharge.create` throws `P2002` on `[periodId, unitId]`.

---

## 2. Logic Chain

1. **Premise 1 (Multi-Tenant Isolation Invariant)**:
   A multi-tenant SaaS architecture must enforce strict boundary isolation: no tenant user (manager, sub-manager, or resident) may read or write records belonging to any other tenant (`complexId`). Only `SUPER_ADMIN` holds cross-tenant privileges.
2. **Premise 2 (Evaluation of Current `migrationRoutes.ts`)**:
   Observation 1 demonstrates that `migrationRoutes.ts` accepts `targetComplexId` from user-controlled parameters (`params.complexId` or `body.complexId`) and executes the migration as long as the user's role is `COMPLEX_MANAGER` or authorized `SUB_MANAGER`. Because `request.user.complexId` is never compared against `targetComplexId`, a manager of Complex 1 can overwrite Complex 2. Therefore, an IDOR cross-tenant vulnerability exists.
3. **Premise 3 (Deterministic RFC 7807 Status Code Hierarchy)**:
   In REST security architecture:
   - *Authentication (401)* checks *who you are*.
   - *Authorization (403)* checks *what you are allowed to do*.
   - *Validation (400)* checks *request syntax and completeness*.
   - *Domain Rule (422)* checks *business logic consistency*.
   In Observation 2, `tenantMiddleware` executed before `authenticate` because it was registered globally, returning 400 instead of 401 on bare requests. In ADV-1.4, cross-tenant rejection (403) occurred prior to reconciliation (422) because security authorization MUST strictly evaluate before executing sensitive business logic. An unauthorized caller must never be informed of reconciliation status (422) in another complex.
4. **Premise 4 (Idempotency Invariant in Data Ingestion)**:
   In commercial SaaS data ingestion, network retries, double submissions, or corrected historical imports must be idempotent.
   In Observation 3, `tx.period.create`, `tx.unitCharge.create`, and `tx.ledgerTransaction.create` rely on non-idempotent inserts and non-deterministic random keys (`Date.now() + Math.random()`), guaranteeing hard database crashes (P2002) and duplicate ledger entries on re-execution.
5. **Conclusion**:
   Remediation requires:
   - Adding a strict cross-tenant guard in `migrationRoutes.ts`: `if (user.role !== 'SUPER_ADMIN' && user.complexId !== targetComplexId) return 403`.
   - Clarifying and preserving the deterministic hook order (401 → 403 → 400 → 422).
   - Upgrading `tx.period`, `tx.unitCharge`, and `tx.ledgerTransaction` to deterministic `upsert` operations with deterministic keys (`tx-mig-${complexId}-${unitNumber}-${tIdx}`) and supporting `overwrite: true` cleanup.

---

## 3. Caveats

1. **Test Mock Consistency (`mockTx`)**:
   In both `server/tests/migration.test.ts` and `server/tests/adversarialMigration.test.ts`, `rawPrisma.$transaction` is mocked with a custom `mockTx` object that defines only `.create` and `.findMany` on `mockTx.period`, `mockTx.unitCharge`, and `mockTx.ledgerTransaction`.
   **CRITICAL IMPLEMENTATION WARNING**: When switching `migrationService.ts` from `.create` to `.upsert`, the `mockTx` definitions in both test files MUST be extended to support `.upsert` (and `.deleteMany` if used), otherwise unit tests will throw `TypeError: tx.period.upsert is not a function`.
2. **Tenant Middleware Precedence for Bare Requests**:
   `server/tests/server.test.ts` line 40 explicitly tests that generic protected endpoints (`GET /api/v1/units`) return **HTTP 400 Bad Request** (`tenant-context-missing`) when called with no headers. Therefore, global `tenantMiddleware` behavior must not be altered in a way that breaks `server.test.ts`. For migration endpoints, defense-in-depth requires checking `if (!request.user) return 401` inside `handleMigration`.
3. **Persisted Debt Reconciliation**:
   This report coordinates with Explorer 1's authentic PostgreSQL debt reconciliation (`tx.unit.findMany({ where: { complexId } })`). Idempotent upserts of `Unit` (`tx.unit.upsert`) ensure that re-migrated units correctly update `currentBalance` in PostgreSQL, enabling accurate DB-level debt verification.

---

## 4. Conclusion & Drop-In Code Recommendations

### 4.1 Recommendation 1: Cross-Tenant Authorization Guard & Defense-in-Depth in `server/src/routes/migrationRoutes.ts`

#### Target File: `server/src/routes/migrationRoutes.ts`
Replace lines 22–56 with the following hardened handler:

```typescript
  // Handler function reused across both routes
  const handleMigration = async (request: any, reply: any) => {
    const tenantCtx = getTenantContext();
    const body = request.body as z.infer<typeof migrationBodySchema>;
    const params = request.params as { complexId?: string; id?: string };

    const targetComplexId = params.complexId || params.id || body.complexId || tenantCtx?.complexId;

    // 1. Parameter Validation: Ensure complexId is provided
    if (!targetComplexId) {
      return reply.code(400).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/missing-complex-id',
        title: 'Bad Request',
        status: 400,
        detail: 'A valid complexId is required to execute migration.',
        instance: request.raw.url || request.url,
      });
    }

    // 2. Authentication Guard (Defense-in-depth)
    if (!request.user) {
      return reply.code(401).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication token is required to execute migration.',
        instance: request.raw.url || request.url,
      });
    }

    const { role, complexId: userComplexId, permissions } = request.user;

    // 3. Cross-Tenant Authorization Guard: Non-super-admins can ONLY migrate into their assigned complex
    if (role !== 'SUPER_ADMIN' && userComplexId !== targetComplexId) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Cross-tenant migration forbidden. Managers can only execute migration on their own assigned complex.',
        instance: request.raw.url || request.url,
      });
    }

    // 4. Role & Permissions Guard: Enforce managerial privileges
    const isAllowed = role === 'SUPER_ADMIN' ||
      role === 'COMPLEX_MANAGER' ||
      (role === 'SUB_MANAGER' && (permissions.includes('MANAGE_SETTINGS') || permissions.includes('MANAGE_FINANCES')));

    if (!isAllowed) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Migration requires managerial privileges (SUPER_ADMIN, COMPLEX_MANAGER, or MANAGE_SETTINGS).',
        instance: request.raw.url || request.url,
      });
    }

    try {
      const result = await migrationService.executeMigration(
        targetComplexId,
        body,
        request.user?.id || tenantCtx?.userId
      );
      return reply.code(200).send(result);
    } catch (err: any) {
      request.log.error(err, 'Migration reconciliation failed and was rolled back');
      return reply.code(422).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/migration-failed',
        title: 'Migration Reconciliation Failure',
        status: 422,
        detail: err.message || 'Data migration failed reconciliation assertions and was rolled back.',
        instance: request.raw.url || request.url,
      });
    }
  };
```

Update `migrationBodySchema` in `server/src/routes/migrationRoutes.ts` (lines 11–18) to accept `overwrite`:
```typescript
const migrationBodySchema = z.object({
  complexId: z.string().optional(),
  complexName: z.string().optional(),
  initialFund: z.number().default(0),
  expectedEndingFund: z.number().optional(),
  overwrite: z.boolean().optional().default(false),
  units: z.array(z.record(z.any())).default([]),
  periods: z.array(z.record(z.any())).default([]),
});
```

---

### 4.2 Recommendation 2: Migration Idempotency & Clean Re-Run in `server/src/services/migrationService.ts`

#### Target File: `server/src/types/index.ts`
Update `LegacyExportPayload`:
```typescript
export interface LegacyExportPayload {
  units: any[];
  periods: any[];
  initialFund: number;
  expectedEndingFund?: number;
  overwrite?: boolean;
}
```

#### Target File: `server/src/services/migrationService.ts`
1. **Optional Cleanup on Overwrite** (insert at line 105):
   ```typescript
   if ((payload as any).overwrite) {
     // Clean up previously migrated periods and associated charges for this complex
     await tx.period.deleteMany({
       where: { complexId }
     });
     // Clean up previously migrated transactions for this complex
     await tx.ledgerTransaction.deleteMany({
       where: {
         complexId,
         transactionId: { startsWith: 'tx-mig-' }
       }
     });
   }
   ```

2. **Deterministic Legacy Unit Transactions** (replace lines 260–275):
   ```typescript
   for (let tIdx = 0; tIdx < u.transactions.length; tIdx++) {
     const t = u.transactions[tIdx]!;
     const txAmt = parseDecimal(t.amount || 0);
     const isPayment = (t.type || '').toLowerCase() === 'payment';
     if (isPayment) {
       totalPayments += txAmt;
     }

     const rawKind = String(t.txKind || 'MANUAL').toUpperCase();
     const txKind = (Object.values(TxKind) as string[]).includes(rawKind)
       ? (rawKind as TxKind)
       : TxKind.MANUAL;

     const rawType = String(t.type || 'PAYMENT').toUpperCase();
     const txType = rawType === 'DEBT'
       ? TxType.DEBT
       : (rawType === 'FORGIVE' ? TxType.FORGIVE : TxType.PAYMENT);

     // Deterministic transactionId prevents duplicate rows on re-migration
     const txId = t.transactionId || `tx-mig-${complexId}-${unitNumber}-${tIdx}`;

     await tx.ledgerTransaction.upsert({
       where: { transactionId: txId },
       create: {
         complexId,
         unitId: createdUnit.id,
         transactionId: txId,
         txKind,
         type: txType,
         amount: txAmt,
         date: t.date ? new Date(t.date) : new Date(),
         description: t.desc || t.description || 'تراکنش قدیمی کلاینت',
         paymentMethod: PaymentMethod.CARD_TRANSFER,
       },
       update: {
         amount: txAmt,
         txKind,
         type: txType,
         date: t.date ? new Date(t.date) : new Date(),
         description: t.desc || t.description || 'تراکنش قدیمی کلاینت',
       }
     });
     transactionsImported++;
   }
   ```

3. **Period Upsert to Prevent Constraint Collision** (replace lines 298–312):
   ```typescript
   // Ensure unique [complexId, type, year, month]
   const uniqueMonth = `${month}_mig_${pIdx + 1}`;

   const createdPeriod = await tx.period.upsert({
     where: {
       complexId_type_year_month: {
         complexId,
         type: periodType,
         year,
         month: uniqueMonth,
       }
     },
     create: {
       complexId,
       type: periodType,
       name: p.title || p.name || `دوره ${pIdx + 1}`,
       status: periodStatus,
       year,
       month: uniqueMonth,
       totalExpenseAmount: periodExpense,
       frozenExpenses: p.frozenExpenses || p.expenses || null,
     },
     update: {
       name: p.title || p.name || `دوره ${pIdx + 1}`,
       status: periodStatus,
       totalExpenseAmount: periodExpense,
       frozenExpenses: p.frozenExpenses || p.expenses || null,
     }
   });
   periodsImported++;
   ```

4. **Deterministic Period Payments Upsert** (replace lines 324–341):
   ```typescript
   if (targetUnitId) {
     for (let payIdx = 0; payIdx < p.payments.length; payIdx++) {
       const pay = p.payments[payIdx]!;
       const payAmt = parseDecimal(pay.amount || 0);
       totalPayments += payAmt;

       // Deterministic transactionId for period payments
       const payTxId = pay.transactionId || `tx-mig-pay-${complexId}-${uniqueMonth}-${payIdx}`;

       await tx.ledgerTransaction.upsert({
         where: { transactionId: payTxId },
         create: {
           complexId,
           unitId: targetUnitId,
           periodId: createdPeriod.id,
           transactionId: payTxId,
           txKind: TxKind.MANUAL,
           type: TxType.PAYMENT,
           amount: payAmt,
           date: pay.date ? new Date(pay.date) : new Date(),
           description: pay.desc || pay.description || `پرداخت شارژ دوره ${createdPeriod.name}`,
           paymentMethod: PaymentMethod.CARD_TRANSFER,
         },
         update: {
           amount: payAmt,
           date: pay.date ? new Date(pay.date) : new Date(),
           description: pay.desc || pay.description || `پرداخت شارژ دوره ${createdPeriod.name}`,
         }
       });
       transactionsImported++;
     }
   }
   ```

5. **UnitCharge Upsert** (replace lines 354–372):
   ```typescript
   await tx.unitCharge.upsert({
     where: {
       periodId_unitId: {
         periodId: createdPeriod.id,
         unitId: targetUnitId,
       }
     },
     create: {
       complexId,
       periodId: createdPeriod.id,
       unitId: targetUnitId,
       amount: chAmt,
       paidAmount: paidAmt,
       fixedShare: parseDecimal(ch.details?.fixed || 0),
       waterShare: parseDecimal(ch.details?.water || 0),
       gasShare: parseDecimal(ch.details?.gas || 0),
       electricityShare: parseDecimal(ch.details?.elec || 0),
       incidentalShare: parseDecimal(ch.details?.incidental || 0),
       specialShare: parseDecimal(ch.details?.specialShare || 0),
       snapshotOccupants: ch.snapshot?.occupants || 0,
       snapshotHasPackage: !!ch.snapshot?.hasPackage,
     },
     update: {
       amount: chAmt,
       paidAmount: paidAmt,
       fixedShare: parseDecimal(ch.details?.fixed || 0),
       waterShare: parseDecimal(ch.details?.water || 0),
       gasShare: parseDecimal(ch.details?.gas || 0),
       electricityShare: parseDecimal(ch.details?.elec || 0),
       incidentalShare: parseDecimal(ch.details?.incidental || 0),
       specialShare: parseDecimal(ch.details?.specialShare || 0),
       snapshotOccupants: ch.snapshot?.occupants || 0,
       snapshotHasPackage: !!ch.snapshot?.hasPackage,
     }
   });
   ```

---

### 4.3 Recommendation 3: Test Mock Upgrades for Test Suites

In `server/tests/migration.test.ts` and `server/tests/adversarialMigration.test.ts`, update `mockTx` to support `.upsert` and `.deleteMany`:

```typescript
      period: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...data };
          db.periods.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { complexId, type, year, month } = where.complexId_type_year_month;
          let existing = null;
          for (const p of db.periods.values()) {
            if (p.complexId === complexId && p.type === type && p.year === year && p.month === month) {
              existing = p;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.periods.set(existing.id, updated);
            return updated;
          }
          const record = { id: `prd-${Date.now()}-${Math.random()}`, ...create };
          db.periods.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async ({ where }) => {
          for (const [id, p] of db.periods.entries()) {
            if (!where?.complexId || p.complexId === where.complexId) {
              db.periods.delete(id);
            }
          }
        }),
        findMany: vi.fn(async () => Array.from(db.periods.values()))
      },
      unitCharge: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `chg-${Date.now()}-${Math.random()}`, ...data };
          db.unitCharges.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { periodId, unitId } = where.periodId_unitId;
          let existing = null;
          for (const ch of db.unitCharges.values()) {
            if (ch.periodId === periodId && ch.unitId === unitId) {
              existing = ch;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.unitCharges.set(existing.id, updated);
            return updated;
          }
          const record = { id: `chg-${Date.now()}-${Math.random()}`, ...create };
          db.unitCharges.set(record.id, record);
          return record;
        }),
        findMany: vi.fn(async () => Array.from(db.unitCharges.values()))
      },
      ledgerTransaction: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...data };
          db.transactions.set(record.id, record);
          return record;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const { transactionId } = where;
          let existing = null;
          for (const tx of db.transactions.values()) {
            if (tx.transactionId === transactionId) {
              existing = tx;
              break;
            }
          }
          if (existing) {
            const updated = { ...existing, ...update };
            db.transactions.set(existing.id, updated);
            return updated;
          }
          const record = { id: `tx-${Date.now()}-${Math.random()}`, ...create };
          db.transactions.set(record.id, record);
          return record;
        }),
        deleteMany: vi.fn(async ({ where }) => {
          for (const [id, tx] of db.transactions.entries()) {
            if (!where?.complexId || tx.complexId === where.complexId) {
              if (!where.transactionId?.startsWith || tx.transactionId.startsWith(where.transactionId.startsWith)) {
                db.transactions.delete(id);
              }
            }
          }
        }),
        findMany: vi.fn(async () => Array.from(db.transactions.values()))
      },
```

---

## 5. Verification Method

To independently verify the remediated code after implementation by Worker:

1. **Verify Cross-Tenant Guard**:
   Add test in `server/tests/adversarialMigration.test.ts`:
   ```typescript
   it('ADV-5.4: Manager of Complex A cannot migrate into Complex B (HTTP 403 Forbidden)', async () => {
     const res = await server.inject({
       method: 'POST',
       url: '/api/v1/complexes/cpx-different-tenant/migrate',
       headers: {
         authorization: `Bearer ${managerToken}`, // managerToken.complexId === 'cpx-adv-test'
         'x-complex-id': 'cpx-adv-test'
       },
       payload: {
         initialFund: 0,
         units: [{ vahed: 1, metraj: 80 }],
         periods: []
       }
     });

     expect(res.statusCode).toBe(403);
     expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
     expect(res.json().type).toBe('https://api.parsbuilding.com/errors/forbidden');
     expect(res.json().detail).toMatch(/Cross-tenant migration forbidden/i);
   });
   ```

2. **Verify Idempotent Re-Migration**:
   Add test in `server/tests/adversarialMigration.test.ts`:
   ```typescript
   it('ADV-2.3: Re-running migration for same complex is completely idempotent and does not duplicate periods or transactions', async () => {
     const complexId = 'adv-idempotent-cpx';
     const payload = {
       initialFund: 5_000_000,
       expectedEndingFund: 7_000_000,
       units: [{ vahed: 1, metraj: 100, balance: -500_000 }],
       periods: [
         {
           title: 'دوره اول',
           year: 1403,
           month: '01',
           totalExpenses: 1_000_000,
           payments: [{ amount: 3_000_000 }]
         }
       ]
     };

     // First execution
     const res1 = await migrationService.executeMigration(complexId, payload as any);
     expect(res1.success).toBe(true);

     // Second execution (same payload)
     const res2 = await migrationService.executeMigration(complexId, payload as any);
     expect(res2.success).toBe(true);

     // Check DB counts: Exactly 1 period, 1 unit, 1 resident, 1 payment transaction
     const periods = Array.from(db.periods.values()).filter(p => p.complexId === complexId);
     const units = Array.from(db.units.values()).filter(u => u.complexId === complexId);
     const txs = Array.from(db.transactions.values()).filter(t => t.complexId === complexId);

     expect(periods.length).toBe(1);
     expect(units.length).toBe(1);
     expect(txs.length).toBe(1);
   });
   ```

3. **Execute Full Project Test Suites**:
   ```cmd
   cmd /c "cd server && npm run typecheck"
   cmd /c "cd server && npm run build"
   cmd /c "cd server && npm test"
   cmd /c "cd tests_e2e && npm test"
   ```
   *Expected Result*: 0 type errors, clean build, 100% green test passes across all suites (16 test files, 163+ server tests, 214 E2E tests).
