# Dispatch: M3 Explorer 2 (REST & Real-Time WebSocket API Endpoints)

- **Archetype**: `teamwork_explorer`
- **Role**: Backend API Researcher
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_2\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`

## Objective
Investigate existing backend routes and design the complete REST and WebSocket API architecture for Milestone 3 across all core entities.

## Scope & Investigation Tasks
1. Audit existing Fastify routes in `server/src/routes/` (`authRoutes.ts`, `receiptRoutes.ts`, etc.).
2. Specify missing endpoints required for a full SaaS building management system:
   - Complexes & Buildings (`/api/v1/complexes`, `/api/v1/buildings`)
   - Units (`/api/v1/units` - CRUD, occupant assignment, area, specs)
   - Residents (`/api/v1/residents` - CRUD, unit associations, phone/credentials)
   - Periods (`/api/v1/periods` - create period, calculate charges via `CalculationEngine`, publish, close)
   - Charges & Payments (`/api/v1/charges`, `/api/v1/payments`, `/api/v1/transactions`)
   - Announcements / Digital Bulletin Board (`/api/v1/announcements`)
   - Audit Logs (`/api/v1/audit-logs`)
3. Ensure every route enforces:
   - Tenant isolation (`complexId` via `tenantMiddleware`)
   - RBAC permissions via `requirePermission` or role checks
   - RFC 7807 Problem Details error responses
   - Immutable audit logging on all mutations
4. Investigate `server/src/services/realtimeService.ts` to map real-time event publishing:
   - `period:published`, `payment:received`, `announcement:created`, `charge:updated`
   - WebSocket subscription rooms (`complex:{complexId}`, `unit:{unitId}`).

## Deliverable
Write a comprehensive investigation report and handoff in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_2\handoff.md`

## 2026-11-01T13:33:10Z
[Message from f119ffc6-97e5-4dda-bea3-4b8fe97c83df]
Investigate REST & Real-Time WebSocket API Endpoints for Fastify and realtimeService.

