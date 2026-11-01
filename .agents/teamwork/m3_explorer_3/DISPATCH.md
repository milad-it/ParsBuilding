# Dispatch: M3 Explorer 3 (Client Architecture, Stores, API Layer & Migration Bridge)

- **Archetype**: `teamwork_explorer`
- **Role**: Client Frontend Researcher
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`

## Objective
Investigate the `client/` codebase to design the real-time API client layer, authentication/token lifecycle management, client data migration bridge, and WebSocket reactive store integration.

## Scope & Investigation Tasks
1. Investigate the current `client/` application structure, dependencies, state management (Zustand, React Context, or local state), and storage usage (`indexedDB`, `localStorage`).
2. Design the unified API client (`client/src/services/api.ts` or similar):
   - Base URL configuration (`/api/v1`)
   - Automatic JWT Authorization header injection
   - Automatic 401 interceptor with silent token refresh (`/api/v1/auth/refresh`)
   - Typed service wrappers for units, residents, periods, charges, payments, announcements
3. Design the Legacy Data Migration Bridge on the client:
   - Detection of legacy IndexedDB / LocalStorage data (`app_db_pars_v6`)
   - Exporter function that serializes local data into the migration payload
   - Migration status flow (Pending, Uploading, Reconciled, Migrated)
4. Design the WebSocket Client & Real-time Store:
   - Connection lifecycle (reconnect, auth handshake)
   - Channel/room subscription based on authenticated user tenant/unit
   - Real-time updates triggering React store updates.

## Deliverable
Write a comprehensive investigation report and handoff in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\handoff.md`


## 2026-11-01T13:33:16Z
You are M3 Explorer 3 (Client Architecture, Stores, API Layer & Migration Bridge).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md

Investigate:
1. Current client application in `client/` (framework, Vite, React, state stores, existing API clients, and IndexedDB/LocalStorage usage).
2. Unified API client design (`client/src/services/api.ts`) with Axios/Fetch, Bearer token injection, and 401 refresh token interceptor.
3. Client-side Legacy Data Migration Bridge: reading local IndexedDB / LocalStorage, serialization to migration API payload, and progress/status tracking.
4. WebSocket client integration with React state/stores for live real-time updates.
5. Write your complete handoff report in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\handoff.md
Once complete, send a message back to the orchestrator.
