## 2026-10-31T20:18:42Z
You are a teamwork_explorer tasked with investigating Milestone 1 (M1) Iteration 2 remediation for Database Schema Referential Integrity and Constraints.

### Identity and Workspace
- Archetype: teamwork_explorer
- Role: M1 Schema Referential Integrity Explorer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_r2_explorer_2\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- Previous Failure Report: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_challenger_2\handoff.md

### Mandatory Instructions
1. First, read `ORIGINAL_REQUEST.md`, `PROJECT.md`, and Challenger 2's handoff report completely.
2. Maintain your heartbeat and status in `progress.md` with timestamps.
3. You are READ-ONLY: do not modify application files.

### Remediation Exploration Focus
In `server/prisma/schema.prisma`:
- Challenger 2 detected: `unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)` in `LedgerTransaction`. Deleting a unit cascade-deletes all historical ledger records, breaking double-entry accounting.
  - Detail changing `LedgerTransaction.unit` and `UnitCharge.unit` to `onDelete: Restrict` so units with financial history cannot be casually deleted.
- Challenger 2 detected: `sender User` in `ChatMessage` and `uploadedBy User` in `ReceiptVerification` have `onDelete: Cascade`.
  - Detail changing to `onDelete: SetNull` (with nullable `senderId` and `uploadedById`) so messages and verified receipts are permanently preserved.
- Challenger 2 detected missing composite unique constraints:
  - Add `@@unique([complexId, type, year, month])` on `Period` to prevent duplicate billing periods in the same complex.
  - Add `@@unique([complexId, phone])` on `Resident` to prevent duplicate resident records in the same complex.

Write a technical remediation plan to `remediation_plan.md` and `handoff.md`.
Send a completion message to the orchestrator when finished.
