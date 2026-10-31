# Handoff Report: Fastify Hook Precedence & Tenant Resolution Architecture

**Agent**: M2-R2 Explorer 2 (Fastify Hook Precedence & Tenant Resolution Specialist)  
**Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_2\`  
**Milestone**: M2 (Security Hardening, Authentication & Granular RBAC)  
**Status**: COMPLETE (Hard Handoff)  

---

## 1. Observation

1. **Fastify Hook Registration & Execution Order**:
   - In `server/src/index.ts` line 36:
     ```typescript
     server.addHook('preHandler', tenantMiddleware);
     ```
   - In `server/src/routes/subManagerRoutes.ts` line 39:
     ```typescript
     fastify.get('/complex/sub-managers', {
       preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
     }, async (request) => { ... });
     ```
   - In Fastify's lifecycle, server instance preHandler hooks execute strictly before route-level `preHandler` arrays.

2. **Tenant Middleware Premature Rejection**:
   - In `server/src/middleware/tenant.ts` lines 86–119:
     ```typescript
     // If request.user is already authenticated, use their tenant scope
     if (request.user) {
       // ...
       return;
     }

     const complexIdHeader = request.headers['x-complex-id'] || request.headers['x-tenant-id'];
     // ...
     if (!complexId && !isPublic) {
       return reply.code(400)
         .header('Content-Type', 'application/problem+json')
         .send({
           type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
           title: 'Tenant Context Missing',
           status: 400,
           detail: "Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource.",
           instance: request.raw.url || request.url
         });
     }
     ```
   - Because `tenantMiddleware` executes before route `preHandler: [authenticate]`, `request.user` is always `undefined`.
   - When requests are transmitted with valid `Authorization: Bearer <token>` without an explicit `x-complex-id` header:
     Verbatim Response: `HTTP 400 {"type":"https://api.parsbuilding.com/errors/tenant-context-missing","title":"Tenant Context Missing","status":400,"detail":"Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource."}`.
   - The verified user claims embedded inside the JWT payload are completely ignored.

3. **Rate Limit Status Code Conversion in Error Handler**:
   - In `server/tests/adversarialM2Hardening.test.ts` line 167:
     ```
     HOOK ONERROR: errObj: {
       type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
       title: 'Too Many Requests',
       status: 429
     }
     CONFIRMED BUG: Login rate limit violation returns HTTP 500 instead of HTTP 429 Problem Details!
     ```
   - In `server/src/middleware/errorHandler.ts` line 57:
     `error.statusCode` is checked, but not `(error as any).status`. Consequently, Fastify rate-limit errors default to HTTP 500.

4. **Cross-Resident Receipt IDOR**:
   - In `server/src/routes/receiptRoutes.ts` line 88:
     `if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId)`
     Only validates tenant boundary, omitting resident unit ownership verification (`uploadedById !== user.id && !user.unitIds.includes(receipt.unitId)`).

5. **Test Suite Baseline**:
   - Command: `npm.cmd --prefix server test`
   - Output: `11 passed (11), Tests 95 passed (95), Duration 2.82s`.
   - Command: `powershell -Command "Set-Location tests_e2e; node --test --experimental-strip-types suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts"`
   - Output: `tests 15, suites 5, pass 15, fail 0, duration_ms 155.5654`.

---

## 2. Logic Chain

1. **Hook Lifecycle Sequence**:
   - Fastify's architecture dictates: `Instance preHandler -> Plugin preHandler -> Route preHandler -> Route Handler`.
   - Therefore, any hook attached with `server.addHook('preHandler', ...)` executes before the route's `preHandler` array.
   - Route-level `authenticate` never runs before `tenantMiddleware`.
2. **Dual-Source Tenant Resolution Necessity**:
   - In commercial SaaS architectures, clients transmit authentication tokens via standard `Authorization: Bearer <JWT>`.
   - The JWT token payload already contains `complexId`, `role`, and `userId`.
   - Requiring a separate `x-complex-id` header violates REST conventions, introduces client friction, and creates cross-tenant header spoofing attack vectors if a client passes a header that conflicts with their token.
3. **Resolution Strategy**:
   - In `tenantMiddleware`, detect whether `Authorization: Bearer <token>` is present.
   - Safely verify and decode the token using `verifyAccessToken(token)`.
   - If valid, populate `request.user` immediately, extract `complexId` from token claims, enforce that non-super-admins cannot spoof a foreign `complexId` via headers (returning HTTP 403 on conflict), and enter `tenantStorage.enterWith(context)`.
   - If token is absent, fallback to `x-complex-id` header check. If both are absent on a protected route, return HTTP 400 Tenant Context Missing (maintaining full compatibility with `server.test.ts`).
   - In `server/src/middleware/rbac.ts`, make `authenticate` idempotent: `if (request.user) return;`.

---

## 3. Caveats

- Super Admin users can operate with an empty `complexId` string (`''`) to perform global platform queries. `database.ts` line 44 explicitly supports this:
  `if (ctx?.role === 'SUPER_ADMIN' && !ctx.complexId) return '';`.
  The updated `tenantMiddleware` allows Super Admin users to query without `complexId` without returning 400.
- For public routes (`/health`, `/api/v1/ping`, `/api/v1/auth/login`, etc.), invalid or expired tokens in headers are safely ignored rather than throwing 401, allowing public requests to proceed anonymously.

---

## 4. Conclusion

The Fastify hook precedence defect is completely remediable via drop-in enhancements without refactoring route signatures or breaking existing tests:
1. **`server/src/middleware/tenant.ts`**: Upgraded to dual-source resolver supporting both Bearer JWT token verification and tenant headers, with strict spoofing protection.
2. **`server/src/middleware/rbac.ts`**: Updated to make `authenticate` idempotent.
3. **`server/src/middleware/errorHandler.ts`**: Updated to inspect `error.statusCode || (error as any).status` ensuring HTTP 429 is returned for rate limit violations.
4. **`server/src/routes/receiptRoutes.ts`**: Updated with resident unit access check to eliminate IDOR.
5. Complete drop-in code is documented in `.agents/teamwork/m2_r2_explorer_2/m2_r2_tenant_hook_plan.md`.

---

## 5. Verification Method

To independently verify the implementation:

```powershell
# 1. Run all unit and adversarial server tests
npm.cmd --prefix server test

# 2. Run Tier 5 E2E adversarial suite
powershell -Command "Set-Location tests_e2e; node --test --experimental-strip-types suites/tier1_features/f10_hardened_auth.test.ts suites/tier1_features/f11_granular_rbac.test.ts suites/tier3_combinations/rbac_resident_portal_access.test.ts suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts"
```

### Invalidation Conditions
- If any request bearing a valid JWT token without `x-complex-id` header returns HTTP 400 Tenant Context Missing on protected routes, the fix has failed.
- If a resident can view another resident's payment receipt via `GET /api/v1/receipts/:id`, the IDOR check has failed.
- If `POST /api/v1/auth/login` rate limit violations return HTTP 500 instead of HTTP 429, the error handler status fix has failed.
