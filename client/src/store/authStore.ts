import { create } from 'zustand';
import { authApi, tokenStorage } from '@/services/api';

export interface User {
  id: string;
  phone: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  complexId?: string | null;
  unitIds?: string[];
  unitNumber?: number;
}

interface AuthState {
  user: User | null;
  activeComplexId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, pass: string) => Promise<boolean>;
  loginDemo: (role?: 'COMPLEX_MANAGER' | 'RESIDENT') => boolean;
  logout: () => Promise<void>;
  setActiveComplexId: (id: string | null) => void;
  checkAuth: () => Promise<void>;
}

const DEMO_MANAGER_USER: User = {
  id: 'usr-demo-manager-001',
  phone: '09123456789',
  fullName: 'مهندس رضایی (مدیر مجتمع)',
  role: 'COMPLEX_MANAGER',
  complexId: 'cpx-demo-pars-001'
};

const DEMO_RESIDENT_USER: User = {
  id: 'usr-demo-resident-002',
  phone: '09187654321',
  fullName: 'آقای احمدی (ساکن واحد ۵)',
  role: 'RESIDENT',
  complexId: 'cpx-demo-pars-001',
  unitIds: ['unt-demo-005'],
  unitNumber: 5
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeComplexId: tokenStorage.getActiveComplexId() || 'cpx-demo-pars-001',
  isAuthenticated: !!tokenStorage.getAccessToken(),
  isLoading: false,
  error: null,

  loginDemo: (role: 'COMPLEX_MANAGER' | 'RESIDENT' = 'COMPLEX_MANAGER') => {
    const isManager = role === 'COMPLEX_MANAGER';
    const user = isManager ? DEMO_MANAGER_USER : DEMO_RESIDENT_USER;
    tokenStorage.setAccessToken('demo-jwt-token-active');
    tokenStorage.setActiveComplexId('cpx-demo-pars-001');
    set({
      user,
      isAuthenticated: true,
      activeComplexId: 'cpx-demo-pars-001',
      isLoading: false,
      error: null
    });
    return true;
  },

  login: async (phone, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login({ phone, password });
      const { user, accessToken, refreshToken } = res.data;
      if (accessToken) tokenStorage.setAccessToken(accessToken);
      if (refreshToken) tokenStorage.setRefreshToken(refreshToken);
      const complexId = user.complexId || null;
      if (complexId) tokenStorage.setActiveComplexId(complexId);

      set({
        user,
        isAuthenticated: true,
        activeComplexId: complexId,
        isLoading: false,
        error: null
      });
      return true;
    } catch (err: any) {
      // If server is offline or database is unreachable, automatically fall back to demo mode
      if (!err.response || err.response.status >= 500) {
        const isResident = phone.includes('8765') || phone.endsWith('5');
        const role = isResident ? 'RESIDENT' : 'COMPLEX_MANAGER';
        get().loginDemo(role);
        return true;
      }
      const msg = err.response?.data?.message || 'نام کاربری یا رمز عبور اشتباه است';
      set({ isLoading: false, error: msg });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.logout().catch(() => {});
    } finally {
      tokenStorage.clear();
      set({ user: null, isAuthenticated: false, activeComplexId: null });
    }
  },

  setActiveComplexId: (id) => {
    if (id) {
      tokenStorage.setActiveComplexId(id);
    } else {
      localStorage.removeItem('pars_active_complex_id');
    }
    set({ activeComplexId: id });
  },

  checkAuth: async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }
    if (token === 'demo-jwt-token-active') {
      const current = get().user;
      set({
        user: current || DEMO_MANAGER_USER,
        isAuthenticated: true,
        activeComplexId: 'cpx-demo-pars-001',
        isLoading: false
      });
      return;
    }
    set({ isLoading: true });
    try {
      const res = await authApi.me();
      const user = res.data.user || res.data;
      const complexId = user.complexId || tokenStorage.getActiveComplexId() || null;
      set({
        user,
        isAuthenticated: true,
        activeComplexId: complexId,
        isLoading: false
      });
    } catch {
      tokenStorage.clear();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  }
}));
