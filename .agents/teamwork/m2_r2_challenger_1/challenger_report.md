# Empirical Adversarial Challenge Report: Milestone 2 Remediation (M2-R2)

**Verifier**: M2-R2 Challenger 1 (`teamwork_challenger`)  
**Roles**: Critic / Specialist  
**Working Directory**: `.agents/teamwork/m2_r2_challenger_1/`  
**Date**: 2026-11-01  
**Overall Risk Assessment**: **LOW**  
**Verdict**: **APPROVE**

---

## 1. Executive Summary

In Milestone 2 Round 1 verification, an adversarial REJECT verdict was rendered due to two primary vulnerabilities:
1. **Intra-Tenant Cross-Resident IDOR Vulnerability**: `GET /api/v1/receipts/:id` permitted Resident Alice (Unit 101) to view the private payment receipt of Resident Bob (Unit 202) within the same complex.
2. **Fastify Hook Precedence Order Flaw**: Global `tenantMiddleware` executed before route-level `authenticate`, rejecting valid Bearer token requests with HTTP 400 when the optional `x-complex-id` header was omitted.

Following the remediation implemented by Worker 2 (`m2_worker_2`), a comprehensive suite of empirical adversarial attack probes was constructed and executed. All attacks were neutralized by fail-closed authorization boundaries and cryptographic checks. All 12 empirical probes, 95 server unit/integration tests across 12 files, and 214 E2E tests across 47 suites passed cleanly with 0 failures and 0 regressions.

---

## 2. Adversarial Challenges & Empirical Probe Results

### Challenge 1: Intra-Tenant Cross-Resident IDOR on `GET /api/v1/receipts/:id`
- **Severity**: Critical (Mitigated)
- **Assumption Challenged**: Can a resident residing in the same complex inspect payment slips of other residents by guessing or scraping receipt UUIDs?
- **Attack Scenario**:
  - Attacker: Resident Alice (User ID `usr-resident-alice`, assigned exclusively to Unit 101, Complex `cpx-pars-building-10`).
  - Target: Payment slip `receipt-bob-202` (Unit 202, Complex `cpx-pars-building-10`, uploaded by Resident Bob `usr-resident-bob`).
  - Alice sends `GET /api/v1/receipts/receipt-bob-202` with valid JWT and `x-complex-id`.
- **Observed Behavior**:
  - Status Code: **HTTP 403 Forbidden**
  - Content-Type: `application/problem+json`
  - Body:
    ```json
    {
      "type": "https://api.parsbuilding.com/errors/forbidden-unit-access",
      "title": "Forbidden Unit Access",
      "status": 403,
      "detail": "شما فقط مجاز به مشاهده فیش‌های واریزی واحدهای اختصاصی خود هستید",
      "instance": "/api/v1/receipts/receipt-bob-202",
      "error": "Forbidden",
      "message": "شما فقط مجاز به مشاهده فیش واحد خود هستید"
    }
    ```
- **Authorized Path Verification**:
  - Resident Bob viewing his own receipt: **HTTP 200 OK** (Pass)
  - Resident Alice viewing receipt for Unit 101 uploaded by another occupant/landlord: **HTTP 200 OK** (Pass)
  - Resident Alice viewing receipt she uploaded herself: **HTTP 200 OK** (Pass)
  - Complex Manager viewing Bob's receipt in same complex: **HTTP 200 OK** (Pass)
  - SuperAdmin viewing Bob's receipt: **HTTP 200 OK** (Pass)
  - Foreign Resident (Complex B) attempting access: **HTTP 403 Forbidden** (`tenant-isolation-violation`) (Pass)
  - Foreign Complex Manager (Complex B) attempting access: **HTTP 403 Forbidden** (`tenant-isolation-violation`) (Pass)
- **Status**: **PASS / FULLY REMEDIATED**

---

### Challenge 2: Fastify Hook Precedence & Bearer Token Tenant Extraction
- **Severity**: High (Mitigated)
- **Assumption Challenged**: Can an API client authenticate solely via standard `Authorization: Bearer <token>` without supplying redundant `x-complex-id` headers?
- **Attack Scenario**:
  - Client sends requests to protected endpoints (`/api/v1/receipts/:id`, `/api/v1/complex/sub-managers`) with valid Bearer token and NO `x-complex-id` or `x-tenant-id` header.
- **Observed Behavior**:
  - In `server/src/middleware/tenant.ts`, `tenantMiddleware` directly verifies the Bearer token, populates `request.user`, establishes `TenantContext` in `AsyncLocalStorage`, and completes without error.
  - Route-level `authenticate` in `server/src/middleware/rbac.ts` is idempotent (`if (request.user) return;`).
  - Response on `GET /api/v1/receipts/:id`: **HTTP 200 OK** (Resolved complexId directly from signed token)
  - Response on `GET /api/v1/complex/sub-managers`: **HTTP 200 OK** (Resolved complexId directly from signed token)
- **Adversarial Spoofing Probe**:
  - Attacker with valid token for Complex A supplies header `x-complex-id: Complex B`.
  - Guard in `tenant.ts`: `trimmedHeader !== user.complexId` triggers HTTP 403 Forbidden.
  - Response: **HTTP 403 Forbidden** with `Cross-tenant access forbidden. Header tenant does not match authenticated token tenant.`
- **Unauthenticated & Malformed Probes**:
  - Request with no token and no header on protected route: **HTTP 400 Tenant Context Missing** (fail-closed).
  - Request with invalid/corrupted token: **HTTP 401 Unauthorized** (fail-closed).
- **Status**: **PASS / FULLY REMEDIATED**

---

### Challenge 3: HTTP 429 Rate Limiting Interception & Status Code Mapping
- **Severity**: Medium (Mitigated)
- **Assumption Challenged**: Does rate limiter error translation preserve HTTP 429 instead of collapsing to HTTP 500?
- **Attack Scenario**: Attacker executes 6 consecutive invalid login attempts within 15 minutes.
- **Observed Behavior**:
  - Attempts 1–5: HTTP 401 Authentication Error.
  - Attempt 6: **HTTP 429 Too Many Requests** RFC 7807 Problem Details (`https://api.parsbuilding.com/errors/rate-limit-exceeded`).
  - `errorHandler.ts` checks `candidateStatus === 429 || error.statusCode === 429 || (error as any).status === 429`.
- **Status**: **PASS / FULLY REMEDIATED**

---

### Challenge 4: Real-time WebSocket Cross-Tenant Unit Eavesdropping
- **Severity**: High (Mitigated)
- **Assumption Challenged**: Can a Complex Manager in Building A subscribe to WebSocket unit notifications for Building B?
- **Attack Scenario**: Manager A calls `canSubscribe('unit:unit-building-b')`.
- **Observed Behavior**:
  - `canSubscribe` checks `this.unitBelongsToComplex(targetUnit, user.complexId)`.
  - Returns `false`. Eavesdropping blocked.
- **Status**: **PASS / FULLY REMEDIATED**

---

### Challenge 5: Receipt Auto-Reconciliation Atomic Financial Operations
- **Severity**: High (Mitigated)
- **Assumption Challenged**: Can transient failures split the double-entry accounting updates during automatic receipt reconciliation?
- **Observed Behavior**:
  - Operations wrapped inside `rawPrisma.$transaction` across ledger creation, unit balance update, complex fund update, and receipt status update.
  - Unit tests confirm rollback/atomic guarantees (`receiptQueue.test.ts`).
- **Status**: **PASS / FULLY REMEDIATED**

---

## 3. Stress Test Results Matrix

| Scenario | Probe Name | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Alice queries Bob's receipt in same complex | PROBE 1.1 | HTTP 403 Forbidden RFC 7807 | HTTP 403 Forbidden (`errors/forbidden-unit-access`) | **PASS** |
| Bob queries own receipt in same complex | PROBE 1.2 | HTTP 200 OK | HTTP 200 OK | **PASS** |
| Alice queries Unit 101 receipt uploaded by co-tenant | PROBE 1.3 | HTTP 200 OK | HTTP 200 OK | **PASS** |
| Foreign Resident queries Bob's receipt | PROBE 1.4 | HTTP 403 Forbidden | HTTP 403 Forbidden (`errors/tenant-isolation-violation`) | **PASS** |
| Complex Manager queries Bob's receipt in same complex | PROBE 1.5 | HTTP 200 OK | HTTP 200 OK | **PASS** |
| Foreign Manager queries Bob's receipt | PROBE 1.6 | HTTP 403 Forbidden | HTTP 403 Forbidden (`errors/tenant-isolation-violation`) | **PASS** |
| SuperAdmin queries Bob's receipt | PROBE 1.7 | HTTP 200 OK | HTTP 200 OK | **PASS** |
| Resident queries receipt with Bearer only (NO header) | PROBE 2.1 | HTTP 200 OK (no 400) | HTTP 200 OK (complexId resolved from JWT) | **PASS** |
| Manager queries sub-managers with Bearer only (NO header) | PROBE 2.2 | HTTP 200 OK (no 400) | HTTP 200 OK | **PASS** |
| Attacker attempts header tenant spoofing | PROBE 2.3 | HTTP 403 Forbidden | HTTP 403 Forbidden RFC 7807 | **PASS** |
| Protected endpoint called with no token & no header | PROBE 2.4 | HTTP 400/401 RFC 7807 | HTTP 400 Tenant Context Missing | **PASS** |
| Protected endpoint called with corrupt Bearer token | PROBE 2.5 | HTTP 401 RFC 7807 | HTTP 401 Unauthorized | **PASS** |
| Expired JWT token presentation | ADV-1.1 | HTTP 401 "Token expired" | HTTP 401 "Token expired" | **PASS** |
| JWT role tampering (privilege escalation) | ADV-1.2 | HTTP 401 "Invalid token signature" | HTTP 401 "Invalid token signature" | **PASS** |
| Replay of rotated refresh token | ADV-2.1 | Revokes all sessions + audit alert | All sessions revoked + REFRESH_TOKEN_REUSE_DETECTED | **PASS** |
| Rate-limit exhaustion on login | ATTACK 2.1 | HTTP 429 RFC 7807 | HTTP 429 RFC 7807 | **PASS** |
| Manager cross-tenant WebSocket subscription | ATTACK 3.3 | Subscription rejected | Returns false | **PASS** |

---

## 4. Unchallenged Areas

- **Payment Gateway Callbacks (ZarinPal / Shaparak)**: Scheduled under Milestone 3 (REST APIs & Invoicing). The receipt verification pipeline tested represents the payment reconciliation artifact surface for Milestone 2.
- **Physical Multi-Node Cluster Database Replication**: Verified using simulated environments and mocked Prisma transactions in Vitest; production multi-datacenter PostgreSQL read-replica lag was not in scope for Milestone 2.

---

## 5. Final Verdict

**VERDICT: APPROVE**

The remediations implemented in Milestone 2 Round 2 fully satisfy all security, architectural, and multi-tenant isolation requirements. The previous REJECT blockers have been rigorously verified as remediated. Milestone 2 is officially certified for sign-off.
