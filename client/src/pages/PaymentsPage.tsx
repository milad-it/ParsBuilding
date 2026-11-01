import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ledgerApi, unitApi } from '@/services/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { toast } from '@/store/uiStore';
import { formatToman, toFaDigit } from '@/utils/formatters';
import { formatJalaliDateTime } from '@/utils/jalali';
import { CreditCard, Plus, ArrowDownLeft, CheckCircle } from 'lucide-react';

export const PaymentsPage: React.FC<{
  initialUnitId?: string | null;
  isOpenRecordModal?: boolean;
  onCloseRecordModal?: () => void;
}> = ({ initialUnitId, isOpenRecordModal, onCloseRecordModal }) => {
  const { activeComplexId } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment Recording Modal State
  const [isModalOpen, setIsModalOpen] = useState(isOpenRecordModal || false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId || '');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CARD_TRANSFER' | 'CASH' | 'GATEWAY' | 'OFFSET'>('CARD_TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [description, setDescription] = useState<string>('واریز شارژ ساختمان');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpenRecordModal !== undefined) {
      setIsModalOpen(isOpenRecordModal);
    }
  }, [isOpenRecordModal]);

  useEffect(() => {
    if (initialUnitId) {
      setSelectedUnitId(initialUnitId);
      setIsModalOpen(true);
    }
  }, [initialUnitId]);

  const fetchData = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const [txRes, uRes] = await Promise.all([
        ledgerApi.getTransactions({ complexId: activeComplexId }),
        unitApi.getAll({ complexId: activeComplexId })
      ]);
      const paymentTxs = (txRes.data || []).filter((tx: any) => tx.type === 'PAYMENT');
      setTransactions(paymentTxs);
      setUnits(uRes.data || []);
      if (!selectedUnitId && uRes.data?.length > 0) {
        setSelectedUnitId(uRes.data[0].id);
      }
    } catch {
      toast.error('خطا در دریافت لیست تراکنش‌ها');
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId) {
      toast.error('لطفاً واحد مورد نظر را انتخاب نمایید');
      return;
    }
    if (amount <= 0) {
      toast.error('مبلغ واریزی باید بزرگتر از صفر باشد');
      return;
    }

    setIsSubmitting(true);
    try {
      await ledgerApi.recordPayment({
        unitId: selectedUnitId,
        amount,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        description
      });
      toast.success('واریزی با موفقیت ثبت و تراز صندوق و واحد بروزرسانی شد');
      setIsModalOpen(false);
      onCloseRecordModal?.();
      setAmount(0);
      setReferenceNumber('');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در ثبت تراکنش پرداخت');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'unit',
      header: 'واحد و پرداخت‌کننده',
      render: (tx) => {
        const u = units.find((x) => x.id === tx.unitId);
        return (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs">
              {u ? toFaDigit(u.unitNumber) : '-'}
            </span>
            <div>
              <span className="font-bold text-slate-100">
                {u ? `واحد ${toFaDigit(u.unitNumber)} ${u.unitName ? `(${u.unitName})` : ''}` : 'واحد نامشخص'}
              </span>
              <p className="text-[10px] text-slate-400">{tx.description}</p>
            </div>
          </div>
        );
      }
    },
    {
      key: 'amount',
      header: 'مبلغ پرداختی',
      align: 'center',
      render: (tx) => (
        <span className="font-mono font-bold text-emerald-400 text-sm num-tabular">
          +{formatToman(tx.amount)} تومان
        </span>
      )
    },
    {
      key: 'paymentMethod',
      header: 'روش پرداخت',
      align: 'center',
      render: (tx) => {
        const method = tx.metadata?.paymentMethod || 'CARD_TRANSFER';
        const methodMap: Record<string, { label: string; variant: any }> = {
          CARD_TRANSFER: { label: 'کارت به کارت', variant: 'brand' },
          GATEWAY: { label: 'درگاه آنلاین', variant: 'emerald' },
          CASH: { label: 'نقدی', variant: 'amber' },
          OFFSET: { label: 'تهاتر / بخشودگی', variant: 'slate' }
        };
        const m = methodMap[method] || { label: method, variant: 'slate' };
        return <Badge variant={m.variant}>{m.label}</Badge>;
      }
    },
    {
      key: 'referenceNumber',
      header: 'شماره پیگیری / سند',
      align: 'center',
      render: (tx) => (
        <span className="font-mono text-xs text-slate-400">
          {tx.referenceNumber || tx.metadata?.referenceNumber || '-'}
        </span>
      )
    },
    {
      key: 'date',
      header: 'تاریخ و ساعت ثبت',
      align: 'center',
      render: (tx) => (
        <span className="text-xs text-slate-400 num-tabular">
          {formatJalaliDateTime(tx.date || tx.createdAt)}
        </span>
      )
    }
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">ثبت و مدیریت واریزی‌های صندوق</h2>
          <p className="text-xs text-slate-400 mt-1">
            ثبت دریافت نقدی، کارت به کارت یا درگاه اینترنتی و تسویه حساب آنی بدهی واحدها
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          iconStart={<Plus className="w-4 h-4" />}
        >
          ثبت واریزی جدید
        </Button>
      </div>

      {/* Main Payments Table */}
      <DataTable
        columns={columns}
        data={transactions}
        keyExtractor={(tx) => tx.id}
        searchPlaceholder="جستجو بر اساس شماره پیگیری یا توضیحات..."
        searchFilter={(tx, q) =>
          (tx.description && tx.description.includes(q)) ||
          (tx.referenceNumber && tx.referenceNumber.includes(q))
        }
        isLoading={loading}
      />

      {/* Payment Recording Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          onCloseRecordModal?.();
        }}
        title="ثبت سند واریز وجه به صندوق ساختمان"
        description="با ثبت این سند، بلافاصله مانده بدهی واحد کسر شده و تراز صندوق افزایش می‌یابد."
        size="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="space-y-1.5 text-right">
            <label className="block text-xs font-medium text-slate-300">انتخاب واحد</label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-brand-500"
              required
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  واحد {toFaDigit(u.unitNumber)} {u.unitName ? `(${u.unitName})` : ''} — مانده فعلی:{' '}
                  {Number(u.currentBalance || 0) > 0
                    ? `${formatToman(u.currentBalance)} بدهکار`
                    : `${formatToman(Math.abs(u.currentBalance || 0))} تسویه`}
                </option>
              ))}
            </select>
          </div>

          <MoneyInput
            label="مبلغ واریزی (تومان)"
            value={amount}
            onChange={setAmount}
            placeholder="مبلغ واریز را وارد کنید"
            required
          />

          <div className="space-y-1.5 text-right">
            <label className="block text-xs font-medium text-slate-300">روش پرداخت</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('CARD_TRANSFER')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'CARD_TRANSFER'
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                کارت به کارت / فیش بانکی
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('GATEWAY')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'GATEWAY'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                درگاه پرداخت آنلاین
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'CASH'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                وجه نقد دریافتی
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('OFFSET')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'OFFSET'
                    ? 'border-slate-500 bg-slate-500/15 text-slate-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                تهاتر / بخشودگی
              </button>
            </div>
          </div>

          <Input
            label="شماره پیگیری یا شماره ارجاع فیش (اختیاری)"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="مثال: ۱۲۳۴۵۶۷۸۹"
          />

          <Input
            label="توضیحات و بابت"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="بابت شارژ ماهانه یا..."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                onCloseRecordModal?.();
              }}
            >
              انصراف
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              ثبت قطعی واریزی
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
