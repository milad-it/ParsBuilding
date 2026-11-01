import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { complexApi, migrationApi } from '@/services/api';
import { migrationBridge } from '@/services/migrationBridge';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { MoneyInput } from '@/components/common/MoneyInput';
import { toast } from '@/store/uiStore';
import { formatToman } from '@/utils/formatters';
import { Settings, Database, Upload, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { activeComplexId } = useAuthStore();
  const [complexData, setComplexData] = useState<any>({
    name: 'برج مسکونی پارس',
    address: 'تهران، خیابان ولیعصر',
    initialFund: 50000000
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    if (activeComplexId) {
      complexApi.getById(activeComplexId)
        .then((res) => {
          if (res.data) setComplexData(res.data);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [activeComplexId]);

  const handleSaveComplex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplexId) return;
    setIsSaving(true);
    try {
      await complexApi.update(activeComplexId, {
        name: complexData.name,
        address: complexData.address,
        initialFund: complexData.initialFund
      });
      toast.success('تنظیمات ساختمان با موفقیت ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره تنظیمات ساختمان');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunMigration = async () => {
    if (!activeComplexId) return;
    setIsMigrating(true);
    try {
      const detection = await migrationBridge.detectLegacyData();
      if (!detection.hasLegacyData || !detection.rawPayload) {
        toast.info('داده قدیمی در مرورگر یافت نشد یا قبلاً مهاجرت انجام شده است');
        return;
      }
      const result = await migrationBridge.executeMigration(activeComplexId, detection.rawPayload);
      if (result.success) {
        toast.success(`مهاجرت موفقیت‌آمیز بود: ${result.unitsImported} واحد و ${result.periodsImported} دوره همگام شدند`);
      } else {
        toast.warning('مهاجرت با اختلاف در مبالغ تراز ثبت گردید');
      }
    } catch {
      toast.info('داده‌های مرورگر آماده مهاجرت یا سیستم به صورت ابری همگام است');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div dir="rtl" className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-brand-600" />
          <span>تنظیمات مجتمع و همگام‌سازی اطلاعات</span>
        </h2>
        <p className="text-xs text-stone-500 mt-1">
          تنظیمات نام ساختمان، موجودی اولیه صندوق و پل مهاجرت داده‌های نسخه‌های پیشین
        </p>
      </div>

      {/* Building Profile Form */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-stone-800 border-b border-stone-100 pb-3">
          مشخصات کلی ساختمان
        </h3>

        <form onSubmit={handleSaveComplex} className="space-y-4">
          <Input
            label="نام ساختمان / مجتمع"
            value={complexData.name || ''}
            onChange={(e) => setComplexData({ ...complexData, name: e.target.value })}
            required
          />

          <Input
            label="آدرس پستی مجتمع"
            value={complexData.address || ''}
            onChange={(e) => setComplexData({ ...complexData, address: e.target.value })}
          />

          <MoneyInput
            label="موجودی اولیه تنخواه صندوق (تومان)"
            value={Number(complexData.initialFund || 0)}
            onChange={(val) => setComplexData({ ...complexData, initialFund: val })}
            helperText="موجودی تنخواه‌گردان ثبت‌شده در اساسنامه ساختمان"
          />

          <div className="flex justify-end pt-3 border-t border-stone-200">
            <Button type="submit" variant="primary" isLoading={isSaving}>
              ذخیره تغییرات
            </Button>
          </div>
        </form>
      </div>

      {/* Migration Bridge Box */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-200">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-800">پل مهاجرت اطلاعات محلی (IndexedDB / LocalStorage)</h3>
            <p className="text-xs text-stone-500">
              انتقال خودکار سوابق مالی، دوره‌ها و واحدها از نسخه آفلاین قدیمی به پایگاه‌داده چندمستأجره ابری
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-stone-50 p-4 border border-stone-200 text-xs text-stone-600 leading-relaxed">
          پل مهاجرت تمامی کلیدهای ذخیره‌سازی محلی قبلی را اعتبارسنجی نموده و بدون هیچ‌گونه حذف اطلاعات قبلی، آنها را با سرور ابری PostgreSQL تجمیع می‌کند.
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="secondary"
            onClick={handleRunMigration}
            isLoading={isMigrating}
            iconStart={<Upload className="w-4 h-4 text-brand-600" />}
          >
            آغاز همگام‌سازی و مهاجرت داده‌ها
          </Button>
        </div>
      </div>
    </div>
  );
};
