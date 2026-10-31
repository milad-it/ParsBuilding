## 2026-10-31T19:45:08Z
You are a teamwork_explorer tasked with investigating Milestone 1 (M1) Multi-Tenant Prisma Schema and Database Architecture.

### Identity and Workspace
- Archetype: teamwork_explorer
- Role: M1 Database Schema Explorer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_2\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- Backend Survey report: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_backend_data\survey_report.md

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` and `PROJECT.md` completely.
2. Read the backend survey report in `.agents/teamwork/explorer_survey_backend_data/survey_report.md`.
3. Maintain your heartbeat and status in `progress.md` inside your working directory with timestamps (`Last visited: [timestamp]`).
4. You are READ-ONLY: do not modify application files.

### M1 Scope: Multi-Tenant Prisma Schema & Tenant Isolation Specification
Detail the complete PostgreSQL schema to be placed in `server/prisma/schema.prisma`:
- Enforce strict row-level multi-tenancy (`complexId` on all tenant-specific tables: `Building`, `Unit`, `Resident`, `Period`, `UnitCharge`, `LedgerTransaction`, `AuditLog`, etc.).
- Complete models: `Complex`, `Building`, `User`, `SubManagerPermission`, `Unit` (including `area`, `occupants`, `hasPackage`), `Resident`, `UnitResident`, `Period`, `PeriodCustomUnit`, `UnitCharge`, `LedgerTransaction`, `AuditLog`, `ChatMessage`, `ReceiptVerification`.
- Foreign key constraints, cascade rules, unique constraints (e.g. `[complexId, unitNumber]`), and composite performance indexes.
- Tenant isolation middleware & Prisma client extension design (`tenantContext` injection).

### Output
Write a technical report to `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_2\m1_schema_plan.md` and a 5-component `handoff.md`.
Send a completion message to the orchestrator when finished.
