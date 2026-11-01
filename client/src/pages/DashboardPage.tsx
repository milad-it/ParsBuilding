import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { complexApi, ledgerApi, periodApi, unitApi } from '@/services/api';
import { wsClient } from '@/services/websocket';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { BuildingMatrix3D } from '@/components/3d/manager/BuildingMatrix3D';
import { formatToman, toFaDigit } from '@/utils/formatters';
import { formatJalaliDateTime } from '@/utils/jalali';
import {
  Wallet,
  AlertCircle,
  Percent,
  CalendarCheck,
  Building,
  PlusCircle,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Clock
} from 'lucide-react';

export const DashboardPage: React.FC<{
  onNavigate?: (view: string) => void;
  onOpenPaymentModal?: () => void;
  onSelectUnit?: (unitId: string) => void;
}> = ({ onNavigate, onOpenPaymentModal, onSelectUnit }) => {
  const { activeComplexId } = useAuthStore();
  const [loading, setLoading] = useState(true);

  // Dashboard Stats State
  const [treasuryFund, setTreasuryFund] = useState<number>(0);
  const [totalDebts, setTotalDebts] = useState<number>(0);
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [collectionRate, setCollectionRate] = useState<number>(100);
  const [activePeriod, setActivePeriod] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [debtors, setDebtors] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  const fetchDashboardData = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const [treasuryRes, balanceSheetRes, periodsRes, unitsRes, debtorsRes, txRes] = await Promise.all([
        complexApi.getTreasury(activeComplexId).catch(() => ({ data: { currentFund: 0 } })),
        ledgerApi.getBalanceSheet(activeComplexId).catch(() => ({ data: { totalDebts: 0, totalCredits: 0 } })),
        periodApi.getAll({ complexId: activeComplexId, status: 'ACTIVE' }).catch(() => ({ data: [] })),
        unitApi.getAll({ complexId: activeComplexId }).catch(() => ({ data: [] })),
        ledgerApi.getDebtors(activeComplexId).catch(() => ({ data: [] })),
        ledgerApi.getTransactions({ complexId: activeComplexId }).catch(() => ({ data: [] }))
      ]);

      const fund = Number(treasuryRes.data?.currentFund || 0);
      const debts = Number(balanceSheetRes.data?.totalDebts || 0);
      const credits = Number(balanceSheetRes.data?.totalCredits || 0);
      const uList = unitsRes.data || [];
      const pList = periodsRes.data || [];
      const currentPeriod = pList.length > 0 ? pList[0] : null;

      let collRate = 100;
      if (currentPeriod && currentPeriod.charges) {
        const billed = Number(currentPeriod.totalExpenseAmount || 0);
        let paid = 0;
        currentPeriod.charges.forEach((c: any) => {
          paid += Number(c.paidAmount || 0);
        });
        collRate = billed > 0 ? Math.round((paid / billed) * 100) : 100;
      }

      setTreasuryFund(fund);
      setTotalDebts(debts);
      setTotalCredits(credits);
      setCollectionRate(collRate);
      setActivePeriod(currentPeriod);
      setUnits(uList);
      setDebtors((debtorsRes.data || []).slice(0, 5));
      setRecentTransactions((txRes.data || []).slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Real-Time WebSocket Binding
  useEffect(() => {
    if (!activeComplexId) return;
    const room = `complex:${activeComplexId}`;
    wsClient.subscribe(room);

    const unsubPayment = wsClient.on('payment:received', () => {
      fetchDashboardData();
    });
    const unsubPeriod = wsClient.on('period:published', () => {
      fetchDashboardData();
    });
    const unsubBalance = wsClient.on('unit:balance_updated', () => {
      fetchDashboardData();
    });

    return () => {
      unsubPayment();
      unsubPeriod();
      unsubBalance();
      wsClient.unsubscribe(room);
    };
  }, [activeComplexId, fetchDashboardData]);

  const occupiedCount = units.filter((u) => u.occType !== 'VACANT' && u.occupants > 0).length;
  const occupancyPct = units.length > 0 ? Math.round((occupiedCount / units.length) * 100) : 0;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Top Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">داشبورد جامع مدیریت</h2>
          <p className="text-xs text-slate-400 mt-1">
            وضعیت مالی، نرخ وصولی شارژ و کنترل هوشمند تراز ساختمان در یک نگاه
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="sm"
            onClick={fetchDashboardData}
            iconStart={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            بروزرسانی
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate?.('periods')}
            iconStart={<PlusCircle className="w-4 h-4 text-brand-400" />}
          >
            صدور دوره جدید
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenPaymentModal}
            iconStart={<ArrowUpRight className="w-4 h-4" />}
          >
            ثبت واریزی سریع
          </Button>
        </div>
      </div>

      {/* 5 High-Impact Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="موجودی کل صندوق ساختمان"
          value={formatToman(treasuryFund)}
          unit="تومان"
          color="emerald"
          subtitle="تراز نقدی و بانکی مجتمع"
          icon={<Wallet className="w-5 h-5" />}
          trend={{ value: 'مثبت و متوازن', isPositive: true }}
        />
        <StatCard
          title="کل بدهی وصول‌نشده واحدها"
          value={formatToman(totalDebts)}
          unit="تومان"
          color="rose"
          subtitle="مجموع مانده بدهی معوق"
          icon={<AlertCircle className="w-5 h-5" />}
          trend={{ value: `${toFaDigit(debtors.length)} واحد بدهکار`, isPositive: false }}
        />
        <StatCard
          title="نرخ وصولی دوره جاری"
          value={`${toFaDigit(collectionRate)}٪`}
          color="brand"
          subtitle={activePeriod ? `دوره: ${activePeriod.name}` : 'دوره‌ای فعال نیست'}
          icon={<Percent className="w-5 h-5" />}
          trend={{ value: 'پیشرفت تسویه', isPositive: collectionRate >= 70 }}
        />
        <StatCard
          title="ضریب سکونت ساختمان"
          value={`${toFaDigit(occupancyPct)}٪`}
          color="amber"
          subtitle={`${toFaDigit(occupiedCount)} از ${toFaDigit(units.length)} واحد فعال`}
          icon={<Building className="w-5 h-5" />}
          trend={{ value: `${toFaDigit(units.length - occupiedCount)} واحد خالی`, isPositive: true }}
        />
      </div>

      {/* 3D Isometric Building Status Matrix Showcase */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-500 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-100">ماتریس سه‌بعدی و وضعیت لحظه‌ای واحدها</h3>
          </div>
          <span className="text-xs text-slate-400">
            جهت مشاهده جزئیات یا ثبت واریزی روی هر واحد کلیک کنید
          </span>
        </div>
        <BuildingMatrix3D
          units={units}
          onSelectUnit={(id) => {
            onSelectUnit?.(id);
            onNavigate?.('units');
          }}
        />
      </div>

      {/* Quick Debtors Table & Recent Ledger Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Highest Debtors */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-glass space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span>واحدهای دارای بیشترین بدهی</span>
            </h3>
            <button
              onClick={() => onNavigate?.('units')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer"
            >
              مشاهده همه
            </button>
          </div>

          {debtors.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">خوشبختانه واحد بدهکاری وجود ندارد</p>
          ) : (
            <div className="space-y-2">
              {debtors.map((d: any) => (
                <div
                  key={d.id}
                  onClick={() => onSelectUnit?.(d.id)}
                  className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 hover:bg-slate-800/40 transition-colors cursor-pointer border border-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 font-bold text-xs">
                      {toFaDigit(d.unitNumber)}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        واحد {toFaDigit(d.unitNumber)} {d.unitName ? `(${d.unitName})` : ''}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {d.residents?.[0]?.fullName || 'ساکن ثبت نشده'}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-rose-400 num-tabular">
                    +{formatToman(d.currentBalance)} تومان
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Ledger Transactions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-glass space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>آخرین تراکنش‌های ثبتی معین</span>
            </h3>
            <button
              onClick={() => onNavigate?.('ledger')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer"
            >
              مشاهده دفترچه
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">تراکنشی برای نمایش ثبت نشده است</p>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map((tx: any) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs ${
                        tx.type === 'PAYMENT'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {tx.type === 'PAYMENT' ? 'واریز' : 'بدهی'}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        {tx.description || (tx.type === 'PAYMENT' ? 'پرداخت شارژ' : 'ثبت بدهی دوره')}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {formatJalaliDateTime(tx.date || tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold num-tabular ${
                      tx.type === 'PAYMENT' ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {formatToman(tx.amount)} تومان
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
