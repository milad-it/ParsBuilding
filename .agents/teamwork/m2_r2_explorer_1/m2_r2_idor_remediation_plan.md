# Milestone 2 Remediation Plan: IDOR & Resident Receipt Authorization Hardening

- **Document Version**: 1.0.0
- **Author**: M2-R2 Explorer 1 (IDOR & Resident Authorization Specialist)
- **Target Component**: `server/src/routes/receiptRoutes.ts`
- **Related Modules**: `server/src/middleware/rbac.ts`, `server/src/services/receiptQueue.ts`, `server/tests/adversarialM2.test.ts`
- **Classification**: High-Priority Security Remediation (Broken Object Level Authorization / IDOR - CWE-639)

---

## 1. Executive Summary & Threat Model

In the M2 adversarial security evaluation, Challenger 1 flagged a critical Insecure Direct Object Reference (IDOR) vulnerability on the endpoint `GET /api/v1/receipts/:id`.

### Threat Scenario
- **Actor**: Authenticated Resident Alice (occupant of Unit 101 in Complex A).
- **Victim**: Authenticated Resident Bob (occupant of Unit 202 in the same Complex A).
- **Attack Vector**: Alice obtains Bob's receipt ID (via sequential generation, shoulder surfing, compromised cache, or WebSocket eavesdropping) and sends `GET /api/v1/receipts/rcpt-bob-unit-202` with her own valid Bearer JWT.
- **Exploitation Impact**: The backend returns HTTP 200 OK containing Bob's private banking slip, OCR data, tracking numbers, bank card digits, amounts, and image URL.
- **Root Cause**: The route handler strictly verified `request.user.complexId !== receipt.complexId` (cross-complex tenant boundary), but omitted intra-complex resident unit authorization. Because Alice and Bob belong to the same complex, the tenant guard passed.

---

## 2. Deep-Dive: Root Cause Analysis of `receiptRoutes.ts` (Lines 70–93)

### Existing Vulnerable Implementation
```typescript
// server/src/routes/receiptRoutes.ts: lines 70–93
fastify.get('/receipts/:id', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const receipt = await rawPrisma.receiptVerification.findUnique({
    where: { id },
    include: {
      unit: {
        select: { unitNumber: true, unitName: true }
      }
    }
  });

  if (!receipt) {
    return reply.code(404).send({ error: 'Not Found', message: 'رسید پرداخت یافت نشد' });
  }

  // Tenant check
  if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
    return reply.code(403).send({ error: 'Forbidden', message: 'عدم دسترسی به فیش مجتمع دیگر' });
  }

  return reply.code(200).send({ receipt });
});
```

### Flaw Breakdown
1. **Missing Resident Authorization Matrix**:
   `request.user.role` is not evaluated for `RESIDENT`. While managers (`SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER`) legitimately have building-wide access to financial receipts, `RESIDENT` accounts must be strictly restricted.
2. **Missing Unit Ownership Association**:
   `request.user.unitIds` (the array of units the resident is legally registered to occupy/own) is completely ignored.
3. **Missing Uploader Attribution Fallback**:
   If a resident uploaded a payment receipt on behalf of their tenancy or prior unit assignment, `receipt.uploadedById === request.user.id` is not honored.
4. **Non-Standardized Error Responses**:
   The existing 403 and 404 responses returned non-standard JSON (`{ error, message }`) lacking RFC 7807 Problem Details headers (`application/problem+json`) and standard attributes (`type`, `title`, `status`, `detail`, `instance`).

---

## 3. Exact Authorization Logic Specification

### Resident Role Authorization Rule
For every request to `GET /api/v1/receipts/:id`:
```
IF request.user.role === 'RESIDENT':
   hasAccess = (Array.isArray(request.user.unitIds) AND request.user.unitIds.includes(receipt.unitId))
               OR (receipt.uploadedById === request.user.id)
   IF NOT hasAccess:
       RETURN HTTP 403 Forbidden with RFC 7807 Problem Details
```

### Full Role & Tenant Decision Matrix

| Role | Complex Check | Unit Check | Uploader Fallback | Result on Unauthorized |
|---|---|---|---|---|
| `SUPER_ADMIN` | Bypassed (Global) | Bypassed (Global) | N/A | Full access across all complexes |
| `COMPLEX_MANAGER` | Enforced (`user.complexId === receipt.complexId`) | Bypassed within complex | N/A | HTTP 403 `tenant-isolation-violation` if complex mismatch |
| `SUB_MANAGER` | Enforced (`user.complexId === receipt.complexId`) | Bypassed within complex | N/A | HTTP 403 `tenant-isolation-violation` if complex mismatch |
| `RESIDENT` | Enforced (`user.complexId === receipt.complexId`) | Enforced (`user.unitIds.includes(receipt.unitId)`) | Enforced (`receipt.uploadedById === user.id`) | HTTP 403 `forbidden-unit-access` if neither unit nor uploader matches |

### RFC 7807 Response Schema for IDOR Rejection
```http
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json; charset=utf-8

{
  "type": "https://api.parsbuilding.com/errors/forbidden-unit-access",
  "title": "Forbidden Unit Access",
  "status": 403,
  "detail": "شما فقط مجاز به مشاهده فیش‌های واریزی واحدهای اختصاصی خود هستید",
  "instance": "/api/v1/receipts/rcpt-bob-unit-202",
  "error": "Forbidden",
  "message": "شما فقط مجاز به مشاهده فیش واحد خود هستید"
}
```
*Note: Both `detail` (RFC 7807 canonical) and legacy fields `error` / `message` are provided to guarantee seamless backward compatibility with all frontend clients and existing automated test suites.*

---

## 4. Comprehensive Audit of Related Endpoints for IDOR Vulnerabilities

### 4.1 Audit of `POST /api/v1/receipts/verify`
In the initial implementation:
- **Line 22**: `if (user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId))` protected against residents uploading for arbitrary units.
- **Defect 1 (Cross-Tenant Manager IDOR)**: If a `COMPLEX_MANAGER` or `SUB_MANAGER` from Complex A submitted `POST /receipts/verify` referencing a `unitId` in Complex B, line 22 did not trigger. Line 30 fetched the unit from Complex B, and line 41 created the receipt under Complex B's `complexId`. This allowed managers to inject fake receipts into rival complexes!
- **Defect 2 (Sub-Manager RBAC Bypass)**: A `SUB_MANAGER` without `RECORD_PAYMENTS` or `VERIFY_RECEIPTS` permission could upload receipts for units they do not reside in.
- **Defect 3 (RFC 7807 Non-Compliance)**: Errors were returned without `application/problem+json`.

**Remediation in `POST /receipts/verify`**:
1. Check `if (user.role !== 'SUPER_ADMIN' && user.complexId !== unit.complexId)` and return 403 `tenant-isolation-violation`.
2. Check `if (user.role === 'SUB_MANAGER')`: ensure user either holds `RECORD_PAYMENTS` / `VERIFY_RECEIPTS` or is an assigned occupant of `body.unitId`.
3. Wrap all 403 and 404 responses with RFC 7807 headers and payload attributes.

### 4.2 Audit of Sub-Manager Routes (`server/src/routes/subManagerRoutes.ts`)
- `GET /complex/sub-managers`: Scoped strictly by `request.user.complexId`.
- `POST /complex/sub-managers`: Creates user bound to `request.user.complexId`.
- `PUT /complex/sub-managers/:userId/permissions`: Queries `where: { id: userId, complexId, role: UserRole.SUB_MANAGER }`.
- **Verdict**: Fully isolated. No IDOR vulnerability.

### 4.3 Audit of User Session Routes (`server/src/routes/authRoutes.ts`)
- `GET /auth/sessions`: Calls `getActiveSessions(request.user!.id)`.
- `POST /auth/revoke-all`: Calls `revokeAllSessions(request.user!.id)`.
- **Verdict**: User ID is bound to the verified JWT claim (`claims.sub`). No parameter tampering possible.

---

## 5. Complete Drop-In Replacement Code

The complete replacement code for `server/src/routes/receiptRoutes.ts` has been generated and validated in `.agents/teamwork/m2_r2_explorer_1/proposed_receiptRoutes.ts`.

### Drop-In Replacement for `server/src/routes/receiptRoutes.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, hasRequiredPermission } from '../middleware/rbac';
import { rawPrisma } from '../config/database';
import { receiptVerificationQueue } from '../services/receiptQueue';

const submitReceiptSchema = z.object({
  unitId: z.string().uuid(),
  imageUrl: z.string().min(5),
  expectedAmount: z.number().nonnegative().optional()
});

export async function receiptRoutes(fastify: FastifyInstance) {
  // Submit receipt for AI verification
  fastify.post('/receipts/verify', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const body = submitReceiptSchema.parse(request.body);
    const user = request.user!;

    // Resident unit access check: residents may only submit for their assigned units
    if (user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId)) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
          title: 'Forbidden Unit Access',
          status: 403,
          detail: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید'
        });
    }

    // Verify unit exists and get its complexId
    const unit = await rawPrisma.unit.findUnique({
      where: { id: body.unitId }
    });

    if (!unit) {
      return reply.code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'واحد مسکونی یافت نشد',
          instance: request.raw.url || request.url,
          error: 'Not Found',
          message: 'واحد مسکونی یافت نشد'
        });
    }

    const complexId = unit.complexId;

    // Tenant isolation check: non-SUPER_ADMIN managers/sub-managers/residents cannot submit for other complexes
    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
          title: 'Tenant Isolation Violation',
          status: 403,
          detail: 'عدم دسترسی به واحد مجتمع دیگر',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'عدم دسترسی به واحد مجتمع دیگر'
        });
    }

    // Sub-Manager role permission check: must hold RECORD_PAYMENTS or VERIFY_RECEIPTS permission or be unit occupant
    if (user.role === 'SUB_MANAGER') {
      const hasPerm = hasRequiredPermission(user.role, user.permissions, 'RECORD_PAYMENTS') ||
                      hasRequiredPermission(user.role, user.permissions, 'VERIFY_RECEIPTS');
      const isOccupant = Array.isArray(user.unitIds) && user.unitIds.includes(body.unitId);
      if (!hasPerm && !isOccupant) {
        return reply.code(403)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://api.parsbuilding.com/errors/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'مدیر کمکی دسترسی ثبت یا بارگذاری فیش برای این واحد را ندارد',
            instance: request.raw.url || request.url,
            error: 'Forbidden',
            message: 'دسترسی غیرمجاز'
          });
      }
    }

    // Create receipt record
    const receipt = await rawPrisma.receiptVerification.create({
      data: {
        complexId,
        unitId: body.unitId,
        uploadedById: user.id,
        imageUrl: body.imageUrl,
        status: 'PENDING'
      }
    });

    // Enqueue verification job for async processing
    await receiptVerificationQueue.enqueue({
      receiptId: receipt.id,
      complexId,
      unitId: body.unitId,
      uploadedById: user.id,
      imageUrl: body.imageUrl,
      expectedAmount: body.expectedAmount,
      createdAt: receipt.createdAt.toISOString()
    });

    return reply.code(202).send({
      message: 'رسید پرداخت دریافت شد و در صف اعتبارسنجی هوشمند قرار گرفت',
      receiptId: receipt.id,
      status: receipt.status
    });
  });

  // Get receipt status
  fastify.get('/receipts/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await rawPrisma.receiptVerification.findUnique({
      where: { id },
      include: {
        unit: {
          select: { unitNumber: true, unitName: true }
        }
      }
    });

    if (!receipt) {
      return reply.code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'رسید پرداخت یافت نشد',
          instance: request.raw.url || request.url,
          error: 'Not Found',
          message: 'رسید پرداخت یافت نشد'
        });
    }

    // 1. Cross-Tenant isolation check
    if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
          title: 'Tenant Isolation Violation',
          status: 403,
          detail: 'عدم دسترسی به فیش مجتمع دیگر',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'عدم دسترسی به فیش مجتمع دیگر'
        });
    }

    // 2. Intra-Tenant Resident IDOR authorization check:
    // Residents are strictly isolated to their assigned unit(s) or receipts they uploaded themselves
    if (request.user!.role === 'RESIDENT') {
      const isAssignedUnit = Array.isArray(request.user!.unitIds) && request.user!.unitIds.includes(receipt.unitId);
      const isUploader = receipt.uploadedById === request.user!.id;

      if (!isAssignedUnit && !isUploader) {
        return reply.code(403)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
            title: 'Forbidden Unit Access',
            status: 403,
            detail: 'شما فقط مجاز به مشاهده فیش‌های واریزی واحدهای اختصاصی خود هستید',
            instance: request.raw.url || request.url,
            error: 'Forbidden',
            message: 'شما فقط مجاز به مشاهده فیش واحد خود هستید'
          });
      }
    }

    return reply.code(200).send({ receipt });
  });
}
```

---

## 6. Regression Testing Specifications & Updates

### 6.1 Update to Existing Adversarial Test (`server/tests/adversarialM2.test.ts`)
In `server/tests/adversarialM2.test.ts` lines 446–457:
**Before**:
```typescript
const isExposed = res.statusCode === 200;
console.log(`[ADV-4.2 PROBE RESULT] Cross-Resident Receipt Access: statusCode=${res.statusCode}`);
if (isExposed) {
  console.warn('🚨 VULNERABILITY CONFIRMED: GET /receipts/:id allows cross-resident receipt inspection within same complex!');
}
expect([200, 403]).toContain(res.statusCode);
```

**After (Strict Regression Assertion)**:
```typescript
expect(res.statusCode).toBe(403);
expect(res.headers['content-type']).toContain('application/problem+json');
const body = res.json();
expect(body.type).toBe('https://api.parsbuilding.com/errors/forbidden-unit-access');
expect(body.status).toBe(403);
expect(body.message).toContain('شما فقط مجاز به مشاهده فیش واحد خود هستید');
```

### 6.2 Update to E2E Adversarial Test (`tests_e2e/suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts`)
In `tests_e2e/suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts` lines 151–169:
**Before**:
```typescript
it('ADV-M2-4.2 [DEFECT DETECTED]: GET /receipts/:id FAILS to enforce resident unit ownership within same complex', () => {
...
  assert.equal(
    hasResidentUnitCheck,
    false,
    'IDOR VULNERABILITY CONFIRMED: GET /receipts/:id does NOT verify resident unit ownership...'
  );
});
```

**After (Remediated Assertion)**:
```typescript
it('ADV-M2-4.2 [PASS]: GET /receipts/:id enforces resident unit ownership within same complex', () => {
  const getReceiptHandler = receiptRoutesCode.match(/fastify\.get\('\/receipts\/:id'[\s\S]*?\n  \}\);/);
  assert.ok(getReceiptHandler, 'GET /receipts/:id route must be defined');

  const handlerBody = getReceiptHandler[0];
  const hasResidentUnitCheck = handlerBody.includes('requireResidentUnitAccess') ||
                               handlerBody.includes('user.unitIds.includes') ||
                               handlerBody.includes('receipt.uploadedById === request.user');

  assert.equal(
    hasResidentUnitCheck,
    true,
    'SECURITY VERIFIED: GET /receipts/:id strictly verifies resident unit ownership.'
  );
});
```

### 6.3 Dedicated Regression Test Suite (`proposed_receiptIdorHardening.test.ts`)
A dedicated Vitest test suite (`.agents/teamwork/m2_r2_explorer_1/proposed_receiptIdorHardening.test.ts`) provides 12 distinct assertions verifying:
1. Cross-resident receipt read blocked with HTTP 403 RFC 7807 (`forbidden-unit-access`).
2. Resident reading own unit receipt succeeds with HTTP 200 OK.
3. Co-occupants of the same unit reading receipt succeeds with HTTP 200 OK.
4. Resident reading receipt uploaded by themselves succeeds with HTTP 200 OK.
5. Complex Manager reading any receipt in their complex succeeds with HTTP 200 OK.
6. Platform Super Admin reading any receipt across complexes succeeds with HTTP 200 OK.
7. Cross-complex receipt read blocked with HTTP 403 RFC 7807 (`tenant-isolation-violation`).
8. Non-existent receipt returns HTTP 404 RFC 7807 (`not-found`).
9. Resident uploading receipt for non-assigned unit blocked with HTTP 403.
10. Manager uploading receipt for a different complex blocked with HTTP 403.
11. Sub-Manager without payment permissions uploading for non-assigned unit blocked with HTTP 403.
12. Sub-Manager with `VERIFY_RECEIPTS` uploading for building unit succeeds with HTTP 202.

---

## 7. Implementation Checklist for Developer Agent

- [ ] Apply `proposed_receiptRoutes.ts` or `receipt_idor_patch.patch` to `server/src/routes/receiptRoutes.ts`.
- [ ] Tighten `server/tests/adversarialM2.test.ts` lines 446–457 to assert HTTP 403.
- [ ] Invert assertion in `tests_e2e/suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts` lines 151–169 to assert `true`.
- [ ] Copy `proposed_receiptIdorHardening.test.ts` to `server/tests/receiptIdorHardening.test.ts`.
- [ ] Run `npm.cmd --prefix server test` and confirm 100% passing tests.
- [ ] Run `cd tests_e2e && node --experimental-strip-types --test suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts` and confirm all suites pass.
- [ ] Commit and push changes according to project rules.
