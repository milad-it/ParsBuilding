# Dispatch: M4 Explorer 2 (Interactive 3D Visual Elements Architecture)

- **Archetype**: `teamwork_explorer`
- **Role**: 3D & WebGL Graphics Architect
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **Existing Frontend Survey**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_ui\survey_report.md`

## Mission & Investigation Focus
Investigate and produce a complete blueprint for the interactive 3D visual elements using Three.js (or React Three Fiber / Drei / Vanilla Three.js canvas):
1. **Engine Selection & Architecture**:
   - Evaluate dependencies: `three`, `@types/three` (and optionally `@react-three/fiber`, `@react-three/drei` or lightweight performant custom Three.js canvas components).
   - Ensure zero performance degradation, graceful WebGL fallback (SVG/CSS isometric fallback if WebGL is unavailable or low-spec), responsive canvas resize, and memory cleanup (dispose geometries, materials, textures on unmount).
2. **Three Key 3D Interactive Elements**:
   - **Login Screen 3D Building Complex**:
     - Modern interactive 3D architectural high-rise / residential building model generated procedurally or with Three.js primitives (floors, glowing glass windows, entrance canopy, rooftop elements).
     - Subtle interactive mouse parallax / orbit rotation, ambient day/dusk/night lighting, soft ground plane shadow.
   - **Manager Dashboard 3D Isometric Building Status Matrix**:
     - Isometric 3D visualization representing the building units / floors.
     - Interactive unit blocks color-coded by financial status: Green (paid/credit), Amber (pending current period), Red (debt/overdue).
     - Hover tooltip showing unit number, resident name, and balance. Click to navigate or select unit.
   - **Resident Portal 3D Digital Keycard / Access Pass**:
     - 3D holographic digital resident badge with metallic sheen, dynamic reflection, building badge, resident unit number, and subtle tilt on mouse hover (gyroscopic effect).
3. **Output Requirements**:
   - Write your comprehensive architecture and code blueprint report to:
     `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\handoff.md`
   - Include complete component blueprints, shader/material configurations, and fallback strategies ready for the Worker.


## 2026-11-01T16:14:23Z
You are m4_explorer_2, a teamwork_explorer specializing in 3D WebGL Graphics and Three.js.
Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\

Read your dispatch file:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\DISPATCH.md
Also read:
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_ui\survey_report.md

Investigate and produce a complete technical blueprint for Three.js 3D visual elements:
1. Login screen 3D interactive building complex (responsive canvas, lighting, orbit/parallax, window glow).
2. Manager dashboard 3D isometric building status matrix (color-coded units by financial status, interactive raycasting/hover tooltips).
3. Resident portal 3D holographic digital resident keycard / badge.
Ensure clean geometry/texture memory disposal, performant rendering, and graceful CSS/SVG fallback.
Write your comprehensive handoff report to:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_2\handoff.md
Send completion message to orchestrator.
