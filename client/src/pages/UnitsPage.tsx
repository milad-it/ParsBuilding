import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { unitApi } from '@/services/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { toast } from '@/store/uiStore';
import { formatToman, toFaDigit } from '@/utils/formatters';
import {
  Home,
  Plus,
  Edit2,
  FileText,
  CreditCard,
  Flame,
  Users,
  Building,
  Check
} from 'lucide-react';

const SAMPLE_UNITS = [
  { id: 'unt-1', unitNumber: 1, floor: 1, area: 95, occupants: 3, currentBalance: 0, isOccupied: true, ownerName: 'رضا کمالی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-2', unitNumber: 2, floor: 1, area: 110, occupants: 4, currentBalance: -450000, isOccupied: true, ownerName: 'علی رضایی', tenantName: null, hasPackage: false, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-3', unitNumber: 3, floor: 2, area: 85, occupants: 2, currentBalance: 120000, isOccupied: true, ownerName: 'محسن کریمی', tenantName: 'صادقی', hasPackage: false, occupancyType: 'TENANT' },
  { id: 'unt-4', unitNumber: 4, floor: 2, area: 120, occupants: 4, currentBalance: 0, isOccupied: true, ownerName: 'مریم نوری', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-5', unitNumber: 5, floor: 3, area: 105, occupants: 3, currentBalance: -680000, isOccupied: true, ownerName: 'حسین احمدی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-6', unitNumber: 6, floor: 3, area: 90, occupants: 2, currentBalance: 0, isOccupied: false, ownerName: 'فرهاد طاهری', tenantName: null, hasPackage: false, occupancyType: 'VACANT' },
  { id: 'unt-7', unitNumber: 7, floor: 4, area: 115, occupants: 3, currentBalance: -250000, isOccupied: true, ownerName: 'جعفر مرادی', tenantName: null, hasPackage: false, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-8', unitNumber: 8, floor: 4, area: 130, occupants: 5, currentBalance: 300000, isOccupied: true, ownerName: 'سعید باقری', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-9', unitNumber: 9, floor: 5, area: 140, occupants: 4, currentBalance: 0, isOccupied: true, ownerName: 'امیر ابراهیمی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
  { id: 'unt-10', unitNumber: 10, floor: 5, area: 150, occupants: 4, currentBalance: -1100000, isOccupied: true, ownerName: 'کیوان رحیمی', tenantName: null, hasPackage: true, occupancyType: 'OWNER_OCCUPIED' },
];

export const UnitsPage: React.FC<{
  selectedUnitId?: string | null;
  onOpenPaymentForUnit?: (unitId: string) => void;
}> = ({ selectedUnitId, onOpenPaymentForUnit }) => {
  const { activeComplexId } = useAuthStore();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DEBTORS' | 'VACANT' | 'TENANT' | 'PACKAGE'>('ALL');

  // Modals
  const [editingUnit, setEditingUnit] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statementUnit, setStatementUnit] = useState<any | null>(null);
  const [statementData, setStatementData] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Form state
  const [formUnitNumber, setFormUnitNumber] = useState<number>(1);
  const [formUnitName, setFormUnitName] = useState<string>('');
  const [formFloor, setFormFloor] = useState<number>(1);
  const [formArea, setFormArea] = useState<number>(90);
  const [formOccupants, setFormOccupants] = useState<number>(3);
  const [formOccType, setFormOccType] = useState<string>('OWNER_OCCUPIED');
  const [formHasPackage, setFormHasPackage] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchUnits = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const res = await unitApi.getAll({ complexId: activeComplexId });
      const data = res.data || [];
      setUnits(data.length > 0 ? data : SAMPLE_UNITS);
    } catch {
      setUnits(SAMPLE_UNITS);
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  // Open statement if selectedUnitId is passed
  useEffect(() => {
    if (selectedUnitId && units.length > 0) {
      const u = units.find((x) => x.id === selectedUnitId);
      if (u) handleOpenStatement(u);
    }
  }, [selectedUnitId, units]);

  // Quick occupancy toggle
  const handleQuickOccupancyToggle = async (unit: any, nextType: string) => {
    try {
      await unitApi.updateOccupancy(unit.id, {
        occType: nextType,
        occupants: nextType === 'VACANT' ? 0 : Math.max(1, unit.occupants || 1)
      });
      toast.success(`وضعیت واحد ${unit.unitNumber} بروزرسانی شد`);
      // Optimistic update
      setUnits((prev) =>
        prev.map((u) =>
          u.id === unit.id
            ? { ...u, occType: nextType, occupants: nextType === 'VACANT' ? 0 : u.occupants }
            : u
        )
      );
    } catch {
      toast.error('خطا در بروزرسانی وضعیت سکونت');
    }
  };

  const handleOpenEdit = (unit: any) => {
    setEditingUnit(unit);
    setFormUnitNumber(unit.unitNumber);
    setFormUnitName(unit.unitName || '');
    setFormFloor(unit.floor ?? 1);
    setFormArea(Number(unit.area || 0));
    setFormOccupants(unit.occupants || 0);
    setFormOccType(unit.occType || 'OWNER_OCCUPIED');
    setFormHasPackage(!!unit.hasPackage);
    setIsEditModalOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplexId) return;
    setIsSaving(true);
    try {
      const payload = {
        unitNumber: formUnitNumber,
        unitName: formUnitName || undefined,
        floor: formFloor,
        area: formArea,
        occupants: formOccupants,
        occType: formOccType,
        hasPackage: formHasPackage
      };

      if (editingUnit) {
        await unitApi.update(editingUnit.id, payload);
        toast.success(`واحد ${formUnitNumber} با موفقیت ویرایش شد`);
      } else {
        await unitApi.create({ ...payload, complexId: activeComplexId });
        toast.success(`واحد جدید ${formUnitNumber} ایجاد گردید`);
      }
      setIsEditModalOpen(false);
      setIsCreateModalOpen(false);
      fetchUnits();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره اطلاعات واحد');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenStatement = async (unit: any) => {
    setStatementUnit(unit);
    setStatementLoading(true);
    try {
      const res = await unitApi.getStatement(unit.id);
      setStatementData(res.data);
    } catch {
      toast.error('خطا در دریافت صورت‌حساب واحد');
    } finally {
      setStatementLoading(false);
    }
  };

  const filteredUnits = units.filter((u) => {
    if (activeFilter === 'DEBTORS') return Number(u.currentBalance || 0) > 0;
    if (activeFilter === 'VACANT') return u.occType === 'VACANT';
    if (activeFilter === 'TENANT') return u.occType === 'TENANT_OCCUPIED';
    if (activeFilter === 'PACKAGE') return u.hasPackage;
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'unitNumber',
      header: 'شماره واحد',
      render: (u) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
            {toFaDigit(u.unitNumber)}
          </span>
          <span className="font-semibold text-slate-200">{u.unitName || `واحد ${toFaDigit(u.unitNumber)}`}</span>
        </div>
      )
    },
    {
      key: 'floor',
      header: 'طبقه',
      align: 'center',
      render: (u) => <span className="font-mono text-slate-300 num-tabular">{toFaDigit(u.floor ?? '-')}</span>
    },
    {
      key: 'area',
      header: 'متراژ (متر)',
      align: 'center',
      render: (u) => (
        <span className="font-mono text-slate-300 num-tabular">
          {toFaDigit(Math.round(Number(u.area || 0)))}
        </span>
      )
    },
    {
      key: 'occupants',
      header: 'تعداد نفرات',
      align: 'center',
      render: (u) => (
        <span className="inline-flex items-center gap-1 font-mono text-slate-300 num-tabular">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          {toFaDigit(u.occupants || 0)}
        </span>
      )
    },
    {
      key: 'hasPackage',
      header: 'سیستم گرمایش',
      align: 'center',
      render: (u) =>
        u.hasPackage ? (
          <Badge variant="amber" size="sm">
            <Flame className="w-3 h-3 me-1 text-amber-400" />
            پکیج مستقل
          </Badge>
        ) : (
          <span className="text-[11px] text-slate-400">موتورخانه مرکزی</span>
        )
    },
    {
      key: 'occType',
      header: 'وضعیت سکونت',
      render: (u) => (
        <select
          value={u.occType || 'OWNER_OCCUPIED'}
          onChange={(e) => handleQuickOccupancyToggle(u, e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
        >
          <option value="OWNER_OCCUPIED">مالک ساکن</option>
          <option value="TENANT_OCCUPIED">مستأجر</option>
          <option value="VACANT">خالی از سکنه</option>
        </select>
      )
    },
    {
      key: 'currentBalance',
      header: 'مانده حساب',
      render: (u) => {
        const bal = Number(u.currentBalance || 0);
        const isDebt = bal > 0;
        return (
          <Badge variant={isDebt ? 'rose' : 'emerald'} size="md">
            <span className="font-mono num-tabular">
              {isDebt ? `+${formatToman(bal)} بدهکار` : `${formatToman(Math.abs(bal))} تسویه`}
            </span>
          </Badge>
        );
      }
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (u) => (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => handleOpenStatement(u)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            title="صورت‌حساب واحد"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpenPaymentForUnit?.(u.id)}
            className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="ثبت واریزی برای این واحد"
          >
            <CreditCard className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenEdit(u)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            title="ویرایش مشخصات"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* Page Title & Add Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">مدیریت واحدها و ساکنین</h2>
          <p className="text-xs text-slate-400 mt-1">
            مشخصات فیزیکی، متراژ، نفرات ساکن و تراز حساب جاری هر واحد
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setEditingUnit(null);
            setFormUnitNumber(units.length + 1);
            setFormUnitName('');
            setFormFloor(1);
            setFormArea(90);
            setFormOccupants(3);
            setFormOccType('OWNER_OCCUPIED');
            setFormHasPackage(false);
            setIsCreateModalOpen(true);
          }}
          iconStart={<Plus className="w-4 h-4" />}
        >
          افزودن واحد جدید
        </Button>
      </div>

      {/* Quick Filter Segmented Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'ALL'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
          }`}
        >
          همه واحدها ({toFaDigit(units.length)})
        </button>
        <button
          onClick={() => setActiveFilter('DEBTORS')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'DEBTORS'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-900 text-rose-400 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          واحدهای بدهکار ({toFaDigit(units.filter((u) => Number(u.currentBalance || 0) > 0).length)})
        </button>
        <button
          onClick={() => setActiveFilter('VACANT')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'VACANT'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          واحدهای خالی ({toFaDigit(units.filter((u) => u.occType === 'VACANT').length)})
        </button>
        <button
          onClick={() => setActiveFilter('TENANT')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'TENANT'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          مستأجران ({toFaDigit(units.filter((u) => u.occType === 'TENANT_OCCUPIED').length)})
        </button>
        <button
          onClick={() => setActiveFilter('PACKAGE')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'PACKAGE'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-amber-400 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          دارای پکیج مستقل ({toFaDigit(units.filter((u) => u.hasPackage).length)})
        </button>
      </div>

      {/* Main Units Data Table */}
      <DataTable
        columns={columns}
        data={filteredUnits}
        keyExtractor={(u) => u.id}
        searchPlaceholder="جستجو بر اساس شماره واحد، نام..."
        searchFilter={(u, q) =>
          String(u.unitNumber).includes(q) ||
          (u.unitName && u.unitName.includes(q))
        }
        isLoading={loading}
      />

      {/* Create / Edit Unit Modal */}
      <Modal
        isOpen={isEditModalOpen || isCreateModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setIsCreateModalOpen(false);
        }}
        title={editingUnit ? `ویرایش واحد ${editingUnit.unitNumber}` : 'ثبت واحد جدید در مجتمع'}
        description="مشخصات فیزیکی جهت تسهیم عادلانه هزینه‌ها و قبوض"
      >
        <form onSubmit={handleSaveUnit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="شماره واحد"
              type="number"
              value={formUnitNumber}
              onChange={(e) => setFormUnitNumber(Number(e.target.value))}
              required
            />
            <Input
              label="نام / عنوان اختیاری (مثلاً واحد ۴ شرقی)"
              value={formUnitName}
              onChange={(e) => setFormUnitName(e.target.value)}
            />
            <Input
              label="شماره طبقه"
              type="number"
              value={formFloor}
              onChange={(e) => setFormFloor(Number(e.target.value))}
              required
            />
            <Input
              label="متراژ خالص واحد (مترمربع)"
              type="number"
              value={formArea}
              onChange={(e) => setFormArea(Number(e.target.value))}
              required
            />
            <Input
              label="تعداد نفرات ساکن"
              type="number"
              value={formOccupants}
              onChange={(e) => setFormOccupants(Number(e.target.value))}
              required
            />
            <div className="space-y-1.5 text-right">
              <label className="block text-xs font-medium text-slate-300">نوع سکونت</label>
              <select
                value={formOccType}
                onChange={(e) => setFormOccType(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="OWNER_OCCUPIED">سکونت مالک</option>
                <option value="TENANT_OCCUPIED">مستأجر</option>
                <option value="VACANT">واحد خالی</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="hasPackage"
              checked={formHasPackage}
              onChange={(e) => setFormHasPackage(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="hasPackage" className="text-xs text-slate-200 cursor-pointer">
              واحد دارای پکیج و سیستم گرمایش مستقل است (معاف از هزینه گاز مشترک موتورخانه)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setIsCreateModalOpen(false);
              }}
            >
              انصراف
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              ذخیره اطلاعات
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unit Statement Modal */}
      <Modal
        isOpen={!!statementUnit}
        onClose={() => setStatementUnit(null)}
        title={`صورت‌حساب مالی واحد ${statementUnit?.unitNumber}`}
        description="ریز محاسبات شارژ، سوابق پرداختی و وضعیت بدهی/بستانکاری"
        size="lg"
      >
        {statementLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">در حال دریافت صورت‌حساب...</div>
        ) : statementData ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-xs text-slate-400">مانده تراز فعلی واحد:</span>
                <p
                  className={`text-xl font-bold font-mono num-tabular mt-1 ${
                    Number(statementData.unit?.currentBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {Number(statementData.unit?.currentBalance || 0) > 0
                    ? `+${formatToman(statementData.unit?.currentBalance)} تومان بدهکار`
                    : `${formatToman(Math.abs(statementData.unit?.currentBalance || 0))} تومان تسویه`}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const uid = statementUnit.id;
                  setStatementUnit(null);
                  onOpenPaymentForUnit?.(uid);
                }}
                iconStart={<CreditCard className="w-4 h-4" />}
              >
                ثبت واریزی این واحد
              </Button>
            </div>

            {/* Recent Charges */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">سوابق شارژ دوره‌ها:</h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {(statementData.charges || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">شارژی ثبت نشده است</p>
                ) : (
                  statementData.charges.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-200">
                          {c.period?.name || `دوره ${c.periodId?.substring(0, 8)}`}
                        </span>
                        <span className="ms-2 text-[10px] text-slate-400">
                          (سهم ثابت + متراژی + قبوض)
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-100 num-tabular">
                        {formatToman(c.amount)} تومان
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">سوابق تراکنش‌های واریزی:</h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {(statementData.transactions || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">تراکنشی ثبت نشده است</p>
                ) : (
                  statementData.transactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-emerald-400">واریز وجه</span>
                        <span className="ms-2 text-[10px] text-slate-400">{tx.description}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 num-tabular">
                        {formatToman(tx.amount)} تومان
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
