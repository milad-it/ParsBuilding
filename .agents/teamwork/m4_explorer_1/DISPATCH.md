# Dispatch: M4 Explorer 1 (Frontend Architecture & RTL Persian Design System)

- **Archetype**: `teamwork_explorer`
- **Role**: Frontend Architecture Specialist
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Existing Frontend Survey**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_ui\survey_report.md`

## Mission & Investigation Focus
Investigate and produce a complete blueprint for the modern commercial SaaS frontend architecture:
1. **Toolchain & Setup**: React 18+ / Vite / TypeScript setup in `client/` (or root integration), dependencies (`tailwindcss`, `@radix-ui` or Tailwind primitives, `lucide-react`, `clsx`, `tailwind-merge`, etc.), Vite config with path aliases and proxy to backend Fastify (`http://localhost:3000`).
2. **Persian RTL SaaS Design System**:
   - Typography: Vazirmatn integration from existing `fonts/` or font files, proper RTL font-face, direction rules (`dir="rtl"`).
   - Theme Tokens: Deep slate/navy dark mode and clean SaaS light mode, brand colors, glassmorphism, elevation shadows, metric cards.
   - Eliminating the 500px mobile container constraint: Full-width responsive dashboard with collapsible Persian sidebar, top breadcrumbs bar, user profile dropdown, and multi-tenant complex switcher.
3. **Core Component Library Primitives**:
   - Button, Input (Persian number formatting aware, no cursor jump), Modal/Dialog, StatCard, Badge, Tabs, Data Table with pagination/sorting, Toast notification.
4. **State & Routing**:
   - Client routing (React Router or lightweight hash/view router supporting `/login`, `/dashboard`, `/units`, `/residents`, `/periods`, `/ledger`, `/audit`, `/resident`).
   - Auth store & tenant context connecting to `client/src/services/api.ts`.
5. **Output Requirements**:
   - Write your comprehensive investigation report to:
     `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_1\handoff.md`
   - Include clear file breakdown, component interfaces, and drop-in configuration blueprints for Worker implementation.


## 2026-11-01T16:14:17Z
[Message from orchestrator e906fd40-417c-4738-8fa8-9895a4f89f83]
Investigate and produce a complete technical blueprint for modern React 18+ / Vite / TypeScript setup in client/, Tailwind CSS configuration with Persian RTL Vazirmatn typography, design tokens, full-width responsive SaaS shell (replacing the 500px phone container), shared UI primitives (Button, Modal, StatCard, Badge, Tabs, Table), and client routing/auth store.
Write your comprehensive handoff report to:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_1\handoff.md
Send completion message to orchestrator.
