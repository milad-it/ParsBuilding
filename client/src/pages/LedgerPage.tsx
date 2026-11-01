import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ledgerApi, unitApi } from '@/services/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { formatToman, toFaDigit } from '@/utils/formatters';
import { formatJalaliDateTime } from '@/utils/jalali';
import { BookOpen, Wallet, TrendingDown, TrendingUp, CheckCircle, Search } from 'lucide-react';

export const LedgerPage: React.FC = () => {
  const { activeComplexId } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<any>({
    currentFund: 0,
    initialFund: 0,
    totalDebts: 0,
    totalCredits: 0,
    closedPeriodsCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'PAYMENT' | 'DEBT'>('ALL');

  const fetchData = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const [txRes, bsRes, uRes] = await Promise.all([
        ledgerApi.getTransactions({ complexId: activeComplexId }),
        ledgerApi.getBalanceSheet(activeComplexId),
        unitApi.getAll({ complexId: activeComplexId })
      ]);
      setTransactions(txRes.data || []);
      setBalanceSheet(bsRes.data || {});
      setUnits(uRes.data || []);
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTransactions = transactions.filter((tx) => {
    if (selectedUnitId !== 'ALL' && tx.unitId !== selectedUnitId) return false;
    if (txTypeFilter !== 'ALL' && tx.type !== txTypeFilter) return false;
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'date',
      header: 'تاریخ و زمان',
      render: (tx) => (
        <span className="text-xs text-slate-300 num-tabular">
          {formatJalaliDateTime(tx.date || tx.createdAt)}
        </span>
      )
    },
    {
      key: 'unit',
      header: 'طرف حساب (واحد)',
      render: (tx) => {
        const u = units.find((x) => x.id === tx.unitId);
        return (
          <span className="font-bold text-slate-200">
            {u ? `واحد ${toFaDigit(u.unitNumber)}` : 'صندوق مجتمع'}
          </span>
        );
      }
    },
    {
      key: 'description',
      header: 'شرح تراکنش',
      render: (tx) => (
        <div>
          <span className="font-semibold text-slate-200">{tx.description || '-'}</span>
          {tx.referenceNumber && (
            <p className="text-[10px] font-mono text-slate-500">سند: {tx.referenceNumber}</p>
          )}
        </div>
      )
    },
    {
      key: 'type',
      header: 'نوع سند',
      align: 'center',
      render: (tx) => (
        <Badge variant={tx.type === 'PAYMENT' ? 'emerald' : 'rose'}>
          {tx.type === 'PAYMENT' ? 'واریز (بستانکار)' : 'شارژ / هزینه (بدهکار)'}
        </Badge>
      )
    },
    {
      key: 'amount',
      header: 'مبلغ تراکنش',
      align: 'center',
      render: (tx) => (
        <span
          className={`font-mono font-bold text-sm num-tabular ${
            tx.type === 'PAYMENT' ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {tx.type === 'PAYMENT' ? '+' : '-'}{formatToman(tx.amount)} تومان
        </span>
      )
    }
  ];

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-white">دفتر کل و معین مالی ساختمان</h2>
        <p className="text-xs text-slate-400 mt-1">
          ثبت کلیه بدهکاری‌ها، بستانکاری‌ها و اسناد مالی مجتمع بر اساس استانداردهای دوبل
        </p>
      </div>

      {/* Balance Sheet KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="موجودی جاری صندوق"
          value={formatToman(balanceSheet.currentFund)}
          unit="تومان"
          color="emerald"
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          title="کل مطالبات از واحدها (بدهی معوق)"
          value={formatToman(balanceSheet.totalDebts)}
          unit="تومان"
          color="rose"
          icon={<TrendingDown className="w-5 h-5" />}
        />
        <StatCard
          title="مجموع بستانکاری واحدها"
          value={formatToman(balanceSheet.totalCredits)}
          unit="تومان"
          color="brand"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="دوره‌های مالی بسته‌شده"
          value={toFaDigit(balanceSheet.closedPeriodsCount || 0)}
          unit="دوره"
          color="slate"
          icon={<BookOpen className="w-5 h-5" />}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span>فیلتر بر اساس واحد:</span>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">همه واحدها</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                واحد {toFaDigit(u.unitNumber)} {u.unitName ? `(${u.unitName})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span>نوع سند:</span>
          <select
            value={txTypeFilter}
            onChange={(e: any) => setTxTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">کلیه اسناد</option>
            <option value="PAYMENT">فقط واریزی‌ها</option>
            <option value="DEBT">فقط بدهی‌ها و شارژ</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <DataTable
        columns={columns}
        data={filteredTransactions}
        keyExtractor={(tx) => tx.id}
        searchPlaceholder="جستجو در شرح سند، شماره پیگیری..."
        searchFilter={(tx, q) =>
          (tx.description && tx.description.includes(q)) ||
          (tx.referenceNumber && tx.referenceNumber.includes(q))
        }
        isLoading={loading}
      />
    </div>
  );
};
