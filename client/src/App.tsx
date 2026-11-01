import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { wsClient } from '@/services/websocket';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UnitsPage } from '@/pages/UnitsPage';
import { PeriodsPage } from '@/pages/PeriodsPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { LedgerPage } from '@/pages/LedgerPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { BulletinPage } from '@/pages/BulletinPage';
import { ResidentPortalPage } from '@/pages/ResidentPortalPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const App: React.FC = () => {
  const { isAuthenticated, user, checkAuth, isLoading } = useAuthStore();
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetUnitForPayment, setTargetUnitForPayment] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      wsClient.connect();
      // If resident role, redirect directly to resident portal
      if (user?.role === 'RESIDENT') {
        setCurrentView('resident');
      }
    } else {
      wsClient.disconnect();
    }
  }, [isAuthenticated, user?.role]);

  if (isLoading) {
    return (
      <div dir="rtl" className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">در حال بارگذاری سامانه هوشمند پارس...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setCurrentView('dashboard')} />;
  }

  const viewTitles: Record<string, string> = {
    dashboard: 'داشبورد جامع مدیریت',
    units: 'واحدها و مشخصات ساکنین',
    periods: 'دوره‌های صدور شارژ و تسهیم',
    payments: 'ثبت واریزی و صندوق',
    ledger: 'دفتر کل و معین مالی',
    audit: 'ردپای حسابرسی و تغییرات',
    bulletin: 'تابلو اعلانات دیجیتال',
    resident: 'پرتال اختصاصی ساکن',
    settings: 'تنظیمات و پشتیبان‌گیری'
  };

  const handleOpenPaymentForUnit = (unitId: string) => {
    setTargetUnitForPayment(unitId);
    setCurrentView('payments');
    setPaymentModalOpen(true);
  };

  return (
    <AppShell
      currentView={currentView}
      onNavigate={(v) => setCurrentView(v)}
      title={viewTitles[currentView] || 'سامانه مدیریت پارس'}
    >
      {currentView === 'dashboard' && (
        <DashboardPage
          onNavigate={(v) => setCurrentView(v)}
          onOpenPaymentModal={() => {
            setTargetUnitForPayment(null);
            setCurrentView('payments');
            setPaymentModalOpen(true);
          }}
          onSelectUnit={(unitId) => handleOpenPaymentForUnit(unitId)}
        />
      )}

      {currentView === 'units' && (
        <UnitsPage
          selectedUnitId={targetUnitForPayment}
          onOpenPaymentForUnit={(unitId) => handleOpenPaymentForUnit(unitId)}
        />
      )}

      {currentView === 'periods' && <PeriodsPage />}

      {currentView === 'payments' && (
        <PaymentsPage
          initialUnitId={targetUnitForPayment}
          isOpenRecordModal={paymentModalOpen}
          onCloseRecordModal={() => setPaymentModalOpen(false)}
        />
      )}

      {currentView === 'ledger' && <LedgerPage />}

      {currentView === 'audit' && <AuditLogsPage />}

      {currentView === 'bulletin' && <BulletinPage />}

      {currentView === 'resident' && <ResidentPortalPage />}

      {currentView === 'settings' && <SettingsPage />}
    </AppShell>
  );
};

export default App;
