# Dispatch: M4 Worker 1 (World-Class SaaS UI/UX, 3D Elements & Resident Portal)

- **Archetype**: `teamwork_worker`
- **Role**: Lead Full-Stack Frontend Engineer
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Explorer Hand-off Blueprints**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_1\handoff.md` (Frontend Architecture, React/Vite/TS, Tailwind RTL & Component Library)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\handoff.md` (Three.js 3D Visual Elements: 3D Building, Status Matrix, Resident Keycard, Fallbacks)
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_3\handoff.md` (Manager Workflows, Dedicated Resident Portal & Real-Time APIs)
- **Client Services Already Implemented**:
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client\src\services\api.ts`
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client\src\services\websocket.ts`
  - `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client\src\services\migrationBridge.ts`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & Responsibilities
1. **Initialize `client/` React 18+ / Vite / TypeScript Environment**:
   - Create `client/package.json` with scripts (`dev`, `build`, `typecheck`, `test`), dependencies (`react`, `react-dom`, `lucide-react`, `three`, `@types/three`, `clsx`, `tailwind-merge`), and devDependencies (`vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`).
   - Create `client/vite.config.ts`, `client/tsconfig.json`, `client/tailwind.config.js`, `client/postcss.config.js`, and `client/index.html`.
   - Install packages via npm in `client/`.
2. **Implement Persian RTL SaaS Design System**:
   - Configure Vazirmatn font-face in CSS, `dir="rtl"`, and custom SaaS slate/emerald/amber/crimson palette with glassmorphism.
   - Implement reusable UI primitives in `client/src/components/ui/`: `Button`, `Input`, `MoneyInput` (with Persian digit formatting and zero cursor jumping), `Modal`, `StatCard`, `Badge`, `Tabs`, `DataTable`, `Toast`.
   - Implement modern SaaS layout shell in `client/src/components/layout/`: `Sidebar` (collapsible RTL sidebar with navigation to Dashboard, Units, Periods, Payments, Ledger, Audit, Bulletin, Settings, Resident Portal), `Header` (breadcrumbs, active tenant indicator, notification bell, profile menu), and `ResponsiveContainer` (replacing the 500px mobile container).
3. **Implement 3D Visual Elements (Three.js)**:
   - `Building3DHero.tsx` in `client/src/components/3d/`: 3D interactive modern high-rise building with glowing windows, day/dusk/night ambient lighting, and mouse parallax.
   - `BuildingMatrix3D.tsx` in `client/src/components/3d/`: 3D isometric building status matrix mapping units to spatial cubicles color-coded by financial status (Paid/Credit, Pending, Debt), interactive raycast hover with Persian tooltip, floor explosion toggle, and graceful 2D isometric CSS/SVG fallback.
   - `ResidentKeycard3D.tsx` in `client/src/components/3d/`: 3D holographic digital resident keycard with metallic sheen, dynamic canvas texture, gyroscopic tilt, and flip-to-IBAN/QR view.
4. **Implement Manager Workflows & Views**:
   - `DashboardView.tsx`: Real-time treasury fund, debt total, collection rate %, active period status, unit occupancy stats, 3D building matrix, and quick action bar.
   - `UnitsView.tsx`: Interactive unit cards and table, balance badges, occupant details, unit edit modal.
   - `PeriodsView.tsx`: Period creation modal with Iranian building expense categories, real-time share calculation preview, draft/publish/close lifecycle actions.
   - `PaymentsView.tsx`: Payment recording modal, auto-crediting unit balance and treasury fund.
   - `LedgerView.tsx`: Searchable double-entry financial ledger and immutable audit log viewer (`AuditLogView.tsx`).
5. **Implement Dedicated Resident Portal (`/resident`)**:
   - `ResidentPortalView.tsx`: Clean mobile/desktop portal with:
     - Digital Bulletin Board (`BulletinView.tsx`): Announcements, notices, assembly meetings.
     - Personal Statement & Ledger: Current balance (Green credit / Red debt), historical period breakdown, receipts.
     - Online Payment View: "Pay Balance" modal with simulated payment gateway and receipt uploader.
     - 3D Holographic Keycard.
6. **Integrate Real-Time Services**:
   - Bind views to `client/src/services/api.ts` and `client/src/services/websocket.ts` for live event streaming and toast alerts.
7. **Testing & Verification**:
   - Add frontend unit tests in `client/tests/` verifying components, `MoneyInput`, routing, and state.
   - Run `npm test` in `client/` and `npm run build` in `client/`.
   - Run server tests (`npm test` in `server/`) — verify 187/187 pass.
   - Run E2E tests (`npm test` in `tests_e2e/`) — verify 214/214 pass.
8. **Git Commit & Push**:
   - Follow `AGENTS.md` / `GEMINI.md`: `git status`, `git add .`, commit with clean message describing Milestone 4 implementation, and `git push origin main`.
9. **Deliverable**:
   - Write comprehensive handoff report to:
     `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\handoff.md`
   - Send completion message to orchestrator.
