# Dispatch: M3-R2 Explorer 1 (Authentic DB Debts Reconciliation & Ingestion Integrity)

- **Archetype**: `teamwork_explorer`
- **Role**: Migration Integrity & Accounting Researcher
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Previous Gate Findings**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_reviewer_1\handoff.md`
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_1\handoff.md`

## 2026-11-01T14:23:38Z
You are M3-R2 Explorer 1 (Authentic DB Debts Reconciliation & Ingestion Integrity).
Investigate:
1. Authentic DB debt reconciliation in `server/src/services/migrationService.ts`: query persisted units from DB, calculate actual debts, compare against legacy debts & expectedTotalDebts.
2. Eliminate silent debt drop when duplicate unit numbers exist in payload.
3. Fix string parsing regex in `toEnDigit` / `parseDecimal` for Arabic 8 with zeroes.
4. Trim whitespace-only phones.
5. Write your complete handoff report with drop-in code recommendations in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_explorer_1\handoff.md
Once complete, send a message back to the orchestrator.
