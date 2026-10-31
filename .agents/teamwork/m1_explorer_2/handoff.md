# Handoff Report: Milestone 1 Multi-Tenant Prisma Schema & Tenant Isolation Architecture

**Agent:** `m1_explorer_2` (Role: M1 Database Schema Explorer)  
**Recipient:** Orchestrator (`748ca4e1-43f0-41a9-ac48-b939be1d06a0`)  
**Workspace:** `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_2\`  
**Target Milestone:** M1 — Foundation & Database Architecture  
**Artifact Generated:** `m1_schema_plan.md`  

---

## 1. Observation

1. **Absence of Server-Side Database and Backend Directory:**
   Inspection via `find_by_name` across `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui` revealed 32 client-side files and zero server files. No `server/` directory, no `server/prisma/schema.prisma`, and no backend package manifests exist yet.
2. **Existing Client-Side Data Structure & Hardcoded Single-Tenant State:**
   - In `js/state.js:3`: `db = { units: [], periods: [], initialFund: 0 }`.
   - In `js/app.js:342-358`: default initialization creates 20 units without tenant identifier:
     ```javascript
     for (let i = 1; i <= 20; i++) {
         db.units.push({ id: i, name: '', occupants: 0, occType: 'owner', ownerName: '', ownerPhone: '', tenantPhone: '', hasPackage: false, transactions: [] });
     }
     ```
   - In `js/reports.js:302-350` and `js/logic.js:50-108`: Ledger transactions are stored locally with fields `id`, `transactionId`, `periodId`, `txKind`, `date`, `type`, `amount`, `desc`.
3. **Missing Critical Accounting & Legal Fields in Existing Code:**
   In `explorer_survey_calculations/survey_report.md:126`: "فیلد متراژ در مدل واحد (`u.area`) یا فرمول‌ها وجود ندارد. عدم انطباق بحرانی: هیچ فرمولی بر پایه مساحت برای هزینه‌های استهلاک، بیمه و نوسازی پیاده نشده است." (Iranian Condominium Law Article 4 requires area-based apportionment).
4. **Mandated Interface & Isolation Contracts:**
   - `PROJECT.md:108-117` mandates the `TenantContext` contract:
     ```typescript
     export interface TenantContext {
       complexId: string;
       buildingId?: string;
       userId: string;
       role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
       permissions: string[];
     }
     ```
   - `PROJECT.md:120-132` mandates append-only audit logging:
     ```typescript
     export interface AuditLogEntry {
       complexId: string;
       actorId: string;
       action: string;
       entityType: string;
       entityId: string;
       ipAddress?: string;
       beforeDelta?: Record<string, any>;
       afterDelta?: Record<string, any>;
       timestamp: Date;
     }
     ```

---

## 2. Logic Chain

1. **From Observation 1 & 2 to Schema Architecture:**
   Because the system currently operates on an unauthenticated, single-tenant in-memory/IndexedDB model, migrating to a commercial SaaS platform requires an explicit root tenant entity (`Complex`) that anchors all data.
2. **From Observation 2 & Mandatory Instructions to Row-Level Multi-Tenancy:**
   To guarantee absolute data isolation while preserving high database connection efficiency with connection poolers (PgBouncer/Supavisor), every tenant-specific entity must declare a mandatory `complexId` foreign key referencing `Complex.id` with `onDelete: Cascade`.
3. **From Observation 3 to Model Field Additions:**
   To satisfy Article 4 of the Iranian Condominium Law and the new calculation engine contract (`UnitData.area`), `Unit` must store `area Decimal @default(0) @db.Decimal(8, 2)` and `Period` must support `areaExpenseTotal Decimal @default(0) @db.Decimal(12, 2)`, with `UnitCharge` preserving historical calculations via `snapshotArea` and `areaShare`.
4. **From Observation 4 to Tenant Isolation Design:**
   Passing `complexId` manually in every single service function is error-prone. By combining `AsyncLocalStorage` with a Prisma Client Extension (`$extends`), the application automatically injects `where: { complexId }` on all read/write queries, completely blocking accidental cross-tenant data leaks.
5. **From Accounting Immutability Requirements to Referential Integrity Rules:**
   Financial records (`LedgerTransaction`) and audit trails (`AuditLog`) must NEVER be deleted when a user is deactivated or deleted. Therefore, `createdById` and `actorId` must use `onDelete: SetNull`, while `REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC` in PostgreSQL enforces an append-only ledger.

---

## 3. Caveats

1. **PostgreSQL Version Requirement:** The proposed schema requires PostgreSQL 14+ for optimal JSONB diffing and UUID native functions.
2. **SUPER_ADMIN Tenant Impersonation:** Platform Super-Admins have a nullable `complexId` in the `User` table; when querying a specific complex, they must pass the `x-tenant-id` header to populate the `tenantContext`.
3. **Direct Database Migration Pre-requisite:** The schema plan provides the target blueprint; actual file creation of `server/prisma/schema.prisma` and running `prisma db push` or `prisma migrate dev` will be executed during Milestone 1 implementation turns.

---

## 4. Conclusion

The multi-tenant PostgreSQL schema design and tenant isolation architecture are fully defined and documented in `m1_schema_plan.md`:
- **15 Production Models:** `Complex`, `Building`, `User`, `RefreshToken`, `SubManagerPermission`, `Unit`, `Resident`, `UnitResident`, `Period`, `PeriodCustomUnit`, `UnitCharge`, `LedgerTransaction`, `AuditLog`, `ChatMessage`, `ReceiptVerification`.
- **Row-Level Segregation:** `complexId` enforced on all 12 tenant-owned models with composite performance indexing and foreign key constraints.
- **Robust Financial Data Types:** High-precision `Decimal(12, 2)` and `Decimal(14, 2)` to eliminate floating-point drift and support zero-loss integer math.
- **Complete Isolation Blueprint:** Ready-to-implement `AsyncLocalStorage` context manager and Prisma Client `$extends` middleware.

---

## 5. Verification Method

1. **Schema Syntax Verification:**
   Inspect `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_2\m1_schema_plan.md` (Section 2). Once the backend directory is initialized, verify with:
   ```powershell
   npx prisma validate --schema=server/prisma/schema.prisma
   npx prisma format --schema=server/prisma/schema.prisma
   ```
2. **Constraint & Index Coverage Check:**
   Verify that composite indexes match high-traffic queries:
   - `Unit`: `@@unique([complexId, unitNumber])`, `@@index([complexId])`
   - `Period`: `@@index([complexId, status, year, month])`
   - `UnitCharge`: `@@unique([periodId, unitId])`, `@@index([complexId, unitId])`
   - `LedgerTransaction`: `@@index([complexId, unitId, date])`, `@@index([transactionId])`
   - `AuditLog`: `@@index([complexId, createdAt])`, `@@index([entityType, entityId])`
3. **Invalidation Conditions:**
   The specification is invalidated if any tenant model omits `complexId`, if financial transactions can be cascade-deleted upon user deletion, or if the calculation engine requires unit attributes not represented in `Unit` or `UnitCharge`.
