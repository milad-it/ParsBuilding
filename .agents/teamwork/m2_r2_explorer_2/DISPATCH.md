## 2026-10-31T21:36:28Z
You are M2-R2 Explorer 2 (Fastify Hook Precedence & Tenant Resolution Specialist).
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_2\

Read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_challenger_1\handoff.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\index.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\middleware\tenant.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\middleware\rbac.ts

Mission:
Challenger 1 discovered an architectural defect: server.addHook('preHandler', tenantMiddleware) in index.ts executes before route-level preHandler: [authenticate]. Consequently, when authenticated requests send a Bearer token without an explicit 'x-complex-id' header, tenantMiddleware runs while request.user is undefined and rejects the request with HTTP 400 Tenant Context Missing, despite the user's token containing complexId!

Formulate an exact, drop-in remediation plan:
1. Analyze the interaction between tenantMiddleware and authenticate.
2. In tenantMiddleware, check if an Authorization Bearer token exists on the request. If no x-complex-id header is present but a Bearer token is provided, safely decode/verify the JWT token payload (using jwtService/authService or token decode) to extract complexId and user claims, or design the hook sequence so authenticate runs before tenant validation on protected routes, while exempting public routes (/auth/login, /health, etc.).
3. Ensure AsyncLocalStorage tenantStorage correctly receives complexId from both header AND verified Bearer token seamlessly.
4. Provide complete, drop-in replacement code for server/src/middleware/tenant.ts, server/src/index.ts, and any affected routes/tests.
5. Write your comprehensive report to .agents/teamwork/m2_r2_explorer_2/m2_r2_tenant_hook_plan.md and handoff.md.
6. Deliver completion message with file paths via send_message to the orchestrator.
