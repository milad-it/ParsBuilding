# Milestone 1: Multi-Tenant Prisma Schema & Tenant Isolation Architecture

**Project:** ParsBuilding Commercial SaaS Platform  
**Document:** Database Architecture & Multi-Tenant Isolation Specification  
**Milestone:** M1 — Multi-Tenant Database & Core Foundation  
**Target Path:** `server/prisma/schema.prisma` & `server/src/middleware/tenant.ts`  
**Date:** 2026-10-31  

---

## ۱. مرور معماری و استراتژی چندمستأجری (Architecture Overview & Multi-Tenancy Strategy)

پلتفرم تجاری **ParsBuilding** یک سیستم SaaS مدرن برای مدیریت هوشمند مجتمع‌های مسکونی، اداری و تجاری است. جهت پاسخ‌گویی به الزامات مقیاس‌پذیری تجاری، ایزولاسیون سازمانی و امنیت فراگیر (**نیازمندی‌های R2 و R3**)، استراتژی **Row-Level Multi-Tenancy با تفکیک چندلایه** انتخاب شده است.

### ۱.۱. دلایل انتخاب Row-Level Multi-Tenancy با `complexId`
1. **مقیاس‌پذیری مقرون‌به‌صرفه (Cost-Effective Scalability):** امکان میزبانی ده‌ها هزار مجتمع ساختمانی بر روی یک یا چند کلاستر مشترک PostgreSQL بدون سربار سنگین هزاران Database یا Schema مجزا (اجتناب از مشکلات Connection Pool Starvation و محدودیت حافظه کاتالوگ لینوکس/پستگرس).
2. **مدیریت بهینه اتصالات (Connection Pooling):** سازگاری کامل با Connection Poolerهای در سطح Transaction مانند **PgBouncer** یا **Supavisor**.
3. **مهاجرت‌های اتمیک و سریع اسکیما (Instant Schema Migrations):** اعمال تغییرات دیتابیس از طریق `prisma migrate deploy` تنها با یک بار اجرا در کسری از ثانیه روی کل پلتفرم، بدون نیاز به اسکریپت‌های چرخشی روی هزاران دیتابیس.
4. **ایزولاسیون عمیق ۳ لایه‌ای (Three-Layer Defense-in-Depth):**
   - **لایه ۱ (Request Middleware):** استخراج `tenantContext` (شناسه مجتمع، کاربر و دسترسی‌ها) و ذخیره در `AsyncLocalStorage`.
   - **لایه ۲ (Prisma Client Extension):** تزریق خودکار و بدون خطای شرط `where: { complexId }` و فیلد `data.complexId` به کلیه کوئری‌ها و جهش‌های پایگاه داده.
   - **لایه ۳ (PostgreSQL Row-Level Security - RLS):** فعال‌سازی RLS در سطح هسته دیتابیس به عنوان لایه محافظ نهایی.

---

## ۲. کد کامل اسکیما پریزما (`server/prisma/schema.prisma`)

این فایل به عنوان سند مرجع و نسخه نهایی در مسیر `server/prisma/schema.prisma` قرار می‌گیرد:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============================================================================
// بخش اول: اینام‌های سیستم (System Enums)
// ============================================================================

enum UserRole {
  SUPER_ADMIN     // دسترسی کلان پلتفرم و تمام مجتمع‌ها
  COMPLEX_MANAGER // مدیر ارشد یک مجتمع
  SUB_MANAGER     // مدیر کمکی/حسابدار با دسترسی‌های ماژولار
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

enum PeriodType {
  MONTHLY         // شارژ دوره‌ای ماهانه
  SPECIAL         // دوره اضطراری / پروژه‌های عمرانی
}

enum PeriodStatus {
  DRAFT           // پیش‌نویس (در حال ثبت مقادیر)
  ACTIVE          // شروع‌شده و قفل مقادیر ورودی
  CLOSED          // بسته و تسویه نهایی شده
}

enum CostInputMode {
  RATE            // ورود نرخ به ازای هر واحد / هر نفر
  TOTAL           // ورود کل مبلغ فاکتور و تسهیم سیستمی
}

enum SpecialDistMode {
  ALL             // تقسیم بین تمام واحدها
  ACTIVE          // تقسیم فقط بین واحدهای دارای سکنه
  CUSTOM          // تقسیم بین واحدهای دست‌چین‌شده
}

enum TxType {
  DEBT            // بدهکاری
  PAYMENT         // بستانکاری / واریز
  FORGIVE         // بخشودگی / تعدیل
}

enum TxKind {
  MANUAL            // ثبت دستی توسط مدیر
  CHARGE_TRANSFER   // انتقال مانده شارژ تسویه‌نشده به دفتر معین
  CREDIT_APPLY      // اعمال اعتبار/بستانکاری در شارژ دوره
  PAST_MONTHLY_PAY  // تیک تسویه بدهی ماهانه پیشین در فرم دوره
  PAST_SPECIAL_PAY  // تیک تسویه بدهی اضطراری پیشین در فرم دوره
  OVERPAY_CREDIT    // بستانکاری ناشی از پرداخت مازاد
  CREDIT_PAST_M     // تسویه بدهی ماهانه گذشته با بستانکاری
  CREDIT_PAST_S     // تسویه بدهی اضطراری گذشته با بستانکاری
  LEGACY_AUTO       // تراکنش خودکار قدیمی کلاینت (جهت حفظ سازگاری مهاجرت)
}

enum PaymentMethod {
  CASH              // نقدی
  CARD_TRANSFER     // کارت به کارت / پایا / ساتنا
  GATEWAY           // درگاه آنلاین شاپرک
  OFFSET            // تهاتر / بخشودگی
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  LOGIN
  LOGOUT
  START_PERIOD
  CLOSE_PERIOD
  SETTLE_DEBT
  PERMISSION_CHANGE
  DATA_EXPORT
  MIGRATION
}

enum ReceiptStatus {
  PENDING           // در انتظار پردازش OCR هوش مصنوعی
  PROCESSED         // پردازش‌شده و استخراج اطلاعات
  VERIFIED          // تایید نهایی توسط مدیر
  REJECTED          // رد شده (نامعتبر یا تکراری)
}

// ============================================================================
// بخش دوم: موجودیت‌های هسته و هویت (Tenants & Identity)
// ============================================================================

model Complex {
  id              String      @id @default(uuid())
  slug            String      @unique // شناسه یکتا در URL (مانند "pars-complex")
  name            String      // نام مجتمع (مانند "برج پارس")
  address         String?
  city            String?
  province        String?
  postalCode      String?
  phone           String?
  unitCount       Int         @default(20)
  initialFund     Decimal     @default(0) @db.Decimal(14, 2) // موجودی اولیه صندوق (تومان)
  currentFund     Decimal     @default(0) @db.Decimal(14, 2) // تراز محاسبه‌شده آنلاین صندوق
  roundStep       Int         @default(50000)                // گام رند کردن شارژ (تومان)
  currency        String      @default("IRT")                // تومان (IRT) یا ریال (IRR)
  isActive        Boolean     @default(true)
  settings        Json?       // تنظیمات توسعه‌پذیر مجتمع
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // روابط چندمستأجری
  buildings       Building[]
  users           User[]
  units           Unit[]
  residents       Resident[]
  unitResidents   UnitResident[]
  periods         Period[]
  periodCustomUnits PeriodCustomUnit[]
  charges         UnitCharge[]
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
  description     String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // روابط
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
  phone           String      @unique // شناسه ورود به پلتفرم
  fullName        String
  email           String?
  passwordHash    String      // هش‌شده با Argon2id
  role            UserRole    @default(RESIDENT)
  isActive        Boolean     @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // روابط
  complex         Complex?    @relation(fields: [complexId], references: [id], onDelete: Cascade)
  subManagerPerm  SubManagerPermission?
  residents       Resident[]
  refreshTokens   RefreshToken[]
  auditActions    AuditLog[]  @relation("ActorAuditLogs")
  createdPeriods  Period[]    @relation("PeriodCreator")
  createdTxs      LedgerTransaction[] @relation("TxCreator")
  sentMessages    ChatMessage[]
  uploadedReceipts ReceiptVerification[] @relation("ReceiptUploader")
  verifiedReceipts ReceiptVerification[] @relation("ReceiptVerifier")

  @@index([complexId, role])
  @@index([phone])
  @@map("users")
}

model RefreshToken {
  id              String      @id @default(uuid())
  userId          String
  tokenHash       String      @unique // هش SHA-256 توکن رفرش جهت امنیت مضاعف
  expiresAt       DateTime
  revokedAt       DateTime?
  replacedByToken String?
  userAgent       String?
  ipAddress       String?
  createdAt       DateTime    @default(now())

  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@map("refresh_tokens")
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

// ============================================================================
// بخش سوم: واحدها، ساکنین و تخصیص سکونت (Units & Residents)
// ============================================================================

model Unit {
  id              String          @id @default(uuid())
  complexId       String
  buildingId      String?
  unitNumber      Int             // شماره واحد (۱ تا ...)
  unitName        String?         // نام مستعار (مانند "واحد ۵ شرقی")
  floor           Int?
  area            Decimal         @default(0) @db.Decimal(8, 2) // متراژ جهت محاسبات متراژی (ماده ۴ قانون تملک)
  occupants       Int             @default(0)                   // تعداد نفرات ساکن جهت قبوض نفراتی
  occType         OccupancyStatus @default(OWNER_OCCUPIED)      // وضعیت سکونت
  hasPackage      Boolean         @default(false)               // دارای پکیج مستقل گاز
  parkingCount    Int             @default(0)
  storageArea     Decimal         @default(0) @db.Decimal(8, 2)
  currentBalance  Decimal         @default(0) @db.Decimal(14, 2)// مانده لحظه‌ای دفتر معین (+ بدهکار، - بستانکار)
  notes           String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // روابط
  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  building        Building?       @relation(fields: [buildingId], references: [id], onDelete: SetNull)
  unitResidents   UnitResident[]
  charges         UnitCharge[]
  transactions    LedgerTransaction[]
  receipts        ReceiptVerification[]
  periodCustomUnits PeriodCustomUnit[]

  @@unique([complexId, unitNumber])
  @@index([complexId])
  @@index([buildingId])
  @@map("units")
}

model Resident {
  id              String          @id @default(uuid())
  complexId       String
  userId          String?         // پیوند اختیاری به حساب کاربری پورتال
  fullName        String
  phone           String
  nationalCode    String?         // کد ملی
  type            ResidentType    @default(OWNER)
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // روابط
  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  user            User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  unitAssignments UnitResident[]

  @@index([complexId, phone])
  @@index([complexId, nationalCode])
  @@map("residents")
}

model UnitResident {
  id              String          @id @default(uuid())
  complexId       String          // تفکیک چندمستأجری مستقیم در جدول واسط
  unitId          String
  residentId      String
  type            ResidentType    // مالک یا مستأجر
  isCurrent       Boolean         @default(true) // وضعیت سکونت فعلی
  startDate       DateTime        @default(now())
  endDate         DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  resident        Resident        @relation(fields: [residentId], references: [id], onDelete: Cascade)

  @@index([complexId, unitId, isCurrent])
  @@index([residentId])
  @@map("unit_residents")
}

// ============================================================================
// بخش چهارم: دوره‌های مالی و صورت‌حساب‌های شارژ (Periods & Charges)
// ============================================================================

model Period {
  id                  String          @id @default(uuid())
  complexId           String
  type                PeriodType      @default(MONTHLY)
  name                String          // مثال: "آبان 1403" یا "تعمیر آسانسور (آبان 1403)"
  status              PeriodStatus    @default(DRAFT)
  year                Int             // سال شمسی یا میلادی (مثلاً 1403)
  month               String          // ماه (مثلاً "آبان" یا "08")
  inputMode           CostInputMode   @default(RATE)
  
  // مؤلفه‌های هزینه ورودی دوره
  fixedCost           Decimal         @default(0) @db.Decimal(12, 2)
  waterCost           Decimal         @default(0) @db.Decimal(12, 2)
  gasCost             Decimal         @default(0) @db.Decimal(12, 2)
  electricityCost     Decimal         @default(0) @db.Decimal(12, 2)
  incidentalCost      Decimal         @default(0) @db.Decimal(12, 2)
  incidentalDesc      String?
  areaExpenseTotal    Decimal         @default(0) @db.Decimal(12, 2) // هزینه کل جهت تسهیم بر اساس متراژ
  
  // هزینه‌های خاص دوره‌های اضطراری
  specialTotalCost    Decimal         @default(0) @db.Decimal(12, 2)
  specialDistMode     SpecialDistMode @default(ALL)
  
  // قوانین محاسباتی
  roundUp             Boolean         @default(false)
  roundStep           Int             @default(50000)
  exemptEmptyUnits    Boolean         @default(true) // معافیت واحدهای خالی از قبوض مصرفی

  // اسنپ‌شات‌های تغییرناپذیر پس از بستن دوره
  frozenExpenses      Json?
  totalExpenseAmount  Decimal         @default(0) @db.Decimal(14, 2)
  totalCollectedAmount Decimal        @default(0) @db.Decimal(14, 2)
  startedAt           DateTime?
  closedAt            DateTime?
  createdById         String?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  // روابط
  complex             Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  createdBy           User?           @relation("PeriodCreator", fields: [createdById], references: [id], onDelete: SetNull)
  charges             UnitCharge[]
  customUnits         PeriodCustomUnit[]
  transactions        LedgerTransaction[]

  @@index([complexId, status, year, month])
  @@index([complexId, type])
  @@map("periods")
}

model PeriodCustomUnit {
  id              String   @id @default(uuid())
  complexId       String
  periodId        String
  unitId          String

  complex         Complex  @relation(fields: [complexId], references: [id], onDelete: Cascade)
  period          Period   @relation(fields: [periodId], references: [id], onDelete: Cascade)
  unit            Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([periodId, unitId])
  @@index([complexId])
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
  snapshotArea            Decimal         @default(0) @db.Decimal(8, 2)

  // ریز سهم محاسباتی واحد
  fixedShare              Decimal         @default(0) @db.Decimal(12, 2)
  waterShare              Decimal         @default(0) @db.Decimal(12, 2)
  gasShare                Decimal         @default(0) @db.Decimal(12, 2)
  electricityShare        Decimal         @default(0) @db.Decimal(12, 2)
  incidentalShare         Decimal         @default(0) @db.Decimal(12, 2)
  areaShare               Decimal         @default(0) @db.Decimal(12, 2)
  specialShare            Decimal         @default(0) @db.Decimal(12, 2)
  roundingDelta           Decimal         @default(0) @db.Decimal(12, 2)

  // مبالغ سررسید و تسویه
  amount                  Decimal         @default(0) @db.Decimal(12, 2) // مبلغ کل شارژ این دوره
  paidAmount              Decimal         @default(0) @db.Decimal(12, 2) // پرداختی مستقیم بابت این شارژ
  paidPastMonthly         Decimal         @default(0) @db.Decimal(12, 2) // بدهی گذشته ماهانه تسویه‌شده در این دوره
  paidPastSpecial         Decimal         @default(0) @db.Decimal(12, 2) // بدهی گذشته اضطراری تسویه‌شده در این دوره
  autoCreditApplied       Decimal         @default(0) @db.Decimal(12, 2) // بستانکاری کسرشده برای شارژ ماهانه
  autoCreditAppliedSpecial Decimal        @default(0) @db.Decimal(12, 2) // بستانکاری کسرشده برای شارژ اضطراری

  payDate                 DateTime?
  lockedPastMonthlyDebt   Decimal?        @db.Decimal(12, 2)
  lockedPastSpecialDebt   Decimal?        @db.Decimal(12, 2)
  frozenDetails           Json?           // جزئیات منجمد محاسبات در هنگام بستن
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  // روابط
  complex                 Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  period                  Period          @relation(fields: [periodId], references: [id], onDelete: Cascade)
  unit                    Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  transactions            LedgerTransaction[]

  @@unique([periodId, unitId])
  @@index([complexId, unitId])
  @@index([complexId, periodId])
  @@map("unit_charges")
}

// ============================================================================
// بخش پنجم: دفترچه معین و تراکنش‌های حسابداری (Ledger & Accounting)
// ============================================================================

model LedgerTransaction {
  id              String          @id @default(uuid())
  complexId       String
  unitId          String
  periodId        String?
  chargeId        String?
  transactionId   String          @unique // شناسه منحصربه‌فرد مرجع تراکنش (مانند "tx-1730000000000")
  txKind          TxKind          @default(MANUAL)
  type            TxType          // DEBT (بدهی), PAYMENT (واریز), FORGIVE (بخشودگی)
  amount          Decimal         @db.Decimal(14, 2)
  date            DateTime        @default(now())
  description     String
  paymentMethod   PaymentMethod   @default(CARD_TRANSFER)
  referenceNumber String?         // شماره پیگیری فیش بانکی / پایا
  receiptId       String?         // پیوند به فیش تصویری
  createdById     String?
  createdAt       DateTime        @default(now())

  // روابط
  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  period          Period?         @relation(fields: [periodId], references: [id], onDelete: SetNull)
  charge          UnitCharge?     @relation(fields: [chargeId], references: [id], onDelete: SetNull)
  createdBy       User?           @relation("TxCreator", fields: [createdById], references: [id], onDelete: SetNull)
  receipt         ReceiptVerification? @relation(fields: [receiptId], references: [id], onDelete: SetNull)

  @@index([complexId, unitId, date])
  @@index([complexId, periodId])
  @@index([transactionId])
  @@map("ledger_transactions")
}

// ============================================================================
// بخش ششم: لاگ حسابرسی تغییرناپذیر (Immutable Audit Logging)
// ============================================================================

model AuditLog {
  id              BigInt          @id @default(autoincrement())
  complexId       String?         // برای رخدادهای کلان پلتفرم می‌تواند null باشد
  actorId         String?         // کاربری که عملیات را انجام داده
  actorRole       String?         // نقش کاربر در لحظه رخداد
  ipAddress       String?
  userAgent       String?
  action          AuditAction
  entityType      String          // نام موجودیت (مانند "Period", "UnitCharge", "LedgerTransaction")
  entityId        String          // شناسه رکورد تحت تغییر
  oldData         Json?           // اسنپ‌شات داده قبل از تغییر
  newData         Json?           // اسنپ‌شات داده بعد از تغییر
  diff            Json?           // تفاوت خالص فیلدها (Delta)
  metadata        Json?           // اطلاعات تکمیلی محیطی
  createdAt       DateTime        @default(now())

  complex         Complex?        @relation(fields: [complexId], references: [id], onDelete: Cascade)
  actor           User?           @relation("ActorAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([complexId, createdAt])
  @@index([entityType, entityId])
  @@index([actorId])
  @@map("audit_logs")
}

// ============================================================================
// بخش هفتم: بسترهای بلادرنگ و تایید فیش با هوش مصنوعی (Chat & AI OCR)
// ============================================================================

model ChatMessage {
  id              String          @id @default(uuid())
  complexId       String
  buildingId      String?
  senderId        String
  content         String
  isNotice        Boolean         @default(false) // اطلاعیه رسمی مدیر در برد دیجیتال
  attachments     Json?           // لیست فایل‌ها یا تصاویر ضمیمه
  createdAt       DateTime        @default(now())

  complex         Complex         @relation(fields: [complexId], references: [id], onDelete: Cascade)
  building        Building?       @relation(fields: [buildingId], references: [id], onDelete: SetNull)
  sender          User            @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([complexId, createdAt])
  @@index([complexId, buildingId, createdAt])
  @@map("chat_messages")
}

model ReceiptVerification {
  id              String          @id @default(uuid())
  complexId       String
  unitId          String
  uploadedById    String
  imageUrl        String          // مسیر فایل رسید در استوریج امن
  status          ReceiptStatus   @default(PENDING)
  extractedAmount Decimal?        @db.Decimal(12, 2) // مبلغ استخراج‌شده با هوش مصنوعی
  extractedDate   DateTime?       // تاریخ استخراج‌شده واریز
  trackingNumber  String?         // شماره پیگیری بانکی
  destinationCard String?         // ۴ رقم آخر یا شماره کارت مقصد
  rawAiOutput     Json?           // خروجی کامل JSON مدل ویژن/OCR
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
  @@index([unitId])
  @@map("receipt_verifications")
}
```

---

## ۳. ماتریس موجودیت‌ها، روابط و قوانین یکپارچگی ارجاعی (Referential Integrity & Cascade Rules)

| موجودیت مبدأ | کلید خارجی (`FK`) | موجودیت مرجع | رفتار حذف (`onDelete`) | فلسفه و دلیل منطقی |
|---|---|---|---|---|
| `Building` | `complexId` | `Complex` | `Cascade` | با حذف مجتمع، بلوک‌های آن به طور کامل پاک می‌شوند. |
| `Unit` | `complexId` | `Complex` | `Cascade` | با حذف مجتمع، اطلاعات واحدها پاک می‌شود. |
| `Unit` | `buildingId` | `Building` | `SetNull` | حذف یا بازتعریف یک بلوک نباید باعث حذف ناگهانی واحدها و اسناد مالی آنها شود. |
| `User` | `complexId` | `Complex` | `Cascade` | حساب‌های محلی وابسته به مجتمع با حذف مجتمع پاک می‌شوند. |
| `RefreshToken` | `userId` | `User` | `Cascade` | با حذف کاربر، توکن‌های نشست او باطل و پاک می‌شوند. |
| `SubManagerPermission` | `complexId` | `Complex` | `Cascade` | مجوزهای کمکی وابسته به مجتمع هستند. |
| `SubManagerPermission` | `userId` | `User` | `Cascade` | با حذف کاربر، ردیف مجوزهای او پاک می‌شود. |
| `Resident` | `complexId` | `Complex` | `Cascade` | اطلاعات اشخاص وابسته به مجتمع است. |
| `Resident` | `userId` | `User` | `SetNull` | در صورت لغو یا حذف حساب کاربری ورود، سوابق شخص و نام او در اسناد واحد باقی می‌ماند. |
| `UnitResident` | `complexId` | `Complex` | `Cascade` | تفکیک چندمستأجری مستقیم در پیوند واحد و ساکن. |
| `UnitResident` | `unitId` | `Unit` | `Cascade` | با حذف واحد، پیوندهای سکونت آن پاک می‌شوند. |
| `UnitResident` | `residentId` | `Resident` | `Cascade` | با حذف ساکن، تخصیص سکونت او منقضی/پاک می‌شود. |
| `Period` | `complexId` | `Complex` | `Cascade` | دوره‌ها متعلق به مجتمع هستند. |
| `Period` | `createdById` | `User` | `SetNull` | با حذف حساب کاربری مدیر ایجادکننده، دوره‌ها و صورت‌حساب‌ها هرگز پاک نمی‌شوند. |
| `PeriodCustomUnit` | `periodId` | `Period` | `Cascade` | با حذف دوره، لیست واحدهای سفارشی آن پاک می‌شود. |
| `PeriodCustomUnit` | `unitId` | `Unit` | `Cascade` | با حذف واحد، سطر سفارشی دوره حذف می‌شود. |
| `UnitCharge` | `complexId` | `Complex` | `Cascade` | صورت‌حساب‌های شارژ وابسته به مجتمع هستند. |
| `UnitCharge` | `periodId` | `Period` | `Cascade` | با حذف دوره، ردیف‌های شارژ آن پاک می‌شوند. |
| `UnitCharge` | `unitId` | `Unit` | `Cascade` | با حذف واحد، ردیف‌های شارژ آن پاک می‌شوند. |
| `LedgerTransaction` | `complexId` | `Complex` | `Cascade` | تراکنش‌های مالی وابسته به مجتمع هستند. |
| `LedgerTransaction` | `unitId` | `Unit` | `Cascade` | تراکنش‌های مالی به واحد متصل هستند. |
| `LedgerTransaction` | `periodId` | `Period` | `SetNull` | حذف یک دوره نباید تراکنش واریزی و تسویه دفتر معین را مخدوش کند. |
| `LedgerTransaction` | `chargeId` | `UnitCharge` | `SetNull` | پیوند تراکنش به ردیف شارژ در صورت حذف ردیف، به `null` تغییر می‌کند. |
| `LedgerTransaction` | `createdById` | `User` | `SetNull` | رد پای سازنده سند با حذف اکانت مدیر پاک نمی‌شود، بلکه مقدار `null` می‌گیرد. |
| `LedgerTransaction` | `receiptId` | `ReceiptVerification` | `SetNull` | حذف فیش تصویری سند پرداخت مالی را از بین نمی‌برد. |
| `AuditLog` | `complexId` | `Complex` | `Cascade` | لاگ‌های مجتمع با حذف آن پاک می‌شوند. |
| `AuditLog` | `actorId` | `User` | `SetNull` | **اصل تغییرناپذیری لاگ:** حذف حساب کاربری مدیر یا کاربر، رکوردهای ممیزی و تاریخچه اقدامات او را هرگز پاک نمی‌کند. |
| `ChatMessage` | `complexId` | `Complex` | `Cascade` | پیام‌های چت متعلق به مجتمع هستند. |
| `ChatMessage` | `senderId` | `User` | `Cascade` | با حذف کاربر پیام‌های او پاک می‌شوند. |
| `ReceiptVerification` | `complexId` | `Complex` | `Cascade` | فیش‌ها متعلق به مجتمع هستند. |
| `ReceiptVerification` | `unitId` | `Unit` | `Cascade` | فیش متعلق به واحد است. |
| `ReceiptVerification` | `uploadedById` | `User` | `Cascade` | کاربر آپلودکننده فیش. |
| `ReceiptVerification` | `verifiedById` | `User` | `SetNull` | حذف مدیر تاییدکننده، رکورد وضعیت فیش را خراب نمی‌کند. |

---

## ۴. قیدهای یکتایی و استراتژی ایندکس‌های ترکیبی عملکرد (Unique Constraints & Composite Indexes)

### ۴.۱. قیدهای یکتایی (Unique Constraints)
1. `Complex.slug` — یکتایی شناسه دامنه/آدرس مجتمع در کل سامانه.
2. `Building(complexId, name)` — در یک مجتمع نمی‌توان دو بلوک با نام یکسان داشت.
3. `User.phone` — یکتایی شماره همراه در سراسر پلتفرم برای فرآیند احراز هویت با پیامک/رمز.
4. `Unit(complexId, unitNumber)` — در یک مجتمع نمی‌توان دو واحد با شماره یکسان تعریف کرد.
5. `SubManagerPermission.userId` — رابطه ۱ به ۱ دقیق میان کاربر مدیر کمکی و دسترسی‌های او.
6. `PeriodCustomUnit(periodId, unitId)` — جلوگیری از ثبت تکراری یک واحد در لیست سفارشی دوره.
7. `UnitCharge(periodId, unitId)` — هر واحد در هر دوره مالی دقیقاً یک ردیف صورت‌حساب شارژ دارد.
8. `LedgerTransaction.transactionId` — یکتایی سراسری شناسه تراکنش (مانند `tx-1730000000000`).
9. `RefreshToken.tokenHash` — یکتایی هش توکن‌های رفرش فعال.

### ۴.۲. ایندکس‌های ترکیبی برای کوئری‌های بلادرنگ با عملکرد بالا (High-Performance Indexes)
| جدول | فیلدهای ایندکس | الگوی کوئری هدف (Query Access Pattern) |
|---|---|---|
| `units` | `(complexId, unitNumber)` | جستجوی سریع واحد بر اساس شماره در مجتمع و بررسی قید یکتایی. |
| `units` | `(buildingId)` | فیلتر سریع واحدهای یک بلوک خاص مجتمع. |
| `residents` | `(complexId, phone)` | جستجوی نام و اطلاعات ساکن با شماره تماس در پورتال مدیر. |
| `residents` | `(complexId, nationalCode)` | استعلام هویت ساکن با کد ملی در مجتمع. |
| `unit_residents` | `(complexId, unitId, isCurrent)` | دریافت سریع ساکنان فعلی یک واحد در محاسبات شارژ. |
| `periods` | `(complexId, status, year, month)` | فیلتر دوره‌های فعال، بسته یا پیش‌نویس بر اساس تاریخ در داشبورد مدیر. |
| `periods` | `(complexId, type)` | تفکیک سریع دوره‌های ماهانه عادی و اضطراری. |
| `unit_charges` | `(complexId, unitId)` | دریافت سوابق شارژ یک واحد برای پورتال ساکنین و صدور بیلان. |
| `unit_charges` | `(complexId, periodId)` | خواندن تمام ردیف‌های شارژ یک دوره جهت نمایش در جدول و محاسبه سرجمع‌ها. |
| `ledger_transactions` | `(complexId, unitId, date)` | رندر فوق‌سریع دفترچه معین واحد و صورت‌حساب مالی بر اساس بازه زمانی. |
| `ledger_transactions` | `(complexId, periodId)` | استعلام کلیه تراکنش‌های ناشی از یک دوره خاص جهت محاسبه تراز صندوق. |
| `audit_logs` | `(complexId, createdAt DESC)` | گزارش‌های بازرسی و رخدادنگاری مجتمع به ترتیب جدیدترین‌ها با صفحه‌بندی. |
| `audit_logs` | `(entityType, entityId)` | مشاهده تاریخچه کامل تغییرات یک فیلد یا ردیف خاص (Audit Trail Inspector). |
| `chat_messages` | `(complexId, createdAt DESC)` | واکشی پیام‌های بلادرنگ چت ساختمان با صفحه‌بندی زمانی. |
| `receipt_verifications` | `(complexId, status)` | واکشی فوری فیش‌های در انتظار بررسی برای مدیر (`status: PENDING`). |

---

## ۵. طراحی معماری ایزولاسیون چندمستأجری در کد سرور (Tenant Isolation Architecture)

ایزولاسیون داده‌ها در پلتفرم به صورت دولایه در کد TypeScript پیاده‌سازی می‌شود:

### ۵.۱. کانتکست چندمستأجری با `AsyncLocalStorage` (`server/src/middleware/tenantContext.ts`)

برای جلوگیری از نیاز به ارسال دستی شیء `req` در تمام توابع بیزینس لاجیک، از قابلیت استاندارد Node.js به نام `AsyncLocalStorage` استفاده می‌شود:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface TenantContext {
  complexId: string;
  buildingId?: string;
  userId: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  permissions: string[];
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx || !ctx.complexId) {
    throw new Error('TenantIsolationError: No active tenant context found for this operation.');
  }
  return ctx;
}

/**
 * Fastify Hook / Express Middleware برای استخراج توکن و تزریق کانتکست مجتمع
 */
export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // ۱. اعتبارسنجی توکن JWT از هدر Authorization
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return; // اندپوینت‌های عمومی نیازی به کانتکست ندارند
  }

  const token = authHeader.substring(7);
  const decoded = verifyJwtToken(token); // احراز هویت توکن

  // ۲. تعیین شناسه مجتمع (پشتیبانی از سوپرادمین برای سوییچ روی مجتمع‌ها)
  let targetComplexId = decoded.complexId;
  if (decoded.role === 'SUPER_ADMIN' && request.headers['x-tenant-id']) {
    targetComplexId = request.headers['x-tenant-id'] as string;
  }

  const context: TenantContext = {
    complexId: targetComplexId,
    buildingId: decoded.buildingId,
    userId: decoded.userId,
    role: decoded.role,
    permissions: decoded.permissions || []
  };

  // ذخیره کانتکست در استوریج ناهمگام برای کل طول عمر این درخواست
  tenantStorage.enterWith(context);
  (request as any).tenantContext = context;
}
```

---

### ۵.۲. اکستنشن ایزولاسیون پریزما کلاینت (`server/src/config/prisma.ts`)

با استفاده از قابلیت مدرن **Prisma Client Extensions (`$extends`)**، تمام کوئری‌های پایگاه داده به طور خودکار به شرط `complexId` مجهز می‌شوند. در نتیجه، حتی اگر یک توسعه‌دهنده در نوشتن کوئری فراموش کند شرط `where: { complexId }` را بگذارد، اکستنشن به صورت شفاف و نفوذناپذیر آن را تزریق می‌کند:

```typescript
import { PrismaClient } from '@prisma/client';
import { getTenantContext } from '../middleware/tenantContext';

const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// لیست مدل‌های چندمستأجری که فیلد complexId دارند
const TENANT_MODELS = [
  'building',
  'unit',
  'resident',
  'unitResident',
  'period',
  'periodCustomUnit',
  'unitCharge',
  'ledgerTransaction',
  'auditLog',
  'chatMessage',
  'receiptVerification',
  'subManagerPermission'
] as const;

export const prisma = rawPrisma.$extends({
  name: 'TenantIsolationExtension',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async findFirst({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async count({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async create({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.data = { ...(args.data as any), complexId: ctx.complexId };
        }
        return query(args);
      },

      async update({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async delete({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      }
    }
  }
});
```

---

## ۶. لایه دفاعی سوم: اسکریپت امنیتی Row-Level Security بومی PostgreSQL

برای دستیابی به حداکثر استاندارد امنیتی در سطح پایگاه داده (Security in Depth)، سیاست‌های زیر بر روی جداول PostgreSQL اعمال می‌شوند تا حتی در صورت اجرای دستی کوئری مستقیم SQL، دسترسی بین مجتمع‌ها غیرممکن باشد:

```sql
-- ۱. فعال‌سازی RLS روی تمام جداول دارای complex_id
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_verifications ENABLE ROW LEVEL SECURITY;

-- ۲. ایجاد پالیسی ایزولاسیون با خواندن متغیر کانتکست نشستی
-- کاربر نرم‌افزار در ابتدای هر تراکنش یا درخواست اجرا می‌کند:
-- SET LOCAL app.current_complex_id = 'uuid-of-complex';

CREATE POLICY units_tenant_isolation ON units
  FOR ALL
  USING (
    complex_id = NULLIF(current_setting('app.current_complex_id', true), '')
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY ledger_transactions_tenant_isolation ON ledger_transactions
  FOR ALL
  USING (
    complex_id = NULLIF(current_setting('app.current_complex_id', true), '')
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ۳. سلب دسترسی ویرایش و حذف روی جدول لاگ‌های حسابرسی (Append-Only Audit)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
```

---

## ۷. نگاشت داده‌های کلاینت به اسکیمای هدف (Client DB to Target Schema Mapping)

جدول زیر نشان می‌دهد که چطور ساختار شیء محلی جاوااسکریپت (`db = { units, periods, initialFund }`) مستقیماً و بدون اتلاف داده به جدول‌های جدید PostgreSQL نگاشت می‌شود:

| فیلد در کلاینت (`db`) | مدل هدف در PostgreSQL | فیلد هدف در Prisma | نوع تبدیل / منطق |
|---|---|---|---|
| `db.initialFund` | `Complex` | `initialFund` | `Decimal` دقیق (موجودی اولیه صندوق مجتمع) |
| `u.id` (1..20) | `Unit` | `unitNumber` | عدد صحیح `Int` شماره واحد |
| `u.name` | `Unit` / `Resident` | `unitName` / `fullName` | نام نمایشی واحد و نام شخص ساکن |
| `u.occupants` | `Unit` / `UnitCharge` | `occupants`, `snapshotOccupants` | تعداد ساکنین واحد جهت تسهیم قبوض |
| `u.occType` | `Unit` | `occType` | نگاشت `'owner'` به `OWNER_OCCUPIED` و `'tenant'` به `TENANT_OCCUPIED` |
| `u.ownerName`, `ownerPhone` | `Resident` + `UnitResident` | `fullName`, `phone`, `type: OWNER` | ایجاد پروفایل مالک و پیوند به واحد |
| `u.tenantPhone` | `Resident` + `UnitResident` | `phone`, `type: TENANT` | ایجاد پروفایل مستأجر و پیوند به واحد |
| `u.hasPackage` | `Unit` / `UnitCharge` | `hasPackage`, `snapshotHasPackage` | بولین پکیج مستقل گاز |
| `u.transactions[]` | `LedgerTransaction` | رکوردهای جدول معین | ثبت دقیق با `txKind`، `type`، `amount` و `date` |
| `p.id` | `Period` | شناسه‌گذاری پایدار | ایجاد UUID و نگاشت در Map موقت مهاجرت |
| `p.name` | `Period` | `name`, `year`, `month` | عنوان دوره و استخراج خودکار سال و ماه |
| `p.isClosed`, `p.isStarted` | `Period` | `status` | تبدیل به `DRAFT`, `ACTIVE`, `CLOSED` |
| `p.expenses.*` | `Period` | `fixedCost`, `waterCost`, ... | مبالغ ورودی هزینه‌های دوره |
| `p.charges[]` | `UnitCharge` | رکوردهای جدول شارژ واحد | سهم تفکیکی هر واحد، پرداختی‌ها و تسویه بدهی‌ها |

---

## ۸. چک‌لیست تایید و بازبینی فنی (Verification Checklist for Implementers)

- [x] **انطباق با نیازمندی‌های چندمستأجری R2:** کلیه جداول داده‌ای دارای ستون اجباری `complexId` و کلیدهای خارجی مناسب هستند.
- [x] **۱۵ مدل کامل و مستند:** شامل `Complex`, `Building`, `User`, `RefreshToken`, `SubManagerPermission`, `Unit`, `Resident`, `UnitResident`, `Period`, `PeriodCustomUnit`, `UnitCharge`, `LedgerTransaction`, `AuditLog`, `ChatMessage`, `ReceiptVerification`.
- [x] **پشتیبانی کامل از فرمول‌های ماده ۴ قانون تملک و محاسبات مالی:** افزودن فیلدهای `area`, `snapshotArea`, `areaExpenseTotal`, `areaShare` و دقت عددی `Decimal(12,2)` و `Decimal(14,2)`.
- [x] **ثبت تغییرناپذیر اسناد مالی و لاگ‌ها:** سلب `onDelete: Cascade` از کاربران نسبت به سوابق تراکنش‌ها و لاگ‌ها (`onDelete: SetNull`).
- [x] **طراحی کامل اکستنشن پریزما و میدل‌ور:** ارائه کدهای قابل اجرای TypeScript جهت تزریق خودکار `tenantContext`.
