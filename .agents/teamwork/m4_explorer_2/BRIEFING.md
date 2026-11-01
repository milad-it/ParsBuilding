# BRIEFING — 2026-11-01T16:26:00Z

## Mission
Investigate and produce a complete technical blueprint and architecture for Three.js 3D visual elements (Login 3D building, Manager isometric status matrix, Resident holographic pass, memory disposal, fallbacks).

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: 3D WebGL Graphics Architect, Three.js Specialist
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\
- Original parent: e906fd40-417c-4738-8fa8-9895a4f89f83
- Milestone: M4 - UI/UX Architecture & Three.js 3D Graphics Specification

## 🔒 Key Constraints
- Read-only investigation — do NOT implement application source code.
- Produce structured analysis and actionable blueprints in handoff.md.
- Ensure performant rendering, zero bundle bloat, responsive canvases, memory cleanup (dispose geometries/materials/textures), and robust CSS/SVG fallbacks for non-WebGL / mobile.
- Follow Git and Project guidelines (though explorers do not modify project source code).

## Current Parent
- Conversation ID: e906fd40-417c-4738-8fa8-9895a4f89f83
- Updated: 2026-11-01T16:26:00Z

## Investigation State
- **Explored paths**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `explorer_survey_ui/survey_report.md`, `server/prisma/schema.prisma`, `client/src/services/api.ts`, `client/src/services/websocket.ts`, `m4_explorer_1/DISPATCH.md`, `m4_explorer_3/DISPATCH.md`.
- **Key findings**:
  1. Selected Architecture: Standalone Three.js Controller Pattern wrapped in typed React components. Prevents ~350KB bundle bloat of R3F, bypasses React 18/19 reconciler latency during 60 FPS pointermove/raycast, and provides deterministic GPU VRAM deallocation on unmount.
  2. Login 3D Complex: Procedural architectural tower with `THREE.InstancedMesh` for 288+ glowing windows in 1 draw call, day/dusk/night lighting with smooth lerp, and cursor parallax.
  3. Manager 3D Isometric Matrix: Axonometric `OrthographicCamera` mapping Prisma `Unit` records to spatial cubicles, financial color coding (Emerald/Amber/Crimson/Slate), raycast hover with 2D projected Persian tooltip, exploded floor view, and WebSocket `PAYMENT_RECORDED` live updates.
  4. Resident 3D Holographic Keycard: PBR `MeshPhysicalMaterial` with dynamic iridescence and rainbow sheen, dynamic high-DPI 2D canvas texture with Persian typography, gyroscopic tilt, and 180° flip revealing Sheba and payment QR.
  5. Memory & Performance: `ThreeResourceManager` for recursive geometry/material/texture disposal and context loss handling; `WebGLDetector` for DPI clamping ($\le 2.0$) and `IntersectionObserver` frame pausing; Drop-in CSS/SVG fallbacks for low-spec devices.
- **Unexplored areas**: None within the 3D graphics scope. All requirements fully designed with drop-in code blueprints.

## Key Decisions Made
- Chose procedural geometry over network `.gltf` models to guarantee 0ms asset download delays and 100% offline/Iranian network resilience.
- Chose Orthographic projection over Perspective projection for the Manager Matrix to maintain equal visual scale for all floors.
- Enforced strict VRAM disposal via `ThreeResourceManager` to eliminate browser tab crashes on SPA route navigation.

## Artifact Index
- `.agents/teamwork/m4_explorer_2/DISPATCH.md` — Task definition and dispatch records
- `.agents/teamwork/m4_explorer_2/BRIEFING.md` — Situational awareness
- `.agents/teamwork/m4_explorer_2/progress.md` — Liveness & progress tracker
- `.agents/teamwork/m4_explorer_2/handoff.md` — Final technical blueprint report
