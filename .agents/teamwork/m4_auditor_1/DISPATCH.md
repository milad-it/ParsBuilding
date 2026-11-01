# Dispatch: M4 Forensic Auditor (Milestone 4 Integrity Verification)

- **Archetype**: `teamwork_auditor`
- **Role**: Forensic Integrity Auditor
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_auditor_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\handoff.md`

## Instructions
Conduct forensic integrity audit on Milestone 4 frontend code in `client/`:
1. Check for:
   - Any hardcoded test bypasses, synthetic responses, or fake UI facades pretending to interact with APIs.
   - Any mock data presented as live data without API backing.
   - Genuine Three.js WebGL canvas implementations (`Building3DComplex`, `BuildingMatrix3D`, `ResidentKeycard3D`) vs static images masquerading as 3D.
   - Genuine Persian RTL implementation vs superficial LTR overrides.
   - Verification that backend and E2E test suites remain authentic and intact.
2. Run client tests, client build, server tests, and E2E tests.
3. Deliver an unambiguous binary verdict: `CLEAN` or `INTEGRITY VIOLATION`.
4. Output your complete audit report to:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_auditor_1\handoff.md`
5. Send completion message to orchestrator.

## 2026-11-01T16:43:18Z
From: e906fd40-417c-4738-8fa8-9895a4f89f83
You are m4_auditor_1, a teamwork_auditor performing forensic integrity verification on Milestone 4.
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_auditor_1\
Read your dispatch file:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_auditor_1\DISPATCH.md
Also read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\handoff.md

Conduct static analysis and runtime integrity checks on Milestone 4:
1. Verify genuine Three.js WebGL canvas implementations (`Building3DComplex`, `BuildingMatrix3D`, `ResidentKeycard3D`) vs static images.
2. Check for absence of cheating, fake facades, hardcoded test passes, or mocked data masquerading as live API data.
3. Verify genuine Persian RTL layout and styling.
4. Run client tests, client build, server tests, and E2E tests.
5. Deliver an unambiguous binary verdict: CLEAN or INTEGRITY VIOLATION.
Produce your audit handoff report in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_auditor_1\handoff.md
Send completion message to orchestrator.
