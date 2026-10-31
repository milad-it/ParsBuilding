# Handoff Report: Building Accounting & Calculation Audit (R5)

## 1. Observation
- **Observation 1 (Arabic Digit 8 Typo):** In `js/utils.js:110`, the Arabic digits string is written as `'٠١٢٣٤٥٦٧٤٩'`. Character index 8 is `'٤'` (Arabic 4) instead of `'٨'` (Arabic 8).
- **Observation 2 (Decimal Stripping Bug):** In `js/utils.js:121`, `parse(str)` executes `replace(/[^0-9\-]/g, '')`, stripping all decimal points (`.`). For instance, `parse('85.5')` evaluates to `855`.
- **Observation 3 (Infinite Credit Loop):** In `js/reports.js:302-348`, `finalizePeriodClose` records `unpaid` as a `debt` transaction when a unit's charge is covered by credit (`c.frozen.paidAmount === 0`), and simultaneously records `c.autoCreditApplied` as a `payment` transaction (`TX_KIND.CREDIT_APPLY`). In `js/logic.js:272-280`, `getUnitLedgerBalance` adds `debt` and subtracts `payment`. The net ledger change is `+amount - amount = 0`, leaving the resident's credit balance unreduced across period closes.
- **Observation 4 (Fund Income Double Counting):** In `js/logic.js:966-977`, `computeFundTotals` computes `income = tickIncome + manualIncome`. In `js/ui.js:336-350`, `addManualTransaction` adds payment to `c.paidAmount` in the open period (counted in `tickIncome`) and also executes `pushManualLedgerEntry` (counted in `manualIncome`), doubling the recorded cash income.
- **Observation 5 (Destructive Startup Record Deletion):** In `js/logic.js:719-765`, `repairLedgerDuplicateManualPayments` and `repairLedgerStaleChargePayments` run at application boot and execute `u.transactions = u.transactions.filter(t => !removeIds.has(t.id))` if `Math.abs((t.amount || 0) - tickM) < 1`, deleting legitimate user manual payment records.
- **Observation 6 (Missing Core Features in Schema & Code):** No `area` / `meterage`, `parking`, `storage`, `penalty`, or `discount` fields exist in `db.units`, `js/logic.js`, or `index.html`. Only `occupants`, `hasPackage`, and `fixed` exist.
- **Observation 7 (Zero Test Coverage):** Tool `find_by_name` searching for `*test*`, `*.spec.js`, and `package.json` across the entire workspace yielded 0 results. No automated test framework or runner exists.

## 2. Logic Chain
1. *From Observation 1:* Because character index 8 in `toEnDigit` contains `'٤'` instead of `'٨'`, any input containing the Arabic digit ۸ yields `indexOf('٨') === -1`, resulting in invalid or corrupted numerical values.
2. *From Observation 2:* Because `parse()` removes non-digit characters without preserving decimal dots, any decimal number (such as area 75.5 or fractional rates) is parsed as an order-of-magnitude greater integer (755).
3. *From Observation 3:* When an open period closes, a unit using credit receives a debit of `amount` and a credit of `amount`. Because `getUnitLedgerBalance` treats both as standard ledger entries, the net delta is zero. Thus, the unit retains 100% of its initial credit forever while receiving free building charges.
4. *From Observation 4:* Entering a manual payment towards a period updates both `c.paidAmount` and `u.transactions`. Because `computeFundTotals` sums both arrays without deduplication, fund income is artificially inflated by 2x the paid amount.
5. *From Observation 5:* The startup cleanup routine blindly filters out any manual payment transaction whose value equals a period payment, permanently deleting legitimate manual payment audit records from the client state.
6. *From Observations 6 & 7:* The application cannot satisfy R5 without implementing an area-based and hybrid calculation model, a double-entry accounting ledger, and a comprehensive automated test suite (currently at 0 tests).

## 3. Caveats
- No caveats regarding current calculation logic: all 1,305 lines of `js/logic.js`, 645 lines of `js/reports.js`, 266 lines of `js/state.js`, and 180 lines of `js/utils.js` were comprehensively analyzed.
- Historical data migration from legacy IndexedDB schema (`app_db_pars_v6`) to PostgreSQL must sanitize the duplicate transactions and infinite credit records before ingestion.

## 4. Conclusion
The legacy computational engine is functional for simple, happy-path manual usage with integer numbers, but harbors severe architectural, financial, and mathematical bugs (infinite credit recurrence, fund income double counting, decimal truncation, Arabic digit 8 corruption, and automated deletion of user records). It completely lacks support for area/meterage-based calculations, parking/storage allocations, and automated testing.
A pure, deterministic backend calculation service with BigInt/integer precision (Rials), largest-remainder distribution, and an automated test suite matching the provided 15-scenario Test Case Matrix is mandatory for Milestone R5.

## 5. Verification Method
1. Inspect `js/utils.js` line 110 to verify `'٠١٢٣٤٥٦٧٤٩'`.
2. Inspect `js/reports.js` lines 302-348 and `js/logic.js` lines 272-280 to trace the infinite credit cancellation.
3. Inspect `js/logic.js` lines 966-977 and `js/ui.js` lines 336-350 to trace the fund double-counting.
4. Execute `node -e "console.log('٠١٢٣٤٥٦٧٤٩'[8])"` to observe the duplicate `٤`.
5. Check full survey report at `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\explorer_survey_calculations\survey_report.md`.
