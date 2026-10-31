# BRIEFING — 2026-10-31T19:36:00Z

## Mission
Survey all building accounting, charge calculation formulas, expense distributions, financial logic, and test coverage across the ParsBuilding platform.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Calculation Survey Explorer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_calculations\
- Original parent: 748ca4e1-43f0-41a9-ac48-b939be1d06a0
- Milestone: Survey & Audit of Financial / Calculation Logic (R5)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify application code
- Output only to .agents/teamwork/explorer_survey_calculations/
- Produce survey_report.md and handoff.md
- Communicate results via send_message to orchestrator (748ca4e1-43f0-41a9-ac48-b939be1d06a0)

## Current Parent
- Conversation ID: 748ca4e1-43f0-41a9-ac48-b939be1d06a0
- Updated: 2026-10-31T19:43:00Z

## Investigation State
- **Explored paths**: `js/logic.js`, `js/reports.js`, `js/state.js`, `js/utils.js`, `js/ui.js`, `js/app.js`, `index.html`, `README.md`, `ORIGINAL_REQUEST.md`.
- **Key findings**: Complete inventory of formulas mapped; 8 critical computational flaws & edge cases identified (Arabic digit 8 typo, decimal stripping in `parse`, infinite credit bug on period close, double counting of fund income, destructive deletion of user records on startup, ghost fractional debts, unhandled zero occupancy bills, dropdown mode disconnect); completely missing area-based (متراژ) calculation, parking/storage, penalty/late fees; 0 automated tests exist in the codebase.
- **Unexplored areas**: None within the financial and calculation scope. Complete survey delivered.

## Key Decisions Made
- Fully documented all mathematical formulas and deviations from Iranian building management laws.
- Formulated 15-scenario Test Case Matrix with exact expected outputs and edge cases.
- Outlined deterministic backend service architecture with largest-remainder distribution (Hamilton-Hare) to guarantee conservation of money.

## Artifact Index
- DISPATCH.md — Initial dispatch message
- BRIEFING.md — Situational awareness
- progress.md — Heartbeat and status
- survey_report.md — Comprehensive calculation audit and formulas inventory
- handoff.md — 5-component handoff report
