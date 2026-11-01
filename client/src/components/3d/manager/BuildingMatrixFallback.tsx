import React from 'react';
import { UnitSpatialData } from './BuildingMatrixController';
import { formatToman, toFaDigit } from '@/utils/formatters';

export interface BuildingMatrixFallbackProps {
  units: UnitSpatialData[];
  onSelectUnit?: (unit: UnitSpatialData) => void;
}

export const BuildingMatrixFallback: React.FC<BuildingMatrixFallbackProps> = ({ units, onSelectUnit }) => {
  // Group units by floor descending
  const floors = Array.from(new Set(units.map((u) => u.floor))).sort((a, b) => b - a);

  return (
    <div dir="rtl" className="w-full space-y-3 p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>نمای ماتریسی طبقات و وضعیت مالی واحدها</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>تسویه / بستانکار</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>بدهکار</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
            <span>خالی</span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {floors.map((floor) => {
          const floorUnits = units.filter((u) => u.floor === floor);
          return (
            <div key={floor} className="flex items-center gap-2">
              <span className="w-14 text-xs font-bold text-slate-400 shrink-0">
                طبقه {toFaDigit(floor)}:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                {floorUnits.map((u) => {
                  const isDebt = u.currentBalance > 0;
                  const isVacant = u.occType === 'VACANT';
                  return (
                    <button
                      key={u.id}
                      onClick={() => onSelectUnit?.(u)}
                      className={`flex flex-col p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                        isVacant
                          ? 'border-slate-700/60 bg-slate-800/40 text-slate-400'
                          : isDebt
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>واحد {toFaDigit(u.unitNumber)}</span>
                        <span className="text-[10px] opacity-75">
                          {isVacant ? 'خالی' : isDebt ? 'بدهکار' : 'تسویه'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono mt-1 num-tabular">
                        {isDebt ? `+${formatToman(u.currentBalance)}` : formatToman(u.currentBalance)} تومان
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
