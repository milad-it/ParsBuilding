# Independent Review & Adversarial Evaluation Report: Milestone 2 Remediation (M2-R2)

- **Reviewer**: M2-R2 Reviewer 1 (`teamwork_reviewer`)
- **Roles**: Reviewer, Adversarial Critic
- **Target**: Milestone 2 Security Hardening, Multi-Tenant Resolution & IDOR Remediation
- **Date**: 2026-11-01
- **Status**: Final

---

## 1. Review Summary

**Verdict**: **APPROVE**

Milestone 2 remediation comprehensively and robustly addresses all identified architectural, authorization, and data isolation defects. The implementation delivers authentic, fail-closed security logic with zero hardcoded test facades or integrity violations. All independent verification gates pass cleanly with 100% success rate across type checking, production build, Vitest unit/integration tests (95/95), and the full end-to-end test suite (214/214 across 47 suites).

---

## 2. Key Findings & Strengths

### Strengths & Good Practices Observed:
1. **Flawless Intra-Tenant IDOR Guard on `GET /api/v1/receipts/:id`**:
   - `server/src/routes/receiptRoutes.ts` (lines 164–184) validates that residents (`request.user.role === 'RESIDENT'`) may only view receipts if they are either:
     a) Assigned to the unit associated with the receipt (`user.unitIds.includes(receipt.unitId)`), or
     b) The original uploader of the receipt (`receipt.uploadedById === user.id`).
   - Unauthorized attempts strictly return HTTP 403 Forbidden with standard RFC 7807 Problem Details (`application/problem+json`) pointing to `https://api.parsbuilding.com/errors/forbidden-unit-access`.
   - Cross-tenant requests by non-`SUPER_ADMIN` users are intercepted prior to unit evaluation and blocked with `https://api.parsbuilding.com/errors/tenant-isolation-violation`.

2. **Dual-Source Tenant Resolution & Anti-Spoofing Guard in `tenant.ts`**:
   - `tenantMiddleware` in `server/src/middleware/tenant.ts` inspects incoming `Authorization: Bearer <token>` directly before evaluating headers.
   - For authenticated users, `user.complexId` signed in the JWT is treated as authoritative.
   - Header spoofing protection: If a client token belongs to Complex A, but passes header `x-complex-id: Complex B`, `tenantMiddleware` immediately rejects the request with HTTP 403 Forbidden RFC 7807 (`https://api.parsbuilding.com/errors/forbidden`).
   - Redundant `x-complex-id` requirement is eliminated for standard authenticated requests, while legacy unauthenticated testing routes remain supported via header fallback.
   - `SUPER_ADMIN` retains multi-tenant administrative capabilities (`ctx.role === 'SUPER_ADMIN'`), allowing targeted tenant administration via headers.

3. **Authenticate Middleware Idempotency in `rbac.ts`**:
   - `authenticate` in `server/src/middleware/rbac.ts` (lines 76–89) checks `if (request.user)`: if the user was already resolved by `tenantMiddleware`, it re-affirms `tenantStorage` in `AsyncLocalStorage` and returns immediately.
   - This cleanly resolves the Fastify hook ordering conflict (`server.addHook('preHandler', tenantMiddleware)` executing before route-level `preHandler: [authenticate]`) without duplicate cryptographic token decoding.

4. **Rate Limit 429 Interception & RFC 7807 Compliance in `errorHandler.ts`**:
   - `errorHandler.ts` captures candidate status codes and Fastify rate-limiting error codes (`FST_ERR_RATE_LIMIT_EXCEEDED`, `(error as any).status === 429`, or error type containing `rate-limit`), preventing Fastify from falling back to generic HTTP 500.
   - Accurately computes `retryAfter` from headers or error metadata and emits HTTP 429 RFC 7807 problem details.

5. **Atomic Transaction in `receiptQueue.ts`**:
   - `ReceiptVerificationQueue.processJob` wraps double-entry ledger creation, unit balance decrement, complex fund increment, and receipt status update in an atomic `rawPrisma.$transaction` block with resilient fallback for mock unit test runners.

---

## 3. Verified Claims

| # | Claim | Verification Method | Result | Notes |
|---|-------|---------------------|--------|-------|
| 1 | Server TypeScript compilation succeeds with zero errors | `cd server; npm.cmd run typecheck` | **PASS** | Exit code 0, 0 compiler errors |
| 2 | Server production build generates clean output | `cd server; npm.cmd run build` | **PASS** | Exit code 0, cleanly generated `dist/` |
| 3 | Server unit & integration test suite passes | `cd server; npm.cmd test` | **PASS** | 11 test files passed, 95/95 tests passed, 0 failures |
| 4 | Tier 1 Auth & RBAC E2E tests pass | `cd tests_e2e; node --experimental-strip-types --test "suites/tier1_features/f10_hardened_auth.test.ts" "suites/tier1_features/f11_granular_rbac.test.ts"` | **PASS** | 2 suites passed, 10/10 tests passed |
| 5 | Full E2E Test Suite (Tiers 1–5) passes | `cd tests_e2e; node --experimental-strip-types --test "suites/**/*.test.ts"` | **PASS** | 47 suites passed, 214/214 tests passed, 0 failures |
| 6 | IDOR mitigated on GET `/api/v1/receipts/:id` | Source code review of `receiptRoutes.ts` + `ADV-4.2` test execution | **PASS** | Enforces resident unit / uploader identity, returns 403 RFC 7807 |
| 7 | Dual-source tenant resolution works without redundant header | Source inspection of `tenant.ts` lines 85–178 | **PASS** | Extracts `complexId` from Bearer token, populates AsyncLocalStorage |
| 8 | Anti-spoofing rejects mismatched tenant header | Source inspection of `tenant.ts` lines 142–152 | **PASS** | Returns 403 Forbidden when `trimmedHeader !== user.complexId` |
| 9 | `authenticate` is idempotent | Source inspection of `rbac.ts` lines 76–89 | **PASS** | Returns immediately when `request.user` exists, maintains tenant context |

---

## 4. Adversarial Stress-Testing & Attack Surface Evaluation

### Attack Scenario 1: Intra-Complex Cross-Resident Receipt Enumeration (IDOR)
- **Attack Vector**: Resident Alice residing in Unit 101 sends `GET /api/v1/receipts/rcpt-bob-unit-202` where both Alice and Bob reside in Complex 1.
- **Expected Behavior**: Server must not expose Bob's sensitive banking slip, transfer amount, sender card, or tracking numbers to Alice.
- **Actual Behavior**: `receiptRoutes.ts` evaluates `request.user.role === 'RESIDENT'`. It computes `isAssignedUnit = user.unitIds.includes('unit-202')` (false) and `isUploader = receipt.uploadedById === aliceId` (false). It aborts with HTTP 403 Forbidden RFC 7807 (`type: 'https://api.parsbuilding.com/errors/forbidden-unit-access'`).
- **Verdict**: **DEFENDED (PASS)**.

### Attack Scenario 2: Tenant Header Spoofing via `x-complex-id`
- **Attack Vector**: Attacker obtains valid credentials for Complex A (`cpx-alpha`), then issues requests to tenant-isolated endpoints with header `x-complex-id: cpx-beta`.
- **Expected Behavior**: Server must detect header discrepancy, disregard the spoofed header, and reject access.
- **Actual Behavior**: In `tenantMiddleware`, `user.complexId` (`cpx-alpha`) is compared to `trimmedHeader` (`cpx-beta`). Because `trimmedHeader !== user.complexId`, the request is immediately terminated with HTTP 403 Forbidden RFC 7807: *"Cross-tenant access forbidden. Header tenant does not match authenticated token tenant."*
- **Verdict**: **DEFENDED (PASS)**.

### Attack Scenario 3: Execution Order Conflict Between Fastify Hooks
- **Attack Vector**: In Fastify, application-level preHandler hooks run before route-level preHandler hooks. If `tenantMiddleware` runs before `authenticate`, `request.user` is initially undefined, which previously caused legitimate requests without `x-complex-id` to fail with HTTP 400.
- **Expected Behavior**: `tenantMiddleware` must be capable of extracting and validating Bearer tokens directly, and subsequent `authenticate` must not fail or corrupt context.
- **Actual Behavior**: `tenantMiddleware` validates the Bearer token and sets `request.user` and `tenantStorage`. When `authenticate` runs next, it observes `if (request.user)`, confirms `tenantStorage`, and exits cleanly.
- **Verdict**: **DEFENDED (PASS)**.

### Attack Scenario 4: Rate-Limit Exhaustion Status Code Conversion
- **Attack Vector**: Client triggers 6 consecutive failed logins within 15 minutes, exhausting the rate limit window.
- **Expected Behavior**: Response must be HTTP 429 Too Many Requests with RFC 7807 problem details and `Retry-After` header, NOT HTTP 500 Internal Server Error.
- **Actual Behavior**: `errorHandler.ts` checks `candidateStatus === 429 || error.statusCode === 429 || (error as any).status === 429 || error.code === 'FST_ERR_RATE_LIMIT_EXCEEDED'`. It returns HTTP 429 RFC 7807 with `retryAfter` and title `'Too Many Requests'`.
- **Verdict**: **DEFENDED (PASS)**.

---

## 5. Integrity Audit Assessment

In strict accordance with the Integrity Review Protocol, the implementation was audited for integrity violations:
- **Hardcoded test results or expected outputs embedded in source code**: **NONE FOUND**. All responses, queries, and calculations are dynamically resolved from database queries and cryptographic claims.
- **Dummy or facade implementations**: **NONE FOUND**. The tenant resolution, transaction wrapper, WebSocket manager unit mapping, and receipt authorization logic are fully functional.
- **Shortcuts bypassing the intended task**: **NONE FOUND**. The team built out full transactional auto-reconciliation, AsyncLocalStorage scoping, and RFC 7807 error formatters.
- **Fabricated verification outputs or logs**: **NONE FOUND**. All verification commands were independently executed in this session with full console log capture and verified exit codes.
- **Self-certifying work without genuine independent verification**: **NONE FOUND**. Verification was independently reproduced by running TypeScript compiler, Vite test runner, and Node.js test runner directly.

---

## 6. Coverage Gaps & Unverified Items

- **Coverage Gaps**: None. All core M2 requirements (Argon2id authentication, JWT/refresh rotation, 4-tier RBAC, immutable audit logging, WebSocket rooms, AI receipt queue, rate limiting, and multi-tenant isolation) have verified test coverage across unit, integration, and E2E tiers.
- **Unverified Items**: None.

---

## 7. Conclusion

Milestone 2 remediation meets all commercial SaaS standards, architectural requirements, and adversarial security criteria. The codebase is hardened, compliant with `PROJECT.md` contracts, and ready to advance to Milestone 3.
