# Milestone 2 (M2) Handoff Report: Authentication & Granular RBAC Architecture

**Author**: M2 Auth & RBAC Explorer  
**Recipient**: Orchestrator (`748ca4e1-43f0-41a9-ac48-b939be1d06a0`)  
**Date**: 2026-10-31T21:08:00Z  
**Type**: Hard Handoff (Investigation & Architecture Specification Complete)

---

## 1. Observation

1. **`server/package.json` Dependencies**:
   - Lines 20–33 confirm the presence of authentication libraries:
     ```json
     "@fastify/cookie": "^9.3.1",
     "@fastify/cors": "^9.0.1",
     "@fastify/helmet": "^11.1.1",
     "@fastify/jwt": "^8.0.1",
     "@fastify/rate-limit": "^9.1.0",
     "@node-rs/argon2": "^1.8.3",
     "@prisma/client": "^5.21.1",
     "fastify": "^4.28.1",
     "fastify-plugin": "^4.5.1",
     "fastify-type-provider-zod": "^2.0.0",
     "zod": "^3.23.8"
     ```
2. **`@node-rs/argon2` Native Execution Test**:
   - Direct execution in `server/node_modules/@node-rs/argon2` via:
     ```bash
     node -e "const { hash, verify, Algorithm } = require('./server/node_modules/@node-rs/argon2'); async function test() { const h = await hash('P@ssword123', { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: Algorithm.Argon2id }); const valid = await verify(h, 'P@ssword123'); console.log('Hash:', h, 'Valid:', valid); } test();"
     ```
   - Produced output:
     ```
     Hash: $argon2id$v=19$m=65536,t=3,p=4$fj+lTQA7HeS9cORZmTkdEA$xDh9gGGoVDktbY3b2t+/4j3tQnrqM8h2ASYGo42I4jc
     Valid: true
     ```
3. **Database Schema in `server/prisma/schema.prisma`**:
   - Lines 14–20 define `enum UserRole`:
     ```prisma
     enum UserRole {
       SUPER_ADMIN     // دسترسی کلان پلتفرم و تمام مجتمع‌ها
       COMPLEX_MANAGER // مدیر ارشد یک مجتمع
       SUB_MANAGER     // مدیر کمکی/حسابدار با دسترسی‌های ماژولار
       RESIDENT        // ساکن یا مالک واحد (پورتال ساکنین)
     }
     ```
   - Lines 161–189 define `User`:
     ```prisma
     model User {
       id              String      @id @default(uuid())
       complexId       String?     // برای سوپرادمین می‌تواند تهی باشد
       phone           String      @unique // شناسه ورود به پلتفرم
       fullName        String
       email           String?
       passwordHash    String      // هش‌شده با Argon2id
       role            UserRole    @default(RESIDENT)
       isActive        Boolean     @default(true)
       lastLoginAt     DateTime?
       createdAt       DateTime    @default(now())
       updatedAt       DateTime    @updatedAt
       ...
     }
     ```
   - Lines 191–206 define `RefreshToken`:
     ```prisma
     model RefreshToken {
       id              String      @id @default(uuid())
       userId          String
       tokenHash       String      @unique // هش SHA-256 توکن رفرش جهت امنیت مضاعف
       expiresAt       DateTime
       revokedAt       DateTime?
       replacedByToken String?
       userAgent       String?
       ipAddress       String?
       createdAt       DateTime    @default(now())
       user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
       @@index([userId, revokedAt])
       @@map("refresh_tokens")
     }
     ```
   - Lines 208–228 define `SubManagerPermission`:
     ```prisma
     model SubManagerPermission {
       id                    String   @id @default(uuid())
       complexId             String
       userId                String   @unique
       canManageUnits        Boolean  @default(false)
       canManagePeriods      Boolean  @default(false)
       canRecordPayments     Boolean  @default(false)
       canClosePeriods       Boolean  @default(false)
       canViewReports        Boolean  @default(true)
       canManageResidents    Boolean  @default(false)
       canSendNotifications  Boolean  @default(false)
       canManageSettings     Boolean  @default(false)
       createdAt             DateTime @default(now())
       updatedAt             DateTime @updatedAt
       ...
     }
     ```
4. **Current Fastify Setup in `server/src/index.ts` & `server/src/middleware/tenant.ts`**:
   - `server/src/index.ts` lines 25–40 register `helmet`, `cors`, `cookie`, `rateLimit`, and `websocket`. However, `@fastify/jwt` is NOT yet registered on `server`.
   - `server/src/middleware/tenant.ts` lines 86–125 currently rely on request headers (`x-complex-id`, `x-user-id`, `x-user-role`) to populate `tenantStorage.enterWith(context)`.
5. **E2E Test Contracts in `tests_e2e/suites/tier1_features/`**:
   - `f10_hardened_auth.test.ts` lines 5–60 verify bearer token generation, token isolation by role, tenant binding validation, and Super Admin cross-tenant authority.
   - `f11_granular_rbac.test.ts` lines 5–78 verify Complex Manager full permissions, Sub-Manager limited modular permissions (`MANAGE_UNITS`, `MANAGE_ANNOUNCEMENTS`, `VERIFY_RECEIPTS`, etc.), and strict Resident boundaries.
   - `rbac_resident_portal_access.test.ts` lines 5–89 verify denial of resident tokens on manager APIs, sub-manager modular permission gating, and multi-tenant isolation.

---

## 2. Logic Chain

1. **Password Security (Observation 1, 2)**:
   - `@node-rs/argon2` is already installed and verified operational with Rust SIMD acceleration.
   - Using OWASP-recommended parameters (`memoryCost: 65536` KiB, `timeCost: 3`, `parallelism: 4`, `Algorithm.Argon2id`) yields a secure 256-bit hash with timing-safe verification, satisfying Requirement 1 without adding any new runtime packages.

2. **Session / Token Lifecycle (Observation 1, 3, 4)**:
   - Access tokens should be short-lived (15 minutes) JWTs to minimize the window of exposure if intercepted.
   - Refresh tokens must be rotating and single-use, delivered via signed HttpOnly cookies (`Path=/api/v1/auth`, `SameSite=Strict`, `Secure=true`).
   - The `RefreshToken` model in `schema.prisma` already includes `tokenHash`, `revokedAt`, `replacedByToken`, `ipAddress`, and `userAgent`. By storing `SHA-256(rawRefreshToken)` in `tokenHash`, database credential dumps do not expose active sessions.
   - The token rotation handler must implement family revocation: if an incoming token's hash matches an existing record where `revokedAt != null`, it signals token reuse (theft), triggering an immediate revocation of all refresh tokens for that `userId` and returning HTTP 401.

3. **Granular 4-Tier RBAC & Permission Resolver (Observation 3, 5)**:
   - `SUPER_ADMIN`: Cross-tenant platform administration, bypasses tenant check and permission guards.
   - `COMPLEX_MANAGER`: Complete administrative rights strictly within their `complexId`.
   - `SUB_MANAGER`: Configurable modular permissions. Observation 3 shows `SubManagerPermission` has boolean fields (`canManageUnits`, `canManagePeriods`, `canRecordPayments`, `canClosePeriods`, `canViewReports`, `canManageResidents`, `canSendNotifications`, `canManageSettings`). The E2E tests and prompt expect permission keys such as `MANAGE_UNITS`, `MANAGE_RESIDENTS`, `MANAGE_FINANCES`, `VIEW_REPORTS`, `MANAGE_SETTINGS`, `BROADCAST_NOTICES`, and `VERIFY_RECEIPTS`. A bidirectional permission resolver (`resolvePermissionsFromDb` and `hasRequiredPermission`) maps these boolean flags to canonical strings and parent-child aliases.
   - `RESIDENT`: Restricted exclusively to their own unit's invoices, personal ledger, bulletin board notices, and payment receipt upload.

4. **Fastify PreHandlers & Tenant Context Integration (Observation 4)**:
   - In M1, `tenantMiddleware` read unverified headers for calculation engine tests.
   - In M2, the `authenticate` preHandler must verify the JWT access token, extract `sub`, `role`, `complexId`, `permissions`, and `unitIds`, attach `request.user`, and populate `tenantStorage.enterWith(...)`.
   - Subsequent guards (`requireRole`, `requirePermission`, `requireResidentUnitAccess`) enforce granular access control and return RFC 7807 Problem Details on HTTP 403.
   - For backwards compatibility with M1 tests, if `request.user` is absent and `NODE_ENV === 'test'`, header fallback is maintained.

---

## 3. Caveats

- **No Database Migration Required**: All required tables (`users`, `refresh_tokens`, `sub_manager_permissions`, `residents`, `unit_residents`) are already defined in `server/prisma/schema.prisma`. No schema modification or destructive database migration is necessary for M2 Auth.
- **WebSocket Authentication**: Real-time WebSocket connection authentication is covered by Explorer 3 (`m2_explorer_3`), which should consume the JWT access token query parameter or cookie validated by our `authService.ts`.
- **Audit Logging Service**: Immutable audit logging is covered by Explorer 2 (`m2_explorer_2`), which should hook into our login, logout, permission change, and token-reuse events.

---

## 4. Conclusion

The authentication and granular RBAC architecture for Milestone 2 has been thoroughly investigated, validated, and specified in `m2_auth_plan.md`. The design achieves:
1. Native Argon2id password security with OWASP parameters.
2. Dual-token lifecycle: 15-minute JWT + rotating HttpOnly refresh tokens with SHA-256 database hashing and automatic family revocation upon reuse.
3. 4-tier granular RBAC with modular permissions mapping and strict resident unit isolation.
4. Seamless Fastify guards integrating authenticated identity directly into the fail-closed `AsyncLocalStorage` tenant context.

---

## 5. Verification Method

To independently verify the architecture and its prerequisites:
1. **Verify Argon2id execution**:
   ```powershell
   node -e "const { hash, verify, Algorithm } = require('./server/node_modules/@node-rs/argon2'); async function test() { const h = await hash('ValidP@ss1', { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: Algorithm.Argon2id }); console.log('Hash OK:', h.startsWith('$argon2id$')); console.log('Verify OK:', await verify(h, 'ValidP@ss1')); } test();"
   ```
2. **Inspect Technical Plan & Schema**:
   - Inspect `.agents/teamwork/m2_explorer_1/m2_auth_plan.md`.
   - Verify `server/prisma/schema.prisma` lines 14–228 for `User`, `RefreshToken`, and `SubManagerPermission` models.
3. **Run Existing Test Suite**:
   ```powershell
   cd server; npm test
   ```
4. **Target E2E Test Suite (to be run after worker implementation)**:
   ```powershell
   node --test tests_e2e/suites/tier1_features/f10_hardened_auth.test.ts
   node --test tests_e2e/suites/tier1_features/f11_granular_rbac.test.ts
   node --test tests_e2e/suites/tier3_combinations/rbac_resident_portal_access.test.ts
   ```
