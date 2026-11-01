# BRIEFING — 2026-11-01T16:25:00Z

## Mission
Investigate and produce a complete technical blueprint for modern React 18+ / Vite / TypeScript setup in client/, Tailwind CSS configuration with Persian RTL Vazirmatn typography, design tokens, full-width responsive SaaS shell (replacing the 500px phone container), shared UI primitives (Button, Modal, StatCard, Badge, Tabs, Table), and client routing/auth store.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Frontend Architecture Specialist, Persian RTL Design System Architect
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_1
- Original parent: e906fd40-417c-4738-8fa8-9895a4f89f83
- Milestone: M4 - Commercial SaaS Frontend Architecture & RTL Design System

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Design must support modern commercial SaaS standards
- Persian RTL native support with Vazirmatn typography
- Full-width responsive dashboard shell replacing the restrictive 500px mobile container
- Seamless integration with existing backend APIs and client services

## Current Parent
- Conversation ID: e906fd40-417c-4738-8fa8-9895a4f89f83
- Updated: 2026-11-01T16:25:00Z

## Investigation State
- **Explored paths**: `client/src/services/api.ts`, `client/src/services/websocket.ts`, `client/src/services/migrationBridge.ts`, `css/fonts/*`, `index.html`, `js/ui.js`, `js/utils.js`, `js/state.js`, `server/src/config/env.ts`, `server/package.json`, `tests_e2e/package.json`.
- **Key findings**:
  - Legacy UI has 500px container lock with aggressive `@container` font size overrides.
  - Vazirmatn fonts exist in `css/fonts/*.woff2` ready to be moved to `client/public/fonts/`.
  - Typo in legacy Arabic digit 8 mapping identified and resolved in blueprint.
  - Fully articulated React 18+ / Vite / Tailwind / Zustand / React Router v6 architecture produced.
  - Complete shared UI primitives (`Button`, `MoneyInput`, `Modal`, `StatCard`, `Badge`) and Three.js 3D element integration strategy designed.
- **Unexplored areas**: None for M4 architecture foundation; all target areas investigated and specified.

## Key Decisions Made
- Use full-width responsive `AppShell` with collapsible Persian RTL sidebar and header.
- Provide custom `MoneyInput` with real-time `num2persian` word conversion without cursor jump.
- Support both port 4000 (server default) and 3000 in Vite proxy configuration.
- Integrate Three.js / React Three Fiber for world-class 3D highlights (`Building3DHero`, `BuildingMatrix3D`, `ResidentKeycard3D`) with progressive 2D fallback.

## Artifact Index
- DISPATCH.md — Dispatch instructions and history
- progress.md — Liveness heartbeat and investigation progress
- handoff.md — Comprehensive technical blueprint and handoff report
