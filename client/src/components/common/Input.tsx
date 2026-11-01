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
        {label && <label className="block text-xs font-semibold text-stone-700">{label}</label>}
        <div
          className={cn(
            'relative flex items-center rounded-xl border border-stone-300 bg-white px-3 py-2 transition-all focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/15',
            error && 'border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-500/20',
            disabled && 'opacity-50 pointer-events-none bg-stone-100'
          )}
        >
          {iconStart && <span className="ms-1 me-2 text-stone-400">{iconStart}</span>}
          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none',
              className
            )}
            {...props}
          />
          {iconEnd && <span className="ms-2 me-1 text-stone-400">{iconEnd}</span>}
        </div>
        {error ? (
          <p className="text-xs text-rose-600 pr-1">{error}</p>
        ) : (
          helperText && <p className="text-xs text-stone-500 pr-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
