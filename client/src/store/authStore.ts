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
  logout: () => Promise<void>;
  setActiveComplexId: (id: string | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeComplexId: tokenStorage.getActiveComplexId(),
  isAuthenticated: !!tokenStorage.getAccessToken(),
  isLoading: false,
  error: null,

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
      const msg = err.response?.data?.message || 'خطا در برقراری ارتباط یا نام کاربری/رمز اشتباه است';
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
