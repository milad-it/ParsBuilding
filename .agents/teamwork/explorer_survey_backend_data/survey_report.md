# ParsBuilding — جامع‌ترین گزارش بررسی معماری بک‌اند، داده‌ها، امنیت و مهاجرت
**Platform Architecture, Data Storage, Multi-Tenancy, Security, RBAC & Migration Survey Report**
*تاریخ نگارش: نوامبر ۲۰۲۶ (بر اساس نیازمندی‌های فاز ۱ و الزامات تجاری R2, R3, R4)*

---

## ۱. خلاصه اجرایی و وضعیت کنونی پایگاه داده و بک‌اند (Executive Summary & Existing State)

### ۱.۱. وضعیت فعلی معماری (Current State)
بررسی جامع سورس‌کد پروژه نشان داد که پلتفرم **ParsBuilding** در حال حاضر یک اپلیکیشن تحت وب مستقل و کلاینت‌محور (**100% Client-Side Progressive Web App**) است:
- **فقدان سورس‌کد سمت سرور:** در حال حاضر هیچ فایل اجرایی بک‌اند (نظیر Node.js، Express، Fastify، NestJS)، پکیج‌منیجر (`package.json`)، روت‌های API، یا تعاریف پایگاه داده (`schema.prisma` یا کدهای SQL) در مخزن پروژه وجود ندارد.
- **لایه‌های ذخیره‌سازی محلی:**
  1. **LocalStorage کلاینت:** داده‌ها در کلید اصلی `app_db_pars_v6` با فال‌بک‌های نسخه‌های پیشین (`app_db_pars_final`، `app_db_pars_v5`، `app_db_pars`) ذخیره می‌شوند (`js/state.js:19`, `js/app.js:325-341`).
  2. **IndexedDB ناهمگام:** از پایگاه داده بومی مرورگر با نام `ParsBuildingDB` (نسخه ۱) و آبجکت‌استور `app_state` برای حل محدودیت ۵ مگابایتی LocalStorage و جلوگیری از پاک شدن ناگهانی کش استفاده شده است (`js/idb.js:4-6`).
  3. **فرمت داده:** کلیه موجودیت‌ها و تراکنش‌های ساختمان در یک شیء یکپارچه جاوااسکریپتی به نام `db = { units: [], periods: [], initialFund: 0 }` نگهداری می‌شوند.
- **محدودیت تک‌ساختمانی (Single-Tenant):** در نسخه فعلی کلاینت، هیچ مفهومی از ساختمان‌های متعدد، حساب‌های کاربری مدیران، ساکنین، احراز هویت (Auth) و ایزولاسیون سازمانی وجود ندارد و کد به طور پیش‌فرض برای ۲۰ واحد یک ساختمان منفرد هاردکد شده است (`js/app.js:342`).

### ۱.۲. اهداف تحول به سمت SaaS تجاری (Commercial SaaS Objectives)
برای تحقق نیازمندی‌های **R2، R3، و R4**، سیستم باید به یک معماری مدرن **Multi-Tenant Real-time SaaS** با مشخصات زیر ارتقا یابد:
1. پیاده‌سازی بک‌اند مدرن و فوق سریع مبتنی بر **Node.js (Fastify یا Express)** مجهز به **Prisma ORM** و پایگاه داده رابطه‌ای **PostgreSQL**.
2. ایزولاسیون قطعی چندمستأجری (**Multi-Tenant Data Isolation**) در سطح سازمان‌ها/مجتمع‌های ساختمانی.
3. خط لوله مهاجرت داده‌های محلی (IndexedDB/LocalStorage) به PostgreSQL بدون کمترین افت داده (**Lossless Migration**).
4. سیستم احراز هویت مستحکم مبتنی بر **Argon2id** و توکن‌های امن **JWT + Rotating Refresh Tokens**.
5. ثبت غیرقابل دستکاری لاگ‌های سیستمی و حسابداری (**Immutable Audit Logging**) به همراه دلتای تغییرات.
6. مدل دسترسی چندسطحی (**Granular RBAC**) برای مدیر ارشد (Super-Admin)، مدیر ساختمان (Manager)، مدیران کمکی (Sub-Managers) و پورتال ساکنین (Residents).
7. زیرساخت وب‌سوکت برای نوتیفیکیشن‌ها و چت آنلاین، به همراه بستر هوش مصنوعی جهت اعتبارسنجی فیش‌های واریزی.

---

## ۲. نگاشت جامع موجودیت‌های داده فعلی (Existing Entity & Schema Map)

از تحلیل دقیق فایل‌های `js/state.js`، `js/logic.js`، `js/reports.js`، `js/ui.js`، و `js/app.js`، موجودیت‌ها و فیلدهای سیستم کنونی استخراج شدند:

### ۲.۱. شیء ریشه دیتابیس کلاینت (`db`)
| فیلد | نوع داده | توضیحات |
| :--- | :--- | :--- |
| `initialFund` | Number | موجودی اولیه صندوق ساختمان (تومان) برای محاسبه تراز کل (`js/state.js:3`, `js/logic.js:975`) |
| `units` | Array | لیست واحدهای ساختمان (پیش‌فرض ۲۰ واحد) |
| `periods` | Array | لیست دوره‌های شارژ ماهانه یا هزینه‌های پیش‌بینی‌نشده |

---

### ۲.۲. موجودیت واحد (`Unit`)
محل تعریف و مصرف: `js/app.js:342-358`، `js/ui.js:46-78`
| نام فیلد | نوع داده | پیش‌فرض | توضیحات و منطق محاسباتی |
| :--- | :--- | :--- | :--- |
| `id` | Number / String | عدد ۱ الی ۲۰ | شناسه منحصربه‌فرد واحد در ساختمان |
| `name` | String | `""` | نام نمایشی ساکن فعلی |
| `occupants` | Number | `0` | تعداد نفرات ساکن (مبنای تسهیم هزینه آب و قبوض نفراتی) |
| `occType` | Enum: `'owner'` \| `'tenant'` | `'owner'` | وضعیت سکونت واحد: مالک یا مستأجر |
| `ownerName` | String | `""` | نام و نام‌خانوادگی مالک واحد |
| `ownerPhone` | String | `""` | شماره تماس مالک (فرمت 09xxxxxxxxx) |
| `tenantPhone` | String | `""` | شماره تماس مستأجر در صورت مستأجر بودن |
| `hasPackage` | Boolean | `false` | آیا واحد دارای پکیج گرمایشی مستقل است؟ (معافیت از گاز عمومی) |
| `transactions` | Array<Transaction> | `[]` | دفترچه معین تراکنش‌های مالی اختصاصی واحد |

---

### ۲.۳. موجودیت تراکنش دفترچه معین واحد (`Ledger Transaction`)
محل تعریف: `js/logic.js:50-108`, `js/logic.js:302-356`
| نام فیلد | نوع داده | مقادیر ممکن | توضیحات |
| :--- | :--- | :--- | :--- |
| `id` | Number | تایم‌استمپ میلی‌ثانیه | شناسه محلی تراکنش |
| `transactionId` | String | فرمت `'tx-...'` | شناسه منحصربه‌فرد پایدار تراکنش |
| `periodId` | String \| null | شناسه دوره | پیوند به دوره‌ای که این تراکنش از آن ناشی شده است |
| `txKind` | Enum (`TX_KIND`) | ۹ نوع سیستمی/دستی | `manual`, `charge_transfer`, `credit_apply`, `past_monthly_pay`, `past_special_pay`, `overpay_credit`, `credit_past_m`, `credit_past_s`, `legacy_auto` |
| `date` | String | تاریخ شمسی | زمان وقوع تراکنش (مثلاً `1403/08/10 14:30`) |
| `type` | Enum | `'debt'` \| `'payment'` \| `'forgive'` | نوع حسابداری: بدهی، واریزی، یا بخشودگی/تعدیل |
| `amount` | Number | بزرگتر از صفر | مبلغ تراکنش به تومان |
| `desc` | String | متن فارسی | شرح عملیات (به همراه برچسب شناسه دوره مانند `·#1730000000`) |

---

### ۲.۴. موجودیت دوره مالی و هزینه‌ها (`Period`)
محل تعریف: `js/ui.js:675-686`, `js/logic.js:1240-1305`, `js/reports.js:274-351`
| نام فیلد | نوع داده | توضیحات |
| :--- | :--- | :--- |
| `id` | String | تایم‌استمپ زمان ساخت دوره |
| `type` | Enum: `'monthly'` \| `'special'` | شارژ ماهانه عادی یا هزینه عمرانی/پیش‌بینی‌نشده |
| `name` | String | عنوان دوره (مثلاً "آبان 1403" یا "تعمیر آسانسور (آبان 1403)") |
| `isStarted` | Boolean | آیا دوره شروع و مقادیر اولیه آن قفل شده است؟ |
| `isClosed` | Boolean | آیا دوره بسته و تسویه نهایی انجام گرفته است؟ |
| `closedAt` | String \| null | تاریخ و ساعت بسته شدن دوره به شمسی |
| `expenses` | Object | ساختار هزینه‌های ثبت شده در دوره: |
| ↳ `inputMode` | `'rate'` \| `'total'` | ورودی بر اساس نرخ هر واحد/نفر یا مبلغ کل فاکتور |
| ↳ `fixed` | Number | هزینه شارژ ثابت (نظافت، نگهبانی) به ازای هر واحد |
| ↳ `water` | Number | هزینه آب عمومی (به ازای هر نفر یا کل قبض تقسیم بر نفرات) |
| ↳ `gas` | Number | هزینه گاز (تقسیم بین واحدهای فاقد پکیج) |
| ↳ `electricity` | Number | هزینه برق مشاعات (تقسیم مساوی بین واحدها) |
| ↳ `incidental` | Number | هزینه‌های متفرقه/جانبی (مساوی بین تمام واحدها) |
| ↳ `incDesc` | String | شرح هزینه متفرقه (مثلاً "سرویس موتورخانه") |
| ↳ `specialTotal` | Number | مبلغ کل هزینه پیش‌بینی‌نشده (در دوره‌های special) |
| ↳ `specialMode` | `'all'` \| `'active'` \| `'custom'` | نحوه تسهیم: بین همه واحدها، واحدهای دارای سکنه، یا واحدهای انتخابی |
| ↳ `customUnits` | Array<Number> | لیست شناسه واحدهای مشمول در حالت custom |
| ↳ `roundUp` | Boolean | فعال‌سازی رند کردن مبالغ به مضرب ۵۰ هزار تومان |
| ↳ `exemptEmptyUnits`| Boolean | معافیت واحدهای با سکنه صفر از پرداخت قبوض مصرفی |
| `frozenExpenses` | Object | کپی منجمدشده از `expenses` در زمان بستن دوره |
| `charges` | Array<ChargeRow> | لیست ریز سهم و وضعیت پرداخت تک‌تک واحدها |

---

### ۲.۵. موجودیت ردیف شارژ واحد در دوره (`ChargeRow`)
محل تعریف: `js/ui.js:680-686`, `js/reports.js:280-350`
| نام فیلد | نوع داده | توضیحات |
| :--- | :--- | :--- |
| `unitId` | Number / String | شناسه واحد مشمول |
| `snapshot` | `{ occupants: number, hasPackage: boolean }` | اسنپ‌شات وضعیت واحد در لحظه صدور شارژ |
| `amount` | Number | مبلغ محاسبه‌شده کل شارژ این دوره برای واحد |
| `paidAmount` | Number | مبلغ واریز شده بابت شارژ همین دوره |
| `paidPastMonthly`| Number | مبلغ تسویه شده از بدهی‌های ماهانه گذشته در این دوره |
| `paidPastSpecial`| Number | مبلغ تسویه شده از بدهی‌های اضطراری در این دوره |
| `payDate` | String \| null | تاریخ واریز وجه |
| `details` | `{ fixed, water, gas, elec, incidental }` | ریز مبالغ مؤلفه‌های شارژ |
| `autoCreditApplied` | Number | میزان بستانکاری قبلی که خودکار در این شارژ کسر شده |
| `lockedDebts` | `{ pastMonthly: number, pastSpecial: number }` | بدهی گذشته منجمد شده در لحظه بستن دوره |
| `frozen` | Object | اسنپ‌شات تغییرناپذیر کلیه مبالغ و محاسبات هنگام بسته شدن |

---

## ۳. طراحی معماری پایگاه داده PostgreSQL و اسکیما Prisma (Target Architecture)

### ۳.۱. مدل ایزولاسیون چندمستأجری (Multi-Tenancy Strategy)
در ارزیابی مدل‌های چندمستأجری در PostgreSQL (شامل Database-per-tenant, Schema-per-tenant, Row-level isolation):
- **انتخاب قطعی:** **Row-Level Multi-Tenancy** به همراه کلیدهای خارجی اجباری `complex_id` و بهره‌گیری از **PostgreSQL Row Level Security (RLS)** و **Prisma Client Extensions**.
- **دلایل انتخاب:**
  1. مقیاس‌پذیری تجاری بالا و امکان مدیریت هزاران مجتمع ساختمانی در یک کلاستر دیتابیس مشترک بدون پیچیدگی سربار هزاران اسکیما یا دیتابیس جداگانه.
  2. امکان اتصال امن به Connection Poolerهایی مانند **PgBouncer** یا **Supabase Supavisor**.
  3. اعمال مهاجرت‌های اسکیما (`prisma migrate deploy`) به صورت اتمیک و یکپارچه در کسری از ثانیه روی کل سیستم.
  4. جلوگیری از نشت داده بین مستأجرین به صورت ۲ لایه (لایه‌اول در اکستنشن Prisma با تزریق خودکار `where: { complexId }`، لایه‌دوم در سطح RLS بومی PostgreSQL).

---

### ۳.۲. اسکیمای جامع هدف (Complete Prisma Schema Design)

در ادامه اسکیما استاندارد تجاری برای پیاده‌سازی با **Prisma ORM** و **PostgreSQL 15+** طراحی شده است:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// -------------------------------------------------------------
// 1. هسته چندمستأجری و احراز هویت (Tenants & Identity)
// -------------------------------------------------------------

enum UserRole {
  SUPER_ADMIN     // دسترسی کلی به تمام پلتفرم و مستأجرین
  COMPLEX_MANAGER // مدیر کل یک مجتمع مسکونی/تجاری
  SUB_MANAGER     // مدیر کمکی/حسابدار با دسترسی‌های محدود
  RESIDENT        // ساکن یا مالک واحد (پورتال ساکنین)
}

enum OccupancyStatus {
  OWNER_OCCUPIED  // سکونت مالک
  TENANT_OCCUPIED // سکونت مستأجر
  VACANT          // واحد خالی
}

enum ResidentType {
  OWNER           // مالک
  TENANT          // مستأجر
}

model Complex {
  id              String      @id @default(uuid())
  slug            String      @unique // شناسه یکتا در URL (مثلاً pars-residence)
  name            String      // نام مجتمع (مثلاً برج پارس)
  address         String?
  city            String?
  province        String?
  postalCode      String?
  phone           String?
  unitCount       Int         @default(20)
  initialFund     Decimal     @default(0) @db.Decimal(14, 2) // موجودی اولیه صندوق
  roundStep       Int         @default(50000)                // گام رند کردن شارژ
  currency        String      @default("IRT")                // تومان
  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // روابط
  buildings       Building[]
  users           User[]
  units           Unit[]
  residents       Resident[]
  periods         Period[]
  transactions    LedgerTransaction[]
  auditLogs       AuditLog[]
  subManagerPerms SubManagerPermission[]
  chatMessages    ChatMessage[]
  receipts        ReceiptVerification[]

  @@map("complexes")
}

model Building {
  id              String      @id @default(uuid())
  complexId       String
  name            String      @default("بلوک اصلی")
  floorsCount     Int?
  unitsCount      Int?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  complex         Complex     @relation(fields: [complexId], references: [id], onDelete: Cascade)
  units           Unit[]
  chatMessages    ChatMessage[]

  @@unique([complexId, name])
  @@index([complexId])
  @@map("buildings")
}

model User {
  id              String      @id @default(uuid())
  complexId       String?     // برای سوپرادمین می‌تواند تهی باشد
  phone           String      @unique
  fullName        String
  email           String?
  passwordHash    String      // هش شده با Argon2id
  role            UserRole    @default(RESIDENT)
  isActive        Boolean     @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  complex         Complex?    @relation(fields: [complexId], references: [id], onDelete: Cascade)
  subManagerPerm  SubManagerPermission?
  residents       Resident[]
  auditActions    AuditLog[]  @relation("ActorAuditLogs")
  createdPeriods  Period[]    @relation("PeriodCreator")
  createdTxs      LedgerTransaction[] @relation("TxCreator")
  sentMessages    ChatMessage[]
  uploadedReceipts ReceiptVerification[] @relation("ReceiptUploader")
  verifiedReceipts ReceiptVerification[] @relation("ReceiptVerifier")

  @@index([complexId, role])
  @@map("users")
}

model SubManagerPermission {
  id                    String   @id @default(uuid())
  complexId             String
  userId                String   @unique
  canManageUnits        Boolean  @default(false)
  canManagePeriods      Boolean  @default(false)
  canRecordPayments     Boolean  @default(false)
  canClosePeriods       Boolean  @default(false)
  canViewReports        Boolean  @default(true)
  canManageResidents    Boolean  @default(false)
  canSendNotifications  Boolean  @default(false)
  canManageSettings     Boolean  @default(false)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  complex               Complex  @relation(fields: [complexId], references: [id], onDelete: Cascade)
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([complexId])
  @@map("sub_manager_permissions")
}

// -------------------------------------------------------------
// 2. واحدها، مالکان، ساکنین (Units & Residents)
// -------------------------------------------------------------

model Unit {
  id              String          @id @default(uuid())
  complexId       String
  buildingId      String?
  unitNumber      Int             // شماره واحد (۱ تا ...)
  unitName        String?         // نام مستعار (مثلاً واحد ۴ شمالی)
  floor           Int?
  area            Decimal?        @db.Decimal(8, 2) // متراژ جهت محاسبات متراژی
  occupants       Int             @default(0)       // تعداد ساکنین
  occType         OccupancyStatus @default(OWNER_OCCUPIED)
  hasPackage      Boolean         @default(false)   // پکیج مستقل گاز
  notes           String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  building        Building?       @relation(fields: [buildingId], references: [id], onDelete: SetNull)
  unitResidents   UnitResident[]
  charges         UnitCharge[]
  transactions    LedgerTransaction[]
  receipts        ReceiptVerification[]
  periodCustomUnits PeriodCustomUnit[]

  @@unique([complexId, unitNumber])
  @@index([complexId])
  @@map("units")
}

model Resident {
  id              String          @id @default(uuid())
  complexId       String
  userId          String?
  fullName        String
  phone           String
  nationalCode    String?
  type            ResidentType    @default(OWNER)
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  user            User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  unitAssignments UnitResident[]

  @@index([complexId, phone])
  @@map("residents")
}

model UnitResident {
  id              String          @id @default(uuid())
  unitId          String
  residentId      String
  type            ResidentType    // مالک یا مستأجر
  isCurrent       Boolean         @default(true)
  startDate       DateTime        @default(now())
  endDate         DateTime?

  unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  resident        Resident        @relation(fields: [residentId], references: [id], onDelete: Cascade)

  @@index([unitId, isCurrent])
  @@index([residentId])
  @@map("unit_residents")
}

// -------------------------------------------------------------
// 3. دوره‌های شارژ و محاسبات فاکتورها (Periods & Charges)
// -------------------------------------------------------------

enum PeriodType {
  MONTHLY
  SPECIAL
}

enum PeriodStatus {
  DRAFT
  ACTIVE
  CLOSED
}

enum CostInputMode {
  RATE
  TOTAL
}

enum SpecialDistMode {
  ALL
  ACTIVE
  CUSTOM
}

model Period {
  id                  String          @id @default(uuid())
  complexId           String
  type                PeriodType      @default(MONTHLY)
  name                String          // مثال: "آبان 1403"
  status              PeriodStatus    @default(DRAFT)
  year                Int
  month               String
  inputMode           CostInputMode   @default(RATE)
  
  // مؤلفه‌های هزینه
  fixedCost           Decimal         @default(0) @db.Decimal(12, 2)
  waterCost           Decimal         @default(0) @db.Decimal(12, 2)
  gasCost             Decimal         @default(0) @db.Decimal(12, 2)
  electricityCost     Decimal         @default(0) @db.Decimal(12, 2)
  incidentalCost      Decimal         @default(0) @db.Decimal(12, 2)
  incidentalDesc      String?
  
  // تنظیمات خاص دوره‌های اضطراری
  specialTotalCost    Decimal         @default(0) @db.Decimal(12, 2)
  specialDistMode     SpecialDistMode @default(ALL)
  
  // قوانین محاسبه
  roundUp             Boolean         @default(false)
  exemptEmptyUnits    Boolean         @default(true)

  // اسنپ‌شات‌های منجمد دوره
  frozenExpenses      Json?
  startedAt           DateTime?
  closedAt            DateTime?
  createdById         String?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  complex             Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  createdBy           User?           @relation("PeriodCreator", fields: [createdById], references: [id], onDelete: SetNull)
  charges             UnitCharge[]
  customUnits         PeriodCustomUnit[]
  transactions        LedgerTransaction[]

  @@index([complexId, status])
  @@map("periods")
}

model PeriodCustomUnit {
  id              String   @id @default(uuid())
  periodId        String
  unitId          String

  period          Period   @relation(fields: [periodId], references: [id], onDelete: Cascade)
  unit            Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([periodId, unitId])
  @@map("period_custom_units")
}

model UnitCharge {
  id                      String          @id @default(uuid())
  complexId               String
  periodId                String
  unitId                  String

  // اسنپ‌شات وضعیت واحد در زمان دوره
  snapshotOccupants       Int             @default(0)
  snapshotHasPackage      Boolean         @default(false)

  // جزئیات محاسباتی سهم واحد
  fixedShare              Decimal         @default(0) @db.Decimal(12, 2)
  waterShare              Decimal         @default(0) @db.Decimal(12, 2)
  gasShare                Decimal         @default(0) @db.Decimal(12, 2)
  electricityShare        Decimal         @default(0) @db.Decimal(12, 2)
  incidentalShare         Decimal         @default(0) @db.Decimal(12, 2)

  // مبالغ نهایی
  amount                  Decimal         @default(0) @db.Decimal(12, 2) // کل شارژ این دوره
  paidAmount              Decimal         @default(0) @db.Decimal(12, 2) // پرداختی مستقیم بابت این شارژ
  paidPastMonthly         Decimal         @default(0) @db.Decimal(12, 2) // تیک تسویه بدهی ماهانه
  paidPastSpecial         Decimal         @default(0) @db.Decimal(12, 2) // تیک تسویه بدهی اضطراری
  autoCreditApplied       Decimal         @default(0) @db.Decimal(12, 2) // کسر از بستانکاری
  autoCreditAppliedSpecial Decimal        @default(0) @db.Decimal(12, 2)

  payDate                 DateTime?
  lockedPastMonthlyDebt   Decimal?        @db.Decimal(12, 2)
  lockedPastSpecialDebt   Decimal?        @db.Decimal(12, 2)
  frozenDetails           Json?
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  period                  Period          @relation(fields: [periodId], references: [id], onDelete: Cascade)
  unit                    Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  transactions            LedgerTransaction[]

  @@unique([periodId, unitId])
  @@index([complexId, unitId])
  @@map("unit_charges")
}

// -------------------------------------------------------------
// 4. دفترچه معین و تراکنش‌های مالی (Double-Entry Ledger)
// -------------------------------------------------------------

enum TxType {
  DEBT      // بدهکاری
  PAYMENT   // بستانکاری / واریز
  FORGIVE   // بخشودگی / تعدیل
}

enum TxKind {
  MANUAL            // ثبت دستی توسط مدیر
  CHARGE_TRANSFER   // انتقال مانده بدهی شارژ به معین
  CREDIT_APPLY      // استفاده از بستانکاری در دوره
  PAST_MONTHLY_PAY  // تیک تسویه بدهی ماهانه پیشین
  PAST_SPECIAL_PAY  // تیک تسویه بدهی اضطراری پیشین
  OVERPAY_CREDIT    // بستانکاری ناشی از پرداخت مازاد
  CREDIT_PAST_M     // اعمال بستانکاری روی بدهی ماهانه
  CREDIT_PAST_S     // اعمال بستانکاری روی بدهی اضطراری
  LEGACY_AUTO       // تراکنش‌های خودکار قدیمی جهت سازگاری
}

enum PaymentMethod {
  CASH              // نقدی
  CARD_TRANSFER     // کارت به کارت / پایا
  GATEWAY           // درگاه آنلاین
  OFFSET            // تهاتر / بخشودگی
}

model LedgerTransaction {
  id              String          @id @default(uuid())
  complexId       String
  unitId          String
  periodId        String?
  chargeId        String?
  transactionId   String          @unique // شناسه یکتای مرجع تراکنش
  txKind          TxKind          @default(MANUAL)
  type            TxType
  amount          Decimal         @db.Decimal(14, 2)
  date            DateTime        @default(now())
  description     String
  paymentMethod   PaymentMethod   @default(CARD_TRANSFER)
  referenceNumber String?         // شماره پیگیری فیش بانکی
  receiptId       String?         // پیوند به فیش تصویری
  createdById     String?
  createdAt       DateTime        @default(now())

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  period          Period?         @relation(fields: [periodId], references: [id], onDelete: SetNull)
  charge          UnitCharge?     @relation(fields: [chargeId], references: [id], onDelete: SetNull)
  createdBy       User?           @relation("TxCreator", fields: [createdById], references: [id], onDelete: SetNull)
  receipt         ReceiptVerification? @relation(fields: [receiptId], references: [id], onDelete: SetNull)

  @@index([complexId, unitId, date])
  @@index([transactionId])
  @@map("ledger_transactions")
}

// -------------------------------------------------------------
// 5. سیستم لاگ حسابرسی تغییرناپذیر (Immutable Audit Logging)
// -------------------------------------------------------------

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  LOGIN
  LOGOUT
  CLOSE_PERIOD
  START_PERIOD
  SETTLE_DEBT
  PERMISSION_CHANGE
  DATA_EXPORT
}

model AuditLog {
  id              BigInt          @id @default(autoincrement())
  complexId       String?
  actorId         String?
  actorRole       String?
  ipAddress       String?
  userAgent       String?
  action          AuditAction
  entityType      String          // مثال: "Period", "UnitCharge", "LedgerTransaction"
  entityId        String
  oldData         Json?           // وضعیت داده قبل از تغییر
  newData         Json?           // وضعیت داده بعد از تغییر
  diff            Json?           // مقایسه دلتای تغییرات
  metadata        Json?           // اطلاعات اضافه
  createdAt       DateTime        @default(now())

  complex         Complex?        @relation(fields: [complexId], references: [id], onDelete: Cascade)
  actor           User?           @relation("ActorAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([complexId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}

// -------------------------------------------------------------
// 6. بسترهای توسعه آتی: چت بلادرنگ و تایید فیش با AI
// -------------------------------------------------------------

model ChatMessage {
  id              String          @id @default(uuid())
  complexId       String
  buildingId      String?
  senderId        String
  content         String
  isNotice        Boolean         @default(false) // اطلاعیه رسمی مدیر
  attachments     Json?
  createdAt       DateTime        @default(now())

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  building        Building?       @relation(fields: [buildingId], references: [id], onDelete: SetNull)
  sender          User            @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([complexId, createdAt])
  @@map("chat_messages")
}

enum ReceiptStatus {
  PENDING         // در انتظار بررسی هوش مصنوعی
  PROCESSED       // استخراج اطلاعات انجام شد
  VERIFIED        // تایید نهایی توسط مدیر
  REJECTED        // رد شده (نامعتبر یا تکراری)
}

model ReceiptVerification {
  id              String          @id @default(uuid())
  complexId       String
  unitId          String
  uploadedById    String
  imageUrl        String
  status          ReceiptStatus   @default(PENDING)
  extractedAmount Decimal?        @db.Decimal(12, 2)
  extractedDate   DateTime?
  trackingNumber  String?         // شماره پیگیری استخراج‌شده
  destinationCard String?
  rawAiOutput     Json?           // خروجی کامل مدل بینایی هوش مصنوعی
  verifiedById    String?
  verifiedAt      DateTime?
  rejectionReason String?
  createdAt       DateTime        @default(now())

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  uploadedBy      User            @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: Cascade)
  verifiedBy      User?           @relation("ReceiptVerifier", fields: [verifiedById], references: [id], onDelete: SetNull)
  transactions    LedgerTransaction[]

  @@index([complexId, status])
  @@index([trackingNumber])
  @@map("receipt_verifications")
}
```

---

## ۴. استراتژی جامع و تضمین‌شده مهاجرت داده‌ها (Lossless Migration Strategy)

برای انتقال کامل داده‌های کنونی کاربران از حافظه محلی مرورگر (IndexedDB و LocalStorage) به پایگاه داده ابری PostgreSQL، بدون حتی یک ریال مغایرت محاسباتی، سناریوی گام‌به‌گام زیر طراحی شده است:

### ۴.۱. مکانیزم استخراج داده از کلاینت (Client Extraction)
1. اسکریپت کلاینت در اولین ورود کاربر پس از راه‌اندازی سرور، محتوای ذخیره‌شده در `ParsBuildingDB` (آبجکت استور `app_state`) و `localStorage.getItem('app_db_pars_v6')` را می‌خواند.
2. همچنین امکان آپلود مستقیم فایل بکاپ JSON خروجی برنامه (`downloadBackup()` در `js/state.js:175`) در یک پنل ویژه مهاجرت وجود دارد.
3. داده‌ها اعتبارسنجی اولیه شده و ساختار JSON استاندارد با هش یکپارچگی (SHA-256 Checksum) به روت مهاجرت سرور ارسال می‌شود:
   `POST /api/v1/migration/import-legacy-db`

### ۴.۲. خط لوله تراکنشی سمت سرور (Atomic Server-Side Ingestion)
عملیات ایمپورت تماماً در یک تراکنش ایزوله پایگاه داده (`prisma.$transaction`) اجرا می‌شود تا در صورت بروز هرگونه خطای ساختاری، پایگاه داده دست‌نخورده باقی بماند:

```typescript
// شبه‌کد استاندارد پایپ‌لاین مهاجرت
export async function migrateLegacyDatabase(complexId: string, legacyDb: LegacyDBPayload, managerId: string) {
  return await prisma.$transaction(async (tx) => {
    // گام ۱: به‌روزرسانی موجودی اولیه صندوق مجتمع
    await tx.complex.update({
      where: { id: complexId },
      data: { initialFund: new Prisma.Decimal(legacyDb.initialFund || 0) }
    });

    // گام ۲: ایجاد و همگام‌سازی واحدها و اشخاص
    const unitMap = new Map<number, string>(); // نگاشت ID قدیمی به UUID جدید
    for (const u of legacyDb.units) {
      const createdUnit = await tx.unit.create({
        data: {
          complexId,
          unitNumber: Number(u.id),
          unitName: u.name || `واحد ${u.id}`,
          occupants: Number(u.occupants || 0),
          occType: u.occType === 'tenant' ? OccupancyStatus.TENANT_OCCUPIED : OccupancyStatus.OWNER_OCCUPIED,
          hasPackage: Boolean(u.hasPackage),
        }
      });
      unitMap.set(Number(u.id), createdUnit.id);

      // ثبت پروفایل مالک و مستاجر
      if (u.ownerName || u.ownerPhone) {
        const owner = await tx.resident.create({
          data: {
            complexId,
            fullName: u.ownerName || u.name || `مالک واحد ${u.id}`,
            phone: u.ownerPhone || '09000000000',
            type: ResidentType.OWNER
          }
        });
        await tx.unitResident.create({
          data: { unitId: createdUnit.id, residentId: owner.id, type: ResidentType.OWNER, isCurrent: true }
        });
      }
      if (u.occType === 'tenant' && u.tenantPhone) {
        const tenant = await tx.resident.create({
          data: {
            complexId,
            fullName: u.name || `مستأجر واحد ${u.id}`,
            phone: u.tenantPhone,
            type: ResidentType.TENANT
          }
        });
        await tx.unitResident.create({
          data: { unitId: createdUnit.id, residentId: tenant.id, type: ResidentType.TENANT, isCurrent: true }
        });
      }
    }

    // گام ۳: مهاجرت دوره‌ها و ردیف‌های شارژ
    const periodMap = new Map<string, string>();
    for (const p of legacyDb.periods) {
      const createdPeriod = await tx.period.create({
        data: {
          complexId,
          type: p.type === 'special' ? PeriodType.SPECIAL : PeriodType.MONTHLY,
          name: p.name,
          status: p.isClosed ? PeriodStatus.CLOSED : (p.isStarted ? PeriodStatus.ACTIVE : PeriodStatus.DRAFT),
          year: extractYear(p.name),
          month: extractMonth(p.name),
          inputMode: p.expenses?.inputMode === 'total' ? CostInputMode.TOTAL : CostInputMode.RATE,
          fixedCost: new Prisma.Decimal(p.expenses?.fixed || 0),
          waterCost: new Prisma.Decimal(p.expenses?.water || 0),
          gasCost: new Prisma.Decimal(p.expenses?.gas || 0),
          electricityCost: new Prisma.Decimal(p.expenses?.electricity || 0),
          incidentalCost: new Prisma.Decimal(p.expenses?.incidental || 0),
          incidentalDesc: p.expenses?.incDesc || null,
          specialTotalCost: new Prisma.Decimal(p.expenses?.specialTotal || 0),
          specialDistMode: mapSpecialMode(p.expenses?.specialMode),
          roundUp: Boolean(p.expenses?.roundUp),
          exemptEmptyUnits: Boolean(p.expenses?.exemptEmptyUnits),
          frozenExpenses: p.frozenExpenses || null,
          createdById: managerId
        }
      });
      periodMap.set(String(p.id), createdPeriod.id);

      // ثبت شارژهای هر واحد در این دوره
      for (const c of (p.charges || [])) {
        const unitUuid = unitMap.get(Number(c.unitId));
        if (!unitUuid) continue;

        await tx.unitCharge.create({
          data: {
            complexId,
            periodId: createdPeriod.id,
            unitId: unitUuid,
            snapshotOccupants: Number(c.snapshot?.occupants || 0),
            snapshotHasPackage: Boolean(c.snapshot?.hasPackage),
            fixedShare: new Prisma.Decimal(c.details?.fixed || 0),
            waterShare: new Prisma.Decimal(c.details?.water || 0),
            gasShare: new Prisma.Decimal(c.details?.gas || 0),
            electricityShare: new Prisma.Decimal(c.details?.elec || 0),
            incidentalShare: new Prisma.Decimal(c.details?.incidental || 0),
            amount: new Prisma.Decimal(c.amount || 0),
            paidAmount: new Prisma.Decimal(c.paidAmount || 0),
            paidPastMonthly: new Prisma.Decimal(c.paidPastMonthly || 0),
            paidPastSpecial: new Prisma.Decimal(c.paidPastSpecial || 0),
            autoCreditApplied: new Prisma.Decimal(c.autoCreditApplied || 0),
            autoCreditAppliedSpecial: new Prisma.Decimal(c.autoCreditAppliedSpecial || 0),
            lockedPastMonthlyDebt: c.lockedDebts ? new Prisma.Decimal(c.lockedDebts.pastMonthly || 0) : null,
            lockedPastSpecialDebt: c.lockedDebts ? new Prisma.Decimal(c.lockedDebts.pastSpecial || 0) : null,
            frozenDetails: c.frozen || null
          }
        });
      }
    }

    // گام ۴: مهاجرت کامل تراکنش‌های دفترچه معین (Ledger Transactions)
    for (const u of legacyDb.units) {
      const unitUuid = unitMap.get(Number(u.id));
      if (!unitUuid || !u.transactions) continue;

      for (const t of u.transactions) {
        const periodUuid = t.periodId ? periodMap.get(String(t.periodId)) : null;
        await tx.ledgerTransaction.create({
          data: {
            complexId,
            unitId: unitUuid,
            periodId: periodUuid,
            transactionId: t.transactionId || `tx-${t.id || Date.now()}`,
            txKind: mapTxKind(t.txKind || inferTxKind(t.desc)),
            type: t.type === 'payment' ? TxType.PAYMENT : (t.type === 'forgive' ? TxType.FORGIVE : TxType.DEBT),
            amount: new Prisma.Decimal(t.amount || 0),
            date: parsePersianDateToIso(t.date),
            description: t.desc || 'تراکنش منتقل‌شده',
            createdById: managerId
          }
        });
      }
    }

    // گام ۵: آزمون تطابق مالی (Mathematical Reconciliation Verification)
    const verification = await verifyFinancialReconciliation(tx, complexId, legacyDb);
    if (!verification.isEqual) {
      throw new Error(`Migration rejected: Balance discrepancy detected! Legacy: ${verification.legacyFund}, New: ${verification.newFund}`);
    }

    return { success: true, verifiedFund: verification.newFund };
  });
}
```

### ۴.۳. آزمون تطابق جبری و تراز مالی (Audit Reconciliation Check)
پس از اجرای ایمپورت در تراکنش، سرور با اجرای فرمول‌های `computeFundTotals()` و `calculateAllDebts()` روی داده‌های وارد شده به دیتابیس، تراز صندوق و بدهی تک‌تک واحدها را با مقادیر کلاینت مقایسه می‌کند:
$$\Delta Fund = Fund_{Postgres} - Fund_{Legacy} = 0$$
$$\forall u \in Units: Debt_{Postgres}(u) - Debt_{Legacy}(u) = 0$$
در صورت وجود حتی ۱ ریال عدم تطابق، تراکنش Rollback شده و گزارش تفاوت فیلد به فیلد ارائه می‌گردد.

---

## ۵. معماری امنیت، احراز هویت، RBAC و لاگ حسابرسی (Security, Auth, RBAC & Audit)

### ۵.۱. سیستم احراز هویت و امنیت نشست‌ها (Hardened Authentication)
1. **رمزنگاری پسوردها با Argon2id:**
   - استفاده از کتابخانه `@node-rs/argon2` با پارامترهای مقاوم در برابر حملات سخت‌افزاری (Memory cost: 65536 KB, Time cost: 3 iterations, Parallelism: 4).
2. **استراتژی دو لایه توکن (JWT + Rotating Refresh Token):**
   - **Access Token:** امضا شده با الگوریتم asymmetric (Ed25519 یا RS256) با طول عمر کوتاه (۱۵ دقیقه)، نگهداری فقط در حافظه رم کلاینت (Memory State) جهت جلوگیری قطعی از سرقت توکن از طریق XSS.
   - **Refresh Token:** توکن رندوم با آنتروپی ۲۵۶ بیتی ذخیره شده در کوکی با فلگ‌های `HttpOnly`, `Secure`, `SameSite=Strict` و انقضای ۷ روزه.
   - **Token Rotation & Reuse Detection:** هر بار استفاده از Refresh Token، توکن قبلی باطل و یک توکن جدید صادر می‌شود. در صورت تلاش مجدد برای استفاده از توکن سوخته، کل سلسله توکن‌های کاربر باطل شده و لاگ حمله امنیتی ثبت می‌شود.
3. **دفاع در برابر CSRF و XSS:**
   - نصب و تنظیم هدرهای امنیتی با `@fastify/helmet` (شامل تنظیم دقیق CSP, HSTS, X-Content-Type-Options).
   - اعتبارسنجی توکن‌های محافظت شده ضد CSRF (Double Submit Cookie یا Origin/Referer verification) روی تمام متدهای تغییر وضعیت (`POST`, `PUT`, `PATCH`, `DELETE`).
   - پاکسازی و ضدعفونی کلیه ورودی‌های متنی با کتابخانه‌های اعتبارسنجی `Zod` در لایه روت‌ها.
4. **محدودسازی نرخ درخواست‌ها (Rate Limiting):**
   - اعمال ماژول `@fastify/rate-limit` روی اندپوینت‌های حساس:
     - روت لاگین `/api/v1/auth/login`: حداکثر ۵ تلاش در هر ۱۵ دقیقه به ازای هر IP.
     - روت‌های ارسال پیامک صورت‌حساب: حداکثر ۱۰ پیامک در هر ساعت.
     - روت‌های عمومی API: حداکثر ۱۰۰ درخواست در هر دقیقه.

---

### ۵.۲. مدل کنترل دسترسی نقش‌محور چندسطحی (Granular RBAC Matrix)

| عملیات / ماژول | Super-Admin | مدیر مجتمع (Manager) | مدیر کمکی (Sub-Manager) | ساکن (Resident) |
| :--- | :---: | :---: | :---: | :---: |
| ساخت مجتمع جدید و تخصیص مدیر | ✅ | ❌ | ❌ | ❌ |
| مشاهده سلامت سرور و لاگ‌های سیستمی | ✅ | ❌ | ❌ | ❌ |
| ویرایش اطلاعات مجتمع و متراژها | ✅ | ✅ | ❌ (مشروط) | ❌ |
| ایجاد، ویرایش و قفل دوره‌های شارژ | ✅ | ✅ | مشروط (`canManagePeriods`) | ❌ |
| ثبت پرداخت‌های دستی و تیک‌های بانکی | ✅ | ✅ | مشروط (`canRecordPayments`) | ❌ |
| بستن نهایی دوره مالی و انتقال بدهی | ✅ | ✅ | مشروط (`canClosePeriods`) | ❌ |
| دریافت خروجی PDF و گزارش تراز کل | ✅ | ✅ | مشروط (`canViewReports`) | ❌ |
| مشاهده صورت‌حساب اختصاصی و مانده بدهی | ✅ | ✅ | ✅ | ✅ (فقط واحد خود) |
| ارسال پیام در تابلوی اعلانات مجتمع | ✅ | ✅ | مشروط (`canSendNotifications`) | مشروط (چت عمومی) |
| ارسال و بارگذاری فیش واریز شارژ | ❌ | ✅ | ✅ | ✅ |

---

### ۵.۳. سیستم لاگ حسابرسی تغییرناپذیر (Immutable Audit Logging Engine)
- **ماهیت Append-Only در سطح دیتابیس:** جدول `audit_logs` در PostgreSQL به عنوان یک سند مالی رسمی در نظر گرفته می‌شود. مجوزهای `UPDATE` و `DELETE` در سطح کاربر پایگاه داده سلب می‌شوند (`REVOKE UPDATE, DELETE ON audit_logs FROM app_user;`).
- **ثبت دلتای دقیق تغییرات:** علاوه بر زمان، آدرس IP و شناسه کاربر، تفاوت فیلدها قبل و بعد از تغییر به صورت JSONB ثبت می‌شود:
```json
{
  "entity": "UnitCharge",
  "entityId": "uc_98234",
  "action": "UPDATE",
  "actorId": "usr_manager_1",
  "delta": {
    "paidAmount": { "from": 250000, "to": 500000 },
    "payDate": { "from": null, "to": "2026-11-01T10:15:00Z" }
  }
}
```

---

## ۶. بسترهای بلادرنگ (WebSocket) و اعتبارسنجی هوش مصنوعی (Real-time & AI Foundations)

### ۶.۱. زیرساخت ارتباطی بلادرنگ (WebSocket Real-Time Engine)
جهت به‌روزرسانی آنی تغییرات شارژ، اطلاعیه‌های فوری مدیر، و چت تعاملی ساکنین:
1. **اتصال بلادرنگ از طریق WebSocket / Socket.io:**
   - هندشیک احراز هویت با JWT انجام می‌شود و کاربر بلافاصله به اتاق‌های امن خود جوین می‌شود:
     - `complex:{complexId}` (اتاق سراسری مجتمع برای اعلانات عمومی، تغییر تراز صندوق، و اطلاعیه‌ها)
     - `unit:{unitId}` (اتاق خصوصی واحد برای اطلاع از صدور فاکتور جدید و تایید پرداخت)
2. **رویدادهای بلادرنگ کلیدی:**
   - `charge:updated` — به‌روزرسانی زنده وضعیت پرداخت شارژ یک واحد روی داشبورد مدیر و ساکن.
   - `period:closed` — اعلان بسته شدن دوره و صدور فاکتور جدید.
   - `chat:new_message` — گفتگوی ساکنین در برد دیجیتال ساختمان.

### ۶.۲. معماری قلاب‌های اعتبارسنجی هوش مصنوعی فیش‌های بانکی (AI Receipt Hook Architecture)
برای جلوگیری از ثبت دستی خسته‌کننده شماره پیگیری فیش‌های واریزی ساکنین:
1. **جریان کاربری (Workflow):**
   - ساکن از طریق پورتال موبایل خود، تصویر فیش واریز (رسید آپ، همراه بانک، پوز) را آپلود می‌کند.
   - فایل در استوریج امن محلی یا S3/MinIO ذخیره شده و رکوردی در جدول `receipt_verifications` با وضعیت `PENDING` ایجاد می‌شود.
2. **پردازش پس‌زمینه ناهمگام (Async Worker with BullMQ):**
   - یک جاب بک‌اند پردازش تصویر را به صف BullMQ (مبتنی بر Redis) ارسال می‌کند.
   - ورکر از مدل بینایی/OCR هوش مصنوعی برای استخراج موارد زیر استفاده می‌کند:
     - **مبلغ واریزی** (به ریال یا تومان و تبدیل خودکار)
     - **شماره پیگیری / مرجع** (Tracking Code)
     - **تاریخ و ساعت دقیق واریز**
     - **شماره کارت مبدا و مقصد**
3. **تایید نهایی با یک کلیک توسط مدیر (Human-in-the-Loop):**
   - هوش مصنوعی فیش را با فاکتورهای باز واحد تطبیق می‌دهد. در صورت مطابقت مبلغ، یک دکمه سبز رنگ «تایید با یک کلیک» برای مدیر نمایش داده می‌شود که در صورت تایید، فوراً تراکنش `LedgerTransaction` از نوع `PAYMENT` ایجاد شده و بدهی واحد کسر می‌گردد.

---

## ۷. فهرست فایل‌های بررسی‌شده در سورس‌کد (List of Inspected Files)

در این مطالعه فنی جامع، فایل‌های زیر به طور کامل و خط‌به‌خط تحلیل و نقشه‌برداری شدند:

| مسیر فایل | حجم / خطوط | نقش در پروژه | یافته‌های کلیدی |
| :--- | :--- | :--- | :--- |
| `index.html` | 122 KB / 2,376 خط | ساختار UI کلاینت و مدال‌ها | شامل تمام مدال‌های واحد، دوره، گزارش بدهکاران، پرینت اطلاعیه، و اشتراک پیامکی |
| `js/state.js` | 10.2 KB / 266 خط | مدیریت استیت کلاینت و دیتابیس | متغیر `db` با کلیدهای `units`، `periods`، `initialFund` و ذخیره در `app_db_pars_v6` |
| `js/idb.js` | 2.0 KB / 66 خط | لایه ذخیره‌سازی IndexedDB | دیتابیس `ParsBuildingDB` و استور `app_state` برای ذخیره نسخه کلاینت |
| `js/logic.js` | 49.7 KB / 1,305 خط | هسته منطق محاسباتی و تراکنش‌ها | شامل تمام انواع `TX_KIND`، تسویه بدهی‌های پیشین، رند کردن، و محاسبه تراز صندوق |
| `js/reports.js` | 28.5 KB / 645 خط | گزارش‌های مالی و بستن دوره | منطق منجمد کردن شارژها (`finalizePeriodClose`) و تولید گزارش بدهکاران و واریزی‌ها |
| `js/ui.js` | 87.8 KB / 1,848 خط | رابط کاربری، فرم‌ها و رندرها | مدیریت اینپوت‌های واحدها، ایجاد دوره جدید، تفکیک هزینه‌های ثابت و متغیر |
| `js/app.js` | 16.8 KB / 523 خط | روتر کلاینت و راه‌اندازی اولیه | راه‌اندازی پیش‌فرض ۲۰ واحد، روتینگ با هش مرورگر، و مدیریت ServiceWorker PWA |
| `js/utils.js` | 7.3 KB / 180 خط | توابع کمکی و تبدیل اعداد | تبدیل ارقام فارسی، تبدیل عدد به حروف (`Num2persian`)، فرمت تاریخ و پول |
| `sw.js` | 2.3 KB / 80 خط | سرویس‌ورکر PWA | کش دارایی‌های کلاینت جهت دسترسی آفلاین |
| `manifest.json` | 837 B / 35 خط | مانیفست وب‌اپلیکیشن | تعریف آیکون‌ها و رنگ تم برنامه برای نصب محلی |
| `README.md` | 4.2 KB / 47 خط | مستندات فعلی پروژه | معرفی ویژگی‌ها و معماری کلاینت‌محور فعلی |
| `.agents/teamwork/ORIGINAL_REQUEST.md` | 4.9 KB / 52 خط | سند نیازمندی‌های اصلی پروژه | دستورالعمل فازهای R1 تا R5 تیم‌ورک |

---

## ۸. جمع‌بندی و گام‌های بعدی برای تیم پیاده‌سازی (Next Steps)
1. راه‌اندازی ساختار سرور مدرن با **Fastify** یا **Express** بر بستر TypeScript.
2. ایجاد پایگاه داده PostgreSQL و اعمال اسکیمای طراحی‌شده فوق از طریق `npx prisma db push` یا `prisma migrate dev`.
3. ایجاد اندپوینت‌های احراز هویت با Argon2 و JWT به همراه ایزولاسیون کامل `complexId`.
4. پیاده‌سازی سرویس مهاجرت خودکار داده‌های محلی کلاینت (IndexedDB) به دیتابیس بدون کمترین مغایرت.
5. پیاده‌سازی میدل‌ور ثبت تغییرناپذیر وقایع مالی و احراز هویت در جدول `audit_logs`.
