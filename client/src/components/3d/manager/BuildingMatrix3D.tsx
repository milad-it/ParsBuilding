import React, { useEffect, useRef, useState } from 'react';
import { BuildingMatrixController, UnitSpatialData } from './BuildingMatrixController';
import { BuildingMatrixFallback } from './BuildingMatrixFallback';
import { WebGLDetector } from '../core/WebGLDetector';
import { Layers, RefreshCw } from 'lucide-react';
import { formatToman, toFaDigit } from '@/utils/formatters';

export interface BuildingMatrix3DProps {
  units: any[];
  onSelectUnit?: (unitId: string) => void;
}

export const BuildingMatrix3D: React.FC<BuildingMatrix3DProps> = ({ units, onSelectUnit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BuildingMatrixController | null>(null);

  const [hoveredUnit, setHoveredUnit] = useState<UnitSpatialData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isExploded, setIsExploded] = useState(false);
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  // Map raw unit entities to spatial units (4 units per floor default)
  const spatialUnits: UnitSpatialData[] = units.map((u, index) => {
    const floor = u.floor ?? Math.floor(index / 4) + 1;
    const col = index % 4;
    return {
      id: u.id,
      unitNumber: u.unitNumber,
      unitName: u.unitName,
      floor,
      col,
      currentBalance: Number(u.currentBalance || 0),
      occType: u.occType || 'OWNER_OCCUPIED',
      occupants: u.occupants || 0
    };
  });

  useEffect(() => {
    if (!WebGLDetector.isWebGLAvailable()) {
      setIsWebGLSupported(false);
      return;
    }

    if (containerRef.current && spatialUnits.length > 0) {
      try {
        controllerRef.current = new BuildingMatrixController(containerRef.current, spatialUnits, {
          onHover: (unit, pos) => {
            setHoveredUnit(unit);
            setTooltipPos(pos);
          },
          onClick: (unit) => {
            onSelectUnit?.(unit.id);
          }
        });
      } catch (err) {
        console.warn('WebGL initialization failed for matrix, falling back', err);
        setIsWebGLSupported(false);
      }
    }

    return () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, [units.length]);

  const toggleExplode = () => {
    const next = !isExploded;
    setIsExploded(next);
    controllerRef.current?.setExploded(next);
  };

  if (!isWebGLSupported || spatialUnits.length === 0) {
    return (
      <BuildingMatrixFallback
        units={spatialUnits}
        onSelectUnit={(u) => onSelectUnit?.(u.id)}
      />
    );
  }

  return (
    <div className="relative h-80 sm:h-96 w-full rounded-2xl border border-slate-800 bg-slate-900/60 shadow-glass overflow-hidden">
      {/* 3D Canvas */}
      <div ref={containerRef} className="h-full w-full cursor-pointer" />

      {/* Exploded View Toggle and Legend */}
      <div className="absolute top-4 start-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleExplode}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition-all cursor-pointer ${
            isExploded
              ? 'border-brand-500 bg-brand-600/30 text-brand-300'
              : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
          title="تفکیک سه‌بعدی طبقات"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{isExploded ? 'نمای فشرده طبقات' : 'نمای تفکیک طبقات'}</span>
        </button>
      </div>

      {/* Color Code Legend */}
      <div className="absolute bottom-3 start-4 z-10 flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>تسویه / بستانکار</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <span>بدهکار</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <span>خالی</span>
        </div>
      </div>

      {/* Persian Floating Raycast Tooltip */}
      {hoveredUnit && tooltipPos && (
        <div
          dir="rtl"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 12}px`,
            transform: 'translate(-50%, -100%)'
          }}
          className="pointer-events-none absolute z-20 min-w-[160px] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-right shadow-glass backdrop-blur-md animate-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs font-bold text-slate-100">
            <span>واحد {toFaDigit(hoveredUnit.unitNumber)}</span>
            <span className="text-[10px] text-slate-400">طبقه {toFaDigit(hoveredUnit.floor)}</span>
          </div>
          <div className="mt-2 space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>وضعیت:</span>
              <span className="font-semibold text-slate-200">
                {hoveredUnit.occType === 'VACANT' ? 'خالی' : 'دارای سکونت'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>مانده حساب:</span>
              <span
                className={`font-mono font-bold num-tabular ${
                  hoveredUnit.currentBalance > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {hoveredUnit.currentBalance > 0
                  ? `${formatToman(hoveredUnit.currentBalance)} بدهکار`
                  : `${formatToman(Math.abs(hoveredUnit.currentBalance))} تسویه`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
