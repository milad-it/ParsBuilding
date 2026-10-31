# Handoff Report: Milestone 2 (M2) Immutable Audit Logging & Security Hardening

**Author**: M2 Audit & Security Explorer (`m2_explorer_2`)  
**Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_explorer_2\`  
**Milestone**: M2 Security Hardening, Authentication, RBAC, Audit Logging & Extensibility  
**Handoff Type**: Hard (Investigation & Technical Specification Complete)  

---

## 1. Observation

1. **Database Schema & Prisma Model**:
   - `server/prisma/schema.prisma` lines 466–493 defines `model AuditLog`:
     ```prisma
     model AuditLog {
       id              BigInt          @id @default(autoincrement())
       complexId       String?         // برای رخدادهای کلان پلتفرم می‌تواند null باشد
       actorId         String?         // کاربری که عملیات را انجام داده
       actorRole       String?         // نقش کاربر در لحظه رخداد
       ipAddress       String?
       userAgent       String?
       action          AuditAction
       entityType      String          // نام موجودیت (مانند "Period", "UnitCharge", "LedgerTransaction")
       entityId        String          // شناسه رکورد تحت تغییر
       oldData         Json?           // اسنپ‌شات داده قبل از تغییر
       newData         Json?           // اسنپ‌شات داده بعد از تغییر
       diff            Json?           // تفاوت خالص فیلدها (Delta)
       metadata        Json?           // اطلاعات تکمیلی محیطی
       createdAt       DateTime        @default(now())
       complex         Complex?        @relation(fields: [complexId], references: [id], onDelete: Cascade)
       actor           User?           @relation("ActorAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)
       @@index([complexId, createdAt])
       @@index([entityType, entityId])
       @@index([actorId])
       @@map("audit_logs")
     }
     ```
   - `AuditAction` enum at lines 79–91 contains:
     ```prisma
     enum AuditAction {
       CREATE, UPDATE, DELETE, LOGIN, LOGOUT, START_PERIOD, CLOSE_PERIOD, SETTLE_DEBT, PERMISSION_CHANGE, DATA_EXPORT, MIGRATION
     }
     ```
   - In `AuditLog`, `id` is typed as `BigInt`. Standard V8 `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt` unless custom serialization or string conversion is applied.

2. **Existing Prisma Extension Interceptor**:
   - `server/src/config/database.ts` lines 10–24 specifies `TENANT_MODELS`:
     ```typescript
     export const TENANT_MODELS = [
       'building', 'unit', 'resident', 'unitresident', 'period', 'periodcustomunit',
       'unitcharge', 'ledgertransaction', 'auditlog', 'chatmessage', 'receiptverification',
       'submanagerpermission', 'user'
     ] as const;
     ```
   - Lines 50–273 intercept `findMany`, `findFirst`, `findUnique`, `create`, `update`, `delete`, etc. While `auditlog` is included in `TENANT_MODELS` to enforce `complexId` filtering, `update`, `updateMany`, `delete`, and `deleteMany` are currently **not** unconditionally blocked for `auditlog`.

3. **Current Fastify Security Plugins**:
   - `server/package.json` lines 19–33 confirms all required security dependencies are already installed:
     - `@fastify/rate-limit`: `^9.1.0`
     - `@fastify/helmet`: `^11.1.1`
     - `@fastify/cors`: `^9.0.1`
     - `fastify`: `^4.28.1` (which bundles `secure-json-parse` version `^2.7.0`)
     - `zod`: `^3.23.8`
   - `server/src/index.ts` lines 24–38 currently registers security plugins in basic form:
     ```typescript
     // Security middlewares
     await server.register(helmet, { contentSecurityPolicy: false });
     await server.register(cors, {
       origin: env.CORS_ORIGIN.split(','),
       credentials: true,
       methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
     });
     await server.register(cookie, {
       secret: env.COOKIE_SECRET,
       hook: 'onRequest'
     });
     await server.register(rateLimit, {
       max: 100,
       timeWindow: '1 minute'
     });
     ```
   - Notice: Helmet has CSP disabled (`contentSecurityPolicy: false`); CORS uses a simple string split without regex subdomain matching; Rate-limit has a single global limit (100 req/min) with no dedicated protection against brute-force attacks on `/auth/login`.

4. **Existing E2E Test Invariants**:
   - `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` tests:
     - `T1.12.1`: Unit creation records `CREATE_UNIT` with `afterDelta.unitNumber`.
     - `T1.12.2`: Unit update records `UPDATE_UNIT` with `beforeDelta.occupants` and `afterDelta.occupants`.
     - `T1.12.3`: Period closing records `CLOSE_PERIOD` with financial snapshot (`afterDelta.totalExpenses`).
     - `T1.12.4`: Payment transaction records `RECORD_PAYMENT` with `afterDelta.amount` and `actorId`.
     - `T1.12.5`: Audit logs strictly isolated by `complexId`.
   - `tests_e2e/suites/tier1_features/f13_security_hardening.test.ts` tests:
     - `T1.13.1`: Sanitizing SQL injection patterns in numeric inputs (`"101' OR '1'='1"`).
     - `T1.13.2`: Neutralizing XSS script payloads while preserving Persian text and digits.
     - `T1.13.3`: Rejection of out-of-range negative expenses.
     - `T1.13.4`: Memory DOS prevention on oversized strings (10,000-char input normalized in $<200\text{ms}$).
     - `T1.13.5`: Null bytes (`\u0000`) and control characters parsed cleanly without corruption.
   - `tests_e2e/suites/tier3_combinations/audit_security_sanitization.test.ts` tests:
     - `T3.5.1`: Preserving Persian Unicode with ZWNJ (`'دکتر علیرضا میرزایی‌زاده'`) in audit logs.
     - `T3.5.4`: Monotonically non-decreasing timestamps for append-only audit trail.

---

## 2. Logic Chain

1. **Mapping and Audit Representation**:
   - From Observation 1, the Prisma `AuditLog` model contains `oldData`, `newData`, `diff`, `actorId`, `complexId`, `action`, `entityType`, `entityId`, `ipAddress`, `userAgent`, and `createdAt`.
   - Therefore, `AuditLogEntry` contract from `PROJECT.md` maps directly by routing `beforeDelta -> oldData`, `afterDelta -> newData`, and `timestamp -> createdAt`.
   - BigInt `id` must have a `.toJSON()` prototype handler or string casting before REST serialization to prevent runtime 500 errors.

2. **Immutable Guarantees (Zero UPDATE/DELETE)**:
   - From Observation 2, `database.ts` currently allows `update` and `delete` on `auditlog` if within tenant context.
   - A multi-tenant SaaS requires defense-in-depth:
     - **Layer 1 (ORM/Application)**: Add explicit interceptor in Prisma `$extends` query handlers specifically targeting model `auditLog` to throw `AuditLogImmutableError` whenever `update`, `updateMany`, `delete`, `deleteMany`, or `upsert` is invoked.
     - **Layer 2 (PostgreSQL Engine)**: Deploy a database trigger (`BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs`) that raises exception SQLSTATE `55000`. This guarantees zero modification even if raw SQL is executed by an attacker.
     - **Layer 3 (Database Permissions)**: Revoke `UPDATE`, `DELETE`, `TRUNCATE` privileges on `audit_logs` from the application database role in production.

3. **Rate Limiting Hardening**:
   - From Observation 3, the current rate limiter permits 100 requests per minute globally.
   - Brute-force attacks on `/api/v1/auth/login` can attempt 6,000 passwords per hour under this threshold.
   - Therefore, a route-scoped rate limit of 5 requests per 15 minutes keyed on `IP:phone` must be registered on the login endpoint, formatted in RFC 7807 (`application/problem+json`) with standard 429 status and `Retry-After`.

4. **HTTP Headers & CORS Hardening**:
   - From Observation 3, Helmet currently disables CSP, and CORS lacks wildcard prohibition verification.
   - For a production SaaS with Three.js 3D elements and Persian RTL typography, Helmet must enforce HSTS (1 year), frameguard `DENY`, nosniff, and a custom CSP that allows `blob:` and `data:` for Three.js shaders and CDNs for Vazirmatn fonts while denying iframe framing (`frame-ancestors: 'none'`).
   - CORS must dynamically validate origin against tenant domain patterns (e.g. `*.parsbuilding.ir`) and reject wildcard `*` whenever `credentials: true`.

5. **Input Sanitization**:
   - From Observation 4, user inputs can carry XSS, prototype pollution, or SQL injection vectors.
   - Fastify's native `secure-json-parse` strips/rejects `__proto__` and `constructor` keys.
   - An XSS sanitizer must escape HTML control characters while strictly preserving Persian Unicode text, ZWNJ (`\u200C`), and Persian numerals.
   - Prisma's query engine parameterizes all queries; `prisma.$queryRawUnsafe` must be strictly forbidden to guarantee zero SQL injection vulnerabilities.

---

## 3. Caveats

1. **BigInt Serialization**: Any custom query returning `AuditLog` records directly must serialize `id` as `String(id)` unless the global `(BigInt.prototype as any).toJSON` polyfill is active in `server/src/index.ts`.
2. **Database Triggers in SQLite / Test Environments**: PostgreSQL triggers (`PL/pgSQL`) are specific to PostgreSQL. In unit tests running against in-memory SQLite or mock clients, Layer 1 (Prisma Client Extension) acts as the primary barrier.
3. **No Modification to Application Code**: Per Teamwork Explorer read-only instructions, no application code was modified during this phase. All code blueprints and SQL scripts are documented in `m2_audit_security_plan.md`.

---

## 4. Conclusion

The M2 Immutable Audit Logging and Security Hardening requirements have been thoroughly explored, designed, and specified in `m2_audit_security_plan.md`. The design guarantees:
- A fully typed, transactional `AuditLogger` service (`server/src/services/auditLogger.ts`) capturing auth, financial transactions, CRUD operations, and permission changes with delta diffing and credential redaction.
- Unconditional Zero UPDATE/DELETE enforcement across 4 defense layers (Prisma extension, PostgreSQL triggers, DB role grants, hash chaining).
- Comprehensive security hardening across Fastify plugins (rate-limiting brute-force guard on `/auth/login`, Helmet HTTP headers with 3D/SPA CSP, robust CORS with multi-tenant subdomain matching, and input sanitizers for XSS, prototype pollution, and SQLi).

---

## 5. Verification Method

To verify the implementation once coded by worker agents:

1. **E2E Feature Test Verification**:
   ```bash
   cd "d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\tests_e2e"
   node --test suites/tier1_features/f12_immutable_audit_logging.test.ts
   node --test suites/tier1_features/f13_security_hardening.test.ts
   node --test suites/tier3_combinations/audit_security_sanitization.test.ts
   ```
2. **Server Unit & Fastify Integration Tests**:
   ```bash
   cd "d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server"
   npm test
   ```
3. **Adversarial Immutability Verification**:
   - Call `prisma.auditLog.delete({ where: { id: 1n } })` and assert it throws `AuditLogImmutableError`.
   - Call `prisma.auditLog.update({ where: { id: 1n }, data: { action: 'UPDATE' } })` and assert it throws `AuditLogImmutableError`.
   - Execute raw SQL `DELETE FROM audit_logs` against PostgreSQL and assert trigger error `55000`.
4. **Brute Force Verification**:
   - Send 6 sequential POST requests to `/api/v1/auth/login` with invalid credentials from the same IP/phone; assert the 6th response returns HTTP 429 with `application/problem+json` and `retryAfter`.
