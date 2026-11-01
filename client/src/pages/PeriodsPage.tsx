import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { periodApi } from '@/services/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { toast } from '@/store/uiStore';
import { formatToman, toFaDigit } from '@/utils/formatters';
import { formatJalaliDateTime } from '@/utils/jalali';
import {
  CalendarDays,
  Plus,
  Play,
  Lock,
  Trash2,
  Eye,
  CheckCircle2,
  Calculator,
  AlertTriangle
} from 'lucide-react';

export const PeriodsPage: React.FC = () => {
  const { activeComplexId } = useAuthStore();
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Creation Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [periodName, setPeriodName] = useState('شارژ آبان ۱۴۰۳');
  const [periodType, setPeriodType] = useState<'MONTHLY' | 'EMERGENCY' | 'ANNUAL'>('MONTHLY');
  const [fixedCost, setFixedCost] = useState<number>(500000);
  const [waterCost, setWaterCost] = useState<number>(1200000);
  const [gasCost, setGasCost] = useState<number>(1800000);
  const [electricityCost, setElectricityCost] = useState<number>(850000);
  const [incidentalCost, setIncidentalCost] = useState<number>(600000);
  const [incidentalDesc, setIncidentalDesc] = useState<string>('نظافت راه‌پله و آسانسور');
  const [areaExpenseTotal, setAreaExpenseTotal] = useState<number>(1500000);
  const [specialTotalCost, setSpecialTotalCost] = useState<number>(0);
  const [roundUp, setRoundUp] = useState<boolean>(true);
  const [roundStep, setRoundStep] = useState<number>(50000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculation Preview Modal
  const [previewPeriod, setPreviewPeriod] = useState<any | null>(null);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const fetchPeriods = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const res = await periodApi.getAll({ complexId: activeComplexId });
      setPeriods(res.data || []);
    } catch {
      toast.error('خطا در دریافت لیست دوره‌ها');
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplexId) return;
    setIsSubmitting(true);
    try {
      const payload = {
        complexId: activeComplexId,
        name: periodName,
        type: periodType,
        fixedCost,
        waterCost,
        gasCost,
        electricityCost,
        incidentalCost,
        incidentalDesc,
        areaExpenseTotal,
        specialTotalCost,
        roundUp,
        roundStep
      };

      const res = await periodApi.create(payload);
      toast.success(`دوره «${periodName}» به صورت پیش‌نویس ایجاد شد`);
      setIsCreateModalOpen(false);
      fetchPeriods();

      // Immediately open calculation preview
      handleOpenPreview(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در ایجاد دوره جدید');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPreview = async (period: any) => {
    setPreviewPeriod(period);
    setIsPreviewLoading(true);
    try {
      const res = await periodApi.calculatePreview(period.id);
      setPreviewResult(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در محاسبه پیش‌نمایش دوره');
      setPreviewPeriod(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePublish = async (periodId: string) => {
    setIsPublishing(true);
    try {
      await periodApi.publish(periodId);
      toast.success('دوره با موفقیت محاسبه و به وضعیت فعال (منتشر شده) منتقل شد');
      setPreviewPeriod(null);
      fetchPeriods();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در انتشار دوره');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClosePeriod = async (periodId: string) => {
    if (!confirm('آیا از بستن قطعی این دوره اطمینان دارید؟ با بستن دوره، مانده‌های تسویه‌نشده به عنوان بدهی دائم به دفتر معین منتقل می‌شود.')) {
      return;
    }
    try {
      await periodApi.close(periodId);
      toast.success('دوره با موفقیت بسته شد و مانده‌ها به دفتر معین منتقل گردید');
      fetchPeriods();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در بستن دوره');
    }
  };

  const handleDeletePeriod = async (periodId: string) => {
    if (!confirm('آیا از حذف این دوره پیش‌نویس اطمینان دارید؟')) return;
    try {
      await periodApi.delete(periodId);
      toast.success('دوره پیش‌نویس با موفقیت حذف شد');
      fetchPeriods();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در حذف دوره');
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'عنوان دوره',
      render: (p) => (
        <div>
          <span className="font-bold text-slate-100">{p.name}</span>
          <p className="text-[10px] text-slate-400">
            {p.type === 'MONTHLY' ? 'ماهانه عادی' : p.type === 'EMERGENCY' ? 'اضطراری' : 'سالانه'}
          </p>
        </div>
      )
    },
    {
      key: 'status',
      header: 'وضعیت چرخه',
      align: 'center',
      render: (p) => {
        if (p.status === 'ACTIVE') {
          return (
            <Badge variant="emerald" size="md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              فعال (در حال وصول)
            </Badge>
          );
        }
        if (p.status === 'CLOSED') {
          return (
            <Badge variant="slate" size="md">
              بسته شده (نهایی)
            </Badge>
          );
        }
        return (
          <Badge variant="amber" size="md">
            پیش‌نویس (DRAFT)
          </Badge>
        );
      }
    },
    {
      key: 'totalExpenseAmount',
      header: 'مجموع هزینه‌ها',
      align: 'center',
      render: (p) => (
        <span className="font-mono font-bold text-slate-200 num-tabular">
          {formatToman(p.totalExpenseAmount)} تومان
        </span>
      )
    },
    {
      key: 'createdAt',
      header: 'تاریخ ایجاد',
      align: 'center',
      render: (p) => (
        <span className="text-xs text-slate-400 num-tabular">
          {formatJalaliDateTime(p.createdAt)}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'عملیات و چرخه',
      align: 'center',
      render: (p) => (
        <div className="flex items-center justify-center gap-1.5">
          {p.status === 'DRAFT' && (
            <>
              <Button
                variant="primary"
                size="xs"
                onClick={() => handleOpenPreview(p)}
                iconStart={<Play className="w-3.5 h-3.5" />}
              >
                محاسبه و انتشار
              </Button>
              <button
                onClick={() => handleDeletePeriod(p.id)}
                className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="حذف پیش‌نویس"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          {p.status === 'ACTIVE' && (
            <>
              <Button
                variant="danger"
                size="xs"
                onClick={() => handleClosePeriod(p.id)}
                iconStart={<Lock className="w-3.5 h-3.5" />}
              >
                بستن نهایی دوره
              </Button>
              <button
                onClick={() => handleOpenPreview(p)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 transition-colors"
                title="مشاهده جدول تسهیم"
              >
                <Eye className="w-4 h-4" />
              </button>
            </>
          )}

          {p.status === 'CLOSED' && (
            <button
              onClick={() => handleOpenPreview(p)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 transition-colors"
              title="مشاهده جزئیات دوره بسته شده"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">مدیریت دوره‌ها و تسهیم شارژ</h2>
          <p className="text-xs text-slate-400 mt-1">
            ورود قبوض، فرمول‌های ماده ۴ قانون تملک آپارتمان‌ها و پیش‌نمایش دقیق تسهیم
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsCreateModalOpen(true)}
          iconStart={<Plus className="w-4 h-4" />}
        >
          صدور دوره جدید
        </Button>
      </div>

      {/* Periods Table */}
      <DataTable
        columns={columns}
        data={periods}
        keyExtractor={(p) => p.id}
        searchPlaceholder="جستجو در دوره‌ها..."
        searchFilter={(p, q) => p.name.includes(q)}
        isLoading={loading}
      />

      {/* Create Period Wizard Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="صدور صورت‌حساب دوره جدید"
        description="مبالغ فاکتورها و قبوض ساختمان را وارد نمایید. سیستم به صورت خودکار سهم هر واحد را محاسبه می‌کند."
        size="lg"
      >
        <form onSubmit={handleCreatePeriod} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="عنوان دوره"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              placeholder="مثال: شارژ آبان ۱۴۰۳"
              required
            />
            <div className="space-y-1.5 text-right">
              <label className="block text-xs font-medium text-slate-300">نوع دوره</label>
              <select
                value={periodType}
                onChange={(e: any) => setPeriodType(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="MONTHLY">ماهانه عادی</option>
                <option value="EMERGENCY">اضطراری / پروژه‌ای</option>
                <option value="ANNUAL">سالانه</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <h4 className="text-xs font-bold text-slate-200 mb-3">ریز مبالغ فاکتورها و قبوض:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MoneyInput
                label="شارژ ثابت پایه (تقسیم مساوی بین واحدها)"
                value={fixedCost}
                onChange={setFixedCost}
              />
              <MoneyInput
                label="قبض آب مصرفی مشترک (تقسیم بر اساس نفرات)"
                value={waterCost}
                onChange={setWaterCost}
              />
              <MoneyInput
                label="قبض گاز مصرفی (واحدهای دارای پکیج مستقل معاف هستند)"
                value={gasCost}
                onChange={setGasCost}
              />
              <MoneyInput
                label="قبض برق مشاعات و آسانسور (تقسیم مساوی)"
                value={electricityCost}
                onChange={setElectricityCost}
              />
              <MoneyInput
                label="هزینه‌های متفرقه، خدمات و سرایداری"
                value={incidentalCost}
                onChange={setIncidentalCost}
              />
              <Input
                label="توضیحات خدمات متفرقه"
                value={incidentalDesc}
                onChange={(e) => setIncidentalDesc(e.target.value)}
                placeholder="مثلاً نظافت راه‌پله و سرویس آسانسور"
              />
              <MoneyInput
                label="هزینه‌های متراژی بر اساس ماده ۴ (تعمیرات سازه‌ای و اساسی)"
                value={areaExpenseTotal}
                onChange={setAreaExpenseTotal}
                helperText="تسهیم دقیق بر اساس نسبت مساحت هر واحد به کل متراژ"
              />
              <MoneyInput
                label="پروژه‌های خاص یا اضطراری"
                value={specialTotalCost}
                onChange={setSpecialTotalCost}
              />
            </div>
          </div>

          {/* Rounding settings */}
          <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="roundUp"
                checked={roundUp}
                onChange={(e) => setRoundUp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="roundUp" className="text-xs text-slate-200 cursor-pointer">
                گرد کردن محاسباتی به سمت بالا (الگوریتم بزرگترین باقیمانده برای صفر شدن انحراف)
              </label>
            </div>
            <span className="text-xs text-slate-400 font-mono">گام: ۵۰,۰۰۰ تومان</span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              ثبت پیش‌نویس و محاسبه سهم واحدها
            </Button>
          </div>
        </form>
      </Modal>

      {/* Calculation Preview Matrix Modal */}
      <Modal
        isOpen={!!previewPeriod}
        onClose={() => setPreviewPeriod(null)}
        title={`پیش‌نمایش تسهیم شارژ دوره: ${previewPeriod?.name}`}
        description="بررسی سهم هر واحد پیش از انتشار رسمی (تضمین صفر بودن انحراف محاسباتی Δ = 0)"
        size="2xl"
      >
        {isPreviewLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">
            در حال محاسبه الگوریتم تسهیم و توزیع باقیمانده...
          </div>
        ) : previewResult ? (
          <div className="space-y-4">
            {/* Conservation Verification Header */}
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-bold">
                  انحراف محاسباتی: {previewResult.conservationDelta === 0 ? '۰ تومان (تطبیق ۱۰۰٪ دقیق)' : previewResult.conservationDelta}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-300 font-mono num-tabular">
                <span>کل ورودی فاکتورها: {formatToman(previewResult.totalInputExpenses)} تومان</span>
                <span>کل شارژ تسهیم‌شده: {formatToman(previewResult.totalDistributed)} تومان</span>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto max-h-80 border border-slate-800 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">واحد</th>
                    <th className="p-2.5">ثابت</th>
                    <th className="p-2.5">آب (نفرات)</th>
                    <th className="p-2.5">گاز (پکیج)</th>
                    <th className="p-2.5">برق مشاعات</th>
                    <th className="p-2.5">خدمات</th>
                    <th className="p-2.5">متراژی (ماده ۴)</th>
                    <th className="p-2.5">پروژه خاص</th>
                    <th className="p-2.5">تعدیل رند</th>
                    <th className="p-2.5 font-bold text-slate-200">سهم نهایی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono num-tabular text-slate-300">
                  {(previewResult.charges || []).map((c: any) => (
                    <tr key={c.unitId} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-bold text-white">واحد {toFaDigit(c.unitNumber)}</td>
                      <td className="p-2.5">{formatToman(c.fixed)}</td>
                      <td className="p-2.5">{formatToman(c.water)}</td>
                      <td className="p-2.5">{formatToman(c.gas)}</td>
                      <td className="p-2.5">{formatToman(c.electricity)}</td>
                      <td className="p-2.5">{formatToman(c.incidental)}</td>
                      <td className="p-2.5">{formatToman(c.areaShare)}</td>
                      <td className="p-2.5">{formatToman(c.specialShare)}</td>
                      <td className="p-2.5 text-slate-500">
                        {c.roundingDelta > 0 ? `+${c.roundingDelta}` : c.roundingDelta}
                      </td>
                      <td className="p-2.5 font-bold text-brand-300">
                        {formatToman(c.totalCharge)} تومان
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <Button variant="outline" onClick={() => setPreviewPeriod(null)}>
                بستن
              </Button>
              {previewPeriod.status === 'DRAFT' && (
                <Button
                  variant="primary"
                  onClick={() => handlePublish(previewPeriod.id)}
                  isLoading={isPublishing}
                  iconStart={<CheckCircle2 className="w-4 h-4" />}
                >
                  تایید و انتشار رسمی دوره (ارسال برای ساکنین)
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
