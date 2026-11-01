# Dispatch: M3 Challenger 2 (Adversarial REST Security, RBAC & Continuity Verification)

- **Archetype**: `teamwork_challenger`
- **Role**: Adversarial Security & API Tester
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md`

## Adversarial Verification Objective
Empirically challenge the new Fastify domain REST endpoints and WebSocket events:
1. **Cross-Tenant Access & IDOR Probes**:
   - Attempt to access or mutate complex A's units, residents, periods, charges, or transactions using an authenticated token for complex B. Verify strict HTTP 403 / 404 isolation.
   - Resident IDOR: Verify that a resident of Unit 1 cannot view statements or mutate transactions of Unit 2.
2. **RBAC Guard Probes**:
   - Verify that sub-managers without `MANAGE_PERIODS` or `MANAGE_UNITS` cannot create, update, or close periods/units.
   - Verify unauthenticated requests receive RFC 7807 problem details.
3. **Period Lifecycle & Calculation Continuity**:
   - Preview calculations via `POST /periods/:id/calculate` and verify zero-loss conservation.
   - Publish period, record partial payment, close period, and verify unpaid balance transfers cleanly to unit ledger without double counting or lost debts.
4. **Execute builds & tests**:
   - `cd server && npm test`
   - `cd tests_e2e && npm test`

## Deliverable
Write your complete handoff report with clear **APPROVE** or **REJECT** verdict in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\handoff.md`


## 2026-11-01T14:10:27Z
You are M3 Challenger 2 (Adversarial Security & API Tester).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
Read the Worker handoff in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_worker_1\handoff.md

Adversarial tasks:
1. Probe cross-tenant access and IDOR on all Fastify domain endpoints (units, residents, periods, charges, transactions). Confirm strict 403 / 404 isolation.
2. Probe RBAC permissions: verify sub-managers without specific module rights cannot execute mutations.
3. Test period calculation & closing continuity: verify calculation conservation, charge persistence, and debt transfer to unit ledger upon close.
4. Run server tests and E2E tests.
5. Write your complete handoff report with APPROVE or REJECT in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_challenger_2\handoff.md
Once complete, send a message back to the orchestrator.
