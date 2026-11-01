import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { wsClient } from '@/services/websocket';
import { complexApi } from '@/services/api';
import {
  Bell,
  LogOut,
  Wifi,
  WifiOff,
  Building,
  Menu
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

export interface HeaderProps {
  currentTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ currentTitle }) => {
  const { user, logout, activeComplexId } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const [wsStatus, setWsStatus] = useState<string>('DISCONNECTED');
  const [complexName, setComplexName] = useState<string>('برج مسکونی پارس');

  useEffect(() => {
    const unsub = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (activeComplexId) {
      complexApi.getById(activeComplexId)
        .then((res) => {
          if (res.data?.name) setComplexName(res.data.name);
        })
        .catch(() => {});
    }
  }, [activeComplexId]);

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-20 flex h-14 sm:h-16 w-full items-center justify-between border-b border-stone-200 bg-white/95 px-3 sm:px-6 backdrop-blur-md shadow-xs"
    >
      {/* Title & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 md:hidden cursor-pointer"
          aria-label="منو"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Building className="w-4 h-4 text-brand-600 hidden sm:inline-block" />
          <span className="text-xs font-semibold text-stone-500 truncate max-w-[120px] sm:max-w-none">{complexName}</span>
          <span className="text-xs text-stone-300">/</span>
          <h1 className="text-xs sm:text-base font-black text-stone-900 truncate">{currentTitle}</h1>
        </div>
      </div>

      {/* Action Indicators */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live WebSocket Status Badge */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
            wsStatus === 'CONNECTED'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-stone-200 bg-stone-100 text-stone-600'
          }`}
          title={`وضعیت ارتباط زنده: ${wsStatus}`}
        >
          {wsStatus === 'CONNECTED' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">اتصال زنده</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">آفلاین</span>
            </>
          )}
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 border-s border-stone-200 ps-2 sm:ps-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-stone-800">{user?.fullName || 'کاربر'}</span>
            <span className="text-[10px] text-stone-400">{user?.phone}</span>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-all cursor-pointer"
            title="خروج از حساب"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
};
