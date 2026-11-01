# Dispatch: M3 Explorer 1 (Data Migration Pipeline & Financial Reconciliation)

- **Archetype**: `teamwork_explorer`
- **Role**: Codebase & Migration Researcher
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`

## Objective
Investigate legacy client data structures (IndexedDB / LocalStorage / `app_db_pars_v6`) and design the atomic data migration pipeline in `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts`.

## Scope & Investigation Tasks
1. Identify all legacy data shapes used in the project (units, periods, expenses, payments, funds, debts, settings).
2. Map each legacy entity to the PostgreSQL / Prisma schema (`Complex`, `Building`, `Unit`, `Resident`, `Period`, `PeriodExpense`, `UnitCharge`, `TreasuryTransaction`).
3. Formulate the atomic ingestion logic (Prisma transaction) that guarantees zero data loss, safe rollback on error, and multi-tenant scoping (`complexId`).
4. Define the strict reconciliation algorithm:
   - Initial fund balance + Total payments - Total expenses == Calculated ending fund balance ($\Delta Fund = 0$)
   - Cumulative resident charges - Total payments == Resident debt balances ($\Delta Debts = 0$)
5. Specify API request payload, response schema, and unit test requirements for migration.

## Deliverable
Write a comprehensive investigation report and handoff in:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\handoff.md`


## 2026-11-01T13:33:03Z
[Message] sender=f119ffc6-97e5-4dda-bea3-4b8fe97c83df priority=MESSAGE_PRIORITY_HIGH
You are M3 Explorer 1 (Data Migration Pipeline & Financial Reconciliation).
Your working directory is:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\

Read your dispatch instructions in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\DISPATCH.md
Read the original request in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md

Investigate:
1. Legacy client storage structures (IndexedDB / LocalStorage / `app_db_pars_v6`) in existing codebase.
2. PostgreSQL/Prisma schema in `server/prisma/schema.prisma` and mapping rules.
3. Atomic migration pipeline in `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts`.
4. Exact mathematical reconciliation formulas:
   - Delta Fund = 0
   - Delta Debts = 0
5. Write your complete handoff report in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\handoff.md
Once complete, send a message back to the orchestrator.
