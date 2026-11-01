# Dispatch: M3-R2 Challenger 1

- **Archetype**: `teamwork_challenger`
- **Role**: Adversarial Ingestion & Persistence Challenger
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_3\handoff.md`

## Instructions
Empirically stress-test the data migration pipeline and debt reconciliation:
1. Challenge duplicate unit numbers in migration payload: verify it is rejected and cannot cause silent debt drop.
2. Challenge authentic database debt reconciliation: verify that if a database balance deviates from expected debts, migration rolls back cleanly with `MigrationReconciliationError`.
3. Challenge `expectedEndingFund` and `expectedTotalDebts` handling.
4. Run server adversarial test suites (`npm test -- tests/adversarialMigration.test.ts` in `server`) and verify passing results.
5. Provide your explicit verdict (`APPROVE` or `REJECT`) and evidence in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_1\handoff.md`
6. Send completion message to orchestrator.


## 2026-11-01T16:00:05Z
You are m3_r2_challenger_1, a teamwork_challenger evaluating Gate 3 (Milestone 3 Iteration 2).
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_1\
Read your dispatch file:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_1\DISPATCH.md
Also read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_3\handoff.md

Empirically stress-test the data migration pipeline and debt reconciliation:
- Duplicate unit rejection in payload (preventing silent debt drops).
- Authentic PostgreSQL debt conservation query (`tx.unit.findMany`) and rollback on discrepancy.
- Expected debts and expected ending fund reconciliation.
Run server adversarial tests (`npm test -- tests/adversarialMigration.test.ts` in `server`).
Produce your handoff report in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_1\handoff.md
with an explicit verdict: APPROVE or REJECT.
Send completion message to orchestrator.
