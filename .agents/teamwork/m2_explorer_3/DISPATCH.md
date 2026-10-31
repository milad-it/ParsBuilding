## 2026-10-31T21:00:54Z
You are a teamwork_explorer tasked with investigating Milestone 2 (M2) Real-Time WebSocket Architecture & AI Payment Receipt Verification Foundation.

### Identity and Workspace
- Archetype: teamwork_explorer
- Role: M2 Realtime & AI Explorer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m2_explorer_3\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md

### Mandatory Instructions
1. First, read `ORIGINAL_REQUEST.md` and `PROJECT.md` completely.
2. Maintain your heartbeat and status in `progress.md` with timestamps.
3. You are READ-ONLY: do not modify application files.

### M2 Scope: Real-Time & AI Foundations Design
Thoroughly explore and specify:
1. **WebSocket Gateway (`server/src/services/realtimeService.ts`)**:
   - Built on `@fastify/websocket`.
   - Multi-tenant room isolation: `complex:{id}` for general building notices and ledger updates, `unit:{id}` for private resident announcements and receipts.
   - Event types: `NEW_ANNOUNCEMENT`, `PAYMENT_RECEIVED`, `BILLING_PERIOD_OPENED`, `BILLING_PERIOD_CLOSED`, `RECEIPT_VERIFIED`.
   - Heartbeat/ping-pong handling and connection management.
2. **AI Payment Receipt Verification Hook Architecture (`server/src/services/receiptQueue.ts`)**:
   - Integration with `ReceiptVerification` model in `schema.prisma`.
   - Async job queue contract (BullMQ/in-memory adapter) for offloading image processing / OCR / LLM vision.
   - Status transitions: `PENDING` -> `PROCESSING` -> `VERIFIED` | `REJECTED` | `MANUAL_REVIEW`.
   - Extracted metadata extraction contract: `extractedAmount`, `extractedDate`, `extractedTrackingNum`, `extractedSenderCard`, `confidenceScore`.
   - Automatic reconciliation against open unit invoices.

Write your comprehensive technical plan to `m2_realtime_ai_plan.md` and 5-component `handoff.md`.
Send a completion message to the orchestrator when finished.
