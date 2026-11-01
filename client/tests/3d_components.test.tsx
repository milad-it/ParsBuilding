import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebGLDetector } from '../src/components/3d/core/WebGLDetector';
import { ThreeResourceManager } from '../src/components/3d/core/ThreeResourceManager';
import { CanvasTextureGenerator } from '../src/components/3d/core/CanvasTextureGenerator';
import { BuildingMatrixFallback } from '../src/components/3d/manager/BuildingMatrixFallback';
import { ResidentKeycardFallback } from '../src/components/3d/resident/ResidentKeycardFallback';
import * as THREE from 'three';

describe('Three.js Core & Fallback Components', () => {
  it('detects WebGL support safely without throwing', () => {
    const isAvail = WebGLDetector.isWebGLAvailable();
    expect(typeof isAvail).toBe('boolean');
    const dpr = WebGLDetector.getOptimalPixelRatio();
    expect(dpr).toBeGreaterThanOrEqual(1);
    expect(dpr).toBeLessThanOrEqual(2);
  });

  it('disposes Three.js objects cleanly via ThreeResourceManager', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    expect(scene.children.length).toBe(1);
    ThreeResourceManager.disposeObject(scene);
    expect(scene.children.length).toBe(0);
  });

  it('generates high-DPI canvas texture for resident keycard', () => {
    const tex = CanvasTextureGenerator.createPersianCardTexture({
      complexName: 'برج مسکونی پارس',
      residentName: 'امیرحسین تهرانی',
      unitNumber: 5,
      floor: 2,
      balance: 150000,
      passCode: 'ABC-123',
      isOverdue: true
    });
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('renders BuildingMatrixFallback with floors and units', () => {
    const mockUnits = [
      { id: 'u1', unitNumber: 1, floor: 1, col: 0, currentBalance: 0, occType: 'OWNER_OCCUPIED' as const, occupants: 2 },
      { id: 'u2', unitNumber: 2, floor: 1, col: 1, currentBalance: 500000, occType: 'OWNER_OCCUPIED' as const, occupants: 3 },
      { id: 'u3', unitNumber: 3, floor: 2, col: 0, currentBalance: 0, occType: 'VACANT' as const, occupants: 0 }
    ];

    const handleSelect = vi.fn();
    render(<BuildingMatrixFallback units={mockUnits} onSelectUnit={handleSelect} />);

    expect(screen.getByText(/طبقه ۱/)).toBeInTheDocument();
    expect(screen.getByText(/طبقه ۲/)).toBeInTheDocument();
    expect(screen.getByText(/واحد ۱/)).toBeInTheDocument();
    expect(screen.getByText(/واحد ۲/)).toBeInTheDocument();

    const u1Btn = screen.getByText(/واحد ۱/).closest('button');
    if (u1Btn) fireEvent.click(u1Btn);
    expect(handleSelect).toHaveBeenCalledWith(mockUnits[0]);
  });

  it('renders ResidentKeycardFallback and supports flipping', () => {
    const mockData = {
      complexName: 'برج پارس',
      residentName: 'رضا علوی',
      unitNumber: 4,
      floor: 2,
      balance: 0,
      passCode: 'PASS-123',
      sheba: 'IR123456789012345678901234',
      cardNumber: '۶۰۳۷-۹۹۷۵-۱۱۱۱-۲۲۲۲',
      qrPayload: 'PARS-4'
    };

    render(<ResidentKeycardFallback data={mockData} />);

    expect(screen.getByText('برج پارس')).toBeInTheDocument();
    expect(screen.getByText('رضا علوی')).toBeInTheDocument();

    const flipBtn = screen.getByText(/مشاهده شماره حساب و شبا/);
    fireEvent.click(flipBtn);
    expect(screen.getByText(/مشاهده روی کارت/)).toBeInTheDocument();
  });
});
