# Handoff Report: Milestone 2 Real-Time WebSocket Architecture & AI Payment Receipt Verification Foundation

- **Author**: Teamwork Explorer (M2 Realtime & AI Explorer)
- **Role**: M2 Realtime & AI Explorer (`m2_explorer_3`)
- **Date**: 2026-10-31T21:07:00Z
- **Type**: Hard Handoff (Investigation Complete)
- **Target Specification**: `.agents/teamwork/m2_explorer_3/m2_realtime_ai_plan.md`

---

## 1. Observation

1. **WebSocket Dependency & Server Setup**:
   - `server/package.json` line 25 lists `"@fastify/websocket": "^10.0.1"` under `dependencies`.
   - `server/src/index.ts` lines 6 & 39 already import and register the websocket plugin:
     ```typescript
     import websocket from '@fastify/websocket';
     ...
     await server.register(websocket);
     ```
   - `@fastify/websocket/types/index.d.ts` lines 80–84 show the handler signature in v10.x accepts `(socket: WebSocket.WebSocket, request: FastifyRequest)`.

2. **Database Schema Models & Enums**:
   - `server/prisma/schema.prisma` lines 93–98 declare `ReceiptStatus`:
     ```prisma
     enum ReceiptStatus {
       PENDING           // در انتظار پردازش OCR هوش مصنوعی
       PROCESSED         // پردازش‌شده و استخراج اطلاعات
       VERIFIED          // تایید نهایی توسط مدیر
       REJECTED          // رد شده (نامعتبر یا تکراری)
     }
     ```
   - `server/prisma/schema.prisma` lines 517–544 declare `ReceiptVerification`:
     Fields: `id`, `complexId`, `unitId`, `uploadedById`, `imageUrl`, `status`, `extractedAmount`, `extractedDate`, `trackingNumber`, `destinationCard`, `rawAiOutput`, `verifiedById`, `verifiedAt`, `rejectionReason`.
   - `server/prisma/schema.prisma` lines 433–463 declare `LedgerTransaction` containing foreign key relation `receipt ReceiptVerification? @relation(fields: [receiptId], references: [id])` and `referenceNumber String?`.

3. **Multi-Tenant Context & Worker Execution**:
   - `server/src/config/database.ts` lines 20–21 include `chatmessage` and `receiptverification` in `TENANT_MODELS`.
   - `server/src/config/database.ts` lines 38–45 enforce fail-closed tenant scoping: executing a tenant-scoped query without `complexId` throws `TenantIsolationError`.
   - `server/src/middleware/tenant.ts` lines 42–44 export `runWithTenantContext<T>(context: TenantContext, fn: () => T): T`, providing the exact mechanism needed for background worker tasks to execute database mutations safely within an active tenant boundary.

4. **Numeric and Currency Parsing Utilities**:
   - `server/src/utils/numberUtils.ts` lines 15–22 provide `toEnDigit`, converting Persian `۰-۹` and Arabic `٠-٩` to ASCII digits `0-9`.
   - `server/src/utils/numberUtils.ts` lines 49–52 provide `parseIntegerCurrency`, parsing formatted currency strings into whole Rials or Tomans.

5. **Existing E2E Test Suite Contract for Feature 14**:
   - `tests_e2e/suites/tier1_features/f14_realtime_ai_foundations.test.ts` lines 4–52 validate:
     - `T1.14.1`: Room format `complex:${complexId}`.
     - `T1.14.2`: Room format `unit:${unitId}`.
     - `T1.14.3`: AI receipt queue job payload (`complexId`, `unitId`, `residentId`, `receiptImageUrl`, `expectedAmount`).
     - `T1.14.4`: Status transition array `['QUEUED', 'PROCESSING', 'VERIFIED', 'REJECTED', 'MANUAL_REVIEW']`.
     - `T1.14.5`: Notification payload envelope structure.

---

## 2. Logic Chain

1. **WebSocket Gateway Feasibility**:
   - *Premise*: `@fastify/websocket` is already installed in `server/package.json` and registered in `server/src/index.ts`.
   - *Deduction*: No new external WebSocket library or server restructuring is needed. We can implement `server/src/services/realtimeService.ts` as a singleton gateway that registers the `/ws` endpoint and manages subscriptions.
   - *Tenant Room Isolation*: By checking the handshake token (JWT) and storing `user: { userId, complexId, role, unitIds }` on each extended WebSocket connection, `realtimeService.canSubscribe(user, room)` can deterministically reject cross-tenant and cross-unit eavesdropping.

2. **Async Queue Architecture (Adapter Pattern)**:
   - *Premise*: BullMQ requires Redis (`ioredis`), which might not be running in local developer environments, GitHub Actions CI, or minimal Docker test runners.
   - *Deduction*: Designing an adapter pattern (`IReceiptQueueAdapter`) with a `BullMQReceiptQueueAdapter` (production) and an `InMemoryReceiptQueueAdapter` (development/test) guarantees zero external dependencies while meeting commercial enterprise standards.

3. **Receipt Processing & Automated Reconciliation**:
   - *Premise*: When a receipt is processed, the system must extract metadata and adjust accounting without violating multi-tenant isolation.
   - *Deduction*: By wrapping the worker handler in `runWithTenantContext`, all Prisma queries (`ledgerTransaction.create`, `unit.update`, `complex.update`) automatically inherit `complexId`.
   - *Anti-Replay Security*: Checking `referenceNumber === extractedTrackingNum` on `LedgerTransaction` prevents double-crediting if a resident uploads the same receipt multiple times.
   - *Automated Reconciliation*: When `confidenceScore >= 0.90` and the amount matches the unit's open balance, the system can automatically transition status to `VERIFIED`, create a `LedgerTransaction` (`txKind: MANUAL, type: PAYMENT`), deduct `unit.currentBalance`, add to `complex.currentFund`, and broadcast `RECEIPT_VERIFIED` to `unit:{unitId}` and `PAYMENT_RECEIVED` to `complex:{complexId}`.
   - *Safety Fallback*: If confidence is below threshold (< 0.90) or amounts mismatch, the receipt transitions to `MANUAL_REVIEW`, notifying the manager via WebSocket with zero risk of erroneous automated balance modifications.

---

## 3. Caveats

1. **Prisma Enum Migration**:
   - Currently, `ReceiptStatus` in `server/prisma/schema.prisma` is `[PENDING, PROCESSED, VERIFIED, REJECTED]`.
   - The specification and E2E test `f14` anticipate `PROCESSING` and `MANUAL_REVIEW`.
   - *Recommendation*: Update the Prisma schema enum in M2 or maintain an application-level adapter mapping `PROCESSING` -> worker in-memory status and `MANUAL_REVIEW` -> `PROCESSED` until a schema migration is executed.
2. **Third-Party AI Vision Latency**:
   - Real Vision APIs (e.g. OpenAI GPT-4o Vision or cloud OCR) introduce 1–4 seconds of latency and variable API costs. The worker queue architecture handles this asynchronously so API callers receive `202 Accepted` in < 20ms. A mock vision provider is included for deterministic offline testing.

---

## 4. Conclusion

The architectural design for Milestone 2 Real-Time WebSockets and AI Payment Receipt Verification Foundation is completely mapped out, fully specified in `m2_realtime_ai_plan.md`, and directly compatible with existing database schemas and server bootstrap code:
- **WebSocket Gateway (`realtimeService.ts`)**: Fastify v10 WebSocket handler, JWT handshake auth, fail-closed multi-tenant room isolation (`complex:{id}`, `unit:{id}`), 5 typed event notifications, and 30s heartbeat ping-pong cleanup.
- **AI Receipt Verification Queue (`receiptQueue.ts`)**: Dual-mode queue (BullMQ + In-Memory fallback), pluggable OCR vision provider, anti-replay tracking number verification, automatic ledger reconciliation with unit balance and treasury adjustments, and tenant context isolation via `runWithTenantContext`.

---

## 5. Verification Method

To independently verify the architecture and readiness:
1. **Inspect Plan Artifact**:
   - Read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_explorer_3\m2_realtime_ai_plan.md`.
2. **Run Server Unit & E2E Tests**:
   - Execute vitest on server:
     `npm --prefix server test`
   - Run existing E2E feature 14 test contract:
     `npm --prefix tests_e2e test suites/tier1_features/f14_realtime_ai_foundations.test.ts`
3. **Invalidation Conditions**:
   - The design is invalidated if cross-tenant room subscriptions are permitted without authorization.
   - The design is invalidated if receipt verification blocks the HTTP request/response lifecycle.
   - The design is invalidated if duplicate bank tracking numbers can be credited twice into building funds.
