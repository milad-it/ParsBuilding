import React, { useEffect, useRef, useState } from 'react';
import { ResidentKeycardController, KeycardData } from './ResidentKeycardController';
import { ResidentKeycardFallback } from './ResidentKeycardFallback';
import { WebGLDetector } from '../core/WebGLDetector';
import { RefreshCw } from 'lucide-react';

export interface ResidentKeycard3DProps {
  data: KeycardData;
}

export const ResidentKeycard3D: React.FC<ResidentKeycard3DProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ResidentKeycardController | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (!WebGLDetector.isWebGLAvailable()) {
      setIsSupported(false);
      return;
    }

    if (containerRef.current) {
      try {
        controllerRef.current = new ResidentKeycardController(containerRef.current, data);
      } catch (err) {
        console.warn('Three.js failed for keycard, using fallback', err);
        setIsSupported(false);
      }
    }

    return () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, [data.unitNumber, data.balance, data.residentName]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    controllerRef.current?.flip();
  };

  if (!isSupported) {
    return <ResidentKeycardFallback data={data} />;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        onClick={handleFlip}
        className="h-64 sm:h-72 w-96 max-w-full cursor-pointer select-none"
        title="جهت چرخش کارت کلیک کنید"
      />
      <button
        onClick={handleFlip}
        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-800 transition-all cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{isFlipped ? 'مشاهده روی کارت هوشمند' : 'چرخش و مشاهده شماره شبا و کارت'}</span>
      </button>
    </div>
  );
};
