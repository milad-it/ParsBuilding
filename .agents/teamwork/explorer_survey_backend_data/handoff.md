# Handoff Report: Backend Architecture, Data Storage, Multi-Tenancy & Security Survey

- **Agent**: `explorer_survey_backend_data`
- **Role**: Backend Survey Explorer
- **Date**: 2026-10-31T19:45:00Z
- **Target Recipient**: Orchestrator (`748ca4e1-43f0-41a9-ac48-b939be1d06a0`)
- **Status**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation
1. **Existing Codebase Nature:**
   - The workspace contains zero backend server runtime code (no `package.json`, no Node.js/Express/Fastify scripts, no SQL or ORM files).
   - The application is a 100% client-side Progressive Web App (PWA) running vanilla JavaScript (`js/app.js`, `js/idb.js`, `js/logic.js`, `js/reports.js`, `js/state.js`, `js/ui.js`, `js/utils.js`).
2. **Current Persistence Layer:**
   - Primary state is held in JavaScript memory object `db = { units: [], periods: [], initialFund: 0 }` (`js/state.js:3`).
   - Browser storage uses `localStorage` key `'app_db_pars_v6'` with fallbacks (`'app_db_pars_final'`, `'app_db_pars_v5'`, `'app_db_pars'`) (`js/app.js:325-341`, `js/state.js:19-29`).
   - Asynchronous storage uses IndexedDB (`ParsBuildingDB`, version 1, object store `app_state`, key `'app_db_pars_v6'`) (`js/idb.js:4-6`).
3. **Current Entities & Schema:**
   - `initialFund`: Opening balance integer/float (`js/state.js:52`, `js/logic.js:975`).
   - `units`: Hardcoded array (defaults to 20 units) with properties `id`, `name`, `occupants`, `occType` ('owner'|'tenant'), `ownerName`, `ownerPhone`, `tenantPhone`, `hasPackage` (boolean), `transactions` (`js/app.js:342-358`).
   - `transactions`: Array on each unit with `id`, `transactionId`, `periodId`, `txKind` (9 types in `TX_KIND`), `date` (Jalali string), `type` ('debt'|'payment'|'forgive'), `amount`, `desc` (`js/logic.js:50-108`, `js/logic.js:302-356`).
   - `periods`: Array with `id`, `type` ('monthly'|'special'), `name`, `isClosed`, `isStarted`, `closedAt`, `expenses` (object with `inputMode`, `fixed`, `water`, `gas`, `electricity`, `incidental`, `incDesc`, `specialTotal`, `specialMode`, `customUnits`, `roundUp`, `exemptEmptyUnits`), `frozenExpenses`, and `charges` array (`js/ui.js:675-686`, `js/logic.js:1253-1281`).
   - `charges`: Array on period with `unitId`, `snapshot` (`{ occupants, hasPackage }`), `amount`, `paidAmount`, `paidPastMonthly`, `paidPastSpecial`, `payDate`, `details` (`{ fixed, water, gas, elec, incidental }`), `autoCreditApplied`, `lockedDebts`, `frozen` (`js/reports.js:280-350`).
4. **Current Multi-Tenancy & Security State:**
   - Single-tenant only (1 building of 20 units).
   - No user authentication, passwords, sessions, or roles exist.
   - Any person opening the browser has full unrestricted access.

---

## 2. Logic Chain
1. *From Observation 1 & 2:* The platform currently relies solely on browser sandbox persistence (LocalStorage/IndexedDB). Because of requirement R2 (100% online real-time multi-tenant backend with PostgreSQL and Prisma), a full backend infrastructure must be created from scratch.
2. *From Observation 3:* The existing data model has precise accounting nuances: units can have owners or tenants; central gas billing is exempt for units with `hasPackage = true`; water is distributed by resident occupant count; periods can be monthly or special; past debts can be settled via checkboxes in active periods or transfer to unit ledger upon closing; initial fund plus income minus expenses dictates total treasury balance.
3. *From Requirement R2 & R3:* To enable commercial SaaS scaling, tenant isolation must be guaranteed. Row-Level Multi-Tenancy with foreign keys (`complex_id`), composite indexes, Prisma extensions, and PostgreSQL Row-Level Security (RLS) is optimal over schema-per-tenant or DB-per-tenant because it enables seamless connection pooling (PgBouncer), instant atomic migrations across all tenants, and cost-effective scaling.
4. *From Requirement R2 & Observation 2:* For lossless migration, existing users must be able to export or have their client IndexedDB/LocalStorage payload ingested into PostgreSQL within an ACID transaction (`prisma.$transaction`), mapping legacy units, periods, charges, and ledger transactions, with automated validation verifying that $\Delta Fund = 0$ and $\Delta Debts = 0$.
5. *From Requirement R3 & R4:* Authentication requires Argon2id password hashing and short-lived JWTs with rotating HttpOnly Refresh Tokens. Granular RBAC requires distinguishing `SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER` (with configurable flags), and `RESIDENT`. Audit logging must be an append-only PostgreSQL table (`audit_logs`) recording user, IP, action, and JSON deltas.
6. *From Requirement R4:* Extensibility for real-time chat requires WebSocket room segregation (`complex:{id}`, `unit:{id}`), and AI receipt verification requires an async BullMQ job pipeline with OCR/LLM vision hooks.

---

## 3. Caveats
1. In the legacy codebase, unit IDs are numbers (1 to 20) and compared as strings (`sameId`). During migration to PostgreSQL UUIDs, an internal lookup map (`unitNumber` and `legacyId` -> `unitUuid`) must be preserved.
2. The legacy database stores dates as Persian locale strings (`getPersianDateTime()`, e.g. "1403/08/10 14:30"). The migration pipeline must parse these into standard ISO 8601 Timestamps (`TIMESTAMPTZ`) while retaining original display strings.
3. While the existing app defaulted to 20 units, the new multi-tenant PostgreSQL schema supports variable unit counts, multiple buildings/blocks per complex, and custom area ($m^2$) fields.

---

## 4. Conclusion
The comprehensive survey report has been generated and saved to:
`d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_backend_data\survey_report.md`

Key Deliverables in the Report:
1. Complete entity mapping and relational diagram of all current client data structures.
2. Full target **Prisma Schema** with 14 models covering Multi-Tenancy (`Complex`, `Building`), Identity & RBAC (`User`, `SubManagerPermission`), Properties (`Unit`, `Resident`, `UnitResident`), Financial Engine (`Period`, `UnitCharge`, `LedgerTransaction`), Compliance (`AuditLog`), and Future Extensions (`ChatMessage`, `ReceiptVerification`).
3. Concrete, mathematical **lossless data migration strategy** from IndexedDB/LocalStorage into PostgreSQL with reconciliation assertions.
4. Hardened Security, JWT + Argon2id Auth, granular RBAC permissions matrix, and immutable append-only audit logging architecture.
5. Extensibility design for WebSocket real-time rooms and BullMQ AI receipt processing.

---

## 5. Verification Method
To independently verify the survey findings:
1. Inspect the generated report:
   `view_file` at `.agents/teamwork/explorer_survey_backend_data/survey_report.md`
2. Verify existing client data schema:
   `view_file` at `js/state.js` (lines 1-35), `js/logic.js` (lines 50-108, 300-350), and `js/reports.js` (lines 274-351).
3. Verify lack of existing backend files:
   `find_by_name` in workspace root confirms absence of `package.json`, `server/`, `prisma/`, or `api/`.
