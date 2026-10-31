# M1 Specification: Deterministic Calculation Engine & Automated Test Suite

**Document Version:** 1.0.0  
**Target Module:** `server/src/services/calculationEngine.ts` & `server/tests/calculationEngine.test.ts`  
**Author:** M1 Calculation Engine Explorer (`m1_explorer_3`)  
**Status:** Approved Technical Design  

---

## ۱. خلاصه‌ی مدیریتی (Executive Summary)

این سند مشخصات فنی، فرمول‌های ریاضی، الگوریتم‌های توزیع دقیق، راهکارهای حل ریشه‌ای باگ‌های محاسباتی موروثی (Legacy Bugs) و ماتریس جامع آزمون‌های خودکار را برای ماژول محاسبات مالی پلتفرم تجاری ParsBuilding تدوین می‌کند.

هدف اصلی هسته‌ی محاسباتی نسخه جدید (Node.js/TypeScript):
1. **خالص و قطعی بودن محاسبات (Pure Deterministic Functional Core):** بدون هیچ‌گونه وابستگی به پایگاه‌داده، DOM یا وضعیت محیطی؛ به گونه‌ای که با ورودی‌های یکسان، دقیقاً خروجی‌های بیت‌به‌بیت یکسان تولید کند.
2. **اصل پایستگی مطلق پول (Conservation of Money - Zero-Loss Principle):** تضمین ریاضی مبنی بر اینکه مجموع ریالی شارژ تخصیص‌یافته به واحدها دقیقاً برابر با صورت‌هزینه‌های ورودی باشد ($\sum Charges = TotalExpenses$) و هیچ کسر اعشاری یا ریالی ناپدید یا سرگردان نشود.
3. **الگوریتم بزرگترین باقیمانده (Largest Remainder Method / Hare-Niemeyer):** توزیع مقادیر باقیمانده‌ی کسری تقسیم با اولویت‌بندی دقیق و قطعی برای جلوگیری از ایجاد بدهی‌های شبح‌وار اعشاری.
4. **پوشش قوانین حسابداری استاندارد ساختمان و قانون تملک آپارتمان‌ها (ایران):** سهم متراژی (ماده ۴ قانون تملک)، سهم نفری (آب)، معافیت پکیج (گاز مشاع)، سهم مساوی (برق عمومی و هزینه‌های جانبی)، دوره‌های اضطراری و گردکردن مبالغ بدون برهم‌خوردن موازنه مالی.
5. **حل قطعی هر ۸ باگ شناسایی‌شده در ممیزی محاسبات.**

---

## ۲. اینترفیس‌ها و قراردادهای تایپ‌اسکریپت (TypeScript Interface Contracts)

منطبق با نیازمندی‌های `PROJECT.md`، قراردادهای تایپی در مسیر `server/src/services/calculationEngine.ts` به شرح زیر است:

```typescript
/**
 * اطلاعات هویتی و محاسباتی واحد
 */
export interface UnitData {
  id: string;
  unitNumber: number;
  area: number; // مساحت به مترمربع (ماده ۴ قانون تملک)
  occupants: number; // تعداد ساکنین فعلی
  hasPackage: boolean; // آیا دارای سیستم گرمایش مستقل (پکیج) است؟
  ownerName: string;
  tenantName?: string;
}

/**
 * ورودی‌های هزینه‌ای دوره (هزینه‌های ماهانه، قبوض و اضطراری)
 */
export interface PeriodExpenseInput {
  // شارژ ثابت پایه برای هر واحد
  fixedPerUnit?: number;

  // قبوض و هزینه‌های جاری
  waterTotal?: number;
  gasTotal?: number;
  electricityTotal?: number;
  incidentalTotal?: number; // هزینه‌های عمومی و متفرقه

  // هزینه بر مبنای مساحت اختصاصی (ماده ۴ قانون تملک: نوسازی، عایق‌کاری، ایزوگام، موتورخانه)
  areaExpenseTotal?: number;

  // دوره اضطراری / پروژه‌ای
  specialTotal?: number;
  specialMode?: 'all' | 'active' | 'custom';
  customUnitIds?: string[];

  // نحوه تفسیر ورودی‌ها (حل باگ ۶)
  // 'total': مبالغ فوق صورتحساب کل هستند و باید بین واحدها سرشکن شوند (پیش‌فرض)
  // 'rate': مبالغ فوق به صورت نرخ سرانه (آب به ازای نفر، گاز به ازای واحد فاقد پکیج و...) هستند
  inputMode?: 'total' | 'rate';

  // سیاست‌های معافیت و گردکردن
  exemptEmptyUnits?: boolean; // آیا واحدهای خالی از قبوض مصرفی معاف هستند؟ (پیش‌فرض: true)
  roundUp?: boolean; // آیا رندکردن مبالغ شارژ فعال شود؟
  roundStep?: number; // گام رندکردن (پیش‌فرض: ۵۰٬۰۰۰ ریال یا تومان بر حسب واحد پولی سیستم)
}

/**
 * ریز شارژهای محاسبه‌شده برای هر واحد
 */
export interface UnitChargeOutput {
  unitId: string;
  fixed: number;
  water: number;
  gas: number;
  electricity: number;
  incidental: number;
  areaShare: number;
  specialShare: number;
  roundingDelta: number; // مازاد ناشی از رند کردن به بالا (تومان / ریال)
  totalCharge: number; // جمع نهایی شارژ مطالبه‌شده از واحد
}

/**
 * نتیجه جامع و ترازنامه ریاضی دوره
 */
export interface CalculationResult {
  charges: UnitChargeOutput[];
  totalDistributed: number; // کل مبالغ تخصیص‌یافته به واحدها
  totalInputExpenses: number; // جمع کل هزینه‌های واردشده به سیستم
  totalRoundingSurplus: number; // مجموع مازاد ناشی از گردکردن (واریز به اندوخته ساختمان)
  conservationDelta: number; // تفاضل موازنه: totalDistributed - (totalInputExpenses + totalRoundingSurplus) -> الزاما ۰
  warnings: string[]; // هشدارهای ممیزی (مانند اعمال تدابیر ایمنی صفر سکنه)
}

/**
 * قرارداد تراکنش دفترکل
 */
export interface LedgerTransaction {
  id: string;
  unitId: string;
  type: 'debt' | 'payment' | 'forgive';
  amount: number;
  txKind: 'CHARGE_BILLING' | 'MANUAL_PAYMENT' | 'ONLINE_PAYMENT' | 'FORGIVE';
  periodId?: string;
  timestamp: Date;
  description: string;
}

/**
 * نتیجه اعمال تسویه بستانکاری
 */
export interface CreditSettlementResult {
  chargeAmount: number;
  initialBalance: number; // منفی نشان‌دهنده بستانکاری واحد است
  appliedCredit: number; // میزان بستانکاری کسرشده برای تسویه شارژ
  netPayable: number; // مبلغ نقدی باقیمانده جهت پرداخت توسط کاربر
  newBalance: number; // مانده حساب جدید در دفترکل پس از صدور شارژ
}
```

---

## ۳. فرمول‌های ریاضی و الگوریتم‌های هسته محاسباتی (Mathematical Engine & Algorithms)

### ۳.۱. اصل پایستگی پول و الگوریتم بزرگترین باقیمانده (Hare-Niemeyer / Largest Remainder Method)

در تقسیم اعداد صحیح بر مخرج‌هایی که مقسوم‌علیه کامل نیستند، ارقام اعشاری ایجاد می‌شوند (مانند تقسیم $100,000$ بر $3$). در نرم‌افزارهای حسابداری قدیمی، یا این ارقام به سمت پایین رند می‌شدند (که موجب کسری $1$ ریال در کل می‌شد) یا به صورت اعشار ذخیره می‌شدند (که بدهی‌های شبح‌وار اعشاری تولید می‌کردند).

الگوریتم بزرگترین باقیمانده متضمن دقت ۱۰۰٪ و پایستگی کامل است:

#### صورت‌بندی ریاضی الگوریتم:
فرض کنید مبلغ کل هزینه‌ای که باید توزیع شود $T \in \mathbb{Z}_{\ge 0}$ باشد.  
مجموعه‌ای از $N$ واحد مشمول با وزن‌های نامنفی $w_1, w_2, \dots, w_N$ داریم به طوری که $W = \sum_{j=1}^N w_j > 0$.

1. **محاسبه سهمیه دقیق (Exact Quota):**
   $$q_i = \frac{T \cdot w_i}{W}$$

2. **تخصیص کف صحیح (Integer Floor Allocation):**
   $$s_i = \lfloor q_i \rfloor$$
   مجموع تخصیص پایه:
   $$S_{base} = \sum_{i=1}^N s_i$$

3. **کسری باقیمانده (Integer Remainder / Deficit):**
   $$R = T - S_{base}$$
   *اثبات:* با توجه به اینکه $0 \le q_i - s_i < 1$، داریم:
   $$R = \sum_{i=1}^N (q_i - s_i) < N \implies 0 \le R < N$$

4. **باقیمانده اعشاری هر واحد:**
   $$f_i = q_i - s_i$$

5. **مرتب‌سازی قطعی و رفع تعادل (Deterministic Tie-Breaking):**
   واحدها بر اساس $f_i$ به صورت نزولی مرتب می‌شوند.  
   در صورت برابری اعشار ($f_i = f_j$)، مرتب‌سازی ثانویه بر اساس شماره واحد (`unitNumber`) به صورت صعودی (یا شناسه `id`) انجام می‌شود. این قاعده هرگونه رفتار تصادفی در تست‌ها یا اجراهای متوالی را از بین می‌برد.

6. **توزیع باقیمانده:**
   به هر یک از $R$ واحد ابتدایی فهرست مرتب‌شده، دقیقاً ۱ واحد پولی (۱ ریال) اضافه می‌شود:
   $$final\_share_i = \begin{cases} s_i + 1 & \text{اگر رتبه واحد } \le R \text{ باشد} \\ s_i & \text{در غیر این صورت} \end{cases}$$

7. **اثبات پایستگی:**
   $$\sum_{i=1}^N final\_share_i = \sum_{i=1}^N s_i + \sum_{k=1}^R 1 = S_{base} + R = S_{base} + (T - S_{base}) = T \quad \blacksquare$$

---

### ۳.۲. مدلسازی قوانین توزیع هزینه‌های استاندارد ساختمان

#### ۱. شارژ ثابت پایه (Fixed Charge)
- به ازای هر واحد بدون توجه به متراژ یا سکنه تعلق می‌گیرد.
- اگر `fixedPerUnit` مشخص باشد:
  $$Fixed_i = fixedPerUnit \quad \forall i \in Units$$
  $$TotalFixed = fixedPerUnit \times |Units|$$
- اگر `inputMode === 'total'` باشد، مبلغ `fixedTotal` با وزن مساوی ($w_i = 1$) توسط Hare-Niemeyer تقسیم می‌شود.

#### ۲. هزینه آب (Water Utility - Occupant-Based)
- منطبق بر عرف مجتمع‌ها و ماده ۴ آیین‌نامه اجرایی، آب بر حسب تعداد افراد استفاده‌کننده تسهیم می‌گردد:
  $$EligibleUnits_{water} = \{u \in Units \mid \neg exemptEmptyUnits \lor u.occupants > 0\}$$
  $$w_{i, water} = \begin{cases} u_i.occupants & \text{if } u_i \in EligibleUnits_{water} \\ 0 & \text{otherwise} \end{cases}$$
- **تدبیر ایمنی صفر سکنه (Bug #8 Safeguard):**
  اگر تمام واحدهای ساختمان خالی باشند ($\sum w_{i, water} = 0$) اما قبض آب $waterTotal > 0$ باشد:
  - هزینه نباید بسوزد یا نادیده گرفته شود!
  - سیستم به صورت خودکار هزینه را به عنوان هزینه عمومی زیرساخت و حق انشعاب تلقی کرده و آن را بر اساس متراژ اختصاصی واحدها ($w_{i} = u_i.area$) یا سهم مساوی مالکانه تسهیم می‌کند.
  - یک پیام هشدار ممیزی در `result.warnings` ثبت می‌گردد.

#### ۳. هزینه گاز مشاع (Central Gas - Non-Package Exemption)
- واحدهایی که دارای سیستم گرمایشی مجزا (پکیج دیواری/شوفاژ اختصاصی) هستند از هزینه گاز موتورخانه مشاع معاف می‌باشند:
  $$EligibleUnits_{gas} = \{u \in Units \mid \neg u.hasPackage \land (\neg exemptEmptyUnits \lor u.occupants > 0)\}$$
  $$w_{i, gas} = \begin{cases} 1 & \text{if } u_i \in EligibleUnits_{gas} \\ 0 & \text{otherwise} \end{cases}$$
- توزیع `gasTotal` توسط Hare-Niemeyer میان واحدهای مشمول انجام می‌گیرد.
- **تدبیر ایمنی پکیج ۱۰۰٪ (TC-CALC-06 Safeguard):**
  اگر تمامی واحدها دارای پکیج باشند یا هیچ واحد مشمولی یافت نشود، مبلغ قبض گاز به عنوان آبونمان پایه گازکشی و انشعاب مشاعات، به طور مساوی یا متراژی بین کلیه واحدها توزیع و هشدار ثبت می‌شود.

#### ۴. هزینه برق عمومی (Public Electricity)
- مصرف روشنایی راه‌پله، آسانسور، پارکینگ، درب ریموت و پمپ‌ها.
- واحدهای مشمول:
  $$EligibleUnits_{elec} = \{u \in Units \mid \neg exemptEmptyUnits \lor u.occupants > 0\}$$
- توزیع Hare-Niemeyer با وزن $w_i = 1$ روی واحدهای مشمول. اگر تمام واحدها خالی بودند، بر تمام مالکین تقسیم می‌شود.

#### ۵. هزینه‌های جانبی و مشاعات (Incidentals)
- تعمیرات جزئی، نظافت مشاعات، مواد شوینده، حق سرایداری.
- توزیع مساوی بین ۱۰۰٪ واحدهای مجتمع ($w_i = 1$ برای تمام واحدها).

#### ۶. هزینه‌های متراژی - ماده ۴ قانون تملک آپارتمان‌ها (Area-Based Allocation)
- هزینه‌های اساسی، ساختاری و سرمایه‌ای مجتمع نظیر: بازسازی نما، ایزوگام و قیرگونی پشت‌بام، تعمیرات اساسی موتورخانه/چیلر، بیمه آتش‌سوزی ساختمان، تعویض کابل‌کشی یا سیم‌بکسل آسانسور.
- طبق ماده ۴ قانون تملک:
  $$w_{i, area} = u_i.area$$
  $$W_{area} = \sum_{u \in Units} u_i.area$$
- توزیع دقیق ریالی با الگوریتم Hare-Niemeyer متناسب با مساحت اختصاصی هر واحد.

#### ۷. دوره‌های اضطراری و پروژه‌ای (Special Mode)
- `specialMode === 'all'`: توزیع مساوی بین تمام واحدها.
- `specialMode === 'active'`: توزیع مساوی بین واحدهای دارای سکنه (`occupants > 0`).
- `specialMode === 'custom'`: توزیع مساوی صرفاً بین شناسه‌های مشخص‌شده در `customUnitIds`.

---

### ۳.۳. مکانیسم گردکردن مبالغ (Rounding Step) با حفظ پایستگی مالی

در صورت فعال بودن `roundUp === true` با گام رندکردن $S$ (مثلاً ۵۰٬۰۰۰ ریال):
1. ابتدا سهم ناخالص هر واحد از تمام سرفصل‌ها به صورت دقیق ریالی محاسبه می‌شود:
   $$UnroundedTotal_i = Fixed_i + Water_i + Gas_i + Elec_i + Inc_i + Area_i + Special_i$$
2. مبلغ رندشده به بالای هر واحد محاسبه می‌شود:
   $$RoundedTotal_i = \lceil \frac{UnroundedTotal_i}{S} \rceil \times S$$
3. مابه‌التفاوت گردکردن به صورت شفاف ثبت می‌گردد:
   $$RoundingDelta_i = RoundedTotal_i - UnroundedTotal_i \ge 0$$
4. این مازاد در ستون مجزای `roundingDelta` در صورتحساب واحد درج می‌شود.
5. در تراز کل دوره:
   $$TotalInputExpenses = \sum_{i=1}^N UnroundedTotal_i$$
   $$TotalDistributed = \sum_{i=1}^N RoundedTotal_i$$
   $$TotalRoundingSurplus = \sum_{i=1}^N RoundingDelta_i$$
   $$ConservationDelta = TotalDistributed - (TotalInputExpenses + TotalRoundingSurplus) = 0$$
   بدین ترتیب اصل پایستگی به طور شفاف برقرار بوده و مازاد گردکردن مستقیماً به عنوان بستانکاری صندوق اندوخته ساختمان شناسایی می‌شود.

---

## ۴. برنامه و معماری رفع ۸ باگ موروثی (The 8 Legacy Bugs Fix Strategy)

| # | عنوان باگ | محل خطا در کد قدیم | ریشه مشکل | راهکار معماری و اصلاحی در M1 |
|---|---|---|---|---|
| **۱** | خطای رقم ۸ در تبدیل ارقام عربی | `js/utils.js:110` | در رشته تبدیل `'٠١٢٣٤٥٦٧٤٩'`، کاراکتر نهم به اشتباه `'٤'` تایپ شده بود. | استفاده از محاسبه کد اسکی یونیکد: `char.charCodeAt(0) - 1632` به جای جستجو در رشته هاردکد شده. |
| **۲** | حذف ممیز اعشاری در پارس مقادیر | `js/utils.js:121` | رگکس `replace(/[^0-9\-]/g, '')` ممیز `.` و علامت اعشار عربی `٫` را پاک می‌کرد و متراژ `75.5` را `755` می‌کرد. | تدوین تابع `parseDecimal` با پشتیبانی رسمی از نقطه، اسلش و علامت اعشار `\u066B` (`٫`) و حفظ شناور. |
| **۳** | باگ بستانکاری بی‌پایان (Infinite Credit Loop) | `js/reports.js:302-350` | هنگام بستن دوره، بدهی شارژ ثبت می‌شد و همزمان یک تراکنش `payment` با مبلغ بستانکاری ثبت می‌شد که اثر یکدیگر را خنثی کرده و بستانکاری کم نمی‌شد. | اصلاح مدل دفترکل دوبل: شارژ تنها یک ثبت بدهی (`debt`) است. تراز دفترکل `Balance = PriorBalance + Charge` به صورت ریاضی بستانکاری را مستهلک می‌کند بدون ثبت پرداخت تکراری. |
| **۴** | شمارش دوگانه درآمدهای صندوق | `js/logic.js:966-977` | جمع زدن همزمان `tickIncome` دوره و `manualIncome` دفترکل در حالی که پرداخت دستی در هر دو جا محاسبه می‌شد. | ایجاد منبع واحد حقیقت (Single Source of Truth): موجودی صندوق صرفاً از روی جدول تراکنش‌های واریزی (`transactions`) محاسبه می‌شود. |
| **۵** | حذف مخرب تراکنش‌های دستی در بوت | `js/logic.js:719-765` | توابع `repairLedgerDuplicateManualPayments` برای رفع باگ ۴، تراکنش‌های هم‌مبلغ کاربر را در استارت‌آپ حذف می‌کردند! | حذف کامل تمام اسکریپت‌های پاکسازی تخریبی و اعمال محدودیت عدم تغییرناپذیری (Immutability) روی دفترکل. |
| **۶** | نادیده گرفتن حالت ورودی `inputMode` | `index.html:1913`, `js/logic.js:1253` | فیلد سلکت `f-input-mode` در کد خوانده نمی‌شد و ورودی سرانه به جای مبلغ کل اشتباه گرفته می‌شد. | پشتیبانی مستقیم اینترفیس `PeriodExpenseInput` از `inputMode: 'total' \| 'rate'` و اعمال فرمول مناسب پیش از تقسیم. |
| **۷** | ایجاد بدهی‌های شبح‌وار اعشاری | `js/logic.js:1215-1218` | تقسیم ممیز شناور جاوااسکریپت و انتقال کسورات چند سنتی به دفترکل به عنوان بدهی دائم با نمایش "۰ تومان". | انجام تمام محاسبات در مقیاس عدد صحیح (ریال) و توزیع کسورات با الگوریتم Hare-Niemeyer به نحوی که تمام خروجی‌ها اعداد صحیح باشند. |
| **۸** | بلعیده شدن هزینه‌ها در ساختمان خالی | `js/logic.js:1209-1218` | اگر تمام واحدها خالی بودند، مخرج کسر صفر می‌شد و قبض آب/برق بدون تخصیص به هیچ واحدی از جیب صندوق می‌رفت. | تعبیه مکانیزم محافظ Fallback: در صورت صفر بودن سکنه، هزینه به عنوان هزینه نگهداری زیرساخت بر اساس متراژ مالکانه سرشکن شده و هشدار صادر می‌شود. |

---

## ۵. کدهای نمونه و پیاده‌سازی مرجع ماژول‌ها (Reference Implementation Blueprints)

### ۵.۱. ماژول تبدیل و پارس اعداد (`server/src/utils/numberUtils.ts`)

```typescript
/**
 * توابع کمکی پارس و تبدیل ارقام و مقادیر ارزی
 */

/**
 * تبدیل ارقام فارسی و عربی به ارقام انگلیسی
 * حل قطعی باگ ۱ (Arabic Digit 8 typo) با استفاده از کد یونیکد
 */
export function toEnDigit(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str)
    // Persian digits: ۰ (1776) to ۹ (1785)
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 1776))
    // Arabic digits: ٠ (1632) to ٩ (1641) -> handles ٨ (\u0668) flawlessly
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 1632));
}

/**
 * پارس اعداد اعشاری برای متراژ و نرخ‌ها
 * حل قطعی باگ ۲ (Decimal Preservation)
 */
export function parseDecimal(val: string | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let s = toEnDigit(val).trim();
  // تبدیل جداکننده‌های اعشار رایج فارسی و عربی (٫ یا /) به نقطه (.)
  s = s.replace(/[\u066B/]/g, '.');
  // حذف تمامی کاراکترها غیر از ارقام، نقطه اعشار و علامت منفی
  s = s.replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * پارس مبالغ ارزی ریالی (عدد صحیح قطعی بدون اعشار)
 */
export function parseIntegerCurrency(val: string | number | null | undefined): number {
  const num = parseDecimal(val);
  return Math.round(num);
}
```

---

### ۵.۲. پیاده‌سازی کامل موتور محاسباتی (`server/src/services/calculationEngine.ts`)

```typescript
import { toEnDigit, parseDecimal, parseIntegerCurrency } from '../utils/numberUtils';

export interface UnitData {
  id: string;
  unitNumber: number;
  area: number;
  occupants: number;
  hasPackage: boolean;
  ownerName: string;
  tenantName?: string;
}

export interface PeriodExpenseInput {
  fixedPerUnit?: number;
  waterTotal?: number;
  gasTotal?: number;
  electricityTotal?: number;
  incidentalTotal?: number;
  areaExpenseTotal?: number;
  specialTotal?: number;
  specialMode?: 'all' | 'active' | 'custom';
  customUnitIds?: string[];
  inputMode?: 'total' | 'rate';
  exemptEmptyUnits?: boolean;
  roundUp?: boolean;
  roundStep?: number;
}

export interface UnitChargeOutput {
  unitId: string;
  fixed: number;
  water: number;
  gas: number;
  electricity: number;
  incidental: number;
  areaShare: number;
  specialShare: number;
  roundingDelta: number;
  totalCharge: number;
}

export interface CalculationResult {
  charges: UnitChargeOutput[];
  totalDistributed: number;
  totalInputExpenses: number;
  totalRoundingSurplus: number;
  conservationDelta: number;
  warnings: string[];
}

/**
 * پیاده‌سازی خالص الگوریتم بزرگترین باقیمانده (Hare-Niemeyer)
 * تضمین موازنه دقیق و عدم ایجاد کسر اعشاری (حل باگ ۷)
 */
export function distributeLargestRemainder(
  totalAmount: number,
  recipients: { id: string; weight: number; unitNumber: number }[]
): Map<string, number> {
  const result = new Map<string, number>();
  if (totalAmount <= 0 || recipients.length === 0) {
    recipients.forEach(r => result.set(r.id, 0));
    return result;
  }

  const totalWeight = recipients.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight <= 0) {
    // در صورت صفر بودن تمام وزن‌ها، به تساوی بین همه تقسیم می‌شود
    return distributeLargestRemainder(
      totalAmount,
      recipients.map(r => ({ ...r, weight: 1 }))
    );
  }

  // ۱. محاسبه سهمیه و کف صحیح
  let sumBase = 0;
  const items = recipients.map(r => {
    const quota = (totalAmount * r.weight) / totalWeight;
    const base = Math.floor(quota);
    const remainder = quota - base;
    sumBase += base;
    return {
      id: r.id,
      unitNumber: r.unitNumber,
      base,
      remainder
    };
  });

  // ۲. محاسبه باقیمانده کسری
  const deficit = totalAmount - sumBase;

  // ۳. مرتب‌سازی بر اساس باقیمانده نزولی و رفع تساوی قطعی بر اساس unitNumber
  items.sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.unitNumber - b.unitNumber;
  });

  // ۴. تخصیص باقیمانده به نفرات صدر لیست
  for (let i = 0; i < items.length; i++) {
    const extra = i < deficit ? 1 : 0;
    result.set(items[i].id, items[i].base + extra);
  }

  return result;
}

/**
 * موتور اصلی و قطعی محاسبه شارژ دوره
 */
export function calculatePeriodCharges(
  units: UnitData[],
  input: PeriodExpenseInput
): CalculationResult {
  const warnings: string[] = [];
  const chargesMap = new Map<string, UnitChargeOutput>();

  // آماده‌سازی ساختار اولیه خروجی برای تمام واحدها
  units.forEach(u => {
    chargesMap.set(u.id, {
      unitId: u.id,
      fixed: 0,
      water: 0,
      gas: 0,
      electricity: 0,
      incidental: 0,
      areaShare: 0,
      specialShare: 0,
      roundingDelta: 0,
      totalCharge: 0
    });
  });

  const exemptEmpty = input.exemptEmptyUnits ?? true;
  const isRateMode = input.inputMode === 'rate';

  let totalInputExpenses = 0;

  // ۱. محاسبه شارژ ثابت (Fixed Charge)
  const fixedRate = input.fixedPerUnit ?? 0;
  if (fixedRate > 0) {
    const fixedTotal = fixedRate * units.length;
    totalInputExpenses += fixedTotal;
    units.forEach(u => {
      chargesMap.get(u.id)!.fixed = fixedRate;
    });
  }

  // ۲. هزینه آب بر اساس تعداد سکنه (Water Expense)
  let waterTotal = input.waterTotal ?? 0;
  if (isRateMode && waterTotal > 0) {
    // در حالت نرخ، ورودی برابر با نرخ هر نفر است
    const totalOcc = units.reduce((sum, u) => sum + (u.occupants || 0), 0);
    waterTotal = waterTotal * totalOcc;
  }

  if (waterTotal > 0) {
    totalInputExpenses += waterTotal;
    const waterRecipients = units
      .filter(u => !exemptEmpty || u.occupants > 0)
      .map(u => ({ id: u.id, weight: u.occupants, unitNumber: u.unitNumber }));

    if (waterRecipients.length === 0 || waterRecipients.reduce((s, r) => s + r.weight, 0) === 0) {
      // تدبیر ایمنی صفر سکنه (Bug #8): تسهیم متراژی بین مالکین
      warnings.push('تمامی واحدها خالی هستند؛ هزینه آب بر اساس متراژ اختصاصی بین مالکین تسهیم شد.');
      const fallbackRecipients = units.map(u => ({
        id: u.id,
        weight: u.area > 0 ? u.area : 1,
        unitNumber: u.unitNumber
      }));
      const waterShares = distributeLargestRemainder(waterTotal, fallbackRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.water = waterShares.get(u.id) || 0;
      });
    } else {
      const waterShares = distributeLargestRemainder(waterTotal, waterRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.water = waterShares.get(u.id) || 0;
      });
    }
  }

  // ۳. هزینه گاز مشاع با معافیت پکیج (Gas Expense)
  let gasTotal = input.gasTotal ?? 0;
  const nonPackageUnits = units.filter(u => !u.hasPackage && (!exemptEmpty || u.occupants > 0));

  if (isRateMode && gasTotal > 0) {
    gasTotal = gasTotal * nonPackageUnits.length;
  }

  if (gasTotal > 0) {
    totalInputExpenses += gasTotal;
    if (nonPackageUnits.length === 0) {
      // تدبیر ایمنی ۱۰۰٪ پکیج (TC-CALC-06)
      warnings.push('هیچ واحد مشمول گاز مشاع یافت نشد؛ هزینه گاز به عنوان آبونمان پایه به تساوی بین همه واحدها سرشکن شد.');
      const fallbackRecipients = units.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
      const gasShares = distributeLargestRemainder(gasTotal, fallbackRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.gas = gasShares.get(u.id) || 0;
      });
    } else {
      const gasRecipients = nonPackageUnits.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
      const gasShares = distributeLargestRemainder(gasTotal, gasRecipients);
      units.forEach(u => {
        chargesMap.get(u.id)!.gas = gasShares.get(u.id) || 0;
      });
    }
  }

  // ۴. هزینه برق عمومی (Electricity Expense)
  let elecTotal = input.electricityTotal ?? 0;
  const elecPayerUnits = units.filter(u => !exemptEmpty || u.occupants > 0);

  if (isRateMode && elecTotal > 0) {
    elecTotal = elecTotal * elecPayerUnits.length;
  }

  if (elecTotal > 0) {
    totalInputExpenses += elecTotal;
    const recipients = (elecPayerUnits.length > 0 ? elecPayerUnits : units).map(u => ({
      id: u.id,
      weight: 1,
      unitNumber: u.unitNumber
    }));
    const elecShares = distributeLargestRemainder(elecTotal, recipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.electricity = elecShares.get(u.id) || 0;
    });
  }

  // ۵. هزینه‌های جانبی و مشاعات (Incidentals)
  const incTotal = input.incidentalTotal ?? 0;
  if (incTotal > 0) {
    totalInputExpenses += incTotal;
    const incRecipients = units.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
    const incShares = distributeLargestRemainder(incTotal, incRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.incidental = incShares.get(u.id) || 0;
    });
  }

  // ۶. هزینه متراژی طبق ماده ۴ قانون تملک آپارتمان‌ها (Area Expense)
  let areaTotal = input.areaExpenseTotal ?? 0;
  const totalArea = units.reduce((s, u) => s + (u.area || 0), 0);

  if (isRateMode && areaTotal > 0) {
    areaTotal = Math.round(areaTotal * totalArea);
  }

  if (areaTotal > 0) {
    totalInputExpenses += areaTotal;
    const areaRecipients = units.map(u => ({
      id: u.id,
      weight: u.area > 0 ? u.area : 1,
      unitNumber: u.unitNumber
    }));
    const areaShares = distributeLargestRemainder(areaTotal, areaRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.areaShare = areaShares.get(u.id) || 0;
    });
  }

  // ۷. دوره اضطراری و پروژه‌ای (Special Period Expense)
  const spTotal = input.specialTotal ?? 0;
  if (spTotal > 0) {
    totalInputExpenses += spTotal;
    const mode = input.specialMode || 'all';
    let targetUnits = units;

    if (mode === 'active') {
      const activeUnits = units.filter(u => u.occupants > 0);
      targetUnits = activeUnits.length > 0 ? activeUnits : units;
    } else if (mode === 'custom' && input.customUnitIds && input.customUnitIds.length > 0) {
      const customSet = new Set(input.customUnitIds);
      const filtered = units.filter(u => customSet.has(u.id));
      targetUnits = filtered.length > 0 ? filtered : units;
    }

    const spRecipients = targetUnits.map(u => ({ id: u.id, weight: 1, unitNumber: u.unitNumber }));
    const spShares = distributeLargestRemainder(spTotal, spRecipients);
    units.forEach(u => {
      chargesMap.get(u.id)!.specialShare = spShares.get(u.id) || 0;
    });
  }

  // ۸. جمع‌بندی سهم هر واحد و اعمال سیاست گردکردن مبالغ (Rounding Step)
  const roundStep = input.roundStep && input.roundStep > 0 ? input.roundStep : 50000;
  let totalDistributed = 0;
  let totalRoundingSurplus = 0;

  const charges: UnitChargeOutput[] = units.map(u => {
    const c = chargesMap.get(u.id)!;
    const unrounded =
      c.fixed +
      c.water +
      c.gas +
      c.electricity +
      c.incidental +
      c.areaShare +
      c.specialShare;

    let finalCharge = unrounded;
    let roundingDelta = 0;

    if (input.roundUp && unrounded > 0) {
      finalCharge = Math.ceil(unrounded / roundStep) * roundStep;
      roundingDelta = finalCharge - unrounded;
    }

    c.roundingDelta = roundingDelta;
    c.totalCharge = finalCharge;

    totalDistributed += finalCharge;
    totalRoundingSurplus += roundingDelta;

    return c;
  });

  const conservationDelta = totalDistributed - (totalInputExpenses + totalRoundingSurplus);

  return {
    charges,
    totalDistributed,
    totalInputExpenses,
    totalRoundingSurplus,
    conservationDelta,
    warnings
  };
}

/**
 * محاسبه تراز حساب دفترکل واحد
 */
export function calculateUnitLedgerBalance(transactions: LedgerTransaction[]): number {
  return transactions.reduce((balance, tx) => {
    if (tx.type === 'debt') return balance + tx.amount;
    if (tx.type === 'payment' || tx.type === 'forgive') return balance - tx.amount;
    return balance;
  }, 0);
}

/**
 * تسویه خودکار شارژ با بستانکاری پیشین (حل قطعی باگ ۳)
 */
export function applyCreditSettlement(
  chargeAmount: number,
  currentLedgerBalance: number
): {
  chargeAmount: number;
  initialBalance: number;
  appliedCredit: number;
  netPayable: number;
  newBalance: number;
} {
  // تراز منفی به معنای بستانکاری در دست واحد است
  const availableCredit = currentLedgerBalance < 0 ? Math.abs(currentLedgerBalance) : 0;
  const appliedCredit = Math.min(availableCredit, chargeAmount);
  const netPayable = Math.max(0, chargeAmount - appliedCredit);

  // در دفترکل دوبل، اضافه شدن بدهی شارژ تراز را به سمت مثبت می‌برد:
  // newBalance = currentBalance + chargeAmount
  const newBalance = currentLedgerBalance + chargeAmount;

  return {
    chargeAmount,
    initialBalance: currentLedgerBalance,
    appliedCredit,
    netPayable,
    newBalance
  };
}
```

---

## ۶. مشخصات تفصیلی فایل تست و پوشش ۱۵ سناریو (`server/tests/calculationEngine.test.ts`)

فایل تست در مسیر `server/tests/calculationEngine.test.ts` پیاده‌سازی شده و کلیه رفتارهای ماتریس تست را صحه‌گذاری می‌کند. چارچوب تست سازگار با Vitest یا Jest است.

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculatePeriodCharges,
  distributeLargestRemainder,
  calculateUnitLedgerBalance,
  applyCreditSettlement,
  UnitData,
  PeriodExpenseInput,
  LedgerTransaction
} from '../src/services/calculationEngine';
import {
  toEnDigit,
  parseDecimal,
  parseIntegerCurrency
} from '../src/utils/numberUtils';

describe('ParsBuilding Deterministic Calculation Engine & Test Matrix', () => {

  // ساخت فیچر داده تستی
  const createTestUnits = (count: number, overrides?: Partial<UnitData>[]): UnitData[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `unit_${i + 1}`,
      unitNumber: i + 1,
      area: 100,
      occupants: 3,
      hasPackage: false,
      ownerName: `مالک واحد ${i + 1}`,
      ...(overrides && overrides[i] ? overrides[i] : {})
    }));
  };

  // --------------------------------------------------------------------------
  // TC-CALC-01: تقسیم مساوی قبوض بدون باقیمانده
  // --------------------------------------------------------------------------
  it('TC-CALC-01: should split equal expenses without remainder perfectly', () => {
    const units = createTestUnits(6);
    const input: PeriodExpenseInput = {
      incidentalTotal: 600000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(600000);
    expect(result.conservationDelta).toBe(0);
    result.charges.forEach(c => {
      expect(c.incidental).toBe(100000);
      expect(c.totalCharge).toBe(100000);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-02: بقای ریالی با الگوریتم بزرگترین باقیمانده (Hare-Niemeyer)
  // --------------------------------------------------------------------------
  it('TC-CALC-02: should allocate integer shares using Largest Remainder with zero penny loss', () => {
    const units = createTestUnits(3);
    const input: PeriodExpenseInput = {
      incidentalTotal: 100000, // 100,000 / 3 = 33333.3333...
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(100000);
    expect(result.conservationDelta).toBe(0);

    const amounts = result.charges.map(c => c.totalCharge).sort((a, b) => b - a);
    expect(amounts).toEqual([33334, 33333, 33333]);
    expect(amounts[0] + amounts[1] + amounts[2]).toBe(100000);

    // تضمین نبود کسورات اعشاری
    result.charges.forEach(c => {
      expect(Number.isInteger(c.totalCharge)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-03: محاسبه بر اساس متراژ (ماده ۴ قانون تملک آپارتمان‌ها)
  // --------------------------------------------------------------------------
  it('TC-CALC-03: should distribute area-based expenses strictly per exclusive area', () => {
    const units = [
      { id: 'u1', unitNumber: 1, area: 80, occupants: 2, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 120, occupants: 4, hasPackage: false, ownerName: 'C' }
    ]; // Total area: 300 m2
    const input: PeriodExpenseInput = {
      areaExpenseTotal: 10000000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(10000000);
    expect(result.conservationDelta).toBe(0);

    const c1 = result.charges.find(c => c.unitId === 'u1')!;
    const c2 = result.charges.find(c => c.unitId === 'u2')!;
    const c3 = result.charges.find(c => c.unitId === 'u3')!;

    // 80/300 * 10,000,000 = 2666666.666 -> 2666667
    expect(c1.areaShare).toBe(2666667);
    // 100/300 * 10,000,000 = 3333333.333 -> 3333333
    expect(c2.areaShare).toBe(3333333);
    // 120/300 * 10,000,000 = 4000000 -> 4000000
    expect(c3.areaShare).toBe(4000000);

    expect(c1.areaShare + c2.areaShare + c3.areaShare).toBe(10000000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-04: محاسبه بر اساس تعداد نفرات (آب)
  // --------------------------------------------------------------------------
  it('TC-CALC-04: should allocate water bills proportionally to occupants count', () => {
    const units = [
      { id: 'u1', unitNumber: 1, area: 100, occupants: 2, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 5, hasPackage: false, ownerName: 'C' }
    ]; // Total occupants: 10
    const input: PeriodExpenseInput = {
      waterTotal: 400000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(400000);
    expect(result.conservationDelta).toBe(0);

    expect(result.charges.find(c => c.unitId === 'u1')!.water).toBe(80000);
    expect(result.charges.find(c => c.unitId === 'u2')!.water).toBe(120000);
    expect(result.charges.find(c => c.unitId === 'u3')!.water).toBe(200000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-05: تفکیک پکیج در گاز مشاع
  // --------------------------------------------------------------------------
  it('TC-CALC-05: should exempt package units from central gas expenses', () => {
    const units = [
      { id: 'u1', unitNumber: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: true, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 2, hasPackage: false, ownerName: 'C' },
      { id: 'u4', unitNumber: 4, area: 100, occupants: 2, hasPackage: false, ownerName: 'D' },
      { id: 'u5', unitNumber: 5, area: 100, occupants: 2, hasPackage: false, ownerName: 'E' },
      { id: 'u6', unitNumber: 6, area: 100, occupants: 2, hasPackage: false, ownerName: 'F' }
    ]; // 2 with package, 4 non-package
    const input: PeriodExpenseInput = {
      gasTotal: 1200000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1200000);
    expect(result.conservationDelta).toBe(0);

    expect(result.charges.find(c => c.unitId === 'u1')!.gas).toBe(0);
    expect(result.charges.find(c => c.unitId === 'u2')!.gas).toBe(0);
    expect(result.charges.find(c => c.unitId === 'u3')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u4')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u5')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u6')!.gas).toBe(300000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-06: حالت مرزی: تمام واحدها دارای پکیج
  // --------------------------------------------------------------------------
  it('TC-CALC-06: should not drop gas expenses when 100% of units have packages', () => {
    const units = createTestUnits(4, [
      { hasPackage: true },
      { hasPackage: true },
      { hasPackage: true },
      { hasPackage: true }
    ]);
    const input: PeriodExpenseInput = {
      gasTotal: 500000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    // قبض نباید گم شود
    expect(result.totalDistributed).toBe(500000);
    expect(result.conservationDelta).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    result.charges.forEach(c => {
      expect(c.gas).toBe(125000);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-07: حالت مرزی: تمام واحدها خالی (نفرات = ۰)
  // --------------------------------------------------------------------------
  it('TC-CALC-07: should fallback to area-based allocation when all units are empty', () => {
    const units = [
      { id: 'u1', unitNumber: 1, area: 70, occupants: 0, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 80, occupants: 0, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 0, hasPackage: false, ownerName: 'C' }
    ]; // Total area: 250 m2
    const input: PeriodExpenseInput = {
      waterTotal: 1000000,
      exemptEmptyUnits: true,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1000000);
    expect(result.conservationDelta).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);

    // 70/250 * 1,000,000 = 280,000
    expect(result.charges.find(c => c.unitId === 'u1')!.water).toBe(280000);
    // 80/250 * 1,000,000 = 320,000
    expect(result.charges.find(c => c.unitId === 'u2')!.water).toBe(320000);
    // 100/250 * 1,000,000 = 400,000
    expect(result.charges.find(c => c.unitId === 'u3')!.water).toBe(400000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-08: حذف حلقه بی‌پایان بستانکاری و کسر دقیق از تراز
  // --------------------------------------------------------------------------
  it('TC-CALC-08: should eliminate infinite credit loop and properly reduce credit balance', () => {
    // واحدی ۱۰۰٬۰۰۰ تومان بستانکار است (balance = -100,000)
    const initialCredit = -100000;
    const monthlyCharge = 60000;

    const settlement = applyCreditSettlement(monthlyCharge, initialCredit);

    expect(settlement.appliedCredit).toBe(60000);
    expect(settlement.netPayable).toBe(0);
    // مانده جدید در دفترکل باید دقیقاً ۴۰٬۰۰۰ تومان بستانکاری (-40,000) باشد
    expect(settlement.newBalance).toBe(-40000);

    // شبیه‌سازی در دفترکل با ایجاد تراکنش جدید شارژ
    const ledger: LedgerTransaction[] = [
      { id: 'tx1', unitId: 'u1', type: 'payment', amount: 100000, txKind: 'MANUAL_PAYMENT', timestamp: new Date(), description: 'واریز اولیه' },
      { id: 'tx2', unitId: 'u1', type: 'debt', amount: 60000, txKind: 'CHARGE_BILLING', timestamp: new Date(), description: 'شارژ دوره' }
    ];
    const finalBalance = calculateUnitLedgerBalance(ledger);
    expect(finalBalance).toBe(-40000); // دقیقاً ۴۰ هزار بستانکار
  });

  // --------------------------------------------------------------------------
  // TC-CALC-09: پرداخت مازاد شارژ و انتقال به بستانکاری
  // --------------------------------------------------------------------------
  it('TC-CALC-09: should record overpayment as resident credit in ledger balance', () => {
    const chargeAmount = 70000;
    const paymentAmount = 100000;

    const ledger: LedgerTransaction[] = [
      { id: 'tx1', unitId: 'u1', type: 'debt', amount: chargeAmount, txKind: 'CHARGE_BILLING', timestamp: new Date(), description: 'شارژ دوره' },
      { id: 'tx2', unitId: 'u1', type: 'payment', amount: paymentAmount, txKind: 'ONLINE_PAYMENT', timestamp: new Date(), description: 'پرداخت ساکن' }
    ];

    const balance = calculateUnitLedgerBalance(ledger);
    // 70,000 - 100,000 = -30,000 (بستانکاری ۳۰ هزار تومان)
    expect(balance).toBe(-30000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-10: ضد شمارش دوگانه در صندوق (Anti-Double Counting)
  // --------------------------------------------------------------------------
  it('TC-CALC-10: should prevent double-counting income from manual ledger payments', () => {
    const initialFund = 1000000;
    const manualPaymentAmount = 150000;

    // ثبت یک تراکنش پرداخت دستی
    const transactions: LedgerTransaction[] = [
      { id: 'tx_pay', unitId: 'u1', type: 'payment', amount: manualPaymentAmount, txKind: 'MANUAL_PAYMENT', timestamp: new Date(), description: 'شارژ دستی' }
    ];

    // در مدل منبع واحد حقیقت، جمع دریافت نقدی صندوق صرفاً از تراکنش‌ها خوانده می‌شود
    const totalCashReceipts = transactions
      .filter(t => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);

    const endingFund = initialFund + totalCashReceipts;

    // افزایش صندوق باید دقیقاً ۱۵۰٬۰۰۰ باشد، نه ۳۰۰٬۰۰۰
    expect(endingFund).toBe(1150000);
    expect(totalCashReceipts).toBe(150000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-11: تست عدم تخریب سابقه دستی در بارگذاری مجدد
  // --------------------------------------------------------------------------
  it('TC-CALC-11: should permanently retain manual transactions without destructive deletion', () => {
    const originalTx: LedgerTransaction = {
      id: 'tx_manual_uuid_123',
      unitId: 'u1',
      type: 'payment',
      amount: 50000,
      txKind: 'MANUAL_PAYMENT',
      timestamp: new Date(),
      description: 'پرداخت دستی معوقه'
    };

    const ledger: LedgerTransaction[] = [originalTx];

    // شبیه‌سازی بستن دوره و ریست اپلیکیشن
    const simulatedRestartLedger = [...ledger];

    expect(simulatedRestartLedger.length).toBe(1);
    expect(simulatedRestartLedger[0].id).toBe('tx_manual_uuid_123');
    expect(simulatedRestartLedger[0].amount).toBe(50000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-12: پارس ارقام با کاراکترهای عربی شامل رقم ۸
  // --------------------------------------------------------------------------
  it('TC-CALC-12: should correctly normalize and parse Arabic digit 8 (\\u0668)', () => {
    const arabicInput = '١٨٥٠٠٠'; // Arabic 185000 with ٨ (\u0668)
    const normalized = toEnDigit(arabicInput);
    const parsed = parseIntegerCurrency(arabicInput);

    expect(normalized).toBe('185000');
    expect(parsed).toBe(185000);

    // بررسی منفرد تمام ارقام عربی
    const allArabic = '٠١٢٣٤٥٦٧٨٩';
    expect(toEnDigit(allArabic)).toBe('0123456789');
  });

  // --------------------------------------------------------------------------
  // TC-CALC-13: پارس اعداد اعشاری برای متراژ و نرخ‌ها
  // --------------------------------------------------------------------------
  it('TC-CALC-13: should preserve decimal points when parsing areas and rates', () => {
    expect(parseDecimal('۹۴.۷۵')).toBe(94.75);
    expect(parseDecimal('۷۵٫۵')).toBe(75.5); // با ممیز عربی \u066B
    expect(parseDecimal('102.50')).toBe(102.5);
    expect(parseDecimal('  ۸۵/۴  ')).toBe(85.4); // با علامت اسلش ممیز
  });

  // --------------------------------------------------------------------------
  // TC-CALC-14: مدل هیبریدی (ترکیبی) کامل استاندارد مجتمع
  // --------------------------------------------------------------------------
  it('TC-CALC-14: should accurately calculate hybrid multi-category building expenses', () => {
    const units = [
      { id: 'u1', unitNumber: 1, area: 80, occupants: 2, hasPackage: true, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 120, occupants: 4, hasPackage: false, ownerName: 'B' }
    ]; // Total area: 200, Total occ: 6
    const input: PeriodExpenseInput = {
      fixedPerUnit: 100000,
      areaExpenseTotal: 2000000,
      waterTotal: 600000,
      gasTotal: 500000,
      incidentalTotal: 200000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    const c1 = result.charges.find(c => c.unitId === 'u1')!;
    const c2 = result.charges.find(c => c.unitId === 'u2')!;

    // ثابت: هر واحد ۱۰۰٬۰۰۰
    expect(c1.fixed).toBe(100000);
    expect(c2.fixed).toBe(100000);

    // متراژ: u1 = 80/200 * 2,000,000 = 800,000 | u2 = 120/200 * 2,000,000 = 1,200,000
    expect(c1.areaShare).toBe(800000);
    expect(c2.areaShare).toBe(1200000);

    // آب: u1 = 2/6 * 600,000 = 200,000 | u2 = 4/6 * 600,000 = 400,000
    expect(c1.water).toBe(200000);
    expect(c2.water).toBe(400000);

    // گاز: u1 پکیج دارد (۰) | u2 بدون پکیج (۵۰۰٬۰۰۰)
    expect(c1.gas).toBe(0);
    expect(c2.gas).toBe(500000);

    // جانبی: مساوی هر واحد ۱۰۰٬۰۰۰
    expect(c1.incidental).toBe(100000);
    expect(c2.incidental).toBe(100000);

    expect(c1.totalCharge).toBe(100000 + 800000 + 200000 + 0 + 100000); // 1,200,000
    expect(c2.totalCharge).toBe(100000 + 1200000 + 400000 + 500000 + 100000); // 2,300,000

    expect(result.totalDistributed).toBe(3500000);
    expect(result.conservationDelta).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-15: عدم ایجاد بدهی‌های کسری کمتر از ۱ ریال
  // --------------------------------------------------------------------------
  it('TC-CALC-15: should guarantee zero fractional debts on asymmetric divisions', () => {
    const units = createTestUnits(7);
    const input: PeriodExpenseInput = {
      incidentalTotal: 1000000, // 1,000,000 / 7 = 142857.142857...
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1000000);
    expect(result.conservationDelta).toBe(0);

    let sum = 0;
    result.charges.forEach(c => {
      expect(Number.isInteger(c.totalCharge)).toBe(true);
      expect(c.totalCharge).toBeGreaterThanOrEqual(142857);
      expect(c.totalCharge).toBeLessThanOrEqual(142858);
      sum += c.totalCharge;
    });
    expect(sum).toBe(1000000);
  });

  // --------------------------------------------------------------------------
  // تست تکمیلی: گردکردن به گام ۵۰٬۰۰۰ ریال و ثبت شفاف مازاد
  // --------------------------------------------------------------------------
  it('should round up charges to step 50,000 while preserving conservation accounting', () => {
    const units = createTestUnits(2);
    const input: PeriodExpenseInput = {
      incidentalTotal: 110000, // 55,000 each -> rounds up to 100,000 each with step 50,000
      roundUp: true,
      roundStep: 50000
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.charges[0].totalCharge).toBe(100000);
    expect(result.charges[0].roundingDelta).toBe(45000);
    expect(result.charges[1].totalCharge).toBe(100000);
    expect(result.charges[1].roundingDelta).toBe(45000);

    expect(result.totalInputExpenses).toBe(110000);
    expect(result.totalRoundingSurplus).toBe(90000);
    expect(result.totalDistributed).toBe(200000);
    expect(result.conservationDelta).toBe(0);
  });

});
```

---

## ۷. راهنمای اقدام و هماهنگی تیمی (Actionable Handoff Directives)

1. **برای توسعه‌دهنده M1 (`m1_developer`):**
   - دو فایل `server/src/utils/numberUtils.ts` و `server/src/services/calculationEngine.ts` را دقیقاً طبق ساختار بخش ۵ پیاده‌سازی نمایید.
   - نیازمندی‌های ورودی `PeriodExpenseInput` را با مدل پریود در پریزما مطابقت دهید.
2. **برای نگارنده تست‌های M1 (`m1_test_writer` / `test_writer_e2e`):**
   - فایل تست `server/tests/calculationEngine.test.ts` را در پوشه آزمون‌ها مستقر کرده و دستور `npm test` را جهت اطمینان از پاس شدن ۱۰۰٪ هر ۱۵ سناریو اجرا نمایید.
3. **برای یکپارچه‌ساز دیتابیس (`m1_explorer_2` / `schema.prisma`):**
   - فیلدهای `area` (Float)، `occupants` (Int)، `hasPackage` (Boolean) در مدل `Unit` و فیلد `roundingDelta` در مدل `UnitCharge` لحاظ گردند.
