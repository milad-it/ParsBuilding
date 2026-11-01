import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { auditApi } from '@/services/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatJalaliDateTime } from '@/utils/jalali';
import { ShieldCheck, Eye, Activity, Terminal } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { activeComplexId } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const res = await auditApi.getAll({ complexId: activeComplexId, limit: 100 });
      setLogs(res.data?.logs || res.data || []);
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns: Column<any>[] = [
    {
      key: 'timestamp',
      header: 'زمان ثبت رویداد',
      render: (log) => (
        <span className="text-xs text-stone-500 num-tabular">
          {formatJalaliDateTime(log.timestamp || log.createdAt)}
        </span>
      )
    },
    {
      key: 'action',
      header: 'عملیات',
      align: 'center',
      render: (log) => {
        const actionMap: Record<string, { label: string; variant: any }> = {
          START_PERIOD: { label: 'انتشار دوره شارژ', variant: 'brand' },
          CLOSE_PERIOD: { label: 'بستن دوره مالی', variant: 'rose' },
          SETTLE_DEBT: { label: 'ثبت واریز و تسویه', variant: 'emerald' },
          CREATE: { label: 'ایجاد موجودیت', variant: 'brand' },
          UPDATE: { label: 'ویرایش اطلاعات', variant: 'amber' },
          DELETE: { label: 'حذف داده', variant: 'rose' }
        };
        const a = actionMap[log.action] || { label: log.action, variant: 'slate' };
        return <Badge variant={a.variant}>{a.label}</Badge>;
      }
    },
    {
      key: 'entityType',
      header: 'موجودیت هدف',
      align: 'center',
      render: (log) => (
        <span className="font-mono text-xs text-stone-600">{log.entityType || '-'}</span>
      )
    },
    {
      key: 'actorId',
      header: 'شناسه کاربر / نقش',
      render: (log) => (
        <div>
          <span className="text-xs font-semibold text-stone-800">
            {log.actor?.fullName || log.actorId?.substring(0, 12) || 'سیستم خودکار'}
          </span>
          {log.ipAddress && (
            <p className="text-[10px] font-mono text-stone-500">IP: {log.ipAddress}</p>
          )}
        </div>
      )
    },
    {
      key: 'details',
      header: 'بررسی تغییرات',
      align: 'center',
      render: (log) => (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setSelectedLog(log)}
          iconStart={<Eye className="w-3.5 h-3.5" />}
        >
          مشاهده Diff
        </Button>
      )
    }
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          <span>گزارشات تغییرات و ردپای حسابرسی (Audit Trail)</span>
        </h2>
        <p className="text-xs text-stone-500 mt-1">
          دفتر ثبت تغییرات غیرقابل ویرایش (Append-Only) جهت رصد هرگونه تغییر در تراز مالی و تنظیمات
        </p>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={logs}
        keyExtractor={(l) => l.id}
        searchPlaceholder="جستجو در رویدادها، موجودیت یا شناسه..."
        searchFilter={(l, q) =>
          (l.action && l.action.toLowerCase().includes(q.toLowerCase())) ||
          (l.entityType && l.entityType.toLowerCase().includes(q.toLowerCase())) ||
          (l.ipAddress && l.ipAddress.includes(q))
        }
        isLoading={loading}
      />

      {/* Before / After Diff Inspector Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`بررسی تغییرات: ${selectedLog?.action}`}
        description={`ثبت شده در ${formatJalaliDateTime(selectedLog?.timestamp)} توسط ${selectedLog?.actor?.fullName || 'سیستم'}`}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1 rounded-xl bg-stone-50 p-3 border border-stone-200">
                <span className="font-bold text-stone-500">شناسه رکورد:</span>
                <p className="font-mono text-stone-800 truncate">{selectedLog.entityId || '-'}</p>
              </div>
              <div className="space-y-1 rounded-xl bg-stone-50 p-3 border border-stone-200">
                <span className="font-bold text-stone-500">آدرس آی‌پی:</span>
                <p className="font-mono text-stone-800">{selectedLog.ipAddress || '-'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-brand-600" />
                <span>داده‌های تغییر یافته (JSON Payload):</span>
              </h4>
              <pre className="rounded-xl bg-stone-900 p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-64 border border-stone-800 dir-ltr text-left">
                {JSON.stringify(selectedLog.details || selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
