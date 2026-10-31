## 2026-10-31T20:08:36Z

You are a teamwork_reviewer tasked with independently reviewing Milestone 1 (M1): Calculation Engine, Accounting Accuracy, and Test Verifications.

### Identity and Workspace
- Archetype: teamwork_reviewer
- Role: M1 Calculation Logic Reviewer
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_reviewer_2\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md
- Worker Handoff: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_worker_1\handoff.md

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`, `PROJECT.md`, and the worker handoff completely.
2. Maintain your heartbeat and status in `progress.md` with timestamps.
3. On Windows PowerShell, use `npm.cmd` and `npx.cmd`.

### Review Objectives
- Deeply inspect `server/src/utils/numberUtils.ts`, `server/src/services/calculationEngine.ts`, and `server/tests/calculationEngine.test.ts`.
- Verify the math: Hare-Niemeyer Largest Remainder method ($\sum Shares = TotalExpense$), area-based (ماده ۴) allocation, occupant allocation, gas package exemptions, special periods, zero occupancy handling, and integer Rial accuracy.
- Verify that all 8 legacy bugs discovered in survey are genuinely fixed.
- Execute unit tests: `cd server && npm.cmd test`.
- Run the E2E calculation and precision test suites:
  `cd tests_e2e && node --experimental-strip-types --test "suites/tier1_features/f02_calculation_engine.test.ts" "suites/tier1_features/f03_precision_remainder.test.ts" "suites/tier1_features/f04_arabic_digit_8.test.ts" "suites/tier1_features/f05_decimal_parsing.test.ts" "suites/tier1_features/f06_infinite_credit_bug.test.ts" "suites/tier1_features/f07_anti_double_counting.test.ts" "suites/tier1_features/f09_zero_occupancy_safeguard.test.ts"`
- Record your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.

Write your full review to `review_report.md` and 5-component `handoff.md`.
Send a completion message with your verdict to the orchestrator.
