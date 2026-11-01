# Dispatch: M4 Reviewer 2 (3D Elements, Workflows & Resident Portal Reviewer)

- **Archetype**: `teamwork_reviewer`
- **Role**: 3D Graphics & Domain Workflows Reviewer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_reviewer_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Worker Handoff**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\handoff.md`

## Instructions
Review all 3D graphics, manager workflows, and resident portal implementations:
1. Examine Three.js 3D visual elements:
   - `Building3DHero` (Login tower, lighting, glowing instanced windows, mouse parallax).
   - `BuildingMatrix3D` (Manager dashboard isometric status matrix, financial color coding, raycast hover tooltip, floor explosion toggle, and `BuildingMatrixFallback`).
   - `ResidentKeycard3D` (Holographic resident card, gyroscopic tilt, flip to IBAN/QR, and `ResidentKeycardFallback`).
   - `ThreeResourceManager` (Memory and WebGL context disposal).
2. Examine Manager Workflows (`DashboardPage`, `UnitsPage`, `PeriodsPage`, `PaymentsPage`, `LedgerPage`, `AuditLogsPage`, `BulletinPage`):
   - Real-time calculation preview during period creation.
   - Period lifecycle (DRAFT -> ACTIVE -> CLOSED).
   - Payment recording with atomic ledger updates.
3. Examine Dedicated Resident Portal (`ResidentPortalPage`):
   - Digital bulletin board, personal ledger statement, and online payment view with Shaparak simulation.
4. Verify real-time event integration via `client/src/services/websocket.ts`.
5. Run client tests (`npm test` in `client/`), client build (`npm run build` in `client/`), server tests (`npm test` in `server/`), and E2E tests (`npm test` in `tests_e2e/`).
6. Deliver your report with an explicit verdict (`APPROVE` or `REQUEST_CHANGES`) to:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_reviewer_2\handoff.md`
7. Send completion message to orchestrator.
