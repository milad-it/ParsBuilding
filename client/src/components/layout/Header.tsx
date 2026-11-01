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
      className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 sm:px-6 backdrop-blur-xl"
    >
      {/* Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 md:hidden"
          aria-label="منو"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-brand-400 hidden sm:inline-block" />
          <span className="text-xs font-semibold text-slate-400">{complexName}</span>
          <span className="text-xs text-slate-600">/</span>
          <h1 className="text-sm sm:text-base font-black text-slate-100">{currentTitle}</h1>
        </div>
      </div>

      {/* Action Indicators */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live WebSocket Status Badge */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
            wsStatus === 'CONNECTED'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-slate-700 bg-slate-800 text-slate-400'
          }`}
          title={`وضعیت ارتباط زنده: ${wsStatus}`}
        >
          {wsStatus === 'CONNECTED' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
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

        {/* Notifications Icon */}
        <button
          className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
          aria-label="اعلانات"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 border-s border-slate-800 ps-2 sm:ps-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-200">{user?.fullName || 'کاربر'}</span>
            <span className="text-[10px] text-slate-400">{user?.phone}</span>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
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
