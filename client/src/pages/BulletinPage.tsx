import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { announcementApi } from '@/services/api';
import { wsClient } from '@/services/websocket';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { toast } from '@/store/uiStore';
import { formatJalaliDateTime } from '@/utils/jalali';
import { Megaphone, Plus, Pin, Trash2, Calendar, UserCheck } from 'lucide-react';

const SAMPLE_NOTICES = [
  {
    id: 'ann-1',
    title: 'جلسه مجمع عمومی سالیانه ساختمان',
    content: 'به اطلاع کلیه مالکین و ساکنین محترم می‌رساند مجمع عمومی سالیانه به منظور بررسی بیلان مالی و تصمیم‌گیری در خصوص نقاشی مشاعات در سالن اجتماعات برگزار می‌گردد.',
    category: 'MEETING',
    isPinned: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'ann-2',
    title: 'سرویس و بازرسی دوره‌ای آسانسور و چاله موتورخانه',
    content: 'سرویس‌کار مجاز استاندارد آسانسور روز دوشنبه جهت بازرسی فنی و تعویض لنت ترمز در محل حاضر خواهد بود. لطفاً در این ساعات از آسانسور تردد نفرمایید.',
    category: 'MAINTENANCE',
    isPinned: false,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'ann-3',
    title: 'رعایت نظافت پارکینگ و عدم قرار دادن وسایل اضافی',
    content: 'بر اساس مصوبه هیئت مدیره ساختمان، قرار دادن وسایل اضافی، لاستیک و کارتن در محوطه پارکینگ واحدها ممنوع است.',
    category: 'RULES',
    isPinned: false,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  }
];

export const BulletinPage: React.FC = () => {
  const { activeComplexId, user } = useAuthStore();
  const [announcements, setAnnouncements] = useState<any[]>(SAMPLE_NOTICES);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    if (!activeComplexId) return;
    setLoading(true);
    try {
      const res = await announcementApi.getAll({ complexId: activeComplexId });
      const data = res.data || [];
      setAnnouncements(data.length > 0 ? data : SAMPLE_NOTICES);
    } catch {
      setAnnouncements(SAMPLE_NOTICES);
    } finally {
      setLoading(false);
    }
  }, [activeComplexId]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Real-time WebSocket listener
  useEffect(() => {
    if (!activeComplexId) return;
    const unsub = wsClient.on('announcement:created', (data) => {
      setAnnouncements((prev) => [data, ...prev]);
      toast.info(`اطلاعیه جدید: ${data.title}`);
    });
    return () => {
      unsub();
    };
  }, [activeComplexId]);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await announcementApi.create({
        title: title.trim(),
        content: content.trim()
      });
      toast.success('اطلاعیه با موفقیت بر روی تابلوی دیجیتال ساختمان منتشر شد');
      setIsModalOpen(false);
      setTitle('');
      setContent('');
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در انتشار اطلاعیه');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    if (!confirm('آیا از حذف این اطلاعیه اطمینان دارید؟')) return;
    try {
      await announcementApi.delete(id);
      toast.success('اطلاعیه حذف شد');
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error('خطا در حذف اطلاعیه');
    }
  };

  const isManager = user?.role !== 'RESIDENT';

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-brand-600" />
            <span>تابلو اعلانات دیجیتال ساختمان</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            اطلاعیه‌های هیئت مدیره، جلسات مجمع عمومی، زمان‌بندی نظافت و سرویس‌های تاسیسات
          </p>
        </div>
        {isManager && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            iconStart={<Plus className="w-4 h-4" />}
          >
            انتشار اطلاعیه جدید
          </Button>
        )}
      </div>

      {/* Announcements Stream */}
      {loading ? (
        <div className="py-20 text-center text-xs text-stone-400">در حال بارگذاری اطلاعیه‌ها...</div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-stone-400 mx-auto" />
          <h4 className="text-sm font-bold text-stone-800">تابلو اعلانات خالی است</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            هنوز اطلاعیه یا خبری برای ساکنین این مجتمع منتشر نشده است.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {announcements.map((item, idx) => {
            const isPinned = idx === 0; // Pin latest announcement
            return (
              <div
                key={item.id}
                className={`relative rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 space-y-3 ${
                  isPinned
                    ? 'border-brand-200 bg-brand-50/40 shadow-brand-500/5'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isPinned && (
                      <Badge variant="brand" size="sm">
                        <Pin className="w-3 h-3 text-brand-600 me-0.5" />
                        سنجاق‌شده
                      </Badge>
                    )}
                    <h3 className="text-sm font-black text-stone-900">{item.title}</h3>
                  </div>
                  {isManager && (
                    <button
                      onClick={() => handleDeleteNotice(item.id)}
                      className="rounded-lg p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="حذف اطلاعیه"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                  {item.content}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-brand-600" />
                    <span className="font-medium text-stone-700">مدیریت ساختمان</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-sans num-tabular">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    <span>{formatJalaliDateTime(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Notice Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="انتشار اطلاعیه جدید برای کلیه ساکنین"
        description="این پیام بلافاصله در پرتال ساکنین و تابلوی اعلانات نمایش داده می‌شود."
        size="md"
      >
        <form onSubmit={handleCreateNotice} className="space-y-4">
          <Input
            label="موضوع یا تیتر اطلاعیه"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: جلسه مجمع عمومی ساختمان روز پنج‌شنبه"
            required
          />

          <div className="space-y-1.5 text-right">
            <label className="block text-xs font-semibold text-stone-700">متن پیام یا بخشنامه</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="شرح جزئیات اطلاعیه..."
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-800 placeholder-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/15 leading-relaxed"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              انتشار رسمی در تابلو
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
