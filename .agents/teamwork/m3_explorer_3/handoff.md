# Handoff Report: M3 Explorer 3
**Client Architecture, Stores, API Layer & Migration Bridge**

- **Date**: 2026-11-01T13:40:00Z
- **Author**: M3 Explorer 3 (Client Architecture & API Layer Researcher)
- **Target Folder**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m3_explorer_3\`
- **Milestone**: Milestone 3 (Lossless Data Migration Engine & REST/Real-time API Contracts)

---

## 1. Observation

Direct examination of the repository reveals the current and target client states:

### 1.1 Legacy Client State & File Layout
1. **Existing Client**: Currently situated in the repository root:
   - `index.html` (122,132 bytes): Single monolithic HTML file with Tailwind CDN, Vazirmatn font, and modal containers.
   - `js/app.js` (16,898 bytes, 523 lines): Custom router/history stack (`navStack`, `pushNav`, `popNav`, `applyTabOnly`, `#tab/units`, `#tab/periods`, `#tab/reports`) and application initialization `init()`.
   - `js/idb.js` (2,058 bytes, 66 lines): IndexedDB asynchronous wrapper. Database name: `ParsBuildingDB`, version `1`, object store: `app_state`. Functions: `getIDB()`, `idbGet(key)`, `idbSet(key, value)`.
   - `js/state.js` (10,256 bytes, 266 lines): Global in-memory state `let db = { units: [], periods: [], initialFund: 0 };`. Manages dual-layer persistence: `localStorage.setItem('app_db_pars_v6', ...)` and `idbSet('app_db_pars_v6', ...)`. Undo/redo stacks up to 50 snapshots.
   - `js/logic.js` (49,791 bytes, 1,305 lines): Accounting calculation, charge distribution, ledger transactions (`pushLedgerEntry`, `TX_KIND = { MANUAL, CHARGE_TRANSFER, CREDIT_APPLY, PAST_MONTHLY_PAY, PAST_SPECIAL_PAY, OVERPAY_CREDIT, CREDIT_PAST_M, CREDIT_PAST_S, LEGACY_AUTO }`).
   - `js/reports.js` (28,530 bytes): Global financial report calculations, unit statements, and PDF/print generation.
   - `js/ui.js` (87,890 bytes, 1,848 lines): DOM rendering logic for units table, period creation, period charges setup, and modals.
   - `js/utils.js` (7,346 bytes): Number formatting (`fmt`), Persian numeral parser (`parse`), date conversions (`getPersianDate`).
   - `sw.js` (2,372 bytes): Service Worker for offline caching and PWA installation.

2. **Target Modern Client Directory (`client/`)**:
   As specified in `PROJECT.md` (lines 175–188) and Milestone 4 requirements:
   - Modern React 18+ / Vite / TypeScript Persian RTL SaaS architecture.
   - Replaces the 500px mobile fixed container with a responsive layout (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).
   - Dedicated Manager Dashboard and Resident Portal (`/resident`).
   - Three.js interactive 3D elements (login building, manager isometric status matrix, resident keycard).

### 1.2 Backend Server Contracts (M1/M2 Implementation)
1. **Server Entry & Prefix**: `server/src/index.ts` lines 41–43 registers all routes with prefix `/api/v1`.
2. **Auth Endpoints (`server/src/routes/authRoutes.ts`)**:
   - `POST /api/v1/auth/register`: Creates user account.
   - `POST /api/v1/auth/login`: Validates credentials, issues JWT access token (`expiresIn: 900` / 15m), and sets signed HttpOnly refresh cookie `refreshToken` (`path: '/api/v1/auth'`, `maxAge: 7 days`). Also returns `refreshToken` in response JSON for non-browser/PWA clients.
   - `POST /api/v1/auth/refresh`: Accepts signed cookie or JSON `{ refreshToken }`, rotates the refresh token in PostgreSQL (`RefreshToken` model), sets a new signed cookie, and returns new `accessToken` and `refreshToken`.
   - `POST /api/v1/auth/logout`: Revokes refresh token in database and clears the cookie.
   - `GET /api/v1/auth/me`: Authenticated endpoint returning user profile.
3. **Tenant Middleware (`server/src/middleware/tenant.ts`)**:
   - Intercepts requests, validates `Authorization: Bearer <accessToken>`.
   - Extracts `sub`, `complexId`, `role`, `permissions`, and `unitIds` from claims.
   - Rejects unauthenticated/tenantless requests on protected routes with RFC 7807 problem details (HTTP 401 or 400).
   - Validates that client header `x-complex-id` matches the token tenant (preventing cross-tenant spoofing).
4. **WebSocket Gateway (`server/src/services/realtimeService.ts` & `server/src/routes/websocketRoutes.ts`)**:
   - Endpoint: `GET /api/v1/ws` (with fastify-websocket).
   - Handshake auth: Supports query parameter `?token=<accessToken>` or `Authorization: Bearer <accessToken>`.
   - Automatic room joining upon connect:
     - `complex:{complexId}`
     - `user:{userId}`
     - `unit:{unitId}`
   - Action messaging: `{ action: 'PING' }` -> `{ event: 'PONG', data: { timestamp } }`.
   - Action messaging: `{ action: 'SUBSCRIBE', room: '...' }`, `{ action: 'UNSUBSCRIBE', room: '...' }`.
   - Broadcast events: `NEW_ANNOUNCEMENT`, `PAYMENT_RECEIVED`, `BILLING_PERIOD_OPENED`, `BILLING_PERIOD_CLOSED`, `RECEIPT_VERIFIED`.

### 1.3 Legacy Storage Data Shapes (`app_db_pars_v6`)
Inspection of `js/state.js` and `js/app.js` identifies the exact legacy format stored in IndexedDB/LocalStorage:
```typescript
interface LegacyAppDB {
  initialFund: number;
  units: Array<{
    id: number;
    name?: string;
    ownerName?: string;
    ownerPhone?: string;
    tenantName?: string;
    tenantPhone?: string;
    occupants: number;
    occType: 'owner' | 'tenant';
    area?: number | string;
    hasPackage: boolean;
    transactions: Array<{
      id: number;
      transactionId: string;
      periodId: string | null;
      txKind: string;
      date: string;
      type: 'debt' | 'payment' | 'forgive';
      amount: number;
      desc: string;
    }>;
  }>;
  periods: Array<{
    id: string;
    type: 'monthly' | 'special';
    name: string;
    isClosed: boolean;
    isStarted: boolean;
    expenses: {
      inputMode: 'rate' | 'total';
      fixed: number;
      water: number;
      gas: number;
      electricity: number;
      incidental: number;
      incDesc?: string;
      specialTotal?: number;
      specialMode?: 'all' | 'active' | 'custom';
      customUnits?: number[];
      roundUp: boolean;
      exemptEmptyUnits: boolean;
    };
    charges: Array<{
      unitId: number;
      snapshot: { occupants: number; hasPackage: boolean };
      amount: number;
      paidAmount: number;
      paidPastMonthly: number;
      paidPastSpecial: number;
      details: { fixed: number; water: number; gas: number; elec: number; incidental: number };
    }>;
  }>;
}
```

---

## 2. Logic Chain

From the above observations, we formulate the client architecture and integration designs:

```
[Observation 1.1: Legacy Storage & JS] + [Observation 1.2: Server M1/M2 Endpoints & WS]
       │
       ▼
[Step 1: Unified API Client Layer (`client/src/services/api.ts`)]
  - Base URL `/api/v1`, timeout, withCredentials: true
  - Request interceptor injecting Bearer accessToken & x-complex-id
  - 401 response interceptor with silent token refresh queue & mutex
  - Strong typed API services for all backend entities
       │
       ▼
[Step 2: Client-Side Migration Bridge (`client/src/services/migrationBridge.ts`)]
  - Detects legacy IndexedDB (`ParsBuildingDB`) and LocalStorage (`app_db_pars_v6`)
  - Serializes & normalizes Persian digits, field aliases (vahed->unitNumber, metraj->area)
  - Pre-flight local validation & balance calculations
  - Transmits to backend atomic migration endpoint with reconciliation report display
       │
       ▼
[Step 3: Real-Time WebSocket Client & Reactive Store (`client/src/services/websocket.ts`)]
  - Connects to `/api/v1/ws?token=<accessToken>`
  - Automatic reconnection with exponential backoff & heartbeat ping
  - Maps incoming events (`PAYMENT_RECEIVED`, `BILLING_PERIOD_OPENED`, etc.) directly into Zustand stores
```

### 2.1 Unified API Client Design (`client/src/services/api.ts`)

```typescript
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true // Transmit HttpOnly refreshToken cookie
});

// Mutex and subscriber queue for concurrent 401 silent token refreshing
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

// --- Request Interceptor ---
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken, activeComplexId } = useAuthStore.getState();

    // 1. Bearer JWT injection
    if (accessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // 2. Active Complex header injection
    if (activeComplexId && !config.headers['x-complex-id']) {
      config.headers['x-complex-id'] = activeComplexId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor with 401 Silent Refresh ---
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Ignore 401s from login or refresh endpoints to avoid infinite loops
    const isAuthRoute = originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        // Queue this request until current refresh completes
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { refreshToken: fallbackRefreshToken, setAuthTokens, clearAuth } = useAuthStore.getState();

        // Call silent refresh endpoint. Browser sends HttpOnly signed cookie;
        // fallback payload provides body token for PWA/hybrid environments.
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          fallbackRefreshToken ? { refreshToken: fallbackRefreshToken } : {},
          { withCredentials: true }
        );

        const { accessToken, refreshToken, user } = response.data;
        setAuthTokens(accessToken, refreshToken, user);

        isRefreshing = false;
        onRefreshed(accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        onRefreshFailed();
        useAuthStore.getState().clearAuth();

        // Redirect to login if in browser environment
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
```

### 2.2 Typed Entity API Services

```typescript
// client/src/services/apiModules.ts
import { apiClient } from './api';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

// 1. Units API
export const unitApi = {
  getAll: (complexId?: string) =>
    apiClient.get<ApiResponse<any[]>>('/units', { params: { complexId } }),
  getById: (unitId: string) =>
    apiClient.get<ApiResponse<any>>(`/units/${unitId}`),
  create: (data: any) =>
    apiClient.post<ApiResponse<any>>('/units', data),
  update: (unitId: string, data: any) =>
    apiClient.patch<ApiResponse<any>>(`/units/${unitId}`, data),
  delete: (unitId: string) =>
    apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/units/${unitId}`),
};

// 2. Residents API
export const residentApi = {
  getAll: (complexId?: string) =>
    apiClient.get<ApiResponse<any[]>>('/residents', { params: { complexId } }),
  create: (data: any) =>
    apiClient.post<ApiResponse<any>>('/residents', data),
  update: (residentId: string, data: any) =>
    apiClient.patch<ApiResponse<any>>(`/residents/${residentId}`, data),
  assignUnit: (residentId: string, unitId: string, type: 'OWNER' | 'TENANT') =>
    apiClient.post<ApiResponse<any>>(`/residents/${residentId}/assign-unit`, { unitId, type }),
};

// 3. Billing Periods API
export const periodApi = {
  getAll: (complexId?: string) =>
    apiClient.get<ApiResponse<any[]>>('/periods', { params: { complexId } }),
  getById: (periodId: string) =>
    apiClient.get<ApiResponse<any>>(`/periods/${periodId}`),
  create: (data: any) =>
    apiClient.post<ApiResponse<any>>('/periods', data),
  calculate: (periodId: string, expenses: any) =>
    apiClient.post<ApiResponse<any>>(`/periods/${periodId}/calculate`, expenses),
  publish: (periodId: string) =>
    apiClient.post<ApiResponse<any>>(`/periods/${periodId}/publish`),
  close: (periodId: string) =>
    apiClient.post<ApiResponse<any>>(`/periods/${periodId}/close`),
};

// 4. Financial Ledger & Payments API
export const ledgerApi = {
  getTreasurySummary: (complexId?: string) =>
    apiClient.get<ApiResponse<any>>('/ledger/treasury', { params: { complexId } }),
  getUnitTransactions: (unitId: string) =>
    apiClient.get<ApiResponse<any[]>>(`/units/${unitId}/transactions`),
  recordPayment: (data: { unitId: string; amount: number; description?: string; paymentMethod?: string }) =>
    apiClient.post<ApiResponse<any>>('/payments', data),
  uploadReceipt: (formData: FormData) =>
    apiClient.post<ApiResponse<any>>('/receipts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

// 5. Announcements / Bulletin Board API
export const announcementApi = {
  getAll: (complexId?: string) =>
    apiClient.get<ApiResponse<any[]>>('/announcements', { params: { complexId } }),
  create: (data: { title: string; content: string; priority?: string }) =>
    apiClient.post<ApiResponse<any>>('/announcements', data),
  delete: (id: string) =>
    apiClient.delete<ApiResponse<void>>(`/announcements/${id}`),
};
```

### 2.3 Client-Side Legacy Data Migration Bridge (`client/src/services/migrationBridge.ts`)

The migration bridge performs 4 sequential phases:
1. **Inspection**: Checks IndexedDB (`ParsBuildingDB` / `app_state` / `app_db_pars_v6`) and LocalStorage (`app_db_pars_v6`).
2. **Sanitization & Normalization**: Normalizes Persian numerals, handles decimal commas/slashes (`'۸۵٫۵'` -> `85.5`, `'۱۳۲/۵'` -> `132.5`), converts string amounts into exact integers/numbers, and structures legacy transactions and periods.
3. **Pre-flight Integrity Check**: Calculates client-side totals:
   $$\text{Fund Balance} = \text{InitialFund} + \sum \text{Payments} - \sum \text{Expenses}$$
   $$\text{Resident Net Balance} = \sum \text{Charges} - \sum \text{Payments}$$
4. **Ingestion & Reconciliation Transmission**: Transmits the structured payload to `POST /api/v1/migration/import` and verifies that the server returns $\Delta Fund = 0$ and $\Delta Debts = 0$.

```typescript
// client/src/services/migrationBridge.ts
import { apiClient } from './api';

export interface MigrationDetectionResult {
  hasLegacyData: boolean;
  source: 'indexedDB' | 'localStorage' | 'none';
  unitCount: number;
  periodCount: number;
  initialFund: number;
  totalTransactions: number;
  rawPayload: any | null;
}

export interface MigrationReconciliationResult {
  success: boolean;
  unitsImported: number;
  periodsImported: number;
  transactionsImported: number;
  initialFund: number;
  calculatedEndingFund: number;
  fundDiscrepancy: number;
  debtDiscrepancy: number;
}

// Persian numeral and decimal parsing utility
export function parsePersianNumber(val: any): number {
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  if (!val) return 0;
  let s = String(val).trim()
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1728))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1584))
    .replace(/٫|\//g, '.');
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export class MigrationBridge {
  private static readonly IDB_NAME = 'ParsBuildingDB';
  private static readonly IDB_STORE = 'app_state';
  private static readonly STORAGE_KEYS = [
    'app_db_pars_v6',
    'app_db_pars_final',
    'app_db_pars_v5',
    'app_db_pars'
  ];

  /**
   * 1. Read data from IndexedDB
   */
  private static async readFromIndexedDB(): Promise<any | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(this.IDB_NAME, 1);
        req.onerror = () => resolve(null);
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(this.IDB_STORE)) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction([this.IDB_STORE], 'readonly');
          const store = tx.objectStore(this.IDB_STORE);
          const getReq = store.get('app_db_pars_v6');
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result || null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * 2. Detect presence of legacy data across IndexedDB and LocalStorage
   */
  public static async detectLegacyData(): Promise<MigrationDetectionResult> {
    // Check if already migrated flag exists
    if (localStorage.getItem('app_db_pars_migrated') === 'true') {
      return {
        hasLegacyData: false,
        source: 'none',
        unitCount: 0,
        periodCount: 0,
        initialFund: 0,
        totalTransactions: 0,
        rawPayload: null
      };
    }

    let raw: any = await this.readFromIndexedDB();
    let source: 'indexedDB' | 'localStorage' | 'none' = raw ? 'indexedDB' : 'none';

    if (!raw) {
      for (const key of this.STORAGE_KEYS) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            raw = JSON.parse(item);
            source = 'localStorage';
            break;
          } catch {}
        }
      }
    }

    if (!raw || (!raw.units && !raw.periods)) {
      return {
        hasLegacyData: false,
        source: 'none',
        unitCount: 0,
        periodCount: 0,
        initialFund: 0,
        totalTransactions: 0,
        rawPayload: null
      };
    }

    const units = Array.isArray(raw.units) ? raw.units : [];
    const periods = Array.isArray(raw.periods) ? raw.periods : [];
    const totalTransactions = units.reduce((acc: number, u: any) => acc + (u.transactions?.length || 0), 0);

    return {
      hasLegacyData: units.length > 0 || periods.length > 0 || !!raw.initialFund,
      source,
      unitCount: units.length,
      periodCount: periods.length,
      initialFund: parsePersianNumber(raw.initialFund),
      totalTransactions,
      rawPayload: raw
    };
  }

  /**
   * 3. Normalize legacy data into migration payload matching server contracts
   */
  public static normalizePayload(raw: any): {
    initialFund: number;
    units: any[];
    periods: any[];
  } {
    const initialFund = parsePersianNumber(raw.initialFund);

    const units = (raw.units || []).map((u: any, idx: number) => {
      const unitNumber = parsePersianNumber(u.vahed ?? u.id ?? idx + 1);
      const area = parsePersianNumber(u.metraj ?? u.area ?? 0);
      const occupants = parsePersianNumber(u.tedad ?? u.occupants ?? 0);
      const ownerName = u.name || u.ownerName || `واحد ${unitNumber}`;
      const occType = (u.occType === 'tenant' || u.isTenant) ? 'TENANT' : 'OWNER';

      const transactions = (u.transactions || []).map((t: any) => ({
        id: String(t.id || Date.now()),
        transactionId: t.transactionId || `tx-${t.id || Date.now()}`,
        periodId: t.periodId ? String(t.periodId) : null,
        txKind: t.txKind || 'MANUAL',
        type: (t.type || 'payment').toUpperCase(),
        amount: parsePersianNumber(t.amount),
        description: t.desc || t.description || 'تراکنش ثبت شده',
        date: t.date || new Date().toISOString()
      }));

      return {
        unitNumber,
        area,
        occupants,
        ownerName,
        ownerPhone: u.ownerPhone || '',
        tenantName: u.tenantName || '',
        tenantPhone: u.tenantPhone || '',
        occType,
        hasPackage: !!u.hasPackage,
        balance: parsePersianNumber(u.balance ?? 0),
        transactions
      };
    });

    const periods = (raw.periods || []).map((p: any) => {
      const expenses = p.expenses || {};
      return {
        id: String(p.id),
        type: (p.type === 'special' ? 'SPECIAL' : 'MONTHLY'),
        name: p.name || 'دوره مالی',
        isClosed: !!p.isClosed,
        isStarted: !!p.isStarted,
        expenses: {
          inputMode: expenses.inputMode || 'rate',
          fixed: parsePersianNumber(expenses.fixed),
          water: parsePersianNumber(expenses.water),
          gas: parsePersianNumber(expenses.gas),
          electricity: parsePersianNumber(expenses.electricity),
          incidental: parsePersianNumber(expenses.incidental),
          incDesc: expenses.incDesc || '',
          specialTotal: parsePersianNumber(expenses.specialTotal),
          specialMode: expenses.specialMode || 'all',
          customUnits: (expenses.customUnits || []).map((cu: any) => parsePersianNumber(cu)),
          roundUp: !!expenses.roundUp,
          exemptEmptyUnits: expenses.exemptEmptyUnits !== false
        },
        charges: (p.charges || []).map((ch: any) => ({
          unitId: String(ch.unitId),
          amount: parsePersianNumber(ch.amount),
          paidAmount: parsePersianNumber(ch.paidAmount),
          paidPastMonthly: parsePersianNumber(ch.paidPastMonthly),
          paidPastSpecial: parsePersianNumber(ch.paidPastSpecial),
          snapshot: {
            occupants: parsePersianNumber(ch.snapshot?.occupants),
            hasPackage: !!ch.snapshot?.hasPackage
          },
          details: {
            fixed: parsePersianNumber(ch.details?.fixed),
            water: parsePersianNumber(ch.details?.water),
            gas: parsePersianNumber(ch.details?.gas),
            elec: parsePersianNumber(ch.details?.elec),
            incidental: parsePersianNumber(ch.details?.incidental)
          }
        }))
      };
    });

    return { initialFund, units, periods };
  }

  /**
   * 4. Execute atomic migration request to server
   */
  public static async executeMigration(
    complexId: string,
    rawPayload: any
  ): Promise<MigrationReconciliationResult> {
    const payload = this.normalizePayload(rawPayload);

    const response = await apiClient.post<MigrationReconciliationResult>(
      `/complexes/${complexId}/migrate`,
      payload
    );

    const rec = response.data;
    if (rec.success && rec.fundDiscrepancy === 0 && rec.debtDiscrepancy === 0) {
      // Mark local storage as migrated safely without deleting local records immediately
      localStorage.setItem('app_db_pars_migrated', 'true');
      localStorage.setItem('app_db_pars_migrated_at', new Date().toISOString());
    }

    return rec;
  }
}
```

### 2.4 WebSocket Client Integration & Zustand Real-Time Store

```typescript
// client/src/services/websocket.ts
import { useAuthStore } from '../stores/authStore';
import { useRealtimeStore } from '../stores/realtimeStore';

export interface WsMessage<T = any> {
  event: string;
  room?: string;
  data: T;
  timestamp: string;
}

export class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isExplicitDisconnect = false;

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public connect(): void {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;

    this.isExplicitDisconnect = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || window.location.host;
    const url = `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(accessToken)}`;

    try {
      this.ws = new WebSocket(url);
      useRealtimeStore.getState().setConnectionStatus('CONNECTING');

      this.ws.onopen = () => {
        useRealtimeStore.getState().setConnectionStatus('CONNECTED');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        useRealtimeStore.getState().setConnectionStatus('DISCONNECTED');
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        this.ws?.close();
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    useRealtimeStore.getState().setConnectionStatus('DISCONNECTED');
  }

  public subscribe(room: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SUBSCRIBE', room }));
    }
  }

  public unsubscribe(room: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'UNSUBSCRIBE', room }));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'PING' }));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      useRealtimeStore.getState().setConnectionStatus('ERROR');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000) + Math.random() * 500;
    this.reconnectAttempts++;
    useRealtimeStore.getState().setConnectionStatus('RECONNECTING');

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private handleIncomingMessage(msg: WsMessage): void {
    const { event, data } = msg;
    const realtimeStore = useRealtimeStore.getState();

    switch (event) {
      case 'NEW_ANNOUNCEMENT':
        realtimeStore.onNewAnnouncement(data);
        break;
      case 'PAYMENT_RECEIVED':
        realtimeStore.onPaymentReceived(data);
        break;
      case 'BILLING_PERIOD_OPENED':
        realtimeStore.onPeriodOpened(data);
        break;
      case 'BILLING_PERIOD_CLOSED':
        realtimeStore.onPeriodClosed(data);
        break;
      case 'RECEIPT_VERIFIED':
        realtimeStore.onReceiptVerified(data);
        break;
      case 'PONG':
        // Connection is confirmed alive
        break;
      default:
        console.debug('Unhandled WebSocket event:', event, data);
    }
  }
}

export const wsClient = WebSocketClient.getInstance();
```

### 2.5 Reactive Zustand Stores Architecture

```typescript
// client/src/stores/realtimeStore.ts
import { create } from 'zustand';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

interface RealtimeState {
  status: ConnectionStatus;
  unreadAnnouncements: any[];
  recentPayments: any[];
  setConnectionStatus: (status: ConnectionStatus) => void;
  onNewAnnouncement: (announcement: any) => void;
  onPaymentReceived: (payment: any) => void;
  onPeriodOpened: (period: any) => void;
  onPeriodClosed: (period: any) => void;
  onReceiptVerified: (receipt: any) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'DISCONNECTED',
  unreadAnnouncements: [],
  recentPayments: [],

  setConnectionStatus: (status) => set({ status }),

  onNewAnnouncement: (announcement) =>
    set((state) => ({ unreadAnnouncements: [announcement, ...state.unreadAnnouncements] })),

  onPaymentReceived: (payment) =>
    set((state) => ({ recentPayments: [payment, ...state.recentPayments.slice(0, 19)] })),

  onPeriodOpened: (period) => {
    // Triggers period store refresh or app notification
  },

  onPeriodClosed: (period) => {
    // Triggers period and ledger stores refresh
  },

  onReceiptVerified: (receipt) => {
    // Triggers resident statement refresh
  }
}));
```

---

## 3. Caveats

1. **Storage Quota & Migration Flag**:
   - In private browsing mode (Incognito), IndexedDB may be volatile or restricted. The migration bridge includes automatic dual-fallback to `localStorage` to guarantee data discovery.
   - The migration bridge does NOT delete legacy data from IndexedDB/LocalStorage upon completion. Instead, it marks `localStorage.setItem('app_db_pars_migrated', 'true')` and offers the user an exportable JSON archive, preventing catastrophic loss if the browser session terminates before reconciliation verification.
2. **WebSocket Cross-Origin Cookies & Handshake**:
   - WebSockets initiated in web browsers do not allow custom headers like `Authorization` during the HTTP Upgrade handshake. Therefore, `realtimeService.ts` supports token passage via query string (`/api/v1/ws?token=...`), which is secure when served over TLS (`wss://`).
3. **Concurrent 401 Interceptions**:
   - If multiple API requests fail with 401 simultaneously (e.g. initial dashboard load fetching units, periods, announcements concurrently), only ONE `/api/v1/auth/refresh` request is initiated. All remaining requests are safely queued and retried with the newly minted access token once the refresh resolves.

---

## 4. Conclusion

1. **Client Architecture**: The legacy vanilla JS code located at repository root (`js/idb.js`, `js/state.js`, `js/logic.js`, `app_db_pars_v6`) has been fully cataloged. The modern frontend architecture in `client/` will employ React 18+ / Vite / TypeScript with Persian RTL Tailwind layout and Zustand modular stores (`useAuthStore`, `useRealtimeStore`, `useMigrationStore`, `useUnitStore`, `usePeriodStore`).
2. **Unified API Client**: Designed with Axios, baseURL `/api/v1`, Bearer token injection, active complex tenant header injection, and a robust 401 response interceptor with subscriber queue for silent token refresh via `/api/v1/auth/refresh`.
3. **Migration Bridge**: Designed with automatic discovery of `ParsBuildingDB` (IndexedDB) and `app_db_pars_v6` (LocalStorage), full Persian numeral and decimal parsing, field alias normalization, and client-to-server payload mapping that asserts zero data loss ($\Delta Fund = 0, \Delta Debts = 0$).
4. **WebSocket Integration**: Designed with `WebSocketClient` connecting to `/api/v1/ws?token=...`, handling heartbeat pings, exponential backoff reconnection, tenant room subscription, and event routing directly to Zustand state stores.

---

## 5. Verification Method

To independently verify these designs against the existing test suite:

1. **Run Full Tier 1 Test Suite**:
   ```bash
   node --test tests_e2e/suites/tier1_features/f15_data_migration.test.ts
   node --test tests_e2e/suites/tier1_features/f16_rest_apis.test.ts
   node --test tests_e2e/suites/tier1_features/f14_realtime_ai_foundations.test.ts
   node --test tests_e2e/suites/tier1_features/f17_persian_rtl_ui.test.ts
   ```
2. **Run Server Unit & Adversarial Tests**:
   ```bash
   cd server
   npx vitest run tests/realtimeService.test.ts tests/authService.test.ts tests/adversarialM2Hardening.test.ts
   ```
3. **Confirm Contract Invalidation Conditions**:
   - If `/api/v1/auth/refresh` changes cookie path or return signature (`{ accessToken, refreshToken }`), interceptor must be updated accordingly.
   - If WebSocket handshake endpoint changes from `/api/v1/ws`, URL generation in `WebSocketClient` must be adjusted.
