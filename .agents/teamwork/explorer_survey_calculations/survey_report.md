# گزارش جامع ممیزی محاسبات مالی، فرمول‌های شارژ و قوانین حسابداری ساختمان
## Comprehensive Financial Logic, Calculation Audit & Test Matrix Report

**تاریخ تهیه:** ۲۰۲۶-۱۰-۳۱ (1405/08/09)  
**کاوشگر:** تیم محاسبات و ممیزی مالی (`explorer_survey_calculations`)  
**محدوده ممیزی:** کلیه ماژول‌های جاوااسکریپت، محاسبات شارژ، توزیع هزینه‌ها، دفترکل، مانده بدهی/بستانکاری، دقت ریاضی و وضعیت تست‌های خودکار در پلتفرم ParsBuilding.

---

## ۱. فهرست کامل فرمول‌های ریاضی و قوانین حسابداری موجود (Inventory of Mathematical Formulas & Accounting Rules)

در ساختار فعلی پروژه، هسته محاسبات در دو فایل `js/logic.js` و `js/reports.js` و توابع کمکی در `js/utils.js` متمرکز شده است. در ادامه کلیه فرمول‌های موجود کد به صورت ریاضی استخراج شده است:

### ۱.۱. فرمول محاسبه شارژ دوره ماهانه (Monthly Charge Formula)
در تابع `applyPeriodChargeLogic` (`js/logic.js` خطوط ۱۱۹۸ تا ۱۲۴۵):

$$TotalCharge_i = FixedCharge_i + WaterShare_i + GasShare_i + ElectricityShare_i + IncidentalShare_i$$

جزئیات محاسبه مولفه‌های شارژ برای واحد $i$:

1. **شارژ ثابت (Fixed Charge):**
   $$FixedCharge_i = e.fixed$$
   مبلغ ثابت به ازای هر واحد بدون در نظر گرفتن متراژ یا تعداد ساکنین.

2. **سهم آب بر اساس تعداد ساکنین (Water Expense - Occupant Count):**
   - مجموع ساکنین واحدهای مشمول:
     $$UtilityPayerOcc = \sum_{u \in Units, (!exemptEmpty \lor occ_u > 0)} occ_u$$
   - نرخ سرانه آب:
     $$wp = \begin{cases} \frac{e.water}{UtilityPayerOcc} & \text{if } UtilityPayerOcc > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - سهم واحد $i$:
     $$WaterShare_i = \begin{cases} occ_i \times wp & \text{if } occ_i > 0 \\ 0 & \text{if } occ_i = 0 \end{cases}$$

3. **سهم گاز بر اساس واحدهای بدون پکیج (Gas Expense - Non-Package Units):**
   - تعداد واحدهای مشمول و بدون پکیج مجزا:
     $$NonPackageCount = \sum_{u \in Units, (!exemptEmpty \lor occ_u > 0) \land \neg hasPackage_u} 1$$
   - نرخ هر واحد:
     $$gp = \begin{cases} \frac{e.gas}{NonPackageCount} & \text{if } NonPackageCount > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - سهم واحد $i$:
     $$GasShare_i = \begin{cases} gp & \text{if } (!exemptEmpty \lor occ_i > 0) \land \neg hasPackage_i \\ 0 & \text{otherwise} \end{cases}$$

4. **سهم برق عمومی (Public Electricity):**
   - تعداد واحدهای مشمول:
     $$UtilityPayerCount = \sum_{u \in Units, (!exemptEmpty \lor occ_u > 0)} 1$$
   - نرخ هر واحد:
     $$ep = \begin{cases} \frac{e.electricity}{UtilityPayerCount} & \text{if } UtilityPayerCount > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - سهم واحد $i$:
     $$ElectricityShare_i = \begin{cases} ep & \text{if } (!exemptEmpty \lor occ_i > 0) \\ 0 & \text{otherwise} \end{cases}$$

5. **هزینه‌های جانبی و مشاعات (Incidental Expenses):**
   - تقسیم مساوی بین کلیه واحدهای مجتمع:
     $$ip = \begin{cases} \frac{e.incidental}{TotalUnitsCount} & \text{if } TotalUnitsCount > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - سهم واحد $i$:
     $$IncidentalShare_i = ip$$

---

### ۱.۲. فرمول دوره اضطراری / پیش‌بینی‌نشده (Special / Emergency Period Formula)
در `js/logic.js` خطوط ۱۱۵۷ تا ۱۱۹۵:

بسته به مقدار `specialMode`:
- **حالت `all` (تقسیم مساوی بین تمام واحدها):**
  $$SpecialShare_i = \frac{e.specialTotal}{TotalUnitsCount}$$
- **حالت `active` (تقسیم مساوی بین واحدهای دارای سکنه):**
  $$ActiveCount = \sum_{u \in Units, occ_u > 0} 1$$
  $$SpecialShare_i = \begin{cases} \frac{e.specialTotal}{ActiveCount} & \text{if } occ_i > 0 \land ActiveCount > 0 \\ 0 & \text{otherwise} \end{cases}$$
- **حالت `custom` (تقسیم مساوی بین واحدهای انتخاب‌شده):**
  $$CustomCount = |customUnits|$$
  $$SpecialShare_i = \begin{cases} \frac{e.specialTotal}{CustomCount} & \text{if } i \in customUnits \land CustomCount > 0 \\ 0 & \text{otherwise} \end{cases}$$

---

### ۱.۳. فرمول گردکردن ارقام شارژ (Charge Rounding Formula)
در `js/logic.js` خطوط ۱۱۲۱ تا ۱۱۴۴:
- گام گرد کردن: $CHARGE\_ROUND\_STEP = 50,000$ تومان.
- در صورت فعال بودن گزینه `roundUp`:
  $$UnroundedSum_i = Fixed_i + Water_i + Gas_i + Elec_i + Inc_i$$
  $$TotalCharge_i = \lceil \frac{UnroundedSum_i}{50000} \rceil \times 50000$$
  $$Diff_i = TotalCharge_i - UnroundedSum_i$$
  $$Fixed_i = Fixed_i + Diff_i$$
  (مازاد گردکردن مستقیماً به شارژ ثابت واحد اضافه می‌شود).

---

### ۱.۴. فرمول مانده بدهی و بستانکاری دفترکل واحد (Unit Ledger Balance Formula)
در `js/logic.js` خطوط ۲۷۲ تا ۲۸۰:

$$LedgerBalance_u = \sum_{t \in u.transactions} \begin{cases} +t.amount & \text{if } t.type = \text{'debt'} \\ -t.amount & \text{if } t.type \in \{\text{'payment'}, \text{'forgive'}\} \\ 0 & \text{otherwise} \end{cases}$$

- اگر $LedgerBalance_u > 0$: واحد بدهکار است.
- اگر $LedgerBalance_u < 0$: واحد بستانکار است (میزان بستانکاری $= |LedgerBalance_u|$).
- اگر $LedgerBalance_u = 0$: حساب تسویه است.

---

### ۱.۵. فرمول تخصیص خودکار بستانکاری به دوره جاری (Auto-Credit Allocation)
در `js/logic.js` خطوط ۴۳۱ تا ۴۷۶ (`getUnitPayableDetail`):
- استخر بستانکاری در دسترس واحد:
  $$CreditPool = \max(0, -PastMonthly) + \max(0, -PastSpecial)$$
- کسر بستانکاری برای شارژ ماهانه جاری:
  $$CreditAppliedToCharge = \min(CreditPool, UnpaidCharge)$$
  $$RemainingPool = CreditPool - CreditAppliedToCharge$$
- کسر بستانکاری برای دوره اضطراری باز:
  $$CreditAppliedToSpecial = \min(RemainingPool, OpenSpecialUnpaid)$$
- مبلغ خالص قابل پرداخت واحد در دوره:
  $$Payable_u = (UnpaidCharge - CreditAppliedToCharge) + \max(0, PastMonthly) + (OpenSpecialUnpaid - CreditAppliedToSpecial)$$

---

### ۱.۶. تراز نقدینگی و موجودی کل صندوق ساختمان (Building Fund Balance)
در `js/logic.js` خطوط ۹۶۶ تا ۹۷۷ (`computeFundTotals`):

$$FundBalance = InitialFund + Income - Expense$$

که در آن:
- $Expense = \sum_{p \in StartedPeriods} PeriodExpenses(p)$
- $TickIncome = \sum_{p \in StartedPeriods} \sum_{c \in p.charges} (c.paidAmount + c.paidPastMonthly + c.paidPastSpecial)$
- $ManualIncome = \sum_{u \in Units} \sum_{t \in u.transactions, t.type = 'payment', \neg isAutoEntry(t)} t.amount$
- $Income = TickIncome + ManualIncome$

---

## ۲. ارزیابی تطبیق با استانداردهای حسابداری ساختمان ایران (Audit vs Standard Practices)

| ردیف | استاندارد حسابداری و قانون تملک آپارتمان‌ها (ایران) | وضعیت پیاده‌سازی فعلی در کد | ارزیابی و شکاف (Gap) |
|---|---|---|---|
| ۱ | **محاسبه بر اساس متراژ / مساحت اختصاصی (ماده ۴ قانون تملک)** | فیلد متراژ در مدل واحد (`u.area`) یا فرمول‌ها وجود ندارد. | ❌ **عدم انطباق بحرانی:** هیچ فرمولی بر پایه مساحت برای هزینه‌های استهلاک، بیمه و نوسازی پیاده نشده است. |
| ۲ | **محاسبه بر اساس تعداد نفرات / ساکنین** | در سهم آب (`e.water / totalOcc`) پیاده شده است. | ⚠️ **ناقص:** فقط آب را پوشش می‌دهد؛ امکان انتخاب سایر قبوض برای نفراتی وجود ندارد. |
| ۳ | **سهم مساوی واحدها (شارژ پایه / عمومی)** | در شارژ ثابت (`e.fixed`) و جانبی (`e.incidental`) پیاده شده است. | ⚠️ **مخدوش در گردکردن:** گردکردن مضرب ۵۰ هزار تومان شارژ ثابت را بدون اجازه تغییر می‌دهد. |
| ۴ | **تخصیص هزینه پارکینگ و انبار** | هیچ فیلدی برای پارکینگ و انبار تعریف نشده است. | ❌ **فقدان کامل:** امکان محاسبه هزینه‌های برق پارکینگ یا نظافت انبارها وجود ندارد. |
| ۵ | **تفکیک بدهی مالک و مستاجر** | فیلد `occType` دارد اما دفترکل و بدهی کاملاً تجمیعی است. | ❌ **فقدان تفکیک مالی:** هزینه‌های عمرانی (مالک) و جاری (مستاجر) تفکیک نمی‌شوند. |
| ۶ | **خسارت تاخیر تادیه / جریمه دیرکرد (تبصره ۱ م ۱۰ مکرر)** | در کد وجود ندارد. | ❌ **فقدان کامل:** هیچ مکانیزمی برای جریمه روزانه/ماهانه دیرکرد پرداخت شارژ نیست. |
| ۷ | **اصل پایستگی پول (Conservation of Money)** | جمع سهم واحدها با صورتحساب هزینه برابر نیست! | ❌ **خطای موازنه:** باقیمانده اعشاری دور ریخته می‌شود یا گردکردن جمع ارقام را غیرهمتراز می‌کند. |
| ۸ | **ثبت دوطرفه و تراز مالی (Double-Entry Bookkeeping)** | سیستم ترکیبی تیک دوره + تراکنش دستی با اصلاحات خودکار در هنگام بوت | ❌ **معماری ناپایدار:** نبود لاگ دفتری تفصیلی و عدم وجود جدول اسناد حسابداری استاندارد. |

---

## ۳. باگ‌ها، رفتارهای مرزی و نواقص محاسباتی شناسایی‌شده (Computational Flaws & Edge Cases)

### ۳.۱. باگ بحرانی: خطای کاراکتر ۸ در تبدیل اعداد عربی به انگلیسی
- **محل:** `js/utils.js:110`
```javascript
const toEnDigit = s => (s == null ? '' : String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٤٩'.indexOf(d)));
```
- **شرح باگ:** در رشته ارقام عربی `'٠١٢٣٤٥٦٧٤٩'`، کاراکتر نهم به اشتباه `'٤'` (عدد ۴ عربی) نوشته شده است در حالی که باید `'٨'` (عدد ۸ عربی `\u0668`) باشد!
- **پیامد:** اگر کاربری عدد را با کیبورد عربی وارد کند و در آن رقم ۸ باشد، متد `indexOf('٨')` مقدار `-1` برمی‌گرداند و عدد به کلی فاسد می‌شود.

---

### ۳.۲. باگ بحرانی: حذف ممیز اعشار در پارسر مقادیر عددی
- **محل:** `js/utils.js:121`
```javascript
const parse = (str) => {
    if (!str) return 0;
    let val = toEnDigit(String(str)).replace(/[^0-9\-]/g, '');
    let parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
};
```
- **شرح باگ:** عبارت منظم `replace(/[^0-9\-]/g, '')` علامت نقطه ممیز اعشار (`.`) را به کلی حذف می‌کند و فقط رقم‌ها را می‌گیرد.
- **پیامد:** اگر متراژ واحد `75.5` متر باشد، تبدیل به `755` متر می‌شود (۱۰ برابر خطا)! پارسر کنونی از اعداد اعشاری پشتیبانی نمی‌کند.

---

### ۳.۳. باگ بحرانی تراز دفترکل: باگ بستانکاری بی‌پایان (Infinite Credit Bug)
- **محل:** `js/reports.js:302-350` در تابع `finalizePeriodClose`
```javascript
// Transfer unpaid charge to ledger
const unpaid = Math.max(0, (c.amount || 0) - (c.frozen.paidAmount || 0));
if (unpaid > 0.01) {
    pushLedgerEntry(u, getPersianDateTime(), 'debt', unpaid, desc, { txKind: TX_KIND.CHARGE_TRANSFER, periodId: p.id });
}
...
// Credit-apply entries
const autoC = c.autoCreditApplied || 0;
if (autoC > 0.01) {
    pushLedgerEntry(u, getPersianDateTime(), 'payment', autoC, desc, { txKind: TX_KIND.CREDIT_APPLY, periodId: p.id });
}
```
- **شرح ریاضی:**
  1. واحدی از قبل ۱۰۰٬۰۰۰ تومان بستانکار است (تراز دفترکل: `-100,000`).
  2. در دوره جاری شارژ واحد ۸۰٬۰۰۰ تومان است. بستانکاری خودکار اعمال می‌شود (`autoCreditApplied = 80,000`).
  3. در فرم دوره، تیک پرداخت نقدی نخورده (`paidAmount = 0`) چون با بستانکاری تسویه شده است.
  4. هنگام بستن دوره:
     - بدهی دوره ثبت می‌شود: `debt = 80,000` (تراز باید به `-20,000` برسد).
     - بلافاصله در خط ۳۴۶ تراکنشی از نوع `payment` با مبلغ ۸۰٬۰۰۰ تومان ثبت می‌شود: `payment = 80,000` (تراز به `-100,000` بازمی‌گردد)!
- **پیامد فاجعه‌بار:** بدهی شارژ با پرداخت اعتباری یکدیگر را صفر می‌کنند و بستانکاری اولیه واحد **هرگز کسر نمی‌شود**! واحد می‌تواند تا ابد بدون پرداخت وجه، شارژ مجانی دریافت کند.

---

### ۳.۴. باگ بحرانی صندوق: شمارش دوگانه واریزی‌های دستی (Double Counting of Income)
- **محل:** `js/logic.js:966-977` در تابع `computeFundTotals`
```javascript
const income = tickIncome + manualIncome;
```
- **شرح ریاضی:**
  1. وقتی مدیر در تب واحد یک واریزی دستی به مبلغ ۲۰۰٬۰۰۰ تومان ثبت می‌کند (`addManualTransaction` در `js/ui.js:336`):
     - تابع `allocateManualPaymentToOpenPeriods` مبلغ را به دوره باز اختصاص می‌دهد و `c.paidAmount += 200000` می‌شود.
     - در همان لحظه در خط ۳۳۹، تراکنش دستی با نوع `payment` به دفترکل واحد افزوده می‌شود (`pushManualLedgerEntry`).
  2. تابع `computeFundTotals`:
     - متغیر `tickIncome` جمع `c.paidAmount` را می‌گیرد (شامل ۲۰۰٬۰۰۰ تومان).
     - متغیر `manualIncome` جمع تراکنش‌های دستی `payment` را می‌گیرد (شامل همان ۲۰۰٬۰۰۰ تومان).
     - در نتیجه ۲۰۰٬۰۰۰ تومان دو بار جمع زده شده و صندوق ساختمان ۴۰۰٬۰۰۰ تومان ورودی نشان می‌دهد!

---

### ۳.۵. باگ رفتاری: حذف مخرب سوابق پرداخت دستی کاربر در بوت اولیه
- **محل:** `js/logic.js:719-765` در توابع `repairLedgerDuplicateManualPayments` و `repairLedgerStaleChargePayments`
- **شرح باگ:** توسعه‌دهنده متوجه ایجاد رکوردهای تکراری شده، اما به جای حل ریشه‌ای مدل داده، یک اسکریپت حذف نوشته است که در هر بار لود برنامه، تمام تراکنش‌های دستی با مبالغ برابر با پرداختی‌های دوره را پیدا کرده و با متد `filter` از آرایه `transactions` **حذف دائمی** می‌کند!
- **پیامد:** اگر واحدی بدهی گذشته داشته و واقعاً به صورت دستی همان مبلغ را کارت به کارت کرده باشد، پس از رفرش صفحه تراکنش دست‌نوشته و مستندات پرداخت او پاک می‌شود!

---

### ۳.۶. باگ رابط کاربری و محاسباتی: نادیده گرفتن Dropdown نحوه ورود مبالغ (`inputMode`)
- **محل:** `index.html:1913` و `js/logic.js:1253`
- **شرح باگ:** در فرم تنظیمات دوره گزینه‌ای برای تعیین "مبلغ به ازای هر نفر/واحد (پیش‌فرض)" در برابر "مبلغ کل (تقسیم خودکار)" وجود دارد.
- **واقعیت کد:** در تابع `commitExpenseChange` مقدار این منو اصلاً خوانده و ذخیره نمی‌شود!
- **پیامد:** کاربر در لیبل ورودی می‌بیند: `آب (به ازای هر نفر)`. اگر بنویسد `۵۰٬۰۰۰` تومان به این نیت که هر نفر ۵۰ هزار تومان بدهد، کد محاسباتی آن را مبلغ کل در نظر گرفته و بر کل نفرات تقسیم می‌کند! شارژ تمام ساختمان به جای سرانه ۵۰ هزار تومان، کسری ناچیز محاسبه می‌شود.

---

### ۳.۷. ایجاد بدهی‌های شبح‌وار اعشاری (Ghost Fractional Debts)
- **محل:** `js/logic.js:1215-1218`
- **شرح ریاضی:** تقسیم `100,000 / 3 = 33333.333333333336`.
- **پیامد:** در هنگام بستن دوره، تفاضل `unpaid = 33333.333333333336 - 33333 = 0.333333333336` به عنوان بدهی دائم به دفترکل منتقل می‌شود! در ماه‌های بعد سیستم واحد را بدهکار اعلام می‌کند، اما مبلغ بدهی `۰ تومان` نمایش داده می‌شود که موجب نارضایتی و سردرگمی شدید ساکنین می‌گردد.

---

### ۳.۸. بلعیده شدن هزینه‌ها در ساختمان خالی (Zero Occupancy Expense Drop)
- **محل:** `js/logic.js:1209-1218`
- **شرح:** اگر تمام واحدهای ساختمان در یک ماه خالی باشند (`totalOcc = 0`) و گزینه معافیت فعال باشد:
  $$wp = 0, \quad gp = 0, \quad ep = 0$$
- **پیامد:** قبوض آب، برق و گاز وارده به ساختمان بین هیچ واحدی تقسیم نمی‌شود؛ مبلغ قبض از صندوق خارج می‌شود اما جمع شارژ مطالبه‌شده از واحدها صفر است و بدهی بدون هشدار روی دوش صندوق می‌ماند.

---

## ۴. ماتریس موارد تست برای دقت ۱۰۰٪ ریاضی (Test Case Matrix for 100% Mathematical Precision)

برای حصول اطمینان کامل و استقرار یک موتور محاسباتی پایدار و بدون خطا در بک‌اند Node.js/PostgreSQL، ماتریس تست‌های زیر در بستر تست خودکار (مانند Vitest یا Jest) الزامی است:

### ماتریس تست‌های واحد و یکپارچه (Unit & Integration Calculation Tests)

| کد تست | سناریوی آزمون | ورودی‌های تست | خروجی مورد انتظار | وضعیت فعلی سیستم |
|---|---|---|---|---|
| **TC-CALC-01** | تقسیم مساوی قبوض بدون باقیمانده | هزینه: ۶۰۰٬۰۰۰ تومان، ۶ واحد | سهم هر واحد دقیقاً ۱۰۰٬۰۰۰ تومان، جمع سهام = ۶۰۰٬۰۰۰ | ✅ در حالت رند |
| **TC-CALC-02** | بقای ریالی با الگوریتم بزرگترین باقیمانده (Largest Remainder) | هزینه: ۱۰۰٬۰۰۰ تومان، ۳ واحد | ۲ واحد ۳۳٬۳۳۳ تومان، ۱ واحد ۳۳٬۳۳۴ تومان. مجموع = ۱۰۰٬۰۰۰ تومان دقیق | ❌ شکست (کسر اعشاری ذخیره می‌شود) |
| **TC-CALC-03** | محاسبه بر اساس متراژ (Area-Based) | هزینه نوسازی: ۱۰٬۰۰۰٬۰۰۰ تومان، ۳ واحد (۸۰m², ۱۰۰m², ۱۲۰m²)، جمع متراژ: ۳۰۰m² | واحد ۱: ۲٬۶۶۶٬۶۶۷ تومان<br>واحد ۲: ۳٬۳۳۳٬۳۳۳ تومان<br>واحد ۳: ۴٬۰۰۰٬۰۰۰ تومان<br>مجموع دقیقاً ۱۰٬۰۰۰٬۰۰۰ تومان | ❌ غیرقابل اجرا (متراژ وجود ندارد) |
| **TC-CALC-04** | محاسبه بر اساس تعداد نفرات (Occupants) | هزینه آب: ۴۰۰٬۰۰۰ تومان، واحدها: (۲ نفر، ۳ نفر، ۵ نفر)، جمع نفرات: ۱۰ | واحد ۱: ۸۰٬۰۰۰ تومان<br>واحد ۲: ۱۲۰٬۰۰۰ تومان<br>واحد ۳: ۲۰۰٬۰۰۰ تومان<br>مجموع: ۴۰۰٬۰۰۰ تومان | ⚠️ کار می‌کند اگر تقسیم رند باشد |
| **TC-CALC-05** | تفکیک پکیج در گاز مشاع | گاز: ۱٬۲۰۰٬۰۰۰ تومان، ۲ واحد پکیج‌دار، ۴ واحد بدون پکیج | واحدهای پکیج‌دار: ۰ تومان<br>واحدهای بدون پکیج: هرکدام ۳۰۰٬۰۰۰ تومان<br>مجموع: ۱٬۲۰۰٬۰۰۰ تومان | ⚠️ کار می‌کند |
| **TC-CALC-06** | حالت مرزی: تمام واحدها دارای پکیج | گاز: ۵۰۰٬۰۰۰ تومان، همه واحدها دارای پکیج | ثبت خطا یا انتقال به سهم عمومی ساختمان با هشدار به مدیر | ❌ شکست (مبلغ صفر شده و می‌سوزد) |
| **TC-CALC-07** | حالت مرزی: تمام واحدها خالی (نفرات = ۰) | قبوض آب و برق: ۱٬۰۰۰٬۰۰۰ تومان، همه واحدها ۰ نفر | تقسیم بر اساس سهم پایه مالک/متراژ طبق قانون ساختمان، نه صفر شدن | ❌ شکست (قبوض صفر می‌شوند) |
| **TC-CALC-08** | کسر بستانکاری و تست عدم ایجاد بستانکاری بی‌پایان | واحد دارای ۱۰۰٬۰۰۰ تومان بستانکاری، شارژ دوره ۶۰٬۰۰۰ تومان | ۱. مانده قابل پرداخت: ۰ تومان<br>۲. پس از بستن دوره، مانده بستانکاری واحد دقیقاً ۴۰٬۰۰۰ تومان شود. | ❌ شکست بحرانی (بستانکاری ۱۰۰٬۰۰۰ باقی می‌ماند!) |
| **TC-CALC-09** | پرداخت مازاد شارژ (Overpayment to Credit) | شارژ دوره: ۷۰٬۰۰۰ تومان، پرداخت نقدی: ۱۰۰٬۰۰۰ تومان | تسویه دوره جاری + ۳۰٬۰۰۰ تومان بستانکاری به دوره بعد منتقل شود | ⚠️ نیمه کارآمد |
| **TC-CALC-10** | تست ضد شمارش دوگانه در صندوق (Anti-Double Counting) | ثبت پرداخت دستی شارژ دوره به مبلغ ۱۵۰٬۰۰۰ تومان | موجودی صندوق دقیقاً ۱۵۰٬۰۰۰ تومان افزایش یابد (نه ۳۰۰٬۰۰۰ تومان) | ❌ شکست بحرانی (دوبار شمرده می‌شود) |
| **TC-CALC-11** | تست عدم تخریب سابقه دستی در بارگذاری مجدد | ثبت دستی سند معوقه به میزان ۵۰٬۰۰۰ تومان و بستن دوره | پس از ریست و ریفرش برنامه، رکورد تراکنش دستی در دیتابیس باقی بماند | ❌ شکست بحرانی (اسکریپت آن را پاک می‌کند) |
| **TC-CALC-12** | پارس ارقام با کاراکترهای عربی شامل رقم ۸ | ورودی: `«١٨٥٠٠٠»` | خروجی عددی: `185000` | ❌ شکست بحرانی (تبدیل به عدد نامعتبر) |
| **TC-CALC-13** | پارس اعداد اعشاری برای متراژ و نرخ‌ها | ورودی: `«۹۴.۷۵»` | خروجی عددی: `94.75` (نه ۹۴۷۵) | ❌ شکست بحرانی (ممیز حذف می‌شود) |
| **TC-CALC-14** | مدل هیبریدی (ترکیبی) استاندارد | شارژ ترکیبی: ثابت مساوی + متراژی تعمیرات + نفراتی آب + گاز بدون پکیج | هر جزء بر مبنای استاندارد تفکیک‌شده محاسبه و به تفکیک در صورتحساب چاپ شود | ❌ غیرقابل اجرا در نسخه فعلی |
| **TC-CALC-15** | تست عدم ایجاد بدهی‌های کسری کمتر از ۱ ریال/تومان | تقسیم ارقام نامتقارن (مثلاً ۷۳۱٬۵۰۰ تومان بر ۷ واحد) | تمام سهام اعداد صحیح ریاضی بدون اعشار شناور باشند و جمع سهام برابر کل باشد. | ❌ شکست (تولید اعشار شناور) |

---

## ۵. فهرست فایل‌های بازرسی‌شده (List of Files Inspected)

1. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\logic.js` (۴۹,۷۹۱ بایت - تمام ۱۳۰۵ سطر بازرسی کامل شد)
2. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\reports.js` (۲۸,۵۳۰ بایت - تمام ۶۴۵ سطر بازرسی کامل شد)
3. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\state.js` (۱۰,۲۵۶ بایت - تمام ۲۶۶ سطر بازرسی کامل شد)
4. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\utils.js` (۷,۳۴۶ بایت - تمام ۱۸۰ سطر بازرسی کامل شد)
5. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\ui.js` (۸۷,۸۹۰ بایت - بخش‌های مالی، جداول، رویدادها و مدیریت ورودی بازرسی شد)
6. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\app.js` (۱۶,۸۹۸ بایت - چرخه حیات، مهاجرت و پاکسازی بازرسی شد)
7. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\index.html` (۱۲۲,۱۳۲ بایت - فرم‌های ورودی هزینه‌ها، مدال‌ها، فیلدهای ارقام بازرسی شد)
8. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\README.md` (ادعاهای مربوط به فرمول‌ها و متراژ بازرسی شد)
9. `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md` (الزامات R5 و معیارهای پذیرش ممیزی محاسبات)

---

## ۶. پیشنهادات بازطراحی معماری هسته محاسبات برای مهاجرت به Node.js و PostgreSQL

1. **انتقال قطعی محاسبات از کلاینت به سرور (Pure Deterministic Service):**
   - ایجاد یک سرویس مجزا مانند `AccountingCalculationEngine` در هسته بک‌اند با ورودی و خروجی مشخص و تست‌پذیر بدون وابستگی به DOM.
2. **استفاده از مقادیر صحیح بر پایه کوچکترین واحد پولی (Rials / Cents):**
   - تمامی محاسبات باید با اعداد صحیح در مقیاس ریال (BigInt یا Integer در Postgres) ذخیره و پردازش شوند تا خطای Floating-point کاملاً ریشه‌کن شود.
3. **پیاده‌سازی الگوریتم تخصیص بزرگترین باقیمانده (Largest Remainder Method):**
   - برای تضمین اصل بقای سرمایه، سهم‌های کسری با این الگوریتم تخصیص می‌یابند تا $\sum Shares = TotalExpense$ همواره با دقت صفر ریال برقرار باشد.
4. **طراحی دیتابیس استاندارد دفترکل دوبل (Double-Entry Ledger):**
   - حذف لاجیک‌های وصله‌پینه‌ای نظیر `repairLedgerDuplicateManualPayments`.
   - ایجاد جدول `journal_entries` و `ledger_postings` با شناسه‌های تغییرناپذیر و بدهکار/بستانکار شفاف.
5. **پشتیبانی کامل از متراژ، پارکینگ، انبار و مدل‌های هیبریدی در اسکیما.**
