# Project: ParsBuilding Commercial SaaS Platform

## Architecture
- **Monorepo / Clean Modular Structure**:
  - `server/`: Node.js (TypeScript, Fastify/Express) backend with Prisma ORM connected to PostgreSQL.
  - `client/`: Modern React 18+ (Vite, TypeScript, Tailwind CSS, Lucide icons, Radix UI, Three.js) Persian RTL SaaS application.
  - `tests_e2e/`: Independent opaque-box end-to-end test runner and test cases (Tiers 1–4).
- **Multi-Tenancy Model**:
  - Row-Level Multi-Tenancy with `complexId` tenant segregation, foreign key constraints, composite indexing, and Prisma extension / middleware tenant isolation.
- **Data Flow**:
  - Client sends authenticated JWT/cookie requests to `/api/v1/*`.
  - Backend enforces rate limiting, CORS, tenant isolation middleware, and granular RBAC.
  - All financial transactions and calculations execute via deterministic server-side `CalculationEngine`.
  - Every mutation and audit event is recorded in the append-only `audit_logs` table.
  - WebSocket gateway enables real-time tenant communications and updates.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Multi-Tenant Database Schema | PostgreSQL schema with Prisma ORM (14 models: Complex, Building, Unit, Resident, User, Period, Charges, Transactions, AuditLog, ChatMessage, ReceiptVerification) | M1 | Backend Survey |
| 2 | Pure Deterministic Calculation Engine | Standard building accounting formulas: fixed, area-based (ماده ۴ قانون تملک), occupant-based, equal share, and hybrid charge models | M1 | Calc Survey |
| 3 | Zero-Loss Precision & Remainder Distribution | Integer/BigInt (Rials) currency arithmetic with Largest Remainder Method ($\sum Shares = TotalExpense$) | M1 | Calc Survey |
| 4 | Bug Fix: Arabic Digit 8 Typo | Fix index 8 in `toEnDigit` to map `'٨'` correctly | M1 | Calc Survey |
| 5 | Bug Fix: Decimal Parsing | Support decimal points in input parsing for areas and fractional rates | M1 | Calc Survey |
| 6 | Bug Fix: Infinite Credit Bug Resolution | Eliminate debit/credit cancellation upon period closing so resident credit reduces properly | M1 | Calc Survey |
| 7 | Bug Fix: Anti-Double-Counting Fund Income | Deduplicate manual and period payments in building treasury balances | M1 | Calc Survey |
| 8 | Bug Fix: Safe Data Retention | Abolish destructive startup record deletion routines | M1 | Calc Survey |
| 9 | Bug Fix: Zero Occupancy Safeguard | Prevent expense dropping when occupancy is zero; route to base/owner share | M1 | Calc Survey |
| 10 | Hardened Authentication | Argon2id password hashing, rotating JWT access tokens, HttpOnly refresh tokens | M2 | Backend Survey |
| 11 | Granular RBAC | 4-tier role hierarchy (SUPER_ADMIN, COMPLEX_MANAGER, SUB_MANAGER with custom permissions bitmask, RESIDENT) | M2 | Backend Survey |
| 12 | Immutable Audit Logging | Append-only audit trail recording actor ID, tenant, timestamp, IP, action, and JSON deltas | M2 | Backend Survey |
| 13 | Security Hardening | Rate limiting, Helmet, CORS, input sanitization, CSRF/XSS protection, SQL injection prevention | M2 | Backend Survey |
| 14 | Real-Time & AI Foundations | WebSocket room architecture (`complex:{id}`, `unit:{id}`) & BullMQ AI receipt OCR queue hooks | M2 | Backend Survey |
| 15 | Lossless Data Migration Engine | Atomic migration pipeline importing legacy client IndexedDB/LocalStorage (`app_db_pars_v6`) to PostgreSQL with reconciliation assertions ($\Delta Fund = 0, \Delta Debts = 0$) | M3 | Backend Survey |
| 16 | Full REST & Real-Time APIs | Comprehensive API endpoints for complexes, units, residents, periods, charges, payments, ledger, audit logs, and reports | M3 | Backend Survey |
| 17 | Persian RTL Modern UI System | React 18+ / Vite / TypeScript with Tailwind CSS and Vazirmatn typography, replacing 500px mobile container with responsive SaaS layout | M4 | UI Survey |
| 18 | Interactive 3D Visual Elements | Three.js / React Three Fiber 3D elements: 3D interactive building on Login, 3D isometric status matrix on Manager Dashboard, 3D resident keycard | M4 | UI Survey |
| 19 | Friction-Free Manager Workflows | Intuitive manager interfaces for units, residents, expense entry, period management, payments, and financial ledger | M4 | UI Survey |
| 20 | Dedicated Resident Portal | Resident portal (`/resident`) with digital bulletin board, personal ledger, account statements, and payment view | M4 | UI Survey |
| 21 | Full E2E Test Suite (Tiers 1–4) | Requirement-driven opaque-box testing covering all features, boundary cases, combinations, and real-world workloads | M5 | E2E Track |
| 22 | Tier 5 Adversarial Hardening | White-box adversarial edge-case stress testing and forensic integrity verification | M5 | Implementation |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Foundation, Multi-Tenant Database & Core Computational Engine | Node.js backend setup, Prisma PostgreSQL schema, multi-tenant isolation, deterministic CalculationEngine with all 8 bug fixes, and unit calculation test suite | none | IN_PROGRESS |
| M2 | Security Hardening, Authentication, RBAC, Audit Logging & Extensibility | Argon2id auth, JWT + refresh tokens, 4-tier RBAC, immutable audit logging, rate limiting, WebSocket & AI receipt hooks | M1 | PLANNED |
| M3 | Lossless Data Migration Engine & REST/Real-time API Contracts | Client data migration pipeline (IndexedDB/LocalStorage -> PostgreSQL) with reconciliation assertions, plus complete API endpoints | M1, M2 | PLANNED |
| M4 | World-Class SaaS UI/UX, 3D Elements, Manager Workflows & Resident Portal | React/Vite/TS frontend, Persian RTL design system, Three.js 3D elements, manager dashboard, resident portal, real-time API integration | M3 | PLANNED |
| M5 | Final Acceptance: 100% E2E Test Pass & Tier 5 Adversarial Coverage Hardening | Phase 1: Pass 100% of E2E test suite (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5) with Challengers & Forensic Auditor | M4, TEST_READY | PLANNED |

---

## Interface Contracts

### 1. Calculation Engine Interface (`server/src/services/calculationEngine.ts`)
```typescript
export interface UnitData {
  id: string;
  unitNumber: number;
  area: number; // in square meters (ماده ۴ قانون تملک)
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
  specialTotal?: number;
  specialMode?: 'all' | 'active' | 'custom';
  customUnitIds?: string[];
  areaExpenseTotal?: number; // Distributed strictly by area
  roundUp?: boolean;
  roundStep?: number; // Default 50,000 Rials
  exemptEmptyUnits?: boolean;
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
  conservationDelta: number; // MUST be 0 (Zero-loss principle)
}
```

### 2. Multi-Tenant Database Context (`server/src/middleware/tenant.ts`)
```typescript
export interface TenantContext {
  complexId: string;
  buildingId?: string;
  userId: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  permissions: string[];
}
```

### 3. Audit Log Contract (`server/src/services/auditLogger.ts`)
```typescript
export interface AuditLogEntry {
  complexId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  beforeDelta?: Record<string, any>;
  afterDelta?: Record<string, any>;
  timestamp: Date;
}
```

### 4. Migration Ingestion Contract (`server/src/services/migrationService.ts`)
```typescript
export interface LegacyExportPayload {
  units: any[];
  periods: any[];
  initialFund: number;
}

export interface MigrationReconciliation {
  success: boolean;
  unitsImported: number;
  periodsImported: number;
  transactionsImported: number;
  initialFund: number;
  calculatedEndingFund: number;
  fundDiscrepancy: number; // MUST be 0
  debtDiscrepancy: number; // MUST be 0
}
```

---

## Code Layout
```
/
├── server/
│   ├── prisma/
│   │   └── schema.prisma           # Multi-tenant PostgreSQL schema
│   ├── src/
│   │   ├── config/                 # Environment & database configs
│   │   ├── middleware/             # Auth, tenant isolation, rate-limit, RBAC
│   │   ├── services/
│   │   │   ├── calculationEngine.ts# Deterministic accounting & billing engine
│   │   │   ├── auditLogger.ts      # Immutable audit logging
│   │   │   ├── migrationService.ts # Lossless IndexedDB/LocalStorage importer
│   │   │   ├── authService.ts      # Argon2id + JWT + refresh tokens
│   │   │   └── realtimeService.ts  # WebSocket manager
│   │   ├── routes/                 # Express/Fastify REST endpoints
│   │   └── index.ts                # Server entry point
│   ├── tests/                      # Unit tests for calculation engine & auth
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/             # Reusable UI primitives (Radix/Tailwind)
│   │   │   ├── 3d/                 # Three.js 3D elements (Building, Pass)
│   │   │   ├── common/             # Persian RTL inputs, tables, modals
│   │   │   └── layout/             # SaaS responsive sidebar, header
│   │   ├── pages/                  # Login, Dashboard, Units, Resident Portal
│   │   ├── services/               # Real-time API clients
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
└── tests_e2e/
    ├── src/                        # Opaque-box test runner & utilities
    ├── suites/
    │   ├── tier1_features/         # ≥5 tests per feature
    │   ├── tier2_boundaries/       # Boundary value & error handling
    │   ├── tier3_combinations/     # Pairwise cross-feature interactions
    │   └── tier4_workloads/        # Realistic complex SaaS workloads
    └── package.json
```
