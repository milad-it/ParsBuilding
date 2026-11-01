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
    brand: 'border-brand-500/30 hover:border-brand-500/60 shadow-glow-brand/10',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60 shadow-glow-emerald/10',
    rose: 'border-rose-500/30 hover:border-rose-500/60 shadow-glow-rose/10',
    amber: 'border-amber-500/30 hover:border-amber-500/60',
    slate: 'border-slate-800 hover:border-slate-700'
  };

  const iconBgMap = {
    brand: 'bg-brand-500/10 text-brand-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-400',
    amber: 'bg-amber-500/10 text-amber-400',
    slate: 'bg-slate-800 text-slate-300'
  };

  return (
    <div
      dir="rtl"
      className={cn(
        'relative rounded-2xl bg-slate-900/80 backdrop-blur-md p-5 border transition-all duration-300 hover:-translate-y-0.5 shadow-glass',
        colorMap[color],
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        {icon && <div className={cn('p-2.5 rounded-xl', iconBgMap[color])}>{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl lg:text-3xl font-black text-slate-100 num-tabular tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs font-normal text-slate-400">{unit}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {subtitle && <span className="text-slate-400">{subtitle}</span>}
        {trend && (
          <span className={cn('font-bold num-tabular', trend.isPositive ? 'text-emerald-400' : 'text-rose-400')}>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
};
