import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import {
  LayoutDashboard,
  Home,
  CalendarDays,
  CreditCard,
  BookOpen,
  ShieldCheck,
  Megaphone,
  UserCircle2,
  Settings,
  Building2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  roles?: string[];
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'داشبورد مدیریت', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'units', label: 'واحدها و ساکنین', icon: <Home className="w-5 h-5" /> },
  { id: 'periods', label: 'دوره‌ها و صدور شارژ', icon: <CalendarDays className="w-5 h-5" /> },
  { id: 'payments', label: 'ثبت واریزی و صندوق', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'ledger', label: 'دفتر معین مالی', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'audit', label: 'گزارش حسابرسی (Audit)', icon: <ShieldCheck className="w-5 h-5" /> },
  { id: 'bulletin', label: 'تابلو اعلانات دیجیتال', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'resident', label: 'پرتال اختصاصی ساکن', icon: <UserCircle2 className="w-5 h-5" /> },
  { id: 'settings', label: 'تنظیمات و پشتیبان‌گیری', icon: <Settings className="w-5 h-5" /> }
];

export interface SidebarProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  return (
    <aside
      dir="rtl"
      className={cn(
        'relative z-30 flex flex-col border-e border-slate-800 bg-slate-900/95 backdrop-blur-xl transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-glow-brand">
            <Building2 className="w-5 h-5" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col text-right">
              <span className="text-sm font-black text-slate-100 tracking-tight">پارس بیلدینگ</span>
              <span className="text-[10px] text-brand-400 font-medium">سامانه هوشمند ساختمان</span>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
          title={sidebarOpen ? 'بستن منو' : 'باز کردن منو'}
        >
          {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={!sidebarOpen ? item.label : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 cursor-pointer select-none',
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-bold'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              )}
            >
              <span
                className={cn(
                  'shrink-0 transition-transform duration-200 group-hover:scale-110',
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                )}
              >
                {item.icon}
              </span>
              {sidebarOpen && (
                <span className="flex-1 text-right truncate">
                  {item.label}
                </span>
              )}
              {sidebarOpen && item.badge && (
                <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] text-brand-300">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Mini Bar */}
      {user && (
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-950/60 p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 font-bold text-xs">
              {user.fullName ? user.fullName[0] : 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex flex-col text-right truncate">
                <span className="text-xs font-bold text-slate-200 truncate">{user.fullName || 'کاربر'}</span>
                <span className="text-[10px] text-slate-400">
                  {user.role === 'RESIDENT' ? 'ساکن واحد' : 'مدیر مجتمع'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
