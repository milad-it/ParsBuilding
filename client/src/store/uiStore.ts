import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration?: number;
}

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    const dur = toast.duration ?? 4500;
    if (dur > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, dur);
    }
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}));

export const toast = {
  success: (message: string, title?: string) => useUIStore.getState().addToast({ type: 'success', message, title }),
  error: (message: string, title?: string) => useUIStore.getState().addToast({ type: 'error', message, title }),
  info: (message: string, title?: string) => useUIStore.getState().addToast({ type: 'info', message, title }),
  warning: (message: string, title?: string) => useUIStore.getState().addToast({ type: 'warning', message, title })
};
