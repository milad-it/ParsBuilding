## 2026-10-31T21:36:28Z
You are M2-R2 Explorer 3 (Error Handling, Rate Limiting & WebSocket Isolation Specialist).
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_r2_explorer_3\

Read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_challenger_1\handoff.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_challenger_2\handoff.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\middleware\errorHandler.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\config\security.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\services\realtimeService.ts
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server\src\services\receiptQueue.ts

Mission:
Challengers 1 and 2 discovered two critical defects:
1. Rate limit error returns HTTP 500 instead of HTTP 429: In errorHandler.ts, line 57 checks error.statusCode, but Fastify rate-limit error responseBuilder provides status: 429 and type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded'. Because error.statusCode is undefined, errorHandler falls back to HTTP 500!
2. Manager WebSocket cross-tenant unit room subscription: In realtimeService.ts (lines 181-186), canSubscribe allowed COMPLEX_MANAGER or SUB_MANAGER to subscribe to any unit:{unitId} room without checking whether that unit belongs to the manager's complexId!
3. Reviewer 2 also recommended wrapping receiptQueue.ts lines 219-245 in an atomic prisma.$transaction.

Formulate an exact, drop-in remediation plan:
1. Design exact fix in errorHandler.ts to properly check (error as any).status || error.statusCode || 500, and ensure RFC 7807 problem details with Content-Type application/problem+json are returned with HTTP 429.
2. Design exact fix in realtimeService.ts canSubscribe to verify that for unit:{unitId} rooms, if user is COMPLEX_MANAGER or SUB_MANAGER, the unit must belong to user.complexId (e.g. via room naming convention complex:{complexId}:unit:{unitId} or unit cache/lookup).
3. Design atomic prisma.$transaction for receiptQueue.ts.
4. Provide complete, drop-in replacement code for errorHandler.ts, security.ts, realtimeService.ts, and receiptQueue.ts.
5. Write your comprehensive report to .agents/teamwork/m2_r2_explorer_3/m2_r2_security_ws_plan.md and handoff.md.
6. Deliver completion message with file paths via send_message to the orchestrator.
