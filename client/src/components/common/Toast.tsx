import React from 'react';
import { useUIStore, ToastMessage } from '@/store/uiStore';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-brand-400 shrink-0" />
  };

  const borders = {
    success: 'border-emerald-500/30 bg-slate-900/95 shadow-glow-emerald/10',
    error: 'border-rose-500/30 bg-slate-900/95 shadow-glow-rose/10',
    warning: 'border-amber-500/30 bg-slate-900/95',
    info: 'border-brand-500/30 bg-slate-900/95 shadow-glow-brand/10'
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-glass backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 duration-200',
        borders[toast.type]
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 text-right">
        {toast.title && <h4 className="text-xs font-bold text-slate-100">{toast.title}</h4>}
        <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
        aria-label="بستن"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
