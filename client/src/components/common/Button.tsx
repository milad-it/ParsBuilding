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
      primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/20 active:bg-brand-800',
      secondary: 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 shadow-sm',
      outline: 'border border-stone-300 text-stone-700 hover:bg-stone-100 hover:text-stone-900',
      ghost: 'text-stone-700 hover:bg-stone-100 hover:text-stone-900',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/20',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
      glass: 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 shadow-sm'
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
