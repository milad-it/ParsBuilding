/**
 * Tier 5 White-Box Adversarial Frontend, 3D Lifecycle & Security Hardening Test Suite
 *
 * Covers:
 * 1. WebGL Context Loss Recovery & Idempotent Cleanup
 * 2. Rapid Route Switching & Animation Lifecycle Interruption
 * 3. Adversarial MoneyInput & Numeral Boundary Processing (Negative, Mixed Arabic/Persian, XSS)
 * 4. Authentication Store, Malformed JWT & Token Storage Resilience
 * 5. Tenant Security Boundaries & WebSocket Fault Isolation
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

import { ThreeResourceManager } from '../src/components/3d/core/ThreeResourceManager';
import { WebGLDetector } from '../src/components/3d/core/WebGLDetector';
import { BuildingComplexController } from '../src/components/3d/login/BuildingComplexController';
import { BuildingMatrixController } from '../src/components/3d/manager/BuildingMatrixController';
import { ResidentKeycardController } from '../src/components/3d/resident/ResidentKeycardController';
import { Building3DHero } from '../src/components/3d/login/Building3DComplex';
import { BuildingMatrix3D } from '../src/components/3d/manager/BuildingMatrix3D';
import { ResidentKeycard3D } from '../src/components/3d/resident/ResidentKeycard3D';
import { MoneyInput } from '../src/components/common/MoneyInput';
import { toEnDigit, toFaDigit, formatToman, num2persian, parsePersianNumber } from '../src/utils/formatters';
import { useAuthStore } from '../src/store/authStore';
import { tokenStorage, apiClient, authApi } from '../src/services/api';
import { wsClient, WebSocketClient } from '../src/services/websocket';

describe('Tier 5 Adversarial Hardening: Frontend, 3D & Tenant Security', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      activeComplexId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    });
  });

  // =========================================================================
  // Section 1: WebGL Context Loss Recovery & Idempotent Cleanup
  // =========================================================================
  describe('1. WebGL Context Loss Recovery & Idempotent Cleanup', () => {
    it('T5.1: ThreeResourceManager handles already-lost WebGL context without throwing', () => {
      const mockCanvas = document.createElement('canvas');
      const mockRenderer = {
        dispose: vi.fn(),
        forceContextLoss: vi.fn(() => {
          throw new Error('WebGL context was lost or unavailable');
        }),
        getContext: vi.fn().mockReturnValue(null),
        domElement: mockCanvas
      } as unknown as THREE.WebGLRenderer;

      expect(() => {
        ThreeResourceManager.disposeScene(null, mockRenderer, 123);
      }).not.toThrow();

      expect(mockRenderer.dispose).toHaveBeenCalled();
      expect(mockRenderer.forceContextLoss).toHaveBeenCalled();
    });

    it('T5.2: Multiple consecutive dispose calls on 3D controllers are idempotent', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 600 });
      Object.defineProperty(container, 'clientHeight', { value: 400 });
      document.body.appendChild(container);

      const controller = new BuildingComplexController(container);

      expect(() => {
        controller.dispose();
        controller.dispose();
        controller.dispose();
      }).not.toThrow();

      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });

    it('T5.3: Simulates webglcontextlost event on canvas without unhandled crash', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 500 });
      Object.defineProperty(container, 'clientHeight', { value: 300 });
      document.body.appendChild(container);

      const controller = new BuildingComplexController(container);
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeDefined();

      if (canvas) {
        const event = new Event('webglcontextlost', { bubbles: true, cancelable: true });
        expect(() => canvas.dispatchEvent(event)).not.toThrow();
      }

      controller.dispose();
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });

    it('T5.4: Stress recreation: 10 consecutive instantiations & disposals do not leak', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 400 });
      Object.defineProperty(container, 'clientHeight', { value: 300 });
      document.body.appendChild(container);

      for (let i = 0; i < 10; i++) {
        const ctrl = new BuildingComplexController(container);
        ctrl.setTimeOfDay(i % 2 === 0 ? 'day' : 'night');
        ctrl.dispose();
      }

      expect(container.querySelectorAll('canvas').length).toBe(0);
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });
  });

  // =========================================================================
  // Section 2: Rapid Route Switching During 3D Animation
  // =========================================================================
  describe('2. Rapid Route Switching & Animation Lifecycle Interruption', () => {
    it('T5.5: Interleaved rapid mounting and unmounting of all 3D components', () => {
      vi.spyOn(WebGLDetector, 'isWebGLAvailable').mockReturnValue(false);

      const mockUnits = [
        { id: 'u1', unitNumber: 101, floor: 1, currentBalance: 150000, occType: 'OWNER_OCCUPIED', occupants: 2 },
        { id: 'u2', unitNumber: 102, floor: 1, currentBalance: -50000, occType: 'TENANT_OCCUPIED', occupants: 1 }
      ];

      const mockKeycard = {
        complexName: 'برج نیایش',
        residentName: 'مهندس رضایی',
        unitNumber: 101,
        floor: 1,
        balance: 150000,
        passCode: 'NY-101',
        sheba: 'IR123456789012345678901234',
        cardNumber: '۶۰۳۷-۹۹۷۵-۱۱۱۱-۲۲۲۲',
        qrPayload: 'PAY-101'
      };

      // Rapidly switch between views mimicking route navigation:
      // Route / -> Route /dashboard -> Route /resident -> Route /dashboard -> Route /
      for (let step = 0; step < 20; step++) {
        const { unmount: unmountHero } = render(<Building3DHero />);
        unmountHero();

        const { unmount: unmountMatrix } = render(<BuildingMatrix3D units={mockUnits} />);
        unmountMatrix();

        const { unmount: unmountKeycard } = render(<ResidentKeycard3D data={mockKeycard} />);
        unmountKeycard();
      }

      expect(true).toBe(true);
    });

    it('T5.6: Cancels animationFrame immediately on controller dispose in mid-animation', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 600 });
      Object.defineProperty(container, 'clientHeight', { value: 450 });
      document.body.appendChild(container);

      const units = [
        { id: '1', unitNumber: 1, floor: 1, col: 0, currentBalance: 0, occType: 'OWNER_OCCUPIED' as const, occupants: 1 }
      ];

      const matrixCtrl = new BuildingMatrixController(container, units);
      matrixCtrl.dispose();

      expect(cancelSpy).toHaveBeenCalled();
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });
  });

  // =========================================================================
  // Section 3: Adversarial MoneyInput & Numeral Boundary Processing
  // =========================================================================
  describe('3. Adversarial MoneyInput & Numeral Boundary Processing', () => {
    it('T5.7: Correctly processes negative money input and formats in words', () => {
      const handleChange = vi.fn();
      const TestContainer = () => {
        const [val, setVal] = useState(-50000);
        return (
          <MoneyInput
            value={val}
            onChange={(n) => {
              setVal(n);
              handleChange(n);
            }}
            placeholder="مبلغ"
          />
        );
      };

      render(<TestContainer />);
      expect(screen.getByText(/منفی پنجاه هزار تومان/)).toBeInTheDocument();

      const input = screen.getByPlaceholderText('مبلغ');
      fireEvent.change(input, { target: { value: '-۱۰۰۰۰۰' } });

      expect(handleChange).toHaveBeenCalledWith(-100000);
    });

    it('T5.8: Mixed Arabic, Persian, and Latin numerals resolve to identical integers', () => {
      // Latin: 12345
      // Persian: ۱۲۳۴۵
      // Arabic: ١٢٣٤٥
      // Mixed: ۱۲3٤5
      expect(toEnDigit('12345')).toBe('12345');
      expect(toEnDigit('۱۲۳۴۵')).toBe('12345');
      expect(toEnDigit('١٢٣٤٥')).toBe('12345');
      expect(toEnDigit('۱۲3٤5')).toBe('12345');
      expect(parsePersianNumber('۱۲3٤5')).toBe(12345);
    });

    it('T5.9: Normalizes Arabic digit 8 (٨) correctly across formatters and parser', () => {
      expect(toEnDigit('٨')).toBe('8');
      expect(toEnDigit('٨٨٨')).toBe('888');
      expect(toEnDigit('پلاک ٨، واحد ٨')).toBe('پلاک 8، واحد 8');
      expect(parsePersianNumber('٨۵۰۰۰')).toBe(85000);
    });

    it('T5.10: Hostile inputs (XSS, SQLi, ZWNJ, emojis) in MoneyInput are stripped and sanitized', () => {
      const handleChange = vi.fn();
      render(<MoneyInput value={0} onChange={handleChange} placeholder="مبلغ شارژ" />);
      const input = screen.getByPlaceholderText('مبلغ شارژ');

      // Non-numeric malicious payloads must resolve strictly to 0
      const nonNumericHostile = [
        '<script>alert("xss")</script>',
        "'; DROP TABLE complexes; --",
        'NaN',
        'undefined',
        'null',
        '💵💰🔥',
        '    ',
        '---',
        '\u200C\u200E\u200F'
      ];

      for (const malicious of nonNumericHostile) {
        fireEvent.change(input, { target: { value: malicious } });
        expect(handleChange).toHaveBeenLastCalledWith(0);
      }

      // XSS payloads with embedded numbers must strip all HTML/tags leaving only parsed numeric digits
      fireEvent.change(input, { target: { value: '<img src=x onerror=alert(5000)>' } });
      expect(handleChange).toHaveBeenLastCalledWith(5000);
    });

    it('T5.11: Extreme currency amounts (Trillions of Tomans) format accurately without overflow', () => {
      const oneTrillion = 1_000_000_000_000;
      const formatted = num2persian(oneTrillion);
      expect(formatted).toContain('یک تریلیون تومان');

      const nineHundredBillion = 900_000_000_000;
      const formattedBillion = num2persian(nineHundredBillion);
      expect(formattedBillion).toContain('نهصد میلیارد تومان');

      const zero = num2persian(0);
      expect(zero).toBe('صفر تومان');
    });

    it('T5.12: Decimal parsing: converts Persian momayyez, slash, and Latin dot gracefully', () => {
      expect(parsePersianNumber('12.5')).toBe(12.5);
      expect(parsePersianNumber('100,000')).toBe(100000);
      expect(parsePersianNumber('۱۰۰٬۰۰۰')).toBe(100000);
      expect(parsePersianNumber(null)).toBe(0);
      expect(parsePersianNumber(undefined)).toBe(0);
    });
  });

  // =========================================================================
  // Section 4: Authentication Store & Malformed Token Resilience
  // =========================================================================
  describe('4. Authentication Store & Malformed Token Resilience', () => {
    it('T5.13: checkAuth gracefully handles malformed JWT tokens and resets auth state', async () => {
      tokenStorage.setAccessToken('malformed.token.garbage');

      vi.spyOn(authApi, 'me').mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Invalid token structure' } }
      });

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(tokenStorage.getAccessToken()).toBeNull();
    });

    it('T5.14: checkAuth handles empty or missing token without calling authApi.me', async () => {
      tokenStorage.clear();
      const meSpy = vi.spyOn(authApi, 'me');

      await useAuthStore.getState().checkAuth();

      expect(meSpy).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('T5.15: apiClient request interceptor injects Bearer token and active complexId header', () => {
      tokenStorage.setAccessToken('valid-jwt-token-xyz');
      tokenStorage.setActiveComplexId('complex-tenant-uuid-123');

      const config: any = { headers: {} };
      const interceptor = (apiClient.interceptors.request as any).handlers[0].fulfilled;
      const modifiedConfig = interceptor(config);

      expect(modifiedConfig.headers.Authorization).toBe('Bearer valid-jwt-token-xyz');
      expect(modifiedConfig.headers['x-complex-id']).toBe('complex-tenant-uuid-123');
    });

    it('T5.16: Token storage handles null/cleared state cleanly', () => {
      tokenStorage.setAccessToken('temp-tok');
      tokenStorage.setRefreshToken('temp-ref');
      tokenStorage.setActiveComplexId('temp-comp');

      expect(tokenStorage.getAccessToken()).toBe('temp-tok');
      expect(tokenStorage.getRefreshToken()).toBe('temp-ref');
      expect(tokenStorage.getActiveComplexId()).toBe('temp-comp');

      tokenStorage.clear();

      expect(tokenStorage.getAccessToken()).toBeNull();
      expect(tokenStorage.getRefreshToken()).toBeNull();
      expect(tokenStorage.getActiveComplexId()).toBeNull();
    });
  });

  // =========================================================================
  // Section 5: Tenant Security Boundaries & WebSocket Isolation
  // =========================================================================
  describe('5. Tenant Security Boundaries & WebSocket Fault Isolation', () => {
    it('T5.17: setActiveComplexId updates tenant context and storage', () => {
      useAuthStore.getState().setActiveComplexId('tenant-alpha-99');
      expect(useAuthStore.getState().activeComplexId).toBe('tenant-alpha-99');
      expect(tokenStorage.getActiveComplexId()).toBe('tenant-alpha-99');

      useAuthStore.getState().setActiveComplexId(null);
      expect(useAuthStore.getState().activeComplexId).toBeNull();
      expect(tokenStorage.getActiveComplexId()).toBeNull();
    });

    it('T5.18: WebSocket client isolates event dispatches and supports wildcard', () => {
      const client = WebSocketClient.getInstance();
      const paymentListener = vi.fn();
      const unitListener = vi.fn();
      const wildcardListener = vi.fn();

      const unsubPay = client.on('PAYMENT_RECEIVED', paymentListener);
      const unsubUnit = client.on('UNIT_UPDATED', unitListener);
      const unsubWild = client.on('*', wildcardListener);

      const paymentMsg = {
        event: 'PAYMENT_RECEIVED',
        room: 'complex:tenant-1',
        data: { amount: 500000, unitId: 'u-101' },
        timestamp: new Date().toISOString()
      };

      // Dispatch simulated payment message
      (client as any).dispatchMessage(paymentMsg);

      expect(paymentListener).toHaveBeenCalledTimes(1);
      expect(paymentListener).toHaveBeenCalledWith(paymentMsg.data, paymentMsg);
      expect(unitListener).not.toHaveBeenCalled();
      expect(wildcardListener).toHaveBeenCalledTimes(1);

      unsubPay();
      unsubUnit();
      unsubWild();
    });

    it('T5.19: Faulty WebSocket listener that throws an error does not crash other listeners', () => {
      const client = WebSocketClient.getInstance();
      const faultyListener = vi.fn(() => {
        throw new Error('Listener runtime crash');
      });
      const healthyListener = vi.fn();

      const unsubFaulty = client.on('SECURITY_ALERT', faultyListener);
      const unsubHealthy = client.on('SECURITY_ALERT', healthyListener);

      const alertMsg = {
        event: 'SECURITY_ALERT',
        room: 'complex:tenant-1',
        data: { message: 'Unauthorized access attempt' },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        (client as any).dispatchMessage(alertMsg);
      }).not.toThrow();

      expect(faultyListener).toHaveBeenCalled();
      expect(healthyListener).toHaveBeenCalledTimes(1);

      unsubFaulty();
      unsubHealthy();
    });

    it('T5.20: WebSocket manages room subscriptions and explicit disconnect', () => {
      const client = WebSocketClient.getInstance();
      client.subscribe('complex:complex-A');
      client.subscribe('complex:complex-B');

      expect((client as any).subscribedRooms.has('complex:complex-A')).toBe(true);
      expect((client as any).subscribedRooms.has('complex:complex-B')).toBe(true);

      client.unsubscribe('complex:complex-B');
      expect((client as any).subscribedRooms.has('complex:complex-B')).toBe(false);
      expect((client as any).subscribedRooms.has('complex:complex-A')).toBe(true);

      client.disconnect();
      expect((client as any).isExplicitDisconnect).toBe(true);
    });
  });
});
