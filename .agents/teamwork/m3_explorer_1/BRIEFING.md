# BRIEFING — 2026-11-01T13:46:00Z

## Mission
Investigate legacy client data structures, PostgreSQL schema mapping, atomic migration pipeline architecture, and strict financial reconciliation formulas (Delta Fund = 0, Delta Debts = 0) for Milestone 3.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Investigation, Synthesis
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_1\
- Original parent: f119ffc6-97e5-4dda-bea3-4b8fe97c83df
- Milestone: Milestone 3 (Lossless Data Migration Engine & REST/Real-time API Contracts)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement project source code
- Files for content delivery, messages for coordination
- Strict multi-tenant isolation by complexId
- Zero data loss, rollback on error, exact mathematical balance (Delta Fund = 0, Delta Debts = 0)
- Write output only in my working directory

## Current Parent
- Conversation ID: f119ffc6-97e5-4dda-bea3-4b8fe97c83df
- Updated: 2026-11-01T13:33:03Z

## Investigation State
- **Explored paths**:
  - `js/idb.js`, `js/state.js`, `js/app.js`, `js/logic.js`, `js/reports.js`
  - `server/prisma/schema.prisma`
  - `server/src/types/index.ts`, `server/src/config/database.ts`, `server/src/middleware/tenant.ts`, `server/src/services/calculationEngine.ts`, `server/src/utils/numberUtils.ts`
  - `tests_e2e/src/harness.ts`, `tests_e2e/src/types.ts`, `tests_e2e/suites/tier1_features/f15_data_migration.test.ts`, `tests_e2e/suites/tier3_combinations/migration_calculation_continuity.test.ts`
- **Key findings**:
  - Legacy format uses database `ParsBuildingDB`, store `app_state`, key `app_db_pars_v6`, and localStorage fallbacks (`app_db_pars_v6`, `app_db_pars_final`, `app_db_pars_v5`, `app_db_pars`).
  - Unit entity contains aliases: `vahed`/`unitNumber`/`id`, `metraj`/`area`, `tedad`/`occupants`, `occType`/`isTenant`, `ownerName`/`name`.
  - Transaction kinds in legacy `TX_KIND` exactly match Prisma `enum TxKind` (`MANUAL`, `CHARGE_TRANSFER`, `CREDIT_APPLY`, `PAST_MONTHLY_PAY`, `PAST_SPECIAL_PAY`, `OVERPAY_CREDIT`, `CREDIT_PAST_M`, `CREDIT_PAST_S`, `LEGACY_AUTO`).
  - Strict atomicity must be guaranteed using `rawPrisma.$transaction` to ensure all-or-nothing execution with automatic rollback on validation or database failure.
  - Strict reconciliation formulas mathematically defined: $\Delta Fund = 0$ (Ending fund equals initial fund plus total payments minus total expenses) and $\Delta Debts = 0$ (every unit balance matches legacy ledger debt/credit with zero discrepancy).
- **Unexplored areas**: None for M3 Explorer 1 scope.

## Key Decisions Made
- Formulate complete design for `server/src/services/migrationService.ts` and `server/src/routes/migrationRoutes.ts` with code blueprints, type interfaces, transaction flows, and verification test cases.

## Artifact Index
- `DISPATCH.md` — Inbound instructions & history
- `BRIEFING.md` — Situational awareness working memory
- `progress.md` — Liveness heartbeat
- `handoff.md` — Comprehensive 5-component handoff report
