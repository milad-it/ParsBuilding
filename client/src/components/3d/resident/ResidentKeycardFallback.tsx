import React, { useState } from 'react';
import { KeycardData } from './ResidentKeycardController';
import { formatToman, toFaDigit } from '@/utils/formatters';
import { RefreshCw, QrCode } from 'lucide-react';

export const ResidentKeycardFallback: React.FC<{ data: KeycardData }> = ({ data }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const isDebt = data.balance > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ perspective: '1000px' }}
        className="h-56 w-88 max-w-full cursor-pointer select-none"
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          className="relative h-full w-full rounded-2xl shadow-glass border border-slate-700/60"
        >
          {/* Front Face */}
          <div
            style={{ backfaceVisibility: 'hidden' }}
            dir="rtl"
            className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 p-5 border border-amber-500/30 text-right"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{data.complexName}</h3>
                <span className="text-[10px] text-slate-400">مجوز تردد دیجیتال هوشمند</span>
              </div>
              <div className="h-8 w-11 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-300 border border-amber-700 shadow-sm" />
            </div>

            <div>
              <h2 className="text-base font-extrabold text-slate-100">{data.residentName}</h2>
              <p className="text-xs font-semibold text-brand-400 mt-0.5">
                واحد {toFaDigit(data.unitNumber)} {data.floor !== undefined ? `— طبقه ${toFaDigit(data.floor)}` : ''}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  isDebt ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                {isDebt ? `بدهی: ${formatToman(data.balance)} تومان` : 'وضعیت: تسویه'}
              </span>
              <span className="font-mono text-[10px] text-slate-500 tracking-wider">{data.passCode}</span>
            </div>
          </div>

          {/* Back Face */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
            dir="rtl"
            className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-slate-900 p-5 border border-slate-700 text-right"
          >
            <div>
              <span className="text-[10px] text-slate-400">شماره کارت جهت واریز شارژ:</span>
              <p className="font-mono text-sm font-bold text-brand-300 tracking-wider text-left dir-ltr mt-0.5">
                {data.cardNumber || '۶۰۳۷-۹۹۷۵-۱۲۳۴-۵۶۷۸'}
              </p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400">شماره شبا:</span>
              <p className="font-mono text-xs font-bold text-slate-300 text-left dir-ltr mt-0.5">
                {data.sheba || 'IR000000000000000000000000'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-400">اسکن جهت پرداخت سریع</span>
              <QrCode className="w-8 h-8 text-slate-300" />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsFlipped(!isFlipped)}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{isFlipped ? 'مشاهده روی کارت' : 'مشاهده شماره حساب و شبا (پشت کارت)'}</span>
      </button>
    </div>
  );
};
