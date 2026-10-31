# Independent Security Review & Adversarial Critique: Milestone 2 (M2)

**Reviewer**: M2 Security & Auth Reviewer (`m2_reviewer_1`)  
**Target Milestone**: M2 — Security Hardening, Authentication, Granular RBAC, Immutable Audit Logging & Real-Time/AI Foundations  
**Verdict**: **APPROVE**  
**Date**: 2026-10-31  

---

## Executive Summary

Milestone 2 implementation has been thoroughly reviewed and independently tested. All cryptographic, authorization, and audit requirements have been rigorously implemented without facades, shortcuts, or integrity violations. The test suites pass 100% (72/72 server unit/integration tests and 187/187 E2E tests). Typecheck (`tsc --noEmit`) and production builds (`rimraf dist && tsc`) execute with zero errors.

---

## 1. Quality & Architectural Review

### 1.1 Hardened Authentication (`server/src/services/authService.ts`)
- **Argon2id Password Hashing**: Conforms strictly to RFC 9106 and OWASP recommendations:
  - `memoryCost: 65536` (64 MiB)
  - `timeCost: 3` (3 iterations)
  - `parallelism: 4` (4 threads)
  - `algorithm: Algorithm.Argon2id` via `@node-rs/argon2`
- **Password Complexity**: Enforces length [8, 128], uppercase, lowercase, numeric digits, and special characters.
- **Phone Normalization**: Correctly converts Persian/Arabic numerals via `toEnDigit`, strips formatting characters, and handles prefixes (`+98`, `0098`, `98`) to normalize to standard Iranian format `09xxxxxxxxx`.
- **JWT Access Tokens**:
  - Signed with HMAC-SHA256 (`alg: HS256`).
  - Short-lived duration of 15 minutes (`expiresInSeconds = 900`).
  - Constant-time verification using `crypto.timingSafeEqual` with buffer length safety checks to prevent timing side-channel attacks.
  - Carries verified claims: `sub`, `phone`, `role`, `complexId`, `permissions`, `unitIds`, and `tokenType: ACCESS`.
- **Refresh Token Rotation & Family Revocation**:
  - Generated using 64 cryptographically secure random bytes (`crypto.randomBytes(64).toString('hex')`).
  - Stored strictly as SHA-256 hashes (`hashTokenSha256`).
  - Atomic rotation executes inside `rawPrisma.$transaction` linking `replacedByToken`.
  - **Automatic Token Reuse Detection (Family Revocation)**: If an already-revoked refresh token is re-submitted, the system flags a security breach, revokes all active sessions for that user family (`rawPrisma.refreshToken.updateMany`), records an audit log alert, and terminates the session with an HTTP 401 error.

### 1.2 Granular RBAC & Tenant Scoping (`server/src/middleware/rbac.ts`)
- **4-Tier Hierarchy**: `SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER`, `RESIDENT`.
- **Dynamic Database Permission Resolution**: Maps `SubManagerPermission` model fields to discrete permission strings (`MANAGE_UNITS`, `MANAGE_RESIDENTS`, `MANAGE_PERIODS`, `RECORD_PAYMENTS`, `CLOSE_PERIODS`, `VIEW_REPORTS`, `BROADCAST_NOTICES`, `MANAGE_SETTINGS`).
- **Permission Alias Expansion**: Implements `PERMISSION_ALIASES` so parent permissions (e.g. `MANAGE_FINANCES`, `VIEW_REPORTS`) automatically satisfy child permissions (`MANAGE_EXPENSES`, `VIEW_AUDIT_LOGS`, `VERIFY_RECEIPTS`).
- **Route Guards**:
  - `authenticate`: Enforces Bearer JWT verification and bridges authenticated user state directly to `tenantStorage.enterWith(...)`.
  - `requireRole`: Validates user role against allowed roles, permitting `SUPER_ADMIN` global bypass.
  - `requirePermission`: Enforces fine-grained permission checks.
  - `requireResidentUnitAccess`: Restricts `RESIDENT` requests strictly to their own assigned `unitIds`.

### 1.3 Immutable Audit Logging (`server/src/services/auditLogger.ts` & `database.ts`)
- Deep before/after delta calculation with field redaction (`server/src/utils/delta.ts`).
- Defense-in-depth immutability: Prisma client extension query interceptor throws `AuditLogImmutableError` (HTTP 403) on any attempt to `update`, `updateMany`, `delete`, `deleteMany`, or `upsert` in `auditLog`.
- `BigInt.prototype.toJSON` polyfill guarantees seamless JSON serialization of 64-bit IDs.

### 1.4 Security Middleware & Sanitization (`server/src/config/security.ts` & `sanitizer.ts`)
- `@fastify/helmet`: nosniff, frameguard DENY, xssFilter.
- `@fastify/rate-limit`: Global 100 req/min with RFC 7807 problem details; route-specific strict login limit of 5 attempts / 15 minutes per IP+Phone composite key.
- `@fastify/cors`: Whitelist validation, multi-tenant wildcard subdomain support, credentials support.
- Sanitizer: Strips dangerous prototype pollution keys (`__proto__`, `constructor`, `prototype`), escapes HTML/script injection vectors, while preserving Persian RTL Unicode characters, numerals, and ZWNJ (`\u200C`).

### 1.5 Real-Time WebSockets & AI Receipt Verification (`realtimeService.ts` & `receiptQueue.ts`)
- Room architecture (`complex:{id}`, `unit:{id}`, `user:{id}`) with tenant authorization in `canSubscribe`.
- Asynchronous AI receipt queue with anti-replay duplicate tracking detection, ledger settlement, and real-time event broadcasting.

---

## 2. Adversarial Critique & Stress-Testing

### Challenge 1: Refresh Token Race Condition & Network Retries
- **Scenario**: A client on a mobile network sends a refresh request. Due to transient latency, the client retries the request before the first response arrives. Both requests carry the same refresh token.
- **Observed Behavior**: The first request rotates the token. The second request presents the now-revoked token, which triggers immediate family breach revocation and invalidates all active sessions.
- **Risk Assessment**: MEDIUM (operational/UX friction on flaky networks; high security posture).
- **Recommendation**: For production SaaS deployments, consider adding a short idempotency grace window (e.g., 5 seconds) during which a duplicate refresh request returns the newly issued successor token rather than immediately invalidating the session.

### Challenge 2: Stateless Access Token Invalidation Window
- **Scenario**: When an administrator revokes a sub-manager or user sessions via `/auth/revoke-all`, the refresh tokens are revoked immediately in PostgreSQL. However, previously issued JWT access tokens remain cryptographically valid until their 15-minute expiration timestamp.
- **Observed Behavior**: The 15-minute access token lifespan limits exposure.
- **Risk Assessment**: LOW to MEDIUM.
- **Recommendation**: For immediate invalidation of access tokens before their 15-minute expiry, introduce a distributed token blacklist (e.g. Redis key `revoked_users:{userId}:{timestamp}`) or version counter in JWT claims during Milestone 3.

### Challenge 3: Super Admin Delegation in Sub-Manager Creation
- **Scenario**: `SUPER_ADMIN` attempts to create a sub-manager via `POST /api/v1/complex/sub-managers`.
- **Observation**: Line 64 in `subManagerRoutes.ts` reads `const complexId = request.user!.complexId`. If a Super Admin possesses a global token where `complexId` is null, the endpoint returns HTTP 400 (`Active complexId is required`).
- **Risk Assessment**: LOW (Complex Managers create their own sub-managers in normal workflows).
- **Recommendation**: Allow `SUPER_ADMIN` to pass `complexId` in the request body or via `x-complex-id` header when delegating sub-managers across complexes.

---

## 3. Verified Claims Matrix

| Claim / Specification | Verification Method | Status |
|-----------------------|---------------------|--------|
| Argon2id OWASP parameters ($m=65536, t=3, p=4$) | Unit test inspection & execution (`authService.test.ts`) | **PASS** |
| Timing-safe password verification | `@node-rs/argon2` verify method inspection | **PASS** |
| Iranian phone normalization (+98, 0098, Arabic/Persian digits) | Unit tests in `authService.test.ts` | **PASS** |
| HMAC-SHA256 JWT access token generation & verification | Constant-time buffer comparison check | **PASS** |
| Refresh token SHA-256 storage | `hashTokenSha256` test and schema validation | **PASS** |
| Family breach revocation on token reuse | Spied unit test in `authService.test.ts` | **PASS** |
| 4-Tier RBAC hierarchy and permission alias expansion | Unit tests in `rbac.test.ts` | **PASS** |
| Resident unit boundary enforcement | Unit test `requireResidentUnitAccess` | **PASS** |
| Immutable audit log query interception | Database extension test in `auditLogger.test.ts` | **PASS** |
| Rate limiting headers & RFC 7807 error format | Fastify injection test in `apiIntegration.test.ts` | **PASS** |
| TypeScript typecheck zero errors | `npm.cmd run typecheck` (`tsc --noEmit`) | **PASS** |
| Production build clean generation | `npm.cmd run build` (`rimraf dist && tsc`) | **PASS** |
| Server unit/integration test suite (72/72) | `npm.cmd test` | **PASS** |
| E2E test suite (187/187) | Node test runner across all test suites | **PASS** |

---

## 4. Integrity Violation Check

- **Hardcoded test results**: None found. Real cryptographic primitives and dynamic calculations are executed.
- **Dummy / facade implementations**: None. All services implement full business logic.
- **Shortcuts / task bypasses**: None. All required models, routes, and middlewares are present.
- **Fabricated verification outputs**: None. All test outputs independently verified and reproduced.
- **Self-certifying work**: None. Independent test runners confirm system invariants.

---

## 5. Review Verdict

**VERDICT**: **APPROVE**  
Milestone 2 meets all functional, security, and architectural criteria specified in `ORIGINAL_REQUEST.md` and `PROJECT.md`. Proceed to Milestone 3.
