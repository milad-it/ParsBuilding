# Dispatch: M3-R2 Challenger 2

- **Archetype**: `teamwork_challenger`
- **Role**: Adversarial Accounting & Security Challenger
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_3\handoff.md`

## Instructions
Empirically stress-test period closing accounting math and migration security:
1. Challenge DEFECT-M3-01: verify that when a period with charges is closed, balances do NOT double-credit payments, and accurately reflect unpaid charges across zero-payment, partial-payment, full-payment, and overpayment scenarios.
2. Challenge migration endpoint cross-tenant IDOR: verify that a manager cannot trigger migration on a foreign `complexId` (must return HTTP 403).
3. Challenge unauthenticated migration request: verify HTTP 401.
4. Run server adversarial security tests (`npm test -- tests/adversarialM3DomainSecurity.test.ts` in `server`) and verify passing results.
5. Provide your explicit verdict (`APPROVE` or `REJECT`) and evidence in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_r2_challenger_2\handoff.md`
6. Send completion message to orchestrator.
