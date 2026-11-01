/**
 * ParsBuilding Unified Axios API Client
 *
 * Implements:
 * - Base URL configuration with timeout
 * - Request interceptor injecting Bearer JWT accessToken and x-complex-id tenant header
 * - Response interceptor with concurrent-safe 401 token refresh queue and mutex
 * - Strongly-typed entity API service modules
 */

import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig
} from 'axios';

const API_BASE_URL = typeof process !== 'undefined' && process.env?.VITE_API_URL
  ? process.env.VITE_API_URL
  : '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true // Transmits signed HttpOnly refreshToken cookie
});

// Mutex & subscriber queue for concurrent 401 silent token refreshes
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

// Token storage helper (compatible with browser, node, and mock tests)
export const tokenStorage = {
  getAccessToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('pars_access_token');
    }
    return null;
  },
  setAccessToken(token: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pars_access_token', token);
    }
  },
  getRefreshToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('pars_refresh_token');
    }
    return null;
  },
  setRefreshToken(token: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pars_refresh_token', token);
    }
  },
  getActiveComplexId(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('pars_active_complex_id');
    }
    return null;
  },
  setActiveComplexId(complexId: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pars_active_complex_id', complexId);
    }
  },
  clear() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pars_access_token');
      localStorage.removeItem('pars_refresh_token');
      localStorage.removeItem('pars_active_complex_id');
    }
  }
};

// --- Request Interceptor ---
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    const complexId = tokenStorage.getActiveComplexId();

    // If active session is in local preview/demo mode, resolve cleanly without firing failed backend requests
    if (token === 'demo-jwt-token-active') {
      config.adapter = async (cfg) => {
        const url = cfg.url || '';
        let data: any = {};
        if (url.includes('/treasury')) {
          data = { currentFund: 48500000 };
        } else if (url.includes('/balance-sheet')) {
          data = { totalDebts: 2480000, totalCredits: 420000 };
        } else if (url.includes('/units')) {
          data = [
            { id: 'unt-1', unitNumber: 1, floor: 1, area: 95, occupants: 3, currentBalance: 0, isOccupied: true, ownerName: 'رضا کمالی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-2', unitNumber: 2, floor: 1, area: 110, occupants: 4, currentBalance: -450000, isOccupied: true, ownerName: 'علی رضایی', tenantName: null, hasPackage: false, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-3', unitNumber: 3, floor: 2, area: 85, occupants: 2, currentBalance: 120000, isOccupied: true, ownerName: 'محسن کریمی', tenantName: 'صادقی', hasPackage: false, occupancyType: 'TENANT' },
            { id: 'unt-4', unitNumber: 4, floor: 2, area: 120, occupants: 4, currentBalance: 0, isOccupied: true, ownerName: 'مریم نوری', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-5', unitNumber: 5, floor: 3, area: 105, occupants: 3, currentBalance: -680000, isOccupied: true, ownerName: 'حسین احمدی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-6', unitNumber: 6, floor: 3, area: 90, occupants: 2, currentBalance: 0, isOccupied: false, ownerName: 'فرهاد طاهری', tenantName: null, hasPackage: false, occupancyType: 'VACANT' },
            { id: 'unt-7', unitNumber: 7, floor: 4, area: 115, occupants: 3, currentBalance: -250000, isOccupied: true, ownerName: 'جعفر مرادی', tenantName: null, hasPackage: false, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-8', unitNumber: 8, floor: 4, area: 130, occupants: 5, currentBalance: 300000, isOccupied: true, ownerName: 'سعید باقری', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-9', unitNumber: 9, floor: 5, area: 140, occupants: 4, currentBalance: 0, isOccupied: true, ownerName: 'امیر ابراهیمی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
            { id: 'unt-10', unitNumber: 10, floor: 5, area: 150, occupants: 4, currentBalance: -1100000, isOccupied: true, ownerName: 'کیوان رحیمی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' }
          ];
        } else if (url.includes('/periods')) {
          data = [
            { id: 'prd-demo-1', name: 'شارژ و هزینه‌های آبان ۱۴۰۳', totalExpenseAmount: 8500000, totalCollectedAmount: 6020000, status: 'ACTIVE' }
          ];
        } else if (url.includes('/debtors')) {
          data = [
            { unitId: 'unt-10', unitNumber: 10, residentName: 'کیوان رحیمی', balance: -1100000 },
            { unitId: 'unt-5', unitNumber: 5, residentName: 'حسین احمدی', balance: -680000 },
            { unitId: 'unt-2', unitNumber: 2, residentName: 'علی رضایی', balance: -450000 },
            { unitId: 'unt-7', unitNumber: 7, residentName: 'جعفر مرادی', balance: -250000 }
          ];
        } else if (url.includes('/transactions')) {
          data = [
            { id: 'tx-1', date: new Date().toISOString(), type: 'PAYMENT', amount: 850000, description: 'واریز شارژ واحد ۱' },
            { id: 'tx-2', date: new Date(Date.now() - 86400000).toISOString(), type: 'PAYMENT', amount: 680000, description: 'واریز شارژ واحد ۴' },
            { id: 'tx-3', date: new Date(Date.now() - 172800000).toISOString(), type: 'EXPENSE', amount: 1200000, description: 'هزینه سرویس آسانسور' }
          ];
        } else if (url.includes('/announcements')) {
          data = [
            { id: 'ann-1', title: 'جلسه مجمع عمومی سالیانه ساختمان', content: 'جلسه مجمع عمومی پنج‌شنبه ساعت ۱۸ در سالن اجتماعات برگزار می‌گردد.', category: 'MEETING', isPinned: true, createdAt: new Date().toISOString() },
            { id: 'ann-2', title: 'سرویس دوره‌ای آسانسور و تاسیسات', content: 'سرویس‌کار مجاز روز دوشنبه جهت بازرسی فنی در ساختمان حضور خواهد داشت.', category: 'MAINTENANCE', isPinned: false, createdAt: new Date().toISOString() }
          ];
        } else if (url.includes('/statement')) {
          data = {
            unit: { id: 'unt-5', unitNumber: 5, floor: 3, area: 105, occupants: 3, currentBalance: -680000, ownerName: 'حسین احمدی', hasPackage: true },
            summary: { currentBalance: -680000, totalDebited: 1850000, totalPaid: 1170000 },
            charges: [{ id: 'chg-1', periodName: 'شارژ آبان ۱۴۰۳', amount: 850000, paidAmount: 850000, createdAt: new Date().toISOString() }],
            transactions: [{ id: 'tx-1', amount: 850000, type: 'PAYMENT', date: new Date().toISOString(), description: 'واریز شارژ اینترنتی' }]
          };
        } else if (url.includes('/complexes')) {
          data = { id: 'cpx-demo-pars-001', name: 'برج مسکونی پارس', address: 'تهران، خیابان ولیعصر', initialFund: 48500000 };
        } else {
          data = { status: 'ok', success: true };
        }

        return {
          data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: cfg
        };
      };
      return config;
    }

    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (complexId && !config.headers['x-complex-id']) {
      config.headers['x-complex-id'] = complexId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor with Concurrent 401 Refresh Queue ---
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Ignore 401s from login or refresh endpoints to avoid infinite loops
    const url = originalRequest?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const fallbackRefreshToken = tokenStorage.getRefreshToken();

        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          fallbackRefreshToken ? { refreshToken: fallbackRefreshToken } : {},
          { withCredentials: true }
        );

        const { accessToken, refreshToken } = response.data;
        if (accessToken) {
          tokenStorage.setAccessToken(accessToken);
        }
        if (refreshToken) {
          tokenStorage.setRefreshToken(refreshToken);
        }

        isRefreshing = false;
        onRefreshed(accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        onRefreshFailed();
        tokenStorage.clear();

        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// --- Strongly Typed Domain API Service Modules ---

// 1. Complexes API
export const complexApi = {
  getAll: () => apiClient.get('/complexes'),
  getCurrent: () => apiClient.get('/complex/current'),
  getById: (id: string) => apiClient.get(`/complexes/${id}`),
  create: (data: any) => apiClient.post('/complexes', data),
  update: (id: string, data: any) => apiClient.put(`/complexes/${id}`, data),
  getTreasury: (id: string) => apiClient.get(`/complexes/${id}/treasury`),
};

// 2. Buildings API
export const buildingApi = {
  getAll: (complexId?: string) => apiClient.get('/buildings', { params: { complexId } }),
  getById: (id: string) => apiClient.get(`/buildings/${id}`),
  create: (data: any) => apiClient.post('/buildings', data),
  update: (id: string, data: any) => apiClient.put(`/buildings/${id}`, data),
  delete: (id: string) => apiClient.delete(`/buildings/${id}`),
};

// 3. Units API
export const unitApi = {
  getAll: (params?: { complexId?: string; buildingId?: string; occType?: string; search?: string }) =>
    apiClient.get('/units', { params }),
  getById: (id: string) => apiClient.get(`/units/${id}`),
  create: (data: any) => apiClient.post('/units', data),
  bulkCreate: (data: any) => apiClient.post('/units/bulk', data),
  update: (id: string, data: any) => apiClient.patch(`/units/${id}`, data),
  updateOccupancy: (id: string, data: { occType?: string; occupants?: number }) =>
    apiClient.patch(`/units/${id}/occupancy`, data),
  delete: (id: string) => apiClient.delete(`/units/${id}`),
  getStatement: (id: string) => apiClient.get(`/units/${id}/statement`),
};

// 4. Residents API
export const residentApi = {
  getAll: (params?: { complexId?: string; unitId?: string; type?: string; search?: string }) =>
    apiClient.get('/residents', { params }),
  getById: (id: string) => apiClient.get(`/residents/${id}`),
  create: (data: any) => apiClient.post('/residents', data),
  update: (id: string, data: any) => apiClient.put(`/residents/${id}`, data),
  delete: (id: string) => apiClient.delete(`/residents/${id}`),
  assignUnit: (id: string, data: { unitId: string; type: string; startDate?: string }) =>
    apiClient.post(`/residents/${id}/assign-unit`, data),
  unassignUnit: (id: string, unitId: string) =>
    apiClient.post(`/residents/${id}/unassign-unit`, { unitId }),
};

// 5. Periods & Calculation API
export const periodApi = {
  getAll: (params?: { complexId?: string; status?: string; type?: string; year?: string }) =>
    apiClient.get('/periods', { params }),
  getById: (id: string) => apiClient.get(`/periods/${id}`),
  create: (data: any) => apiClient.post('/periods', data),
  update: (id: string, data: any) => apiClient.put(`/periods/${id}`, data),
  calculatePreview: (id: string, expenses?: any) =>
    apiClient.post(`/periods/${id}/calculate`, expenses || {}),
  publish: (id: string) => apiClient.post(`/periods/${id}/publish`),
  close: (id: string) => apiClient.post(`/periods/${id}/close`),
  delete: (id: string) => apiClient.delete(`/periods/${id}`),
};

// 6. Charges API
export const chargeApi = {
  getAll: (params?: { complexId?: string; periodId?: string; unitId?: string }) =>
    apiClient.get('/charges', { params }),
  getById: (id: string) => apiClient.get(`/charges/${id}`),
};

// 7. Ledger Transactions & Treasury API
export const ledgerApi = {
  getTransactions: (params?: { complexId?: string; unitId?: string; periodId?: string; type?: string }) =>
    apiClient.get('/transactions', { params }),
  recordPayment: (data: {
    unitId: string;
    amount: number;
    paymentMethod?: string;
    referenceNumber?: string;
    description?: string;
    date?: string;
    periodId?: string;
    chargeId?: string;
  }) => apiClient.post('/payments', data),
  recordManual: (data: {
    unitId: string;
    type: 'DEBT' | 'PAYMENT' | 'FORGIVE';
    amount: number;
    description: string;
    txKind?: string;
    referenceNumber?: string;
  }) => apiClient.post('/transactions/manual', data),
  getBalanceSheet: (complexId?: string) =>
    apiClient.get('/reports/balance-sheet', { params: { complexId } }),
  getDebtors: (complexId?: string) =>
    apiClient.get('/reports/debtors', { params: { complexId } }),
};

// 8. Announcements API
export const announcementApi = {
  getAll: (params?: { complexId?: string; buildingId?: string }) =>
    apiClient.get('/announcements', { params }),
  getById: (id: string) => apiClient.get(`/announcements/${id}`),
  create: (data: { title: string; content: string; buildingId?: string; attachments?: string[] }) =>
    apiClient.post('/announcements', data),
  delete: (id: string) => apiClient.delete(`/announcements/${id}`),
};

// 9. Migration API
export const migrationApi = {
  importData: (payload: any) => apiClient.post('/migration/import', payload),
  migrateComplex: (complexId: string, payload: any) =>
    apiClient.post(`/complexes/${complexId}/migrate`, payload),
};

// 10. Auth API
export const authApi = {
  login: (data: { phone: string; password: string }) => apiClient.post('/auth/login', data),
  register: (data: any) => apiClient.post('/auth/register', data),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
};

// 11. Audit API
export const auditApi = {
  getAll: (params?: { complexId?: string; entityType?: string; action?: string; limit?: number; offset?: number }) =>
    apiClient.get('/audit-logs', { params }),
};

