## 2026-10-31T19:35:22Z
You are a teamwork_explorer tasked with surveying all building accounting, charge calculation formulas, expense distributions, and financial logic in the building management platform.

### Identity and Workspace
- Archetype: teamwork_explorer
- Role: Calculation Survey Explorer
- Your working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_calculations\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` completely.
2. Maintain your heartbeat and status in `progress.md` inside your working directory with timestamps (`Last visited: [timestamp]`).
3. You are READ-ONLY: do not modify application code.

### Survey Focus: R5 (Business Logic, Calculation Audit, and Automated Testing)
Thoroughly explore the codebase to map:
- All charge calculation logic: fixed charge, variable charge, area/meterage-based (بر اساس متراژ), resident/occupant-count-based (بر اساس نفرات), equal share (سهم مساوی), parking/storage considerations, and hybrid charge models.
- Expense allocation logic: how building expenses (آب، گاز، برق مشاع، تعمیرات، آسانسور، نظافت و ...) are distributed to units/residents.
- Resident balance, debt, credit, settlement calculations, and payment tracking.
- Penalty/discount or late fee calculation logic if present.
- Mathematical precision & rounding: how decimals, rounding, floating point issues, and currency units (Tomans / Rials) are handled.
- Current tests: identify if any unit or calculation tests exist, where they are, and test frameworks in place.
- Identify bugs, edge cases, potential division by zero, rounding discrepancies, or mathematical inconsistencies in current formulas.

### Output
Write a comprehensive survey report to `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_calculations\survey_report.md` with:
1. Complete Inventory of Mathematical Formulas & Accounting Rules
2. Audit of Existing Code vs Standard Building Accounting Practices
3. Edge Cases & Computational Flaws Identified
4. Test Case Matrix required for 100% mathematical accuracy verification
5. List of files inspected

When finished, write `handoff.md` and send a message to orchestrator with your findings summary.
