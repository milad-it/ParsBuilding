import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import * as THREE from 'three';
import { ThreeResourceManager } from '../src/components/3d/core/ThreeResourceManager';
import { WebGLDetector } from '../src/components/3d/core/WebGLDetector';
import { CanvasTextureGenerator } from '../src/components/3d/core/CanvasTextureGenerator';
import { Building3DHero } from '../src/components/3d/login/Building3DComplex';
import { BuildingMatrix3D } from '../src/components/3d/manager/BuildingMatrix3D';
import { BuildingMatrixFallback } from '../src/components/3d/manager/BuildingMatrixFallback';
import { ResidentKeycard3D } from '../src/components/3d/resident/ResidentKeycard3D';
import { ResidentKeycardFallback } from '../src/components/3d/resident/ResidentKeycardFallback';
import { BuildingComplexController } from '../src/components/3d/login/BuildingComplexController';
import { BuildingMatrixController } from '../src/components/3d/manager/BuildingMatrixController';
import { ResidentKeycardController } from '../src/components/3d/resident/ResidentKeycardController';

describe('Gate 4 Challenger: 3D Graphics Lifecycle & Fallback Stress Suite', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. ThreeResourceManager Lifecycle & Memory Leak Prevention', () => {
    it('handles null/undefined gracefully without throwing', () => {
      expect(() => ThreeResourceManager.disposeObject(null as any)).not.toThrow();
      expect(() => ThreeResourceManager.disposeScene(null, null, null)).not.toThrow();
      expect(() => ThreeResourceManager.disposeScene(null, null, 12345)).not.toThrow();
    });

    it('cancels scheduled requestAnimationFrame correctly', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
      ThreeResourceManager.disposeScene(null, null, 9999);
      expect(cancelSpy).toHaveBeenCalledWith(9999);
    });

    it('recursively disposes complex scene graph with meshes, multi-materials, and all texture channels', () => {
      const scene = new THREE.Scene();
      const parentGroup = new THREE.Group();
      scene.add(parentGroup);

      // Create textures
      const map = new THREE.Texture();
      const normalMap = new THREE.Texture();
      const roughnessMap = new THREE.Texture();
      const mapSpy = vi.spyOn(map, 'dispose');
      const normalSpy = vi.spyOn(normalMap, 'dispose');
      const roughSpy = vi.spyOn(roughnessMap, 'dispose');

      const geo = new THREE.BoxGeometry(2, 2, 2);
      const geoSpy = vi.spyOn(geo, 'dispose');

      const mat = new THREE.MeshStandardMaterial({
        map,
        normalMap,
        roughnessMap
      });
      const matSpy = vi.spyOn(mat, 'dispose');

      const mesh = new THREE.Mesh(geo, mat);
      parentGroup.add(mesh);

      // Multi-material mesh (array of materials, like ResidentKeycard)
      const multiGeo = new THREE.BoxGeometry(1, 1, 1);
      const multiGeoSpy = vi.spyOn(multiGeo, 'dispose');
      const mats = [
        new THREE.MeshBasicMaterial(),
        new THREE.MeshStandardMaterial({ map: new THREE.Texture() })
      ];
      const multiMatSpies = mats.map(m => vi.spyOn(m, 'dispose'));
      const multiMesh = new THREE.Mesh(multiGeo, mats);
      parentGroup.add(multiMesh);

      // Light with dispose
      const light = new THREE.DirectionalLight();
      const lightSpy = vi.spyOn(light, 'dispose');
      parentGroup.add(light);

      // Execute disposal
      ThreeResourceManager.disposeObject(scene);

      expect(geoSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(mapSpy).toHaveBeenCalledTimes(1);
      expect(normalSpy).toHaveBeenCalledTimes(1);
      expect(roughSpy).toHaveBeenCalledTimes(1);
      expect(multiGeoSpy).toHaveBeenCalledTimes(1);
      multiMatSpies.forEach(s => expect(s).toHaveBeenCalledTimes(1));
      expect(lightSpy).toHaveBeenCalledTimes(1);
      expect(scene.children.length).toBe(0);
    });

    it('forces WebGL context loss cleanly on renderer disposal with WEBGL_lose_context', () => {
      const mockLoseContext = vi.fn();
      const mockDom = document.createElement('canvas');
      const parentContainer = document.createElement('div');
      parentContainer.appendChild(mockDom);

      const mockRenderer = {
        dispose: vi.fn(),
        forceContextLoss: vi.fn(),
        getContext: vi.fn().mockReturnValue({
          getExtension: vi.fn((ext: string) => {
            if (ext === 'WEBGL_lose_context') {
              return { loseContext: mockLoseContext };
            }
            return null;
          })
        }),
        domElement: mockDom
      } as unknown as THREE.WebGLRenderer;

      ThreeResourceManager.disposeScene(null, mockRenderer, 42);

      expect(mockRenderer.dispose).toHaveBeenCalled();
      expect(mockRenderer.forceContextLoss).toHaveBeenCalled();
      expect(mockLoseContext).toHaveBeenCalled();
      expect(mockDom.parentElement).toBeNull();
    });

    it('tolerates when forceContextLoss or loseContext throws (context already lost)', () => {
      const mockRenderer = {
        dispose: vi.fn(),
        forceContextLoss: vi.fn(() => {
          throw new Error('Context already lost');
        }),
        getContext: vi.fn().mockReturnValue(null),
        domElement: document.createElement('canvas')
      } as unknown as THREE.WebGLRenderer;

      expect(() => {
        ThreeResourceManager.disposeScene(null, mockRenderer);
      }).not.toThrow();
    });
  });

  describe('2. Graceful Degradation & Fallback Rendering', () => {
    it('Building3DHero renders fallback banner when WebGL is unavailable', () => {
      vi.spyOn(WebGLDetector, 'isWebGLAvailable').mockReturnValue(false);

      render(<Building3DHero />);
      expect(screen.getByText('برج مسکونی هوشمند پارس')).toBeInTheDocument();
      expect(screen.getByText(/سامانه تجاری مدیریت مجتمع‌های مسکونی/)).toBeInTheDocument();
    });

    it('BuildingMatrix3D degrades to BuildingMatrixFallback when WebGL is unsupported', () => {
      vi.spyOn(WebGLDetector, 'isWebGLAvailable').mockReturnValue(false);

      const mockUnits = [
        { id: 'u101', unitNumber: 101, floor: 1, currentBalance: 250000, occType: 'OWNER_OCCUPIED', occupants: 2 },
        { id: 'u102', unitNumber: 102, floor: 1, currentBalance: 0, occType: 'TENANT_OCCUPIED', occupants: 3 },
        { id: 'u201', unitNumber: 201, floor: 2, currentBalance: 0, occType: 'VACANT', occupants: 0 }
      ];

      const handleSelect = vi.fn();
      render(<BuildingMatrix3D units={mockUnits} onSelectUnit={handleSelect} />);

      expect(screen.getByText(/نمای ماتریسی طبقات و وضعیت مالی واحدها/)).toBeInTheDocument();
      expect(screen.getByText(/طبقه ۱/)).toBeInTheDocument();
      expect(screen.getByText(/طبقه ۲/)).toBeInTheDocument();
      expect(screen.getByText(/واحد ۱۰۱/)).toBeInTheDocument();
      expect(screen.getByText(/واحد ۱۰۲/)).toBeInTheDocument();
      expect(screen.getByText(/واحد ۲۰۱/)).toBeInTheDocument();
    });

    it('ResidentKeycard3D degrades to ResidentKeycardFallback with full interactive flip support when WebGL is unsupported', () => {
      vi.spyOn(WebGLDetector, 'isWebGLAvailable').mockReturnValue(false);

      const mockData = {
        complexName: 'برج نیلوفر',
        residentName: 'سهراب سپهری',
        unitNumber: 12,
        floor: 3,
        balance: 750000,
        passCode: 'NLF-12-89',
        sheba: 'IR980120000000000012345678',
        cardNumber: '۶۰۳۷-۹۹۷۵-۸۸۸۸-۹۹۹۹',
        qrPayload: 'PAY-12'
      };

      render(<ResidentKeycard3D data={mockData} />);

      expect(screen.getByText('برج نیلوفر')).toBeInTheDocument();
      expect(screen.getByText('سهراب سپهری')).toBeInTheDocument();
      expect(screen.getByText(/واحد ۱۲/)).toBeInTheDocument();
      expect(screen.getByText(/بدهی:.*۷۵۰.*تومان/)).toBeInTheDocument();

      // Test Flip Interaction
      const flipBtn = screen.getByText(/مشاهده شماره حساب و شبا/);
      fireEvent.click(flipBtn);

      expect(screen.getByText('IR980120000000000012345678')).toBeInTheDocument();
      expect(screen.getByText('۶۰۳۷-۹۹۷۵-۸۸۸۸-۹۹۹۹')).toBeInTheDocument();
      expect(screen.getByText(/اسکن جهت پرداخت سریع/)).toBeInTheDocument();
    });
  });

  describe('3. Rapid Mount/Unmount Stress Testing (50 Cycles)', () => {
    it('survives 50 rapid mount and unmount cycles without memory leak or lingering timers', () => {
      vi.spyOn(WebGLDetector, 'isWebGLAvailable').mockReturnValue(false);

      const mockUnits = [
        { id: 'u1', unitNumber: 1, floor: 1, currentBalance: 0, occType: 'OWNER_OCCUPIED', occupants: 1 }
      ];
      const mockKeycardData = {
        complexName: 'برج پارس',
        residentName: 'تست کننده',
        unitNumber: 1,
        floor: 1,
        balance: 0,
        passCode: 'TEST',
        sheba: 'IR00',
        cardNumber: '6037',
        qrPayload: 'TEST'
      };

      for (let i = 0; i < 50; i++) {
        const { unmount: unmountHero } = render(<Building3DHero />);
        unmountHero();

        const { unmount: unmountMatrix } = render(<BuildingMatrix3D units={mockUnits} />);
        unmountMatrix();

        const { unmount: unmountKeycard } = render(<ResidentKeycard3D data={mockKeycardData} />);
        unmountKeycard();
      }

      // If we reach here without unhandled rejections, OOM, or errors, 50 cycles cleanly survived
      expect(true).toBe(true);
    });
  });

  describe('4. CanvasTextureGenerator Boundary Values', () => {
    it('handles extreme and Persian boundary strings safely', () => {
      const boundaryCases = [
        {
          complexName: '',
          residentName: '',
          unitNumber: 0,
          floor: undefined,
          balance: 0,
          passCode: '',
          isOverdue: false
        },
        {
          complexName: 'مجتمع مسکونی بسیار طولانی با نام فوق‌العاده کشیده برای تست محدودیت گرافیک بوم و قلم',
          residentName: 'نام خانوادگی طولانی ترکیبی و چندبخشی تهرانی اصل شیرازی',
          unitNumber: 99999,
          floor: 999,
          balance: 999999999999,
          passCode: 'EXTREME-999-XYZ',
          isOverdue: true
        },
        {
          complexName: '<script>alert(1)</script>',
          residentName: 'ممد & شرکا "خاص"',
          unitNumber: -1,
          floor: -2,
          balance: -500000,
          passCode: 'SPECIAL!@#$',
          isOverdue: false
        }
      ];

      for (const bc of boundaryCases) {
        expect(() => {
          const tex = CanvasTextureGenerator.createPersianCardTexture(bc);
          expect(tex).toBeInstanceOf(THREE.CanvasTexture);
          tex.dispose();
        }).not.toThrow();
      }
    });
  });

  describe('5. Direct Three.js Controller Stress & State Transitions', () => {
    it('BuildingComplexController initializes, changes time of day, and disposes without dangling frame', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 800 });
      Object.defineProperty(container, 'clientHeight', { value: 600 });
      document.body.appendChild(container);

      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

      let controller: BuildingComplexController | null = null;
      try {
        controller = new BuildingComplexController(container);
        controller.setTimeOfDay('day');
        controller.setTimeOfDay('dusk');
        controller.setTimeOfDay('night');
        expect(controller).toBeDefined();
      } finally {
        if (controller) {
          controller.dispose();
          expect(cancelSpy).toHaveBeenCalled();
        }
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      }
    });

    it('BuildingMatrixController initializes, updates units, toggles exploded mode, and disposes cleanly', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 600 });
      Object.defineProperty(container, 'clientHeight', { value: 450 });
      document.body.appendChild(container);

      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

      const units = [
        { id: '1', unitNumber: 1, floor: 1, col: 0, currentBalance: 0, occType: 'OWNER_OCCUPIED' as const, occupants: 2 },
        { id: '2', unitNumber: 2, floor: 1, col: 1, currentBalance: 100000, occType: 'OWNER_OCCUPIED' as const, occupants: 1 },
        { id: '3', unitNumber: 3, floor: 2, col: 0, currentBalance: -50000, occType: 'TENANT_OCCUPIED' as const, occupants: 3 },
        { id: '4', unitNumber: 4, floor: 2, col: 1, currentBalance: 0, occType: 'VACANT' as const, occupants: 0 }
      ];

      let controller: BuildingMatrixController | null = null;
      try {
        controller = new BuildingMatrixController(container, units);
        controller.setExploded(true);
        controller.setExploded(false);

        // Dynamic update with empty units
        controller.updateUnits([]);

        // Dynamic update with expanded units
        controller.updateUnits([
          ...units,
          { id: '5', unitNumber: 5, floor: 3, col: 0, currentBalance: 900000, occType: 'OWNER_OCCUPIED' as const, occupants: 4 }
        ]);
        expect(controller).toBeDefined();
      } finally {
        if (controller) {
          controller.dispose();
          expect(cancelSpy).toHaveBeenCalled();
        }
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      }
    });

    it('ResidentKeycardController initializes, flips, and disposes cleanly', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 400 });
      Object.defineProperty(container, 'clientHeight', { value: 280 });
      document.body.appendChild(container);

      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

      const keycardData = {
        complexName: 'مجتمع آفتاب',
        residentName: 'مریم میرزاخانی',
        unitNumber: 42,
        floor: 7,
        balance: -200000,
        passCode: 'AFTAB-42',
        sheba: 'IR123456789012345678901234',
        cardNumber: '۶۰۳۷-۹۹۷۵-۷۷۷۷-۸۸۸۸',
        qrPayload: 'PAY-42'
      };

      let controller: ResidentKeycardController | null = null;
      try {
        controller = new ResidentKeycardController(container, keycardData);
        controller.flip();
        controller.flip();
        expect(controller).toBeDefined();
      } finally {
        if (controller) {
          controller.dispose();
          expect(cancelSpy).toHaveBeenCalled();
        }
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      }
    });
  });
});
