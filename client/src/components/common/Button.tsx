import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'glass';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, iconStart, iconEnd, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none cursor-pointer';

    const variants = {
      primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30 hover:shadow-brand-500/50',
      secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/60',
      outline: 'border border-slate-700 text-slate-300 hover:bg-slate-800/80 hover:text-white',
      ghost: 'text-slate-300 hover:bg-slate-850 hover:text-white',
      danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30',
      success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30',
      glass: 'bg-slate-900/60 backdrop-blur-md border border-slate-700/40 text-slate-100 hover:bg-slate-800/60 shadow-glass'
    };

    const sizes = {
      xs: 'text-xs px-2.5 py-1.5 gap-1.5',
      sm: 'text-xs px-3 py-2 gap-2',
      md: 'text-sm px-4 py-2.5 gap-2.5',
      lg: 'text-base px-6 py-3 gap-3'
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-current" />}
        {!isLoading && iconStart && <span className="shrink-0">{iconStart}</span>}
        <span>{children}</span>
        {!isLoading && iconEnd && <span className="shrink-0">{iconEnd}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';
