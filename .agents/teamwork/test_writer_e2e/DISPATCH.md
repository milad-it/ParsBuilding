## 2026-10-31T19:45:41Z
You are a teamwork_test_writer tasked with creating the comprehensive E2E opaque-box test suite for the ParsBuilding commercial SaaS platform.

### Identity and Workspace
- Archetype: teamwork_test_writer
- Role: E2E Test Suite Architect
- Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\test_writer_e2e\
- Workspace root: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
- Original Request path: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
- Project Scope document: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md

### Mandatory Instructions
1. First, read `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` and `PROJECT.md` completely.
2. Maintain your heartbeat and status in `progress.md` inside your working directory with timestamps (`Last visited: [timestamp]`).
3. Follow AGENTS.md / GEMINI.md git rules: whenever you write files or make modifications, run git add, commit with a descriptive message, and push to origin main.

### E2E Testing Scope
- Create `TEST_INFRA.md` at project root using the standard template:
  - Test Philosophy: Opaque-box, requirement-driven, testing every feature in `PROJECT.md § Feature Inventory`.
  - Feature Inventory Coverage mapping.
  - Test Architecture and runner specifications.
  - Scenario catalog for Tier 4.
  - Coverage thresholds.
- Implement the test suite in `tests_e2e/`:
  - `tests_e2e/package.json` with test runner (e.g. Vitest or Jest, TypeScript support, supertest/axios/fetch).
  - `tests_e2e/suites/tier1_features/`: >= 5 tests per feature covering happy-path equivalence classes.
  - `tests_e2e/suites/tier2_boundaries/`: >= 5 tests per feature covering extreme values, 0 occupancy, Arabic digits, float precision, boundary limits.
  - `tests_e2e/suites/tier3_combinations/`: Pairwise interaction tests (multi-tenant + calculation, RBAC + resident portal, credit pool + period closing).
  - `tests_e2e/suites/tier4_workloads/`: Real-world end-to-end building accounting and management lifecycles.
- When the test suite structure and test cases are in place, publish `TEST_READY.md` at the project root with the test runner command and coverage summary.
- Deliver `handoff.md` and message the orchestrator.
