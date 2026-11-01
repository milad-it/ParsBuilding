# Blueprint Report: Manager Workflows, Dedicated Resident Portal & Real-Time WebSocket Integration

**Agent**: `m4_explorer_3` (teamwork_explorer)  
**Role**: Domain Workflows & Real-Time Integration Specialist  
**Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_3\`  
**Target Milestone**: M4 (World-Class SaaS UI/UX, Domain Workflows & Resident Portal)  
**Target Output**: `handoff.md`

---

## 1. Observation

Direct code and architectural observations across the backend and frontend services:

### 1.1 Backend Route Contracts & Financial Operations
- **Periods & Calculation Engine** (`server/src/routes/periodRoutes.ts:26-45, 258-307, 309-434, 436-543`):
  - Period creation schema supports standard Iranian cost fields: `fixedCost`, `waterCost`, `gasCost`, `electricityCost`, `incidentalCost`, `incidentalDesc`, `areaExpenseTotal` (ماده ۴ قانون تملک آپارتمان‌ها), `specialTotalCost`, `specialDistMode` (`ALL` | `ACTIVE` | `CUSTOM`), `roundUp`, `roundStep` (default 50,000 Toman/Rial), `exemptEmptyUnits`.
  - Preview endpoint `POST /periods/:id/calculate` executes dry-run calculation without side-effects, returning `CalculationResult`:
    ```typescript
    export interface CalculationResult {
      charges: UnitChargeOutput[];
      totalDistributed: number;
      totalInputExpenses: number;
      conservationDelta: number; // MUST be 0
    }
    ```
  - State machine lifecycle:
    1. `DRAFT`: Editable input values, deletable via `DELETE /periods/:id`.
    2. `PUBLISH` (`POST /periods/:id/publish`): Moves status to `ACTIVE`, persists calculated `UnitCharge` rows with snapshot metrics (`snapshotOccupants`, `snapshotArea`, `snapshotHasPackage`), saves `frozenExpenses`, and broadcasts real-time events `period:published` and `BILLING_PERIOD_OPENED` to `complex:{id}`.
    3. `CLOSE` (`POST /periods/:id/close`): Moves status to `CLOSED`, sets `closedAt`, creates immutable `LedgerTransaction` (`txKind: CHARGE_TRANSFER`, `type: DEBT`) for unpaid amounts, decrements `unit.currentBalance`, and broadcasts `period:closed` and `BILLING_PERIOD_CLOSED`.

- **Ledger Transactions & Payments** (`server/src/routes/transactionRoutes.ts:17-38, 41-168, 233-312, 314-399`):
  - Payment recording endpoint `POST /payments` supports `paymentMethod` (`CASH`, `CARD_TRANSFER`, `GATEWAY`, `OFFSET`), increments `Unit.currentBalance` (reducing unit debt / increasing unit credit), increments `Complex.currentFund` (building treasury balance), updates `UnitCharge.paidAmount` if `chargeId` is linked, creates immutable audit log (`AuditAction.SETTLE_DEBT`), and broadcasts `payment:received`, `PAYMENT_RECEIVED`, `unit:balance_updated`, and `UNIT_BALANCE_UPDATED` to `complex:{id}` and `unit:{unitId}`.
  - Manual adjustments endpoint `POST /transactions/manual` handles `DEBT`, `PAYMENT`, and `FORGIVE` transaction kinds.
  - Summary reports endpoints:
    - `GET /reports/balance-sheet`: returns `initialFund`, `currentFund`, `totalDebts`, `totalCredits`, `totalBilledExpenses`, `totalCollectedCharges`, and `closedPeriodsCount`.
    - `GET /reports/debtors`: returns list of debtor units (`currentBalance < 0`) ordered by highest debt first with resident names and phone numbers.

- **Units & Residents Management** (`server/src/routes/unitRoutes.ts:13-50, 53-116, 185-217, 320-350, 401-458` and `residentRoutes.ts:12-38, 41-99, 129-200, 285-344`):
  - Unit queries support filtering by `buildingId`, `occType` (`OWNER_OCCUPIED`, `TENANT_OCCUPIED`, `VACANT`), and search by unit number or name.
  - Quick occupancy toggle via `PATCH /units/:id/occupancy` (`occType`, `occupants`).
  - Unit statement endpoint `GET /units/:id/statement` returns current balance, specs, charge breakdown history, and ledger transactions.
  - Resident management supports assignment/unassignment to units (`POST /residents/:id/assign-unit`, `POST /residents/:id/unassign-unit`).

- **Announcements & Digital Bulletin Board** (`server/src/routes/announcementRoutes.ts:13-19, 23-85, 114-179`):
  - Backed by `ChatMessage` model with `isNotice: true`.
  - Content format bundles `title` and `content` as JSON or plain string.
  - Broadcasts `announcement:created` and `NEW_ANNOUNCEMENT` to `complex:{id}`.

- **AI Receipt Verification Queue** (`server/src/routes/receiptRoutes.ts:7-11, 14-119, 122-187`):
  - Resident receipt submission `POST /receipts/verify` (scoped to assigned unit) enqueues BullMQ AI OCR verification job.
  - Returns `202 Accepted` with `receiptId` and `status: PENDING`.
  - Query status via `GET /receipts/:id`.

### 1.2 WebSocket Real-Time Infrastructure
- **Server Implementation** (`server/src/services/realtimeService.ts:5-25, 27-38, 134-173, 202-233, 236-281, 317-346`):
  - Handshake authentication via `token` query parameter or `Authorization: Bearer <token>` header.
  - Auto-joins `complex:{complexId}`, `user:{userId}`, and `unit:{unitId}`.
  - Enforces strict tenant isolation in `canSubscribe(user, room)`: prevents managers or residents of complex A from subscribing to complex B or foreign units.
  - Employs dual-named event dispatch for backwards and forwards compatibility:
    - Period publication: `period:published` and `BILLING_PERIOD_OPENED`
    - Period closing: `period:closed` and `BILLING_PERIOD_CLOSED`
    - Payments: `payment:received` and `PAYMENT_RECEIVED`
    - Balance updates: `unit:balance_updated` and `UNIT_BALANCE_UPDATED`
    - Announcements: `announcement:created` and `NEW_ANNOUNCEMENT`
    - Receipts: `receipt:verified` and `RECEIPT_VERIFIED`
  - Heartbeat monitor with ping/pong every 30 seconds.

- **Client Implementation** (`client/src/services/websocket.ts:23-40, 51-99, 115-127, 129-148, 172-189, 190-203`):
  - Singleton `WebSocketClient.getInstance()`.
  - Auto-reconnect with exponential backoff and jitter (`Math.min(1000 * 1.5^attempts, 30000)`).
  - Explicit disconnect handling, heartbeat ping every 25 seconds.
  - Subscriptions set persistence across reconnections (`subscribedRooms`).

- **Unified Axios API Client** (`client/src/services/api.ts:21-29, 93-109, 112-170, 174-285`):
  - Automatic `Bearer` JWT and `x-complex-id` header injection.
  - Thread-safe 401 refresh token queue and mutex.
  - Domain API modules: `complexApi`, `buildingApi`, `unitApi`, `residentApi`, `periodApi`, `chargeApi`, `ledgerApi`, `announcementApi`, `migrationApi`.

---

## 2. Logic Chain

From these direct observations, we derive the comprehensive UI/UX workflow blueprint:

```
[Observation 1.1: Backend REST Contracts & Prisma Schema]
  ├── Multi-tenant scoping per complexId
  ├── CalculationEngine Largest Remainder Formula
  └── Period state machine (DRAFT -> PREVIEW -> PUBLISH -> CLOSE)
      ▼
[Domain Workflow Architecture]
  ├── Manager Dashboard: Live KPI cards, Treasury meter, Collection gauge
  ├── Units & Residents Management: Interactive filterable grid, Occupancy toggle modal
  ├── Period & Expense Engine: Standard Iranian expense form, Zero-loss calculation preview
  ├── Treasury & Payment Hub: Quick payment modal, double-entry ledger update
  └── Financial Ledger & Audit Trail: Multi-filter ledger, before/after JSON diff viewer
      ▼
[Observation 1.1 & 1.2: Resident Endpoints & Bulletin Board]
  ├── Resident isolated to assigned unitIds
  ├── Announcements stored in ChatMessage with isNotice=true
  └── Simulated gateway & AI receipt upload
      ▼
[Dedicated Resident Portal (/resident)]
  ├── Mobile-first Persian RTL Shell & Identity Bar
  ├── Digital Bulletin Board with pinned meeting alerts
  ├── Personal Ledger & Itemized Charge Breakdown
  └── Payment Hub (Online Gateway Simulation & AI Receipt Uploader)
      ▼
[Observation 1.2: WebSocket Server & Client Architecture]
  ├── Auto-subscription to complex:{id} and unit:{id}
  ├── Dual event naming convention
  └── Heartbeat & Exponential Backoff
      ▼
[Real-Time Integration Pipeline]
  ├── React hooks: useWebSocket, useRealtimeSubscription, useLiveQuery
  └── Optimistic UI updates & automatic TanStack Query cache invalidation
```

---

## 3. Blueprint 1: Manager Workflows

### 3.1 Dashboard Overview & Live Key Metrics
The manager dashboard serves as the operational cockpit of the building complex.

```
+-------------------------------------------------------------------------------------------------------+
|  برج مسکونی پارس  |  مدیریت مجتمع  |  وضعیت صندوق: آنلاین  |  اتصال زنده: متصل  (🟢 WebSocket)        |
+-------------------------------------------------------------------------------------------------------+
|  [ موجودی کل صندوق ]     [ کل بدهی وصول‌نشده ]     [ نرخ وصول دوره ]     [ وضعیت دوره فعال ]   [ ضریب سکونت ] |
|   ۳۸۴,۵۰۰,۰۰۰ تومان         ۵۲,۱۰۰,۰۰۰ تومان            ۸۴.۲٪             آبان ۱۴۰۳ (فعال)        ۱۹ از ۲۰ واحد |
|   ▲ ۴.۲٪ نسبت به ماه قبل    ▼ ۱۲٪ کاهش بدهی         ۱۶ از ۲۰ واحد پرداخت کرده  ۳ روز تا پایان دوره    (۹۵٪ اشغال)  |
+-------------------------------------------------------------------------------------------------------+
|  [ 3D Isometric Building Status Matrix ]   |  [ هشدارهای مدیریتی و اقدامات فوری ]                     |
|  - کلیک روی هر واحد جهت نمایش سریع         |  - ۳ واحد دارای بدهی بیش از ۲ دوره                      |
|  - سبز: تسویه / بستانکار                   |  - ۲ فیش واریزی در انتظار تایید هوش مصنوعی               |
|  - زرد: دوره جاری پرداخت‌نشده               |  - جلسه مجمع عمومی: پنج‌شنبه ساعت ۱۸ (سنجاق‌شده)         |
|  - قرمز: بدهی انباشته                      |  [ + ثبت واریزی سریع ]   [ + صدور دوره جدید ]             |
+-------------------------------------------------------------------------------------------------------+
|  [ جدول سریع بدهکاران با مانده منفی ]      |  [ آخرین تراکنش‌های ثبتی دفترچه معین ]                   |
+-------------------------------------------------------------------------------------------------------+
```

#### Metrics Fetching Hook (`useManagerDashboardStats`)
```typescript
export interface DashboardStats {
  currentFund: number;
  initialFund: number;
  totalDebts: number;
  totalCredits: number;
  collectionRate: number;
  activePeriod: {
    id: string;
    name: string;
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
    totalExpenses: number;
    totalCollected: number;
    paidUnitsCount: number;
    totalUnitsCount: number;
  } | null;
  occupancyStats: {
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyPercentage: number;
  };
  pendingReceiptsCount: number;
}

export function useManagerDashboardStats(complexId: string) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [treasuryRes, balanceSheetRes, periodsRes, unitsRes, receiptsRes] = await Promise.all([
        complexApi.getTreasury(complexId),
        ledgerApi.getBalanceSheet(complexId),
        periodApi.getAll({ complexId, status: 'ACTIVE' }),
        unitApi.getAll({ complexId }),
        apiClient.get('/receipts/pending', { params: { complexId } }).catch(() => ({ data: [] }))
      ]);

      const units = unitsRes.data || [];
      const occupied = units.filter((u: any) => u.occType !== 'VACANT' && u.occupants > 0).length;
      const activePeriods = periodsRes.data || [];
      const activeP = activePeriods.length > 0 ? activePeriods[0] : null;

      let paidCount = 0;
      let totalBilled = 0;
      let totalPaid = 0;

      if (activeP && activeP.charges) {
        totalBilled = Number(activeP.totalExpenseAmount || 0);
        activeP.charges.forEach((c: any) => {
          if (Number(c.paidAmount) >= Number(c.amount)) paidCount++;
          totalPaid += Number(c.paidAmount || 0);
        });
      }

      const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 100;

      setStats({
        currentFund: Number(treasuryRes.data.currentFund || 0),
        initialFund: Number(treasuryRes.data.initialFund || 0),
        totalDebts: Number(balanceSheetRes.data.totalDebts || 0),
        totalCredits: Number(balanceSheetRes.data.totalCredits || 0),
        collectionRate,
        activePeriod: activeP ? {
          id: activeP.id,
          name: activeP.name,
          status: activeP.status,
          totalExpenses: totalBilled,
          totalCollected: totalPaid,
          paidUnitsCount: paidCount,
          totalUnitsCount: units.length
        } : null,
        occupancyStats: {
          totalUnits: units.length,
          occupiedUnits: occupied,
          vacantUnits: units.length - occupied,
          occupancyPercentage: units.length > 0 ? Math.round((occupied / units.length) * 100) : 0
        },
        pendingReceiptsCount: (receiptsRes.data || []).length
      });
    } finally {
      setLoading(false);
    }
  }, [complexId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
```

---

### 3.2 Units & Residents Interactive Management
Managers require a high-density, filterable data grid with rapid-action toggles:

#### Data Structure & View Components
1. **Interactive Units Grid/Table**:
   - Columns: Unit Number, Floor, Resident Name (Owner / Tenant badge), Occupants Count, Area ($m^2$), Heating Type (پکیج / موتورخانه), Current Balance (Red debt / Green credit), Actions.
   - Quick Filter Pills: "همه واحدها", "واحدهای بدهکار", "واحدهای خالی", "مستأجران", "دارای پکیج".
   - Search bar filtering by unit number, name, or phone.
2. **Occupancy Status Quick Toggle**:
   - Single-click toggle from table dropdown: `OWNER_OCCUPIED` (سکونت مالک), `TENANT_OCCUPIED` (مستأجر), `VACANT` (واحد خالی).
   - Instant optimistic UI update backed by `PATCH /units/:id/occupancy`.
3. **Unit Details & Resident Contact Modal**:
   - Tab 1: Unit Specs (Area, Floor, Parking, Storage, Package heating).
   - Tab 2: Resident Assignments (Current Owner & Tenant names, phone numbers, national code, quick `tel:` click-to-call, assign new tenant button).
   - Tab 3: Financial Overview & Statement Shortcut (`GET /units/:id/statement`).
   - Tab 4: Quick Payment / Ledger Adjustment trigger.

```typescript
export interface UnitRowData {
  id: string;
  unitNumber: number;
  unitName: string;
  floor?: number;
  area: number;
  occupants: number;
  occType: 'OWNER_OCCUPIED' | 'TENANT_OCCUPIED' | 'VACANT';
  hasPackage: boolean;
  parkingCount: number;
  storageArea: number;
  currentBalance: number;
  residents: Array<{
    id: string;
    fullName: string;
    phone: string;
    type: 'OWNER' | 'TENANT';
  }>;
}
```

---

### 3.3 Expense Entry & Period Lifecycle Management

#### Standard Iranian Building Expense Items Formula Mapping
Standard Iranian condominium expense rules (مطابق قانون تملک آپارتمان‌ها مصوب ۱۳۴۳ و اصلاحات بعدی):
1. **شارژ ثابت پایه (Fixed Base Charge)**:
   - Divided equally among all units (`total = fixedPerUnit * unitCount`).
2. **آب مصرفی مشترک (Water Bill)**:
   - Distributed strictly by occupant count (`occupants`).
   - If `exemptEmptyUnits=true`, vacant units (`occupants=0`) are exempted.
3. **گاز مصرفی مشترک (Gas Bill)**:
   - Units with independent heating package (`hasPackage=true`) are exempt from shared central boiler gas costs; remaining units share cost by occupant count.
4. **برق مشاعات و آسانسور (Common Electricity Bill)**:
   - Divided equally among active units, or by occupant count.
5. **هزینه‌های متفرقه و خدمات (Incidental Expenses & Maintenance)**:
   - Cleaning, security, gardener, generator maintenance (`incidentalTotal` + `incidentalDesc`). Divided equally.
6. **هزینه‌های متراژی بر اساس ماده ۴ (Area-Based Shared Expenses)**:
   - Major structural repairs, elevator renovation, roof insulation, building facade maintenance (`areaExpenseTotal`).
   - Distributed strictly proportionally by unit area: $\text{Share}_i = \text{Total} \times \frac{\text{Area}_i}{\sum \text{Area}}$.
7. **پروژه‌های عمرانی و دوره‌های اضطراری (Special Projects)**:
   - Distributed according to `specialDistMode`: `ALL` (تمام واحدها), `ACTIVE` (واحدهای سکونت‌دار), or `CUSTOM` (واحدهای انتخاب‌شده در جدول واسط `period_custom_units`).
8. **گرد کردن محاسباتی و توزیع باقیمانده (Largest Remainder Rounding)**:
   - Step: 50,000 Tomans (or Rials).
   - $\sum \text{Charges} = \text{TotalExpense}$ exactly (conservation Delta = 0).

#### Complete Period Lifecycle State Machine
```
   [ ایجاد پیش‌نویس دوره (DRAFT) ]
                 │
                 ▼
   [ ورود مبالغ قبوض و فاکتورها ] ────► [ پیش‌نمایش آنی محاسبات (Calculate Preview) ]
                 │                                │
                 │                       (بررسی سهم هر واحد و Δ = 0)
                 ▼                                │
   [ انتشار رسمی دوره (PUBLISH) ] ◄───────────────┘
                 │
                 ├─► وضعیت ACTIVE (قفل مقادیر ورودی فاکتورها)
                 ├─► ثبت ردیف‌های UnitCharge با اسنپ‌شات متراژ و نفرات
                 └─► ارسال پیام زنده WebSocket (period:published)
                 │
                 ▼
   [ تسویه پرداختی‌ها در طول دوره ] ──► ثبت واریزی‌ها در UnitCharge و افزایش تراز صندوق
                 │
                 ▼
   [ بستن نهایی دوره (CLOSE) ]
                 │
                 ├─► وضعیت CLOSED
                 ├─► انتقال مانده‌های تسویه‌نشده به دفتر معین (txKind: CHARGE_TRANSFER)
                 ├─► کسر بدهی از currentBalance واحدها
                 └─► ارسال پیام زنده WebSocket (period:closed)
```

#### Calculation Preview Component Blueprint
```tsx
export function PeriodCalculationPreviewModal({
  periodId,
  expenses,
  onPublishSuccess
}: {
  periodId: string;
  expenses: PeriodExpenseInput;
  onPublishSuccess: () => void;
}) {
  const [preview, setPreview] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    periodApi.calculatePreview(periodId, expenses).then((res) => {
      setPreview(res.data);
      setLoading(false);
    });
  }, [periodId, expenses]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await periodApi.publish(periodId);
      onPublishSuccess();
    } finally {
      setPublishing(false);
    }
  };

  if (loading || !preview) return <LoadingSpinner label="در حال محاسبه دقیق سهم واحدها..." />;

  return (
    <Dialog open onOpenChange={...}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>پیش‌نمایش تسهیم شارژ دوره (تضمین صفر شدن باقیمانده)</DialogTitle>
          <DialogDescription>
            مجموع فاکتورهای ورودی: {fmtNumber(preview.totalInputExpenses)} تومان | 
            مجموع تسهیم‌شده: {fmtNumber(preview.totalDistributed)} تومان | 
            انحراف محاسباتی: {preview.conservationDelta === 0 ? '۰ (دقیق)' : preview.conservationDelta}
          </DialogDescription>
        </DialogHeader>

        {/* Matrix breakdown table */}
        <table className="w-full text-sm text-right border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th>واحد</th>
              <th>ثابت</th>
              <th>آب (نفراتی)</th>
              <th>گاز (پکیج)</th>
              <th>برق مشاعات</th>
              <th>خدمات</th>
              <th>متراژی (ماده ۴)</th>
              <th>خاص/عمرانی</th>
              <th>تعدیل رند</th>
              <th>مبلغ نهایی شارژ</th>
            </tr>
          </thead>
          <tbody>
            {preview.charges.map((c) => (
              <tr key={c.unitId} className="border-b hover:bg-slate-50">
                <td className="font-bold">واحد {c.unitNumber}</td>
                <td>{fmtNumber(c.fixed)}</td>
                <td>{fmtNumber(c.water)}</td>
                <td>{fmtNumber(c.gas)}</td>
                <td>{fmtNumber(c.electricity)}</td>
                <td>{fmtNumber(c.incidental)}</td>
                <td>{fmtNumber(c.areaShare)}</td>
                <td>{fmtNumber(c.specialShare)}</td>
                <td className="text-slate-500">{c.roundingDelta > 0 ? `+${c.roundingDelta}` : c.roundingDelta}</td>
                <td className="font-extrabold text-indigo-700">{fmtNumber(c.totalCharge)} تومان</td>
              </tr>
            ))}
          </tbody>
        </table>

        <DialogFooter className="mt-4 flex justify-between">
          <Button variant="outline" onClick={...}>ویرایش مقادیر</Button>
          <Button variant="primary" disabled={publishing} onClick={handlePublish}>
            {publishing ? 'در حال ثبت و انتشار...' : 'تایید و انتشار رسمی دوره'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### 3.4 Payment Recording & Treasury Balance Adjustment

#### Quick Payment Dialog Workflow
1. **Trigger**: Manager clicks "+ ثبت واریزی" on dashboard, unit row, or period table.
2. **Input Fields**:
   - Unit selection (`unitId` with autocomplete / dropdown showing current balance).
   - Amount in Toman/Rials with live Persian words converter (`Num2persian`).
   - Payment Method:
     - `CARD_TRANSFER` (کارت به کارت / پایا / ساتنا) with mandatory or optional `referenceNumber`.
     - `CASH` (وجه نقد دریافتی).
     - `GATEWAY` (پرداخت اینترنتی).
     - `OFFSET` (تهاتر / بخشودگی).
   - Date picker (default today, Jalali aware).
   - Period link (optional link to active `periodId` or `chargeId`).
   - Description note.
3. **Atomic Execution**:
   - `POST /payments` atomically commits:
     - `LedgerTransaction` (TxType: `PAYMENT`).
     - Increments `unit.currentBalance` (+ amount).
     - Increments `complex.currentFund` (+ amount).
     - If `chargeId` provided, increments `unitCharge.paidAmount`.
     - Records immutable `audit_log`.
   - Real-time broadcasts:
     - `payment:received` & `PAYMENT_RECEIVED`
     - `unit:balance_updated` & `UNIT_BALANCE_UPDATED`
4. **Instant Feedback**: Toast notification + modal auto-close + optimistic update of dashboard fund card.

---

### 3.5 Financial Ledger & Audit Trail Viewer
1. **Tabular Ledger View** (`/ledger`):
   - Multi-criteria filtering:
     - Filter by Unit (All or single unit).
     - Filter by Transaction Type (`DEBT`, `PAYMENT`, `FORGIVE`).
     - Filter by Period.
     - Date range picker.
   - Running Balance Calculation:
     $$\text{Balance}_t = \text{Balance}_{t-1} + \text{Payment}_t - \text{Debt}_t$$
   - Export buttons: Print PDF Statement, Excel/CSV export.
2. **Immutable Audit Trail Viewer** (`/audit`):
   - Restricted to `SUPER_ADMIN`, `COMPLEX_MANAGER`, or sub-managers with `VIEW_AUDIT_LOGS`.
   - Displays timeline of actor ID, role, action (`START_PERIOD`, `CLOSE_PERIOD`, `SETTLE_DEBT`, `CREATE`, `UPDATE`, `DELETE`), entity type, IP address, and timestamp.
   - Interactive Before/After Delta modal: Visual JSON diff highlighter showing changed fields in green/red.

---

## 4. Blueprint 2: Dedicated Resident Portal (`/resident`)

### 4.1 Mobile-First Persian RTL Layout & Identity Header
Residents predominantly access the application via smartphones (Android/iOS PWA or mobile browser).

```
+-------------------------------------------------------------------------+
|  🏛️ برج پارس  |  واحد ۸ (طبقه ۳)  |  ساکن: امیرحسین تهرانی (مستأجر)      |
+-------------------------------------------------------------------------+
|  [ 3D Digital Resident Keycard / Holographic Pass ]                     |
|  - کارت هولوگرافیک سه‌بعدی با انیمیشن ملایم ژیروسکوپ                     |
|  - نمایش وضعیت کلی: خوش‌حساب (بدون بدهی) یا بدهکار                      |
+-------------------------------------------------------------------------+
|  [ وضعیت تراز مالی شما ]                                                |
|   مانده حساب: ۴۵۰,۰۰۰ تومان بدهکار (قرمز)  یا  ۱۲۰,۰۰۰ تومان بستانکار (سبز) |
|   [ 💳 پرداخت سریع صورت‌حساب ]   [ 📥 دانلود صورت‌حساب جامع PDF ]           |
+-------------------------------------------------------------------------+
|  [ تب‌های پرتال ساکنین ]                                                |
|  [ 📢 برد اعلانات (۳) ]   [ 📄 ریز شارژ دوره‌ها ]   [ 📜 سوابق واریز ]    |
+-------------------------------------------------------------------------+
|  - اطلاعیه سنجاق‌شده: جلسه مجمع عمومی ساختمان (پنج‌شنبه ۱۲ آبان)          |
|  - اطلاعیه: شستشوی پارکینگ و مخزن آب (شنبه ۱۰ صبح)                       |
+-------------------------------------------------------------------------+
```

### 4.2 Digital Bulletin Board (تابلو اعلانات دیجیتال)
- Backed by `GET /announcements`:
  - Rich cards with title, formatted Persian body, author badge ("مدیر ساختمان"), date relative to today (مثلاً "۲ ساعت پیش", "دیروز").
  - Pinned banner for high-priority announcements (جلسه مجمع عمومی, قطعی موقت آب/برق).
  - Image/attachment previews (اسناد فاکتور آسانسور، بخشنامه هیئت مدیره).
  - Real-time updates: whenever manager publishes a notice, a floating toast appears: "اطلاعیه جدید از مدیریت ساختمان اضافه شد" and prepends to the board.

### 4.3 Personal Ledger & Period Charges Breakdown
- **Itemized Charge Breakdown Card**:
  - Displays the active/latest period invoice:
    - سهم ثابت واحد: ۴۰۰,۰۰۰ تومان
    - سهم آب (بر اساس ۳ نفر ساکن): ۲۸۵,۰۰۰ تومان
    - سهم گاز (بدون پکیج - موتورخانه مرکزی): ۳۱۰,۰۰۰ تومان
    - سهم برق مشاعات و آسانسور: ۹۵,۰۰۰ تومان
    - سهم خدمات و نظافت: ۱۵۰,۰۰۰ تومان
    - سهم متراژی تعمیرات نما (بر اساس ۹۲ متر مربع): ۱۸۴,۰۰۰ تومان
    - تعدیل رندسازی: +۱,۰۰۰ تومان
    - **مجموع شارژ قابل پرداخت: ۱,۴۲۵,۰۰۰ تومان**
- **Payments History List**:
  - Filterable timeline of past payments.
  - Payment method badge (کارت به کارت، درگاه آنلاین، وجه نقد).
  - Status indicator (تایید شده 🟢, در حال اعتبارسنجی 🟡).
  - "دریافت رسید دیجیتال" button generating printable/shareable Persian transaction receipt.

### 4.4 Online Payment Hub & Receipt Uploader Modal
When the resident clicks "پرداخت صورت‌حساب":

```tsx
export function ResidentPaymentModal({
  unitId,
  currentBalance,
  onPaymentComplete
}: {
  unitId: string;
  currentBalance: number;
  onPaymentComplete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'GATEWAY' | 'RECEIPT_UPLOAD'>('GATEWAY');
  const [amount, setAmount] = useState<number>(Math.max(0, currentBalance));
  const [submitting, setSubmitting] = useState(false);

  // 1. Simulated Shaparak Gateway Flow
  const handleGatewayPayment = async () => {
    setSubmitting(true);
    try {
      // Direct call to payment recording API with GATEWAY method
      await ledgerApi.recordPayment({
        unitId,
        amount,
        paymentMethod: 'GATEWAY',
        referenceNumber: `SHP-${Date.now()}`,
        description: 'پرداخت آنلاین از طریق درگاه پرداخت شاپرک'
      });
      onPaymentComplete();
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Card-to-Card Receipt Uploader with AI Verification
  const handleReceiptUpload = async (imageUrl: string) => {
    setSubmitting(true);
    try {
      await apiClient.post('/receipts/verify', {
        unitId,
        imageUrl,
        expectedAmount: amount
      });
      onPaymentComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={...}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسویه حساب و پرداخت شارژ</DialogTitle>
          <DialogDescription>
            مبلغ بدهی فعلی: <span className="font-bold text-rose-600">{fmtNumber(currentBalance)} تومان</span>
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200">
          <button
            className={`flex-1 py-2 font-bold ${activeTab === 'GATEWAY' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
            onClick={() => setActiveTab('GATEWAY')}
          >
            درگاه پرداخت اینترنتی
          </button>
          <button
            className={`flex-1 py-2 font-bold ${activeTab === 'RECEIPT_UPLOAD' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
            onClick={() => setActiveTab('RECEIPT_UPLOAD')}
          >
            بارگذاری تصویر فیش واریزی
          </button>
        </div>

        {activeTab === 'GATEWAY' ? (
          <div className="space-y-4 py-3">
            <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800">
              اتصال مستقیم به درگاه پرداخت شاپرک (شبیه‌ساز تایید آنی). پس از پرداخت، مانده حساب شما در لحظه صفر می‌شود.
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">مبلغ پرداختی (تومان):</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="text-lg font-bold"
              />
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={submitting || amount <= 0} onClick={handleGatewayPayment}>
              {submitting ? 'در حال انتقال به درگاه...' : `پرداخت اینترنتی ${fmtNumber(amount)} تومان`}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <div className="bg-amber-50 p-3 rounded-lg text-xs text-amber-800">
              شماره کارت ساختمان: <span className="font-bold font-mono">۶۰۳۷-۹۹۷۵-۱۲۳۴-۵۶۷۸</span> بنام مدیر مجتمع.
              تصویر فیش خود را بارگذاری کنید تا توسط هوش مصنوعی پردازش و تایید گردد.
            </div>
            {/* File dropzone / Image uploader */}
            <ReceiptDropzone onUpload={handleReceiptUpload} disabled={submitting} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. Blueprint 3: Real-Time WebSocket Event Pipeline

### 5.1 Real-Time Event Schema Catalog
The backend and frontend communicate via typed events conforming to the dual naming convention:

| Logical Event | Backend Broadcast Event Types | Target Room | Payload Structure |
|---|---|---|---|
| **Period Published** | `period:published` & `BILLING_PERIOD_OPENED` | `complex:{complexId}` | `{ periodId: string, name: string, year: number, month: string, totalExpenses: number }` |
| **Period Closed** | `period:closed` & `BILLING_PERIOD_CLOSED` | `complex:{complexId}` | `{ periodId: string, name: string, closedAt: string, totalCollected: number }` |
| **Payment Received** | `payment:received` & `PAYMENT_RECEIVED` | `complex:{complexId}` and `unit:{unitId}` | `{ unitId: string, amount: number, txId: string, timestamp: string }` |
| **Unit Balance Updated**| `unit:balance_updated` & `UNIT_BALANCE_UPDATED` | `unit:{unitId}` | `{ unitId: string, currentBalance: number, delta: number }` |
| **Announcement Published** | `announcement:created` & `NEW_ANNOUNCEMENT` | `complex:{complexId}` | `{ id: string, title: string, content: string, buildingId?: string, createdAt: string }` |
| **Receipt Verified (AI)** | `receipt:verified` & `RECEIPT_VERIFIED` | `unit:{unitId}` and `complex:{complexId}` | `{ receiptId: string, unitId: string, amount: number, status: 'VERIFIED' }` |

### 5.2 React Custom Real-Time Hooks

#### 1. Global WebSocket Lifecycle Hook (`useWebSocketConnection`)
```typescript
import { useEffect, useState } from 'react';
import { wsClient } from '@/services/websocket';
import { tokenStorage } from '@/services/api';

export function useWebSocketConnection() {
  const [status, setStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR'>('DISCONNECTED');

  useEffect(() => {
    const token = tokenStorage.getAccessToken();
    if (!token) return;

    const unsubscribe = wsClient.onStatusChange((s) => setStatus(s));
    wsClient.connect();

    return () => {
      unsubscribe();
    };
  }, []);

  return { status, isConnected: status === 'CONNECTED' };
}
```

#### 2. Domain Real-Time Subscription Hook (`useRealtimeSubscription`)
```typescript
import { useEffect } from 'react';
import { wsClient, WsMessage } from '@/services/websocket';

export function useRealtimeSubscription<T = any>(
  events: string | string[],
  callback: (data: T, msg: WsMessage<T>) => void,
  room?: string
) {
  useEffect(() => {
    if (room) {
      wsClient.subscribe(room);
    }

    const eventList = Array.isArray(events) ? events : [events];
    const unsubscribers = eventList.map((evt) => wsClient.on<T>(evt, callback));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (room) {
        wsClient.unsubscribe(room);
      }
    };
  }, [events, callback, room]);
}
```

#### 3. Automatic Cache Invalidation Integration
When a real-time event is received, React State / TanStack Query caches are invalidated without requiring page refreshes:
```typescript
export function useRealtimeDataSync(complexId: string, unitId?: string) {
  const queryClient = useQueryClient();

  useRealtimeSubscription(
    ['payment:received', 'PAYMENT_RECEIVED'],
    (data) => {
      queryClient.invalidateQueries(['treasury', complexId]);
      queryClient.invalidateQueries(['balance-sheet', complexId]);
      queryClient.invalidateQueries(['units', complexId]);
      if (data.unitId) {
        queryClient.invalidateQueries(['unit-statement', data.unitId]);
      }
      toast.success(`واریزی جدید به مبلغ ${fmtNumber(data.amount)} تومان با موفقیت ثبت شد.`);
    },
    `complex:${complexId}`
  );

  useRealtimeSubscription(
    ['period:published', 'BILLING_PERIOD_OPENED'],
    (data) => {
      queryClient.invalidateQueries(['periods', complexId]);
      queryClient.invalidateQueries(['units', complexId]);
      toast.info(`دوره جدید «${data.name}» منتشر شد.`);
    },
    `complex:${complexId}`
  );

  useRealtimeSubscription(
    ['announcement:created', 'NEW_ANNOUNCEMENT'],
    (data) => {
      queryClient.invalidateQueries(['announcements', complexId]);
      toast.info(`اطلاعیه جدید: ${data.title}`);
    },
    `complex:${complexId}`
  );

  if (unitId) {
    useRealtimeSubscription(
      ['unit:balance_updated', 'UNIT_BALANCE_UPDATED'],
      (data) => {
        queryClient.invalidateQueries(['unit-statement', unitId]);
      },
      `unit:${unitId}`
    );
  }
}
```

---

## 6. Logic Chain

1. **Manager Dashboard Stats**: Connected via `GET /complexes/:id/treasury`, `GET /reports/balance-sheet`, and `GET /periods?status=ACTIVE`. Aggregates treasury balance, total debts, collection percentage, and unit occupancy status directly from online PostgreSQL data.
2. **Units & Residents Table**: Connected via `GET /units` and `PATCH /units/:id/occupancy`. Renders all units with color-coded balance tags, contact dialogs, and instant occupancy toggle without modal overhead.
3. **Period Expense Entry & Preview**: Connected via `POST /periods/:id/calculate`. Uses the Deterministic Largest Remainder Engine to distribute costs (fixed, water, gas, electricity, incidental, area-based ماده ۴, emergency), providing a dry-run matrix before publishing to prevent calculation disputes.
4. **Period Lifecycle Execution**:
   - `DRAFT` $\to$ `calculatePreview` $\to$ `publish` (`ACTIVE`, saves snapshots, sends `period:published`).
   - `ACTIVE` $\to$ records payments.
   - `close` (`CLOSED`, transfers outstanding balances to ledger with `txKind: CHARGE_TRANSFER`, decrements unit balance, sends `period:closed`).
5. **Payment Recording & Treasury**:
   - `POST /payments` simultaneously updates unit balance (+ credit), complex fund (+ treasury), charge record, and audit log.
   - Real-time event `PAYMENT_RECEIVED` notifies all open manager and resident views.
6. **Dedicated Resident Portal**:
   - Routed at `/resident`.
   - Restricts queries to current resident's assigned `unitIds`.
   - Displays digital bulletin board with real-time announcement additions.
   - Provides itemized breakdown of current bill components.
   - Features online simulated gateway and AI receipt uploader modal.
7. **WebSocket Event Bus**:
   - Handshake with JWT token.
   - Auto-joins complex and unit rooms.
   - Dual-event listeners update client React states reactively.

---

## 7. Caveats

1. **Frontend Foundation Dependency**:
   - The UI components and hooks designed here depend on the React 18+ / Vite / Tailwind setup being prepared by `m4_explorer_1` (base design system, Radix UI primitives, Vazirmatn fonts).
2. **3D Visual Elements Integration**:
   - The 3D building model (login), 3D isometric status matrix (manager dashboard), and 3D resident keycard (resident portal) are designed by `m4_explorer_2`. The workflow blueprint specifies the exact slots and interaction props for these 3D components.
3. **Banking Gateway Simulation**:
   - Real Shaparak IPG requires a merchant contract and e-Namad. In development/testing, the payment simulation modal makes authenticated calls directly to `POST /payments` with `paymentMethod: 'GATEWAY'`.

---

## 8. Conclusion

All manager workflows, dedicated resident portal views, and real-time WebSocket integrations have been rigorously mapped and synthesized into complete technical blueprints:
- **Manager Dashboard**: Real-time treasury balance, collection rate %, active period status, and occupancy metrics.
- **Unit & Resident Management**: Interactive grid, quick balance badges, occupancy status toggles, resident contact cards.
- **Period Accounting**: Standard Iranian expense fields, dry-run calculation preview with Largest Remainder verification, complete DRAFT $\to$ ACTIVE $\to$ CLOSED lifecycle with immutable ledger transfers.
- **Treasury & Payments**: Instant payment dialog with card-to-card/cash/gateway modes, unit balance adjustments, and audit trail logging.
- **Dedicated Resident Portal**: Clean mobile-first layout at `/resident`, digital bulletin board, itemized period charges, online payment simulation, and AI receipt uploader.
- **WebSocket Event Bus**: Full dual-naming event subscription pipeline with reactive query cache invalidation.

---

## 9. Verification Method

To independently verify the contracts, routes, and workflows outlined in this blueprint:

1. **Verify Backend API Endpoints via HTTP**:
   ```bash
   # 1. Fetch current complex treasury
   curl -s -H "Authorization: Bearer <TOKEN>" -H "x-complex-id: <COMPLEX_ID>" http://localhost:3000/api/v1/complex/current

   # 2. Preview calculation of period expenses
   curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
     -d '{"fixedPerUnit": 200000, "waterTotal": 1500000, "gasTotal": 2000000, "electricityTotal": 800000, "areaExpenseTotal": 5000000}' \
     http://localhost:3000/api/v1/periods/<PERIOD_ID>/calculate

   # 3. Record a payment
   curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
     -d '{"unitId": "<UNIT_ID>", "amount": 500000, "paymentMethod": "CARD_TRANSFER", "referenceNumber": "123456"}' \
     http://localhost:3000/api/v1/payments

   # 4. Fetch unit statement
   curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/v1/units/<UNIT_ID>/statement
   ```

2. **Verify WebSocket Live Broadcasting**:
   - Connect a WebSocket client to `ws://localhost:3000/api/v1/ws?token=<TOKEN>`.
   - Send `{"action": "SUBSCRIBE", "room": "complex:<COMPLEX_ID>"}`.
   - Execute a payment via `POST /payments`.
   - Observe incoming frame:
     ```json
     {"event": "PAYMENT_RECEIVED", "room": "complex:<COMPLEX_ID>", "data": {"unitId": "...", "amount": 500000}, "timestamp": "..."}
     ```

3. **Verify Automated Test Suite**:
   ```powershell
   cd "d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server"
   npm test
   ```
   Ensures all 309 unit, integration, and security tests pass.
