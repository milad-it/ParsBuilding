## 2026-10-31T21:45:45Z
[Message] timestamp=2026-10-31T21:45:45Z sender=748ca4e1-43f0-41a9-ac48-b939be1d06a0 priority=MESSAGE_PRIORITY_HIGH content=You are M2-R2 Remediation Implementation Worker (teamwork_worker).
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_worker_2\

MANDATORY READ FIRST:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_1\m2_r2_idor_remediation_plan.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_1\proposed_receiptRoutes.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_2\m2_r2_tenant_hook_plan.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_3\m2_r2_security_ws_plan.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission:
Implement all 5 remediation blueprints produced by M2-R2 Explorers 1, 2, and 3:

1. IDOR Remediation in `server/src/routes/receiptRoutes.ts`:
   - Replace with the validated implementation from `.agents/teamwork/m2_r2_explorer_1/proposed_receiptRoutes.ts`.
   - On GET `/api/v1/receipts/:id`, for role RESIDENT, strictly verify:
     `if (user.role === 'RESIDENT' && receipt.uploadedById !== user.id && !user.unitIds.includes(receipt.unitId))` -> return 403 with RFC 7807 problem details (`type: 'https://api.parsbuilding.com/errors/forbidden-unit-access'`).
   - On POST `/api/v1/receipts/verify`, maintain resident unit check `user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId)` and add tenant complex verification.

2. Fastify Hook Precedence & Dual-Source Tenant Resolution in `server/src/middleware/tenant.ts` & `server/src/middleware/rbac.ts`:
   - In `tenant.ts`: Implement Bearer JWT token extraction and verification via `verifyAccessToken`. If valid Bearer token is provided, extract user claims and complexId directly, populate `request.user`, verify non-super-admins cannot supply conflicting `x-complex-id` header (403 on conflict), and enter `tenantStorage`.
   - If Bearer token is absent, fallback to `x-complex-id` header.
   - In `rbac.ts`: Make `authenticate` idempotent (`if (request.user) return;`).

3. Rate Limiting HTTP 429 Status in `server/src/middleware/errorHandler.ts` & `server/src/config/security.ts`:
   - In `errorHandler.ts`: Intercept `(error as any).status === 429 || error.statusCode === 429 || (error as any).type?.includes('rate-limit') || error.code === 'FST_ERR_RATE_LIMIT_EXCEEDED'`.
   - Return HTTP 429 with `Content-Type: application/problem+json` and the RFC 7807 problem details body.
   - In `security.ts`: Ensure `statusCode: 429` is included in `errorResponseBuilder`.

4. WebSocket Cross-Tenant Manager Unit Channel Isolation in `server/src/services/realtimeService.ts`:
   - In `canSubscribe`: When checking `room.startsWith('unit:')`, if user is COMPLEX_MANAGER or SUB_MANAGER, verify that the target unit belongs to the manager's `user.complexId` (using `unitBelongsToComplex` validator engine / cache as specified in M2-R2 Explorer 3 plan). Deny cross-complex unit subscriptions!

5. Financial Reconciliation Transaction in `server/src/services/receiptQueue.ts`:
   - Wrap ledger creation, unit balance update, complex fund update, and receipt status update in an interactive `rawPrisma.$transaction` with mock fallback for Vitest.

6. Update Test Suites:
   - In `tests_e2e/suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts`: Invert assertion in `ADV-M2-4.2` to `assert.equal(hasResidentUnitCheck, true, 'GET /receipts/:id MUST verify resident unit ownership')`.
   - In `server/tests/adversarialM2.test.ts` & `server/tests/adversarialM2Hardening.test.ts`: Update tests to assert that IDOR returns 403, and rate-limit exhaustion returns 429!
