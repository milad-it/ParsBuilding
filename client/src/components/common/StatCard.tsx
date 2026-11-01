import React from 'react';
import { cn } from '@/utils/cn';

export interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'brand' | 'emerald' | 'rose' | 'amber' | 'slate';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  trend,
  color = 'slate',
  className
}) => {
  const colorMap = {
    brand: 'border-brand-200/90 hover:border-brand-300',
    emerald: 'border-emerald-200/90 hover:border-emerald-300',
    rose: 'border-rose-200/90 hover:border-rose-300',
    amber: 'border-amber-200/90 hover:border-amber-300',
    slate: 'border-stone-200 hover:border-stone-300'
  };

  const iconBgMap = {
    brand: 'bg-brand-50 text-brand-700 border border-brand-200/60',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    rose: 'bg-rose-50 text-rose-700 border border-rose-200/60',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200/60',
    slate: 'bg-stone-100 text-stone-700 border border-stone-200'
  };

  return (
    <div
      dir="rtl"
      className={cn(
        'relative rounded-2xl bg-white p-5 border transition-all duration-300 hover:-translate-y-0.5 shadow-sm',
        colorMap[color],
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-600">{title}</span>
        {icon && <div className={cn('p-2.5 rounded-xl', iconBgMap[color])}>{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-sans text-2xl lg:text-3xl font-black text-stone-900 tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs font-bold text-stone-400 select-none">{unit}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-stone-100">
        {subtitle && <span className="text-stone-400 text-[11px] font-medium">{subtitle}</span>}
        {trend && (
          <span
            className={cn(
              'font-bold text-[10px] px-2 py-0.5 rounded-md',
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
};
