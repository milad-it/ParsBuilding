# Handoff Report: M1 Deterministic Calculation Engine & Test Suite Specification

**Agent:** `m1_explorer_3` (teamwork_explorer)  
**Role:** M1 Calculation Engine Explorer  
**Working Directory:** `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_3\`  
**Target Files:** `server/src/services/calculationEngine.ts`, `server/src/utils/numberUtils.ts`, `server/tests/calculationEngine.test.ts`  
**Date:** 2026-10-31  

---

## ۱. Observation (مشاهدات عینی)

1. **Bug #1 — Arabic Digit 8 Typo:**
   - File: `js/utils.js:110`
   - Verbatim code:
     ```javascript
     const toEnDigit = s => (s == null ? '' : String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٤٩'.indexOf(d)));
     ```
   - In string `'٠١٢٣٤٥٦٧٤٩'`, index 8 is `'٤'` (`\u0664`) instead of `'٨'` (`\u0668`). When `d` is `'٨'`, `indexOf` returns `-1`, corrupting any input containing Arabic 8.

2. **Bug #2 — Decimal Stripping in Parser:**
   - File: `js/utils.js:121`
   - Verbatim code:
     ```javascript
     let val = toEnDigit(String(str)).replace(/[^0-9\-]/g, '');
     let parsed = parseInt(val, 10);
     ```
   - Regular expression strips `.` and `٫`, converting `75.5` to `755` (10x error), making area-based and fractional calculations impossible.

3. **Bug #3 — Infinite Credit Loop:**
   - File: `js/reports.js:302-349` (`finalizePeriodClose`)
   - Verbatim code:
     ```javascript
     const unpaid = Math.max(0, (c.amount || 0) - (c.frozen.paidAmount || 0));
     if (unpaid > 0.01) {
         pushLedgerEntry(u, getPersianDateTime(), 'debt', unpaid, desc, { txKind: TX_KIND.CHARGE_TRANSFER, periodId: p.id });
     }
     ...
     const autoC = c.autoCreditApplied || 0;
     if (autoC > 0.01) {
         pushLedgerEntry(u, getPersianDateTime(), 'payment', autoC, desc, { txKind: TX_KIND.CREDIT_APPLY, periodId: p.id });
     }
     ```
   - When a unit settles charge with existing credit, a `debt` of amount $A$ and a synthetic `payment` of amount $A$ are both added to ledger; they cancel out, leaving the unit's original credit unreduced forever.

4. **Bug #4 — Income Double Counting:**
   - File: `js/logic.js:966-977` (`computeFundTotals`)
   - Verbatim code:
     ```javascript
     const income = tickIncome + manualIncome;
     ```
   - When a manual payment is made, `allocateManualPaymentToOpenPeriods` sets `c.paidAmount += amount` (counted in `tickIncome`), and line 339 adds a `payment` transaction (counted in `manualIncome`), inflating treasury balance by 2x.

5. **Bug #5 — Destructive Manual Record Deletion:**
   - File: `js/logic.js:719-765` (`repairLedgerDuplicateManualPayments`)
   - Verbatim code:
     ```javascript
     u.transactions = u.transactions.filter(t => !removeIds.has(t.id));
     ```
   - To counteract Bug #4, the code executed startup loops permanently deleting user manual payments that equaled period tick amounts.

6. **Bug #6 — Ignored `inputMode` Dropdown:**
   - Files: `index.html:1913-1918` and `js/logic.js:1253-1281`
   - Verbatim HTML:
     ```html
     <select id="f-input-mode" onchange="calculateActivePeriod()" ...>
         <option value="rate" selected>مبلغ به ازای هر نفر/واحد (پیش‌فرض)</option>
         <option value="total">مبلغ کل (تقسیم خودکار)</option>
     </select>
     ```
   - In `commitExpenseChange()` (`js/logic.js:1253-1281`), `f-input-mode` is never read or stored. Values intended as per-person rates were erroneously treated as total bills and divided across occupants.

7. **Bug #7 — Ghost Fractional Debts:**
   - File: `js/logic.js:1215-1218`
   - Floating-point division (`100000 / 3 = 33333.333333333336`) generated floating-point amounts. Fractional differences ($< 1$ Rial) were pushed to ledger, displaying confusing "0 تومان" debt badges.

8. **Bug #8 — Zero Occupancy Bill Drop:**
   - File: `js/logic.js:1209-1218`
   - If all units in the building are vacant (`utilityPayerOcc === 0`), `wp = 0, gp = 0, ep = 0`. Utility bills were silently dropped and never charged to any unit, leaving unbacked deficits in building funds.

9. **Existing Workspace State:**
   - Workspace currently holds legacy client files (`index.html`, `js/`, `css/`). The `server/` directory is scheduled for creation in Milestone 1.

---

## ۲. Logic Chain (زنجیره استدلال و تصمیمات فنی)

1. **From Observation 1 (Digit 8 typo):**
   - Hardcoding digit lookup strings is prone to typos.
   - Solution: Use Unicode character arithmetic: `String.fromCharCode(d.charCodeAt(0) - 1632)` for Arabic (`\u0660-\u0669`) and `- 1776` for Persian (`\u06F0-\u06F9`). This mathematically maps `\u0668` to `8` without string indexing.

2. **From Observation 2 (Decimal stripping):**
   - Stripping non-digits removes floating points.
   - Solution: Introduce `parseDecimal(str)` which normalizes Arabic/Persian decimal commas (`\u066B`, `/`, `.`) to ASCII `.` and uses `parseFloat`. Introduce `parseIntegerCurrency` for discrete Rial amounts.

3. **From Observations 3, 4, 5 (Ledger, Credit, Fund Inconsistencies):**
   - The root cause is a dual bookkeeping system (period ticks vs. ledger entries).
   - Solution: Transition to a unified Single Source of Truth double-entry ledger. All cash payments are registered once in a transaction table (`type: PAYMENT`). Period charges are registered once as debts (`type: DEBT`). Credit is simply a negative ledger balance. Adding a charge $C$ to balance $B$ yields $B + C$. If $B = -100,000$ and $C = 60,000$, new balance is $-40,000$ automatically, without synthetic credit payment entries. Destructive deletion scripts are completely abolished.

4. **From Observation 6 (Input Mode):**
   - Solution: Expose `inputMode: 'total' | 'rate'` on `PeriodExpenseInput`. When `'rate'` is selected, pre-multiply unit rates by eligible counts before distribution.

5. **From Observation 7 (Ghost Fractions) and Project Requirements (Zero-Loss Principle):**
   - Solution: Pure integer currency arithmetic with the Largest Remainder Method (Hare-Niemeyer). Divides total expense $T$ among eligible units by quota $q_i = T \cdot w_i / W$, assigns integer floor $\lfloor q_i \rfloor$, and awards the remaining deficit $R = T - \sum \lfloor q_i \rfloor$ to units with largest fractional remainders, using `unitNumber` as a deterministic tie-breaker.
   - Result: $\sum Shares = TotalExpense$ with zero penny loss and zero decimal residues.

6. **From Observation 8 (Vacant Building Utility Drop):**
   - Solution: Fallback safeguard: When all occupants are 0, utility infrastructure expenses are distributed to unit owners proportional to exclusive area (Article 4 of Condominium Act) or equal share, returning an explicit warning in `result.warnings`.

7. **Rounding Step Support:**
   - Rounding up each unit to a multiple of $S$ (e.g. 50,000) generates surplus.
   - Solution: Track `roundingDelta` per unit. Total charges sum to $TotalInputExpenses + TotalRoundingSurplus$. The delta $totalDistributed - (totalInputExpenses + totalRoundingSurplus) \equiv 0$. The surplus is formally credited to the building reserve fund.

---

## ۳. Caveats (ملاحظات، مفروضات و حوزه‌های بررسی‌نشده)

1. **Unit of Currency:**
   - Calculations are specified in integer units (whole Rials or Tomans, depending on system configuration). In all cases, the engine treats amounts as discrete integers.
2. **Read-Only Explorer Scope:**
   - As an explorer, no direct edits were made to `server/` files. The complete reference implementations are fully drafted in `m1_calculation_plan.md` for immediate implementation by `m1_developer`.
3. **Database Integration:**
   - The calculation engine is designed as a pure deterministic function (`calculatePeriodCharges(units, expenses)`) with zero database dependencies, ensuring 100% testability in isolation.

---

## ۴. Conclusion (ارزیابی نهایی و نتیجه‌گیری)

طرح جامع محاسباتی و فایل تست‌های خودکار برای فاز M1 به صورت کامل و مستند در فایل زیر تدوین شد:
- `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m1_explorer_3\m1_calculation_plan.md`

این طرح:
1. اینترفیس‌های کامل `UnitData`, `PeriodExpenseInput`, `UnitChargeOutput`, `CalculationResult` را تعریف می‌کند.
2. الگوریتم Hare-Niemeyer را با اثبات ریاضی پایستگی صفر ریال پیاده‌سازی می‌نماید.
3. تمامی فرمول‌های استاندارد ساختمان (ثابت، آب نفری، گاز مشاع منهای پکیج، برق عمومی، هزینه‌های جانبی، متراژی ماده ۴ قانون تملک و دوره‌های اضطراری) را پوشش می‌دهد.
4. هر ۸ باگ موروثی را با استراتژی فنی دقیق ریشه‌کن می‌کند.
5. ماتریس کامل ۱۵ سناریوی تست (`TC-CALC-01` تا `TC-CALC-15`) به همراه سناریوی تکمیلی گردکردن را در قالب یک فایل تست آماده اجرا برای Vitest/Jest ارائه می‌دهد.

---

## ۵. Verification Method (روش راستی‌آزمایی مستقل)

1. **بررسی مستندات فنی:**
   فایل `m1_calculation_plan.md` در پوشه کاری را بررسی فرمایید تا انطباق کدهای نمونه با نیازمندی‌های `PROJECT.md` احراز گردد.
2. **راستی‌آزمایی رفع باگ‌ها:**
   - باگ ۱: بررسی تابع `toEnDigit` در بخش ۵.۱ و یونیکد `\u0668`.
   - باگ ۲: بررسی تابع `parseDecimal` و تست `TC-CALC-13`.
   - باگ ۳: بررسی تابع `applyCreditSettlement` و تست `TC-CALC-08`.
   - باگ ۴ و ۵: بررسی مدل تراکنش‌های تک‌مبنا و تست‌های `TC-CALC-10` و `TC-CALC-11`.
   - باگ ۶: بررسی پشتیبانی از `inputMode` در بخش ۵.۲.
   - باگ ۷: بررسی خروجی‌های عدد صحیح در `distributeLargestRemainder` و تست‌های `TC-CALC-02` و `TC-CALC-15`.
   - باگ ۸: بررسی تدابیر ایمنی صفر سکنه در بخش ۵.۲ و تست‌های `TC-CALC-06` و `TC-CALC-07`.
3. **فرمان اجرای تست‌ها در فاز پیاده‌سازی:**
   پس از کپی کدهای پیشنهادی در `server/`:
   ```bash
   cd server
   npm test server/tests/calculationEngine.test.ts
   ```
   شرط ابطال (Invalidation Condition): هرگونه عدم تطابق جمع خروجی‌ها با ورودی‌ها ($\text{conservationDelta} \ne 0$) یا بروز کسورات اعشاری در شارژ نهایی.
