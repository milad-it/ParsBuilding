# Dispatch: M5 Challenger 2 (Tier 5 White-Box Frontend, 3D & Security Hardening)

- **Archetype**: `teamwork_challenger`
- **Role**: Tier 5 Frontend & Security Hardening Challenger
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m5_challenger_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **E2E Infrastructure**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\TEST_INFRA.md`
- **Test Readiness**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\TEST_READY.md`

## Mission & Instructions
Conduct Tier 5 White-Box Adversarial Coverage Hardening on the frontend and tenant security boundaries:
1. Examine `client/src/` components, 3D controllers (`BuildingComplexController`, `BuildingMatrixController`, `ResidentKeycardController`), `ThreeResourceManager`, `authStore.ts`, and `MoneyInput.tsx`:
   - Audit edge-case code paths: WebGL context loss recovery, rapid route switching during 3D animation, negative money inputs, Arabic/Persian mixed numeral inputs, malformed JWT tokens, cross-tenant WebSocket room hijacking.
2. If any untested code path or coverage gap exists, author an empirical stress test suite in `client/tests/` to harden coverage.
3. Run full client test suite (`npm test` in `client/`), client build (`npm run build` in `client/`), and E2E tests (`npm test` in `tests_e2e/`).
4. Commit & push any added tests per `AGENTS.md` / `GEMINI.md`.
5. Deliver your report with explicit gap status (NO_GAPS or GAPS_FOUND) and verdict (`APPROVE` or `REJECT`) to:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m5_challenger_2\handoff.md`
6. Send completion message to orchestrator.

## 2026-11-01T16:59:11Z
You are m5_challenger_2, a teamwork_challenger conducting Tier 5 white-box frontend, 3D, and security hardening.
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m5_challenger_2\
Read your dispatch file:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m5_challenger_2\DISPATCH.md
Also read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\TEST_INFRA.md

Examine client components, 3D memory lifecycles, and tenant security boundaries. Author any needed Tier 5 tests in client/tests/.
Run client tests (`npm test` in `client/`), client build (`npm run build` in `client/`), and E2E tests (`npm test` in `tests_e2e/`).
Produce your handoff report in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m5_challenger_2\handoff.md
with gap status (NO_GAPS or GAPS_FOUND) and verdict: APPROVE or REJECT.
Send completion message to orchestrator.
