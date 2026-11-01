# BRIEFING — 2026-11-01T16:25:00Z

## Mission
Implement Milestone 4: World-Class Persian RTL SaaS UI/UX, Three.js 3D Visual Elements, Manager Workflows & Dedicated Resident Portal in client/

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_worker_1\
- Original parent: e906fd40-417c-4738-8fa8-9895a4f89f83
- Milestone: Milestone 4 (SaaS UI/UX, 3D Elements & Resident Portal)

## 🔒 Key Constraints
- Genuine implementation — no cheating, no hardcoded results, no dummy facades.
- Persian RTL SaaS first-class UX, Vazirmatn typography, eliminate 500px mobile container.
- Three.js 3D elements: Building3DHero/Complex, BuildingMatrix3D, ResidentKeycard3D with graceful fallbacks.
- Complete Manager Workflows: Dashboard, Units, Periods, Payments, Ledger, AuditLog.
- Dedicated Resident Portal (/resident): Bulletin Board, Personal Ledger & Statement, Payment modal, 3D Keycard.
- Real-time WebSockets & API integration.
- Must pass client unit tests and client build (0 errors).
- Server tests (187/187) and E2E tests (214/214) must remain passing with zero regressions.
- Git commit & push required per AGENTS.md / GEMINI.md.

## Current Parent
- Conversation ID: e906fd40-417c-4738-8fa8-9895a4f89f83
- Updated: 2026-11-01T16:25:00Z

## Task Summary
- **What to build**: Full-featured React 18+ / Vite / TypeScript SaaS web application in `client/` with Persian RTL design, Three.js visual elements, manager views, resident portal, real-time WebSocket bindings.
- **Success criteria**:
  1. `client/` builds cleanly (`npm run build`).
  2. `client/` unit tests pass (`npm test`).
  3. `server/` tests pass (187/187).
  4. `tests_e2e/` tests pass (214/214).
  5. Clean git status, committed and pushed to `main`.
  6. Self-contained handoff report in `m4_worker_1/handoff.md`.
- **Interface contracts**: PROJECT.md, m4_explorer_1/handoff.md, m4_explorer_2/handoff.md, m4_explorer_3/handoff.md.

## Key Decisions Made
- Adopting custom Three.js controller pattern for 60 FPS performance, precise resource disposal (`ThreeResourceManager`), and zero dependency issues.
- Using Zustand for auth and UI state.
- Lucide-react for iconography.
- Full Persian RTL support with `dir="rtl"`, Vazirmatn font-face, and zero cursor-jump `MoneyInput`.

## Artifact Index
- `client/` — Production React/Vite/TS frontend
- `handoff.md` — Final handoff report

## Change Tracker
- **Files modified**:
  - `client/package.json`: Client dependencies (React 18, Vite 5, TS 5, Tailwind 3, Three.js, Zustand, Lucide, Vitest)
  - `client/vite.config.ts`, `client/tsconfig.json`, `client/tailwind.config.ts`, `client/postcss.config.js`: Modern toolchain
  - `client/index.html`: Persian RTL SaaS root with Vazirmatn preload
  - `client/src/index.css`: Vazirmatn typography, scrollbars, tabular figures
  - `client/src/utils/`: `cn.ts`, `formatters.ts`, `jalali.ts`
  - `client/src/store/`: `authStore.ts`, `uiStore.ts`
  - `client/src/components/common/`: `Button`, `Input`, `MoneyInput`, `Modal`, `StatCard`, `Badge`, `Tabs`, `DataTable`, `Toast`
  - `client/src/components/layout/`: `Sidebar`, `Header`, `AppShell`
  - `client/src/components/3d/`: `ThreeResourceManager`, `WebGLDetector`, `CanvasTextureGenerator`, `Building3DComplex`, `BuildingMatrix3D`, `ResidentKeycard3D`, and 2D fallbacks
  - `client/src/pages/`: `LoginPage`, `DashboardPage`, `UnitsPage`, `PeriodsPage`, `PaymentsPage`, `LedgerPage`, `AuditLogsPage`, `BulletinPage`, `ResidentPortalPage`, `SettingsPage`
  - `client/src/services/api.ts`, `client/src/services/migrationBridge.ts`: Domain APIs and bridge exports
  - `client/tests/`: Unit test suite (formatters, MoneyInput, UI primitives, 3D elements and fallbacks)
- **Build status**: `npm run build` in `client/` PASSED (0 errors, 7.96s)
- **Pending issues**: None

## Quality Status
- **Build/test result**:
  - `client/`: 18/18 tests pass (`vitest run`)
  - `client/`: 0 errors build (`tsc && vite build`)
  - `server/`: 187/187 tests pass (`vitest run`)
  - `tests_e2e/`: 214/214 tests pass (`node --test`)
- **Lint status**: Clean (TypeScript strict mode noEmit passes with 0 diagnostics)
- **Tests added/modified**: 4 test files in `client/tests/` covering Persian formatting, MoneyInput, shared components, Three.js disposal, WebGL detection, and 2D/3D fallbacks.

