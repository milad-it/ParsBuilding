## 2026-10-31T19:45:20Z
[Message] sender=748ca4e1-43f0-41a9-ac48-b939be1d06a0 priority=MESSAGE_PRIORITY_HIGH
Content:
You are a teamwork_explorer tasked with investigating Milestone 1 (M1) Deterministic Calculation Engine and Test Suite Specification.

### Identity and Workspace
- Archetype: teamwork_explorer
- Role: M1 Calculation Engine Explorer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_3\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- Calculation Survey report: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_calculations\survey_report.md

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` and `PROJECT.md` completely.
2. Read the calculation survey report in `.agents/teamwork/explorer_survey_calculations/survey_report.md`.
3. Maintain your heartbeat and status in `progress.md` inside your working directory with timestamps (`Last visited: [timestamp]`).
4. You are READ-ONLY: do not modify application files.

### M1 Scope: Deterministic Calculation Engine & Test Matrix
Formulate the exact implementation plan for `server/src/services/calculationEngine.ts` and `server/tests/calculationEngine.test.ts`:
- Pure deterministic functional interface satisfying `CalculationResult` and `PeriodExpenseInput` defined in `PROJECT.md`.
- Implementation of standard building accounting modes:
  - Fixed share per unit.
  - Occupant-based utility allocation (water).
  - Package exemption for central gas.
  - Area-based (ماده ۴ قانون تملک آپارتمان‌ها) allocation for renovation/repairs.
  - Equal share for incidentals and public electricity.
  - Special period modes (all, active, custom units).
  - Largest Remainder Method (Hare-Niemeyer) for zero-loss integer distribution ($\sum UnitCharges = TotalExpenses$).
  - Rounding step support (e.g. 50,000 Rials/Tomans) without breaking expense conservation.
- Concrete plan to fix the 8 legacy bugs:
  1. Arabic digit 8 typo in `toEnDigit`.
  2. Decimal preservation in parsing.
  3. Infinite credit loop elimination.
  4. Income double-counting prevention.
  5. Permanent retention of manual ledger transactions.
  6. Support for `inputMode` (per-unit vs total expense).
  7. Elimination of ghost fractional debts.
  8. Zero-occupancy expense allocation safeguard.
- Detailed test file specification covering all 15 scenarios from the Test Case Matrix.

### Output
Write a technical report to `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_3\m1_calculation_plan.md` and a 5-component `handoff.md`.
Send a completion message to the orchestrator when finished.
