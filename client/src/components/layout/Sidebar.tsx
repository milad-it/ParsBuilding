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
  ChevronLeft,
  X
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
  { id: 'periods', label: 'ثبت هزینه و صدور شارژ', icon: <CalendarDays className="w-5 h-5" /> },
  { id: 'payments', label: 'صندوق و واریزی‌ها', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'ledger', label: 'دفتر مالی ساختمان', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'bulletin', label: 'تابلو اعلانات', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'resident', label: 'پرتال اختصاصی ساکن', icon: <UserCircle2 className="w-5 h-5" /> },
  { id: 'audit', label: 'گزارش حسابرسی', icon: <ShieldCheck className="w-5 h-5" /> },
  { id: 'settings', label: 'تنظیمات مجتمع', icon: <Settings className="w-5 h-5" /> }
];

export interface SidebarProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  const handleItemClick = (id: string) => {
    onNavigate(id);
    // On mobile, automatically close drawer after clicking an item
    if (window.innerWidth < 768 && sidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay (only visible when drawer is open on mobile) */}
      {sidebarOpen && (
        <div
          onClick={toggleSidebar}
          className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-xs md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar (Desktop: Static column | Mobile: Sliding drawer) */}
      <aside
        dir="rtl"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col border-e border-stone-200 bg-white transition-all duration-300 md:static',
          // Desktop sizing
          sidebarOpen ? 'w-64' : 'w-20',
          // Mobile responsive: slide in from right when open, hide off-screen when closed
          sidebarOpen ? 'translate-x-0 shadow-2xl md:shadow-none' : 'max-md:translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-stone-200 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
              <Building2 className="w-5 h-5" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col text-right">
                <span className="text-sm font-black text-stone-900 tracking-tight">پارس بیلدینگ</span>
                <span className="text-[10px] text-brand-600 font-medium">مدیریت هوشمند ساختمان</span>
              </div>
            )}
          </div>
          {/* Close / Collapse button */}
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title={sidebarOpen ? 'بستن منو' : 'باز کردن منو'}
          >
            <span className="md:hidden">
              <X className="w-5 h-5" />
            </span>
            <span className="hidden md:inline">
              {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                title={!sidebarOpen ? item.label : undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 cursor-pointer select-none',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm font-bold'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                )}
              >
                <span
                  className={cn(
                    'shrink-0 transition-transform duration-200 group-hover:scale-110',
                    isActive ? 'text-white' : 'text-stone-500 group-hover:text-stone-800'
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
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Mini Bar */}
        {user && (
          <div className="border-t border-stone-200 p-3 bg-stone-50/70">
            <div className="flex items-center gap-3 rounded-xl bg-white border border-stone-200/80 p-2 shadow-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 font-bold text-xs">
                {user.fullName ? user.fullName[0] : 'U'}
              </div>
              {sidebarOpen && (
                <div className="flex flex-col text-right truncate">
                  <span className="text-xs font-bold text-stone-800 truncate">{user.fullName || 'کاربر'}</span>
                  <span className="text-[10px] text-stone-500 font-medium">
                    {user.role === 'RESIDENT' ? 'ساکن واحد' : 'مدیر مجتمع'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
