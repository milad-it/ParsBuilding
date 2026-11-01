import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '@/components/common/Toast';
import { useUIStore } from '@/store/uiStore';
import {
  LayoutDashboard,
  Home,
  CalendarDays,
  CreditCard,
  Menu
} from 'lucide-react';

export interface AppShellProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
  title: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentView, onNavigate, title, children }) => {
  const { toggleSidebar } = useUIStore();

  const mobileNav = [
    { id: 'dashboard', label: 'داشبورد', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'units', label: 'واحدها', icon: <Home className="w-5 h-5" /> },
    { id: 'periods', label: 'شارژها', icon: <CalendarDays className="w-5 h-5" /> },
    { id: 'payments', label: 'صندوق', icon: <CreditCard className="w-5 h-5" /> }
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-stone-100 text-stone-800 font-sans selection:bg-brand-500 selection:text-white">
      {/* Persian RTL Sidebar (Desktop column & Mobile Drawer) */}
      <Sidebar currentView={currentView} onNavigate={onNavigate} />

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header currentTitle={title} />
        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile-First Bottom Navigation Bar (< 768px) */}
      <nav
        dir="rtl"
        aria-label="نوار دسترسی موبایل"
        className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t border-stone-200 bg-white/95 px-2 backdrop-blur-md md:hidden shadow-lg shadow-stone-900/10"
      >
        {mobileNav.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[11px] font-semibold transition-colors cursor-pointer select-none ${
                isActive ? 'text-brand-600 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <span className={`p-1 rounded-xl transition-all ${isActive ? 'bg-brand-50 text-brand-600' : ''}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
        {/* Mobile More / Menu button */}
        <button
          onClick={toggleSidebar}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800 cursor-pointer select-none"
        >
          <span className="p-1 rounded-xl">
            <Menu className="w-5 h-5" />
          </span>
          <span>منو</span>
        </button>
      </nav>

      {/* Floating System Toasts */}
      <ToastContainer />
    </div>
  );
};
