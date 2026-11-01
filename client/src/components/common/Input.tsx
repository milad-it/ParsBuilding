import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, iconStart, iconEnd, disabled, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && <label className="block text-xs font-medium text-slate-300">{label}</label>}
        <div
          className={cn(
            'relative flex items-center rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2 transition-all focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20',
            error && 'border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-500/20',
            disabled && 'opacity-50 pointer-events-none'
          )}
        >
          {iconStart && <span className="ms-1 me-2 text-slate-400">{iconStart}</span>}
          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none',
              className
            )}
            {...props}
          />
          {iconEnd && <span className="ms-2 me-1 text-slate-400">{iconEnd}</span>}
        </div>
        {error ? (
          <p className="text-xs text-rose-400 pr-1">{error}</p>
        ) : (
          helperText && <p className="text-xs text-slate-400 pr-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
