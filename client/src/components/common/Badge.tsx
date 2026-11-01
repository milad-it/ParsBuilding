import React from 'react';
import { cn } from '@/utils/cn';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'rose' | 'amber' | 'brand' | 'slate' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200',
    brand: 'bg-brand-50 text-brand-700 border border-brand-200',
    slate: 'bg-stone-100 text-stone-700 border border-stone-200',
    outline: 'bg-transparent text-stone-600 border border-stone-200'
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-1 rounded-lg font-semibold'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 select-none transition-colors',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
};
