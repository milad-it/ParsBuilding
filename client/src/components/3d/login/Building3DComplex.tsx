import React, { useEffect, useRef, useState } from 'react';
import { BuildingComplexController, TimeOfDay } from './BuildingComplexController';
import { WebGLDetector } from '../core/WebGLDetector';
import { Sun, Sunset, Moon } from 'lucide-react';

export const Building3DHero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BuildingComplexController | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('night');
  const [isSupported, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    if (!WebGLDetector.isWebGLAvailable()) {
      setIsSupported(false);
      return;
    }

    if (containerRef.current) {
      try {
        controllerRef.current = new BuildingComplexController(containerRef.current);
      } catch (err) {
        console.warn('Three.js failed to initialize in hero, falling back to 2D gradient', err);
        setIsSupported(false);
      }
    }

    return () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, []);

  const handleTimeChange = (time: TimeOfDay) => {
    setTimeOfDay(time);
    controllerRef.current?.setTimeOfDay(time);
  };

  if (!isSupported) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-8">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-500/10 border border-brand-500/30 text-brand-400 shadow-glow-brand">
            <span className="text-4xl">🏢</span>
          </div>
          <h3 className="text-lg font-bold text-white">برج مسکونی هوشمند پارس</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            سامانه تجاری مدیریت مجتمع‌های مسکونی و اداری با استانداردهای مدرن
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Atmospheric Day/Dusk/Night Switcher */}
      <div className="absolute bottom-6 end-6 z-10 flex items-center gap-1.5 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 backdrop-blur-md shadow-glass">
        <button
          onClick={() => handleTimeChange('day')}
          className={`rounded-xl p-2 transition-all ${
            timeOfDay === 'day' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
          }`}
          title="حالت روز"
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleTimeChange('dusk')}
          className={`rounded-xl p-2 transition-all ${
            timeOfDay === 'dusk' ? 'bg-orange-500 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
          title="حالت گرگ‌ومیش"
        >
          <Sunset className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleTimeChange('night')}
          className={`rounded-xl p-2 transition-all ${
            timeOfDay === 'night' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
          title="حالت شب"
        >
          <Moon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
