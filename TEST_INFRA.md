# TEST_INFRA.md — ParsBuilding E2E Test Suite Architecture & Infrastructure

## 1. Test Philosophy & Design Principles
- **Opaque-Box Requirement-Driven Testing**: Every test is derived strictly from `PROJECT.md` specifications, interface contracts, and standard building accounting regulations (ماده ۴ قانون تملک آپارتمان‌ها). No test relies on private implementation details.
- **Zero-Loss Mathematical Precision**: Financial arithmetic operates with integer Rials and exact Largest Remainder apportionment ($\sum \text{UnitShares} \equiv \text{TotalExpense}$), ensuring absolute zero loss and zero rounding discrepancy.
- **Strict Multi-Tenant Isolation**: Row-level tenancy via `complexId` guarantees data encapsulation across organizations, preventing cross-tenant data leaks and unauthorized mutations.
- **Progressive Testability & Contract Independence**: The test suite can run against live HTTP microservices (`API_BASE_URL`) or in isolated deterministic contract mode, validating data contracts, state transitions, security matrices, and mathematical fidelity across all milestones.
- **Adversarial & Edge Resilience**: High-stress boundary tests cover multilingual numeral representations (Arabic, Persian, Latin), fractional square meter areas, empty unit handling, and malicious payload injections.

---

## 2. Feature Inventory Coverage Mapping

| # | Feature Name | Test Suite File | Min Tests | Verification Target |
|---|--------------|-----------------|-----------|---------------------|
| 1 | Multi-Tenant Database Schema | `suites/tier1_features/f01_schema_multi_tenancy.test.ts` | 5 | 14-model relational integrity, complexId scoping, foreign key cascade |
| 2 | Pure Deterministic Calculation Engine | `suites/tier1_features/f02_calculation_engine.test.ts` | 5 | Fixed, area-based (ماده ۴), occupant, equal, and hybrid billing models |
| 3 | Zero-Loss Precision & Remainder Distribution | `suites/tier1_features/f03_precision_remainder.test.ts` | 5 | Hare-Niemeyer Largest Remainder Method, conservationDelta == 0 |
| 4 | Bug Fix: Arabic Digit 8 Typo | `suites/tier1_features/f04_arabic_digit_8.test.ts` | 5 | '٨' -> '8' normalization, string sanitization, mixed Persian/Arabic digits |
| 5 | Bug Fix: Decimal Parsing | `suites/tier1_features/f05_decimal_parsing.test.ts` | 5 | Persian momayyez (٫), slash (/), dot (.) decimal inputs, fractional areas |
| 6 | Bug Fix: Infinite Credit Bug Resolution | `suites/tier1_features/f06_infinite_credit_bug.test.ts` | 5 | Monotonic credit depletion on period closing, debt/credit non-duplication |
| 7 | Bug Fix: Anti-Double-Counting Fund Income | `suites/tier1_features/f07_anti_double_counting.test.ts` | 5 | Deduplication of manual payments & period billings in treasury cash balance |
| 8 | Bug Fix: Safe Data Retention | `suites/tier1_features/f08_safe_data_retention.test.ts` | 5 | Non-destructive database migration, audit trail persistence, zero data loss |
| 9 | Bug Fix: Zero Occupancy Safeguard | `suites/tier1_features/f09_zero_occupancy_safeguard.test.ts` | 5 | Zero occupant handling, fallback to base/area share, no expense drops |
| 10 | Hardened Authentication | `suites/tier1_features/f10_hardened_auth.test.ts` | 5 | Argon2id password hashing, rotating JWT access tokens, session security |
| 11 | Granular RBAC | `suites/tier1_features/f11_granular_rbac.test.ts` | 5 | 4-tier hierarchy (SUPER_ADMIN, COMPLEX_MANAGER, SUB_MANAGER, RESIDENT) |
| 12 | Immutable Audit Logging | `suites/tier1_features/f12_immutable_audit_logging.test.ts` | 5 | Append-only event stream, before/after deltas, actor/IP/timestamp tracking |
| 13 | Security Hardening | `suites/tier1_features/f13_security_hardening.test.ts` | 5 | Rate limiting, input sanitization, CORS, XSS/SQL injection resistance |
| 14 | Real-Time & AI Foundations | `suites/tier1_features/f14_realtime_ai_foundations.test.ts` | 5 | WebSocket room multiplexing, BullMQ OCR queue contracts, status events |
| 15 | Lossless Data Migration Engine | `suites/tier1_features/f15_data_migration.test.ts` | 5 | Legacy export ingestion, schema normalization, ΔFund=0 & ΔDebts=0 proof |
| 16 | Full REST & Real-Time APIs | `suites/tier1_features/f16_rest_apis.test.ts` | 5 | Standard RESTful CRUD endpoints, error codes, HTTP status semantics |
| 17 | Persian RTL Modern UI System | `suites/tier1_features/f17_persian_rtl_ui.test.ts` | 5 | RTL text flow, Vazirmatn font metrics, responsive layout contracts |
| 18 | Interactive 3D Visual Elements | `suites/tier1_features/f18_threejs_3d_elements.test.ts` | 5 | Three.js scene configuration, canvas mounting, shader/mesh state contracts |
| 19 | Friction-Free Manager Workflows | `suites/tier1_features/f19_manager_workflows.test.ts` | 5 | Batch billing, bulk invoice generation, payment receipt logging workflows |
| 20 | Dedicated Resident Portal | `suites/tier1_features/f20_resident_portal.test.ts` | 5 | Digital bulletin board, account balance ledger, resident payment submission |

---

## 3. Test Architecture & Runner Specification
- **Engine**: Node.js v24 native test runner (`node:test`, `node:assert/strict`) with native TypeScript execution (`--experimental-strip-types`).
- **Performance**: Zero transpilation overhead, sub-second test suite execution, isolated memory workspaces.
- **Test Organization**:
  - `tests_e2e/src/types.ts`: Shared domain models, contracts, and schema types.
  - `tests_e2e/src/oracle.ts`: Authoritative mathematical ground truth (Largest Remainder, RTL digits, credit balance rules).
  - `tests_e2e/src/harness.ts`: Unified test harness supporting live HTTP execution or in-memory contract evaluation.
  - `tests_e2e/suites/tier1_features/`: Functional validation of Features 1–20 (>= 100 tests).
  - `tests_e2e/suites/tier2_boundaries/`: Extreme stress & boundary conditions (>= 25 tests).
  - `tests_e2e/suites/tier3_combinations/`: Multi-tenant, RBAC, and settlement interaction matrices (>= 25 tests).
  - `tests_e2e/suites/tier4_workloads/`: Real-world end-to-end building accounting lifecycles (>= 20 tests).

---

## 4. Scenario Catalog for Tier 4 Workloads
1. **Scenario W1: Annual Building Fiscal Lifecycle**
   - Setup: 20-unit residential tower with mixed owner/tenant occupants and initial reserve fund.
   - 12 sequential monthly billing periods with varying seasonal gas, water, and maintenance expenses.
   - Continuous resident payments, partial payments, and overdue interest adjustments.
   - Year-end closing with audit verification: Treasury cash matches deposits minus approved withdrawals.
2. **Scenario W2: Tenant Turnover & Deposit/Credit Settlement**
   - Outgoing tenant vacates unit with positive credit balance.
   - Settlement calculation applies final utility shares and transfers remaining balance to owner account.
   - New tenant moves in with zero debt; ledger maintains unbroken historical records.
3. **Scenario W3: Emergency Capital Expense & Special Assessment**
   - Elevator replacement emergency expense (1,500,000,000 Rials).
   - Distributed strictly by unit floor and area per building bylaws.
   - Multi-stage installment collection plan integrated with regular monthly maintenance dues.
4. **Scenario W4: Multi-Building Commercial Complex Management**
   - 3 separate residential towers managed under 1 master commercial SaaS tenant.
   - Shared common area expenses (security, garden) apportioned across all towers.
   - Tower-specific utility meters isolated to respective tower units.
   - Granular sub-managers assigned per tower with restricted cross-tower permissions.

---

## 5. Quality & Coverage Thresholds
- **Feature Coverage**: 100% of Features 1–20 explicitly verified with at least 5 distinct test assertions.
- **Conservation of Money**: $\Delta \text{Conservation} \equiv 0$ on all calculation and closing workflows.
- **Tenant Leakage**: 0% permissible cross-tenant data leakage or permission bypass.
- **Execution Target**: 100% test pass rate across all tiers.
