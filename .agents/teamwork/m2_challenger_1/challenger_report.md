# Adversarial Security Challenge Report: Milestone 2 (Auth & Granular RBAC)

**Author**: teamwork_challenger (Critic / Security Specialist)
**Date**: 2026-11-01
**Milestone**: M2 (Authentication, Granular RBAC & Security Hardening)
**Explicit Verdict**: **REJECT** (Blocking on Critical Cross-Resident IDOR and Fastify Hook Architecture Defects)

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

Empirical verification confirms that while core cryptographic primitives (Argon2id hashing, timing-safe HMAC-SHA256 signature verification, refresh token reuse family revocation, and basic role hierarchy) are robustly engineered, two critical architectural and security flaws violate tenant/unit boundary isolation and REST client contracts:
1. **Critical IDOR Flaw in Receipt Access (`GET /api/v1/receipts/:id`)**: Resident A in Unit 101 can view private payment receipts and bank transfer slips of Resident B in Unit 202 within the same building/complex.
2. **Hook Execution Precedence Defect in `index.ts`**: The global `tenantMiddleware` executes before route-level `authenticate`, causing all authenticated requests lacking an explicit manual `x-complex-id` header to fail with HTTP 400, ignoring the verified `complexId` claim inside the Bearer JWT.
3. **Rate Limiting Error Translation Defect**: `errorHandler.ts` checks `error.statusCode`, missing `error.status`, which causes rate-limited requests (HTTP 429) on `/api/v1/auth/login` to crash into HTTP 500 Internal Server Error.

---

## Challenges & Empirical Findings

### 1. [CRITICAL] Challenge 1: Cross-Resident Unit Access IDOR Breach in `GET /api/v1/receipts/:id`

- **Assumption challenged**: The system enforces that residents have access only to their own personal statements, ledger, and uploaded documents.
- **Attack scenario**: Resident Alice (assigned solely to Unit 101) issues a `GET` request to `/api/v1/receipts/<receipt_id_of_bob>`, where Bob lives in Unit 202 in the same complex.
- **Root Cause**: In `server/src/routes/receiptRoutes.ts` (lines 88–90):
  ```typescript
  // Tenant check
  if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
    return reply.code(403).send({ error: 'Forbidden', message: 'عدم دسترسی به فیش مجتمع دیگر' });
  }
  return reply.code(200).send({ receipt });
  ```
  The endpoint checks ONLY that both users share the same `complexId`. It does NOT check whether `request.user.role === 'RESIDENT'` and whether `receipt.uploadedById === request.user.id` or `request.user.unitIds.includes(receipt.unitId)`.
- **Empirical Proof**:
  - Test: `ADV-4.2` in `server/tests/adversarialM2.test.ts`
  - Output: `[ADV-4.2 PROBE RESULT] Cross-Resident Receipt Access: statusCode=200`
  - Resident Alice successfully retrieved Bob's sensitive financial receipt image and payment information!
- **Blast radius**: Complete exposure of tenant payment slips, bank transfer metadata, transaction amounts, and financial status between different residents living in the same apartment building.
- **Mitigation**:
  In `server/src/routes/receiptRoutes.ts`, enforce resident unit isolation before returning the receipt:
  ```typescript
  if (request.user!.role === 'RESIDENT' &&
      receipt.uploadedById !== request.user!.id &&
      !request.user!.unitIds.includes(receipt.unitId)) {
    return reply.code(403).header('Content-Type', 'application/problem+json').send({
      type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
      title: 'Forbidden Unit Access',
      status: 403,
      detail: 'شما فقط مجاز به مشاهده فیش‌های پرداختی واحد خود هستید.'
    });
  }
  ```

---

### 2. [HIGH] Challenge 2: Fastify Hook Precedence Architecture Flaw Breaking Bearer JWT Tenant Extraction

- **Assumption challenged**: A client supplying a valid Bearer JWT access token containing `complexId` has their tenant context safely resolved by `tenantMiddleware`.
- **Attack scenario**: Standard API client sends `GET /api/v1/complex/sub-managers` or `GET /api/v1/audit-logs` with header `Authorization: Bearer <valid_token>`, without passing an out-of-band `x-complex-id` header.
- **Root Cause**:
  In Fastify, global hooks added via `server.addHook('preHandler', tenantMiddleware)` (in `server/src/index.ts:36`) execute **BEFORE** route-level preHandlers (`preHandler: [authenticate, requireRole(...)]`).
  When `tenantMiddleware` executes:
  `request.user` is still `undefined`.
  `tenantMiddleware` checks `if (!complexId && !isPublic)` and rejects the request with HTTP 400 Bad Request (`"Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource"`).
- **Empirical Proof**:
  - In `server/tests/adversarialM2.test.ts`, all calls with valid Bearer tokens to `/api/v1/complex/sub-managers`, `/api/v1/audit-logs`, and `/api/v1/receipts/*` returned HTTP 400 instead of executing RBAC guards unless an explicit `x-complex-id` header was redundantly passed.
- **Blast radius**: Breaks REST API contract standards where Bearer JWT claims identify the authenticated caller and tenant; forces mobile/web frontend to pass duplicate unverified headers.
- **Mitigation**:
  Register `authenticate` as an `onRequest` or global `preHandler` hook before `tenantMiddleware`, or decode/extract claims inside `tenantMiddleware` if `Authorization` header is present.

---

### 3. [MEDIUM] Challenge 3: Rate Limiter Status Translation Defect in Error Handler

- **Assumption challenged**: Rate limiting on `/api/v1/auth/login` returns HTTP 429 Problem Details when limits are exceeded.
- **Attack scenario**: An attacker fires 6 consecutive rapid login requests to `/api/v1/auth/login`.
- **Root Cause**:
  `loginRateLimitConfig` produces an error object `{ type: ..., status: 429, ... }`.
  In `server/src/middleware/errorHandler.ts` (lines 57–59):
  ```typescript
  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;
  ```
  Because the object sets `status: 429` rather than `statusCode: 429`, `errorHandler.ts` falls back to `500 Internal Server Error`.
- **Empirical Proof**:
  - Test: `ATTACK 2.1` in `server/tests/adversarialM2Hardening.test.ts`
  - Output: `attackRes6 status: 500 body: {"statusCode":500,"error":"Internal Server Error"}`
  - Test failed: `expected 500 to be 429`.
- **Blast radius**: Misleading server error telemetry (500 alert spikes in production APM monitoring) during brute force attacks instead of proper HTTP 429 Too Many Requests response.
- **Mitigation**:
  Update `server/src/middleware/errorHandler.ts`:
  ```typescript
  const rawStatus = error.statusCode || (error as any).status;
  const statusCode = rawStatus && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  ```

---

## Adversarial Stress Test Results

| Attack Vector | Target Under Test | Scenario & Input | Expected Result | Actual Result | Status |
|---------------|-------------------|------------------|-----------------|---------------|--------|
| **Expired JWT Token** | `authService.verifyAccessToken` & `/api/v1/auth/me` | JWT issued with `exp: now - 60s` | HTTP 401 Problem Details "Token expired" | HTTP 401 "Token expired" | **PASS** |
| **Payload Tampering** | `authService.verifyAccessToken` | Altered `role: RESIDENT` to `SUPER_ADMIN` | Verification throws "Invalid token signature" | Throws `Invalid token signature`, HTTP 401 | **PASS** |
| **Foreign Secret Signature** | `authService.verifyAccessToken` | Token signed with unknown HMAC secret | Verification throws "Invalid token signature" | Rejected with HTTP 401 | **PASS** |
| **"alg: none" Token** | `authService.verifyAccessToken` | JWT with `alg: none` and empty signature | Immediate rejection | Throws error, HTTP 401 | **PASS** |
| **Malformed Auth Headers** | `rbac.authenticate` | Empty, `Bearer` without space, `Basic`, corrupted b64 | HTTP 401 Unauthorized Problem Details | HTTP 401 across all 7 test cases | **PASS** |
| **Refresh Token Replay Breach** | `authService.rotateRefreshToken` | Present already rotated refresh token (`revokedAt != null`) | Immediate family revocation (all user sessions revoked) & audit alert | All sessions revoked (`updateMany`), audit alert `REFRESH_TOKEN_REUSE_DETECTED` logged, 401 | **PASS** |
| **Replay HTTP Endpoint** | `POST /api/v1/auth/refresh` | HTTP POST with reused refresh token | HTTP 401, session family invalidated | HTTP 401, all active tokens marked revoked | **PASS** |
| **Resident Route Elevation** | `GET, POST, PUT /complex/sub-managers` | Resident Bearer token calling management routes | HTTP 403 Forbidden RFC 7807 | HTTP 403 Forbidden | **PASS** |
| **Sub-Manager Route Elevation** | `GET /complex/sub-managers` | Sub-Manager attempting to view/modify other sub-managers | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **Sub-Manager Financial Mutation** | `rbac.hasRequiredPermission` | Sub-Manager without `MANAGE_FINANCES` attempting ledger mutation | Blocked with HTTP 403 | Evaluates to `false`, HTTP 403 | **PASS** |
| **Resident Unit Upload Access** | `POST /api/v1/receipts/verify` | Resident in Unit 101 uploading receipt for Unit 202 | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **Resident Receipt Inspection IDOR** | `GET /api/v1/receipts/:id` | Resident in Unit 101 requesting receipt of Unit 202 in same complex | HTTP 403 Forbidden | **HTTP 200 OK — Leaks sensitive receipt!** | **FAIL (CRITICAL BUG)** |
| **Fastify Hook Precedence** | `server/src/index.ts` | Bearer token sent without redundant `x-complex-id` header | Extract tenant from user, allow RBAC check | **HTTP 400 Bad Request — Tenant Context Missing** | **FAIL (ARCHITECTURAL BUG)** |
| **Rate Limit Status Code** | `/api/v1/auth/login` | 6th rapid login attempt exceeding 5 req/15min | HTTP 429 Too Many Requests | **HTTP 500 Internal Server Error** | **FAIL (BUG)** |

---

## E2E Test Suite Run Verification

Command executed:
```bash
cd tests_e2e && node --experimental-strip-types --test "suites/tier1_features/f10_hardened_auth.test.ts" "suites/tier1_features/f11_granular_rbac.test.ts" "suites/tier3_combinations/rbac_resident_portal_access.test.ts"
```
Result:
```
▶ Feature 10: Hardened Authentication & JWT Token Management (5 tests) - PASS
▶ Feature 11: Granular Role-Based Access Control (RBAC) (5 tests) - PASS
▶ Tier 3 Combinations: RBAC & Resident Portal Access Security (5 tests) - PASS
ℹ tests 15, suites 3, pass 15, fail 0
```

Tier 5 Adversarial Test Suites:
- `tests_e2e/suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts`: **15 passed, 0 failed**
- `server/tests/adversarialM2.test.ts`: **14 passed (empirically confirming the 200 OK IDOR vulnerability)**

---

## Conclusion & Verdict

**Verdict**: **REJECT**

Milestone 2 cannot be approved in its current state. The implementation provides excellent password hashing, HMAC signature verification, and refresh token family revocation, but **fails on resident unit data isolation (IDOR in `receiptRoutes.ts`)** and **fastify hook execution ordering (bearer tenant context extraction)**.

These issues must be resolved before proceeding to Milestone 3.
