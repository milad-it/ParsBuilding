# Milestone 2 Adversarial Verification & Stress Test Report

**Author**: Teamwork Challenger 2 (`teamwork_challenger`)  
**Role**: Audit Immutability, Rate Limiting & WebSocket Challenger  
**Timestamp**: 2026-11-01T01:05:00Z  
**Verdict**: **REJECT**

---

## 1. Executive Summary

As part of Milestone 2 (M2) adversarial verification, three primary security and resilience vectors were empirically challenged through direct code execution, synthetic exploit payloads, and integration stress harnesses:
1. **Audit Log Immutability Violation Attack** against `server/src/services/auditLogger.ts` and `server/src/config/database.ts`
2. **Rate Limit Brute-Force Attack** against `server/src/config/security.ts`, `server/src/routes/authRoutes.ts`, and `server/src/middleware/errorHandler.ts`
3. **WebSocket Cross-Tenant Eavesdropping** against `server/src/services/realtimeService.ts`

### Verdict: **REJECT**
While Layer 1 Prisma extension interceptors successfully reject 100% of direct audit log mutations (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`), two critical failure modes were empirically confirmed:
1. **Critical Bug in Rate Limiting**: Exceeding the login rate limit (attempt 6) crashes with **HTTP 500 Internal Server Error** instead of returning **HTTP 429 Too Many Requests RFC 7807 Problem Details**, caused by missing rate-limit error mapping in `errorHandler.ts`.
2. **Cross-Tenant Unit Room Eavesdropping for Managers**: In `realtimeService.ts`, managers can subscribe to arbitrary unit rooms across foreign complexes (`unit:{unitId}`) without complex tenancy verification.

---

## 2. Adversarial Challenge Findings

### Challenge 1: Audit Log Immutability Violation Attack
- **Target**: `server/src/config/database.ts` (Prisma TenantIsolationExtension) & `server/src/services/auditLogger.ts`
- **Attack Vector**: Direct mutation queries via `prisma.auditLog`:
  - `prisma.auditLog.update`
  - `prisma.auditLog.updateMany`
  - `prisma.auditLog.delete`
  - `prisma.auditLog.deleteMany`
  - `prisma.auditLog.upsert`
- **Empirical Execution**: Executed in `server/tests/adversarialM2Hardening.test.ts` (Tests ATTACK 1.1–1.5) and `tests_e2e/suites/tier5_adversarial/m2_audit_ratelimit_websocket_adversarial.test.ts`.
- **Observed Behavior**:
  - `prisma.auditLog.update()` -> Threw `AuditLogImmutableError` (`statusCode: 403`, `code: AUDIT_LOG_IMMUTABLE_VIOLATION`, message: `"SecurityViolation: AuditLog is append-only. Operation 'update' is strictly forbidden."`)
  - `prisma.auditLog.updateMany()` -> Threw `AuditLogImmutableError`
  - `prisma.auditLog.delete()` -> Threw `AuditLogImmutableError`
  - `prisma.auditLog.deleteMany()` -> Threw `AuditLogImmutableError`
  - `prisma.auditLog.upsert()` -> Threw `AuditLogImmutableError`
- **Rejection Rate**: **100%** across all 5 mutation APIs.
- **Architectural Caveat (Layer 2 DB Engine)**: The audit log immutability is currently enforced in application middleware (Prisma Extension). Direct SQL execution via raw connections or PostgreSQL users without triggers is not prevented by database-level triggers (`BEFORE UPDATE OR DELETE ON audit_logs RAISE EXCEPTION`).

---

### Challenge 2: Rate Limit Brute-Force Attack on Login
- **Target**: `server/src/config/security.ts`, `server/src/routes/authRoutes.ts`, `server/src/middleware/errorHandler.ts`
- **Attack Vector**: Simulating rapid brute-force password guessing (>5 failed login requests within 15 minutes) from IP `198.51.100.44` and phone `09351112233`.
- **Expected Specification**:
  - Attempts 1–5: Return HTTP 401 Unauthorized with decremented `x-ratelimit-remaining` header.
  - Attempt 6+: Blocked with **HTTP 429 Too Many Requests**, returning RFC 7807 Problem Details:
    ```json
    {
      "type": "https://api.parsbuilding.com/errors/rate-limit-exceeded",
      "title": "Too Many Requests",
      "status": 429,
      "detail": "Rate limit exceeded. Retry after 900 seconds.",
      "retryAfter": 900,
      "instance": "/api/v1/auth/login"
    }
    ```
- **Empirical Execution & Log Capture**:
  ```
  Attempt 1..5: HTTP 401 Unauthorized (x-ratelimit-remaining: 4, 3, 2, 1, 0)
  Attempt 6: HTTP 500 Internal Server Error
  Body: {"statusCode":500,"error":"Internal Server Error"}
  Headers: Content-Type: application/json (NOT application/problem+json)
  ```
- **Root Cause Analysis**:
  In `server/src/config/security.ts` line 101:
  `errorResponseBuilder` builds `{ status: 429, ... }` without property `statusCode: 429`.
  When Fastify catches this error, it passes it to `server/src/middleware/errorHandler.ts`:
  ```typescript
  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;
  ```
  Because `error.statusCode` is `undefined` (it only has `status: 429`), `errorHandler.ts` evaluates to `500`, treats it as an unhandled internal exception, and responds with `{"statusCode": 500, "error": "Internal Server Error"}`.
- **Severity**: **HIGH / BLOCKING**
- **Recommended Fix for Worker**:
  In `server/src/middleware/errorHandler.ts`, add a handler for rate limiting:
  ```typescript
  if ((error as any).status === 429 || error.statusCode === 429 || (error as any).type?.includes('rate-limit')) {
    return reply
      .code(429)
      .header('Content-Type', 'application/problem+json')
      .send(error);
  }
  ```

---

### Challenge 3: WebSocket Cross-Tenant Eavesdropping
- **Target**: `server/src/services/realtimeService.ts`
- **Attack Vector 1 (Complex Channel Eavesdropping)**:
  - Tenant A (Complex ALPHA resident) connects to WebSocket and sends `{"action": "SUBSCRIBE", "room": "complex:complex-BETA"}`.
  - Result: **PASS**. Subscription rejected with `{ event: "ERROR", data: { message: "Unauthorized subscription to room: complex:complex-BETA" } }`.
  - Legitimate event broadcast to `complex-BETA` was delivered to Tenant B, with **0 bytes / 0 messages leaked to Tenant A**.
- **Attack Vector 2 (Resident Unit Channel Eavesdropping)**:
  - Tenant A resident attempts to subscribe to `unit:unit-BETA-1` or `unit:unit-ALPHA-neighbor`.
  - Result: **PASS**. `canSubscribe` checks `user.unitIds.includes(targetUnit)` and rejects subscription.
- **Attack Vector 3 (Manager Cross-Complex Unit Channel Eavesdropping)**:
  - Manager of Complex ALPHA connects to WebSocket and sends `{"action": "SUBSCRIBE", "room": "unit:unit-BETA-1"}` (a unit belonging to Complex BETA).
  - Result: **FAIL (VULNERABILITY CONFIRMED)**.
  - In `server/src/services/realtimeService.ts` lines 181-186:
    ```typescript
    // Room: unit:{unitId}
    if (room.startsWith('unit:')) {
      const targetUnit = room.replace('unit:', '');
      if (user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
        return true; // Manager can monitor any unit in their complex
      }
      return user.unitIds.includes(targetUnit);
    }
    ```
  - The comment claims "Manager can monitor any unit in their complex", but the code unconditionally returns `true` for *any* unit ID without checking if `targetUnit` belongs to `user.complexId`.
  - Consequence: Any manager or sub-manager can eavesdrop on private resident unit channels (`unit:{unitId}`) of ANY other complex in the multi-tenant database.
- **Severity**: **MEDIUM-HIGH**
- **Recommended Fix for Worker**:
  Either:
  1. Prefix unit rooms with complexId: `complex:{complexId}:unit:{unitId}` so tenancy is verified synchronously without extra DB queries.
  2. Or verify `targetUnit` ownership against database before joining room.

---

## 3. Test Execution Summary

| Test Suite | Command | Result | Notes |
|---|---|---|---|
| M2 Tier 1 E2E Suites | `cd tests_e2e && node --experimental-strip-types --test "suites/tier1_features/f12_immutable_audit_logging.test.ts" "suites/tier1_features/f13_security_hardening.test.ts" "suites/tier1_features/f14_realtime_ai_foundations.test.ts"` | **15/15 PASS** | Baseline functional contracts pass |
| Tier 5 Adversarial Suites | `cd tests_e2e && node --experimental-strip-types --test suites/tier5_adversarial/m1_multitenant_schema_adversarial.test.ts suites/tier5_adversarial/m2_audit_ratelimit_websocket_adversarial.test.ts` | **29/29 PASS** | Static & behavioral invariants pass; failure analyses documented |
| Full Server Unit & Integration | `cd server; npx.cmd vitest run` | **95/95 PASS** | All 11 files pass; includes reproduction of Rate Limit 500 & Manager unit bypass |

---

## 4. Final Verdict

### **VERDICT: REJECT**

**Reasoning**:
1. Rate limit violations produce HTTP 500 instead of HTTP 429 RFC 7807 Problem Details.
2. Managers have an unrestricted cross-tenant eavesdropping hole on unit WebSocket rooms.
The worker must fix `server/src/middleware/errorHandler.ts` and `server/src/services/realtimeService.ts` before Milestone 2 can be approved.
