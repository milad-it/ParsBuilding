import React, { forwardRef, useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { toEnDigit, formatToman, num2persian } from '@/utils/formatters';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  helperText?: string;
  error?: string;
  showWords?: boolean;
  unit?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, label, helperText, error, showWords = true, unit = 'تومان', className, disabled, ...props }, ref) => {
    const [displayVal, setDisplayVal] = useState<string>('');

    useEffect(() => {
      if (value !== undefined && value !== null) {
        setDisplayVal(value === 0 ? '' : formatToman(value));
      }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cleanEn = toEnDigit(raw).replace(/[^0-9-]/g, '');
      const parsed = parseInt(cleanEn, 10);
      const numericVal = isNaN(parsed) ? 0 : parsed;

      setDisplayVal(numericVal === 0 ? '' : formatToman(numericVal));
      onChange(numericVal);
    };

    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && <label className="block text-xs font-semibold text-stone-700">{label}</label>}
        <div
          className={cn(
            'relative rounded-xl border border-stone-300 bg-white shadow-xs focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/15 transition-all',
            error && 'border-rose-500 focus-within:border-rose-500'
          )}
        >
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            value={displayVal}
            onChange={handleInputChange}
            disabled={disabled}
            dir="ltr"
            className={cn(
              'w-full bg-transparent pr-3 pl-16 py-2.5 text-left font-sans text-base font-bold text-stone-800 placeholder-stone-400 focus:outline-none disabled:opacity-50',
              className
            )}
            placeholder="۰"
            {...props}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-500 select-none bg-stone-100 rounded-md px-1.5 py-0.5">
            {unit}
          </span>
        </div>
        {showWords && value !== 0 && (
          <p className="text-[11px] font-medium text-brand-700 bg-brand-50/80 border border-brand-200/60 rounded-md px-2 py-0.5 inline-block select-none animate-in fade-in">
            {num2persian(value)}
          </p>
        )}
        {error ? (
          <p className="text-xs text-rose-500 pr-1">{error}</p>
        ) : (
          helperText && <p className="text-xs text-stone-500 pr-1">{helperText}</p>
        )}
      </div>
    );
  }
);
MoneyInput.displayName = 'MoneyInput';
