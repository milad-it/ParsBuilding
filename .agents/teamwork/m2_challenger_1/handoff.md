# Handoff Report: M2 Adversarial Verification of Auth & Granular RBAC

**Agent**: teamwork_challenger (Critic / Specialist)
**Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_challenger_1\`
**Verdict**: **REJECT**

---

## 1. Observation

1. **E2E Test Suites**:
   - Command: `cd tests_e2e && node --experimental-strip-types --test suites/tier1_features/f10_hardened_auth.test.ts suites/tier1_features/f11_granular_rbac.test.ts suites/tier3_combinations/rbac_resident_portal_access.test.ts`
   - Output: `ℹ tests 15, ℹ suites 3, ℹ pass 15, ℹ fail 0, ℹ duration_ms 208.725`
2. **Cross-Resident Receipt IDOR Vulnerability**:
   - In `server/src/routes/receiptRoutes.ts` (lines 70–93):
     ```typescript
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
   - Empirical probe in `server/tests/adversarialM2.test.ts`:
     Resident Alice (Unit 101) requested `GET /api/v1/receipts/:id` belonging to Bob (Unit 202) in the same complex.
     Output: `[ADV-4.2 PROBE RESULT] Cross-Resident Receipt Access: statusCode=200`
     Verbatim warning: `🚨 VULNERABILITY CONFIRMED: GET /receipts/:id allows cross-resident receipt inspection within same complex!`
3. **Fastify Hook Precedence Order**:
   - In `server/src/index.ts` line 36:
     ```typescript
     server.addHook('preHandler', tenantMiddleware);
     ```
   - In `server/src/routes/subManagerRoutes.ts` line 39:
     ```typescript
     preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
     ```
   - Because global preHandler hooks run before route-level preHandler hooks in Fastify, `tenantMiddleware` executes while `request.user` is undefined.
   - When requests sent without redundant `x-complex-id` header:
     Verbatim Response: HTTP 400 `{"type":"https://api.parsbuilding.com/errors/tenant-context-missing","title":"Tenant Context Missing","status":400,"detail":"Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource."}`
4. **Rate Limit Status Code Conversion Error**:
   - Command: `npm.cmd --prefix server test`
   - Test in `tests/adversarialM2Hardening.test.ts`:
     ```
     HOOK ONERROR: {
       errObj: {
         type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
         status: 429
       }
     }
     attackRes6 status: 500 body: {"statusCode":500,"error":"Internal Server Error"}
     AssertionError: expected 500 to be 429
     ```
   - In `server/src/middleware/errorHandler.ts` lines 57–59:
     ```typescript
     const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
       ? error.statusCode
       : 500;
     ```
     Because `error.statusCode` is checked but not `(error as any).status`, rate limits return 500 instead of 429.
5. **Verified Cryptographic Strengths**:
   - Token tampering rejection: Tampered payload throws `Invalid token signature`, expired tokens throw `Token expired` (401).
   - Refresh token replay: Presenting a rotated token (`revokedAt !== null`) triggers `rawPrisma.refreshToken.updateMany({ where: { userId, revokedAt: null } })`, revoking all sessions and logging `securityAlert: 'REFRESH_TOKEN_REUSE_DETECTED'`.
   - Granular RBAC: Resident tokens receive 403 on `/complex/sub-managers`, Sub-managers without `MANAGE_FINANCES` cannot mutate ledgers.

---

## 2. Logic Chain

1. **Cross-Resident Isolation Logic**:
   - By requirement R1 and R4 (PROJECT.md), resident portal users must be isolated strictly to their assigned units.
   - Observation 2 demonstrates that `GET /api/v1/receipts/:id` does not check resident unit assignment (`unitIds`) or uploader identity (`uploadedById`).
   - Consequently, any authenticated resident can read private banking receipts of every other resident within their complex, violating data privacy and confidentiality boundaries.
2. **Hook Execution Precedence Logic**:
   - In Fastify, server-level hooks added with `server.addHook('preHandler', ...)` are guaranteed to run before route-specific `preHandler` arrays.
   - Observation 3 shows `tenantMiddleware` runs prior to `authenticate`.
   - As a result, `request.user` is unavailable during `tenantMiddleware`. Unless the client manually passes `x-complex-id`, requests fail with HTTP 400, discarding the authenticated JWT claims.
3. **Error Handler Logic**:
   - Observation 4 shows `loginRateLimitConfig` outputs an object containing `status: 429`.
   - `errorHandler.ts` checks only `error.statusCode`.
   - Therefore, rate-limited responses fall back to HTTP 500 instead of HTTP 429.

---

## 3. Caveats

- Unit invoice endpoints are scheduled for M3 under Feature 16 (`REST APIs`). Thus, resident invoice cross-access was audited based on available receipt verification endpoints (`receiptRoutes.ts`) which represent the resident payment artifact surface in M2.
- The PostgreSQL database was verified against mocked Prisma clients in Vitest as standard unit/integration practice; production database container execution was not used.

---

## 4. Conclusion

**Verdict: REJECT.**

The core cryptographic authentication mechanisms (Argon2id, HMAC-SHA256, refresh token family revocation, rate limit enforcement) and basic role guards are operational and verified. However, **M2 cannot be marked DONE until the following two bugs are resolved**:
1. **Fix IDOR in `server/src/routes/receiptRoutes.ts`**: Add unit check for residents:
   ```typescript
   if (request.user!.role === 'RESIDENT' &&
       receipt.uploadedById !== request.user!.id &&
       !request.user!.unitIds.includes(receipt.unitId)) {
     return reply.code(403).send({ error: 'Forbidden', message: 'شما فقط مجاز به مشاهده فیش واحد خود هستید' });
   }
   ```
2. **Fix Fastify Hook Precedence in `server/src/index.ts` / `server/src/middleware/tenant.ts`**: Ensure authenticated user tenant context is recognized on protected routes without requiring redundant `x-complex-id` header when Bearer token is present.
3. **Fix Error Handler Status Property in `server/src/middleware/errorHandler.ts`**: Check `error.statusCode || (error as any).status` to return HTTP 429 instead of 500.

---

## 5. Verification Method

To independently verify these findings, run:
```powershell
# 1. Run mandatory E2E test suites
Set-Location -Path "tests_e2e"
node --experimental-strip-types --test suites/tier1_features/f10_hardened_auth.test.ts suites/tier1_features/f11_granular_rbac.test.ts suites/tier3_combinations/rbac_resident_portal_access.test.ts

# 2. Run Tier 5 M2 E2E Adversarial Suite (asserting cryptographic checks and flagging IDOR omission)
node --experimental-strip-types --test suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts

# 3. Run Server Adversarial Suite (empirically executing HTTP calls against Fastify)
Set-Location -Path ".."
npm.cmd --prefix server test -- tests/adversarialM2.test.ts
```

Invalidation conditions:
- If `GET /api/v1/receipts/:id` is updated to return HTTP 403 when a resident queries a receipt for another unit, the IDOR finding is resolved.
- If requests with valid Bearer tokens without `x-complex-id` headers resolve tenant context successfully without returning 400, the hook precedence defect is resolved.
