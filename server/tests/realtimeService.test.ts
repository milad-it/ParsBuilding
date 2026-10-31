import { describe, it, expect } from 'vitest';
import { realtimeService, ExtendedWebSocket } from '../src/services/realtimeService';

describe('Realtime WebSocket Gateway & Multi-Tenant Room Isolation', () => {
  it('should enforce strict room subscription access control for complex channel', () => {
    const residentInCpx1 = {
      userId: 'u-1',
      complexId: 'cpx-1',
      role: 'RESIDENT' as const,
      unitIds: ['unit-1']
    };

    // Allowed: Own complex room
    expect(realtimeService.canSubscribe(residentInCpx1, 'complex:cpx-1')).toBe(true);
    // Blocked: Another complex room
    expect(realtimeService.canSubscribe(residentInCpx1, 'complex:cpx-2')).toBe(false);

    // Super Admin: Allowed everywhere
    const superAdmin = {
      userId: 'admin',
      complexId: '',
      role: 'SUPER_ADMIN' as const,
      unitIds: []
    };
    expect(realtimeService.canSubscribe(superAdmin, 'complex:cpx-1')).toBe(true);
    expect(realtimeService.canSubscribe(superAdmin, 'complex:cpx-99')).toBe(true);
  });

  it('should enforce strict unit room boundaries for residents and allow managers', () => {
    const resident = {
      userId: 'res-1',
      complexId: 'cpx-1',
      role: 'RESIDENT' as const,
      unitIds: ['unit-101', 'unit-102']
    };

    // Allowed: Assigned units
    expect(realtimeService.canSubscribe(resident, 'unit:unit-101')).toBe(true);
    expect(realtimeService.canSubscribe(resident, 'unit:unit-102')).toBe(true);
    // Blocked: Unassigned unit
    expect(realtimeService.canSubscribe(resident, 'unit:unit-103')).toBe(false);

    // Complex Manager: Allowed to monitor any unit in complex
    const manager = {
      userId: 'mgr-1',
      complexId: 'cpx-1',
      role: 'COMPLEX_MANAGER' as const,
      unitIds: []
    };
    expect(realtimeService.canSubscribe(manager, 'unit:unit-103')).toBe(true);
  });

  it('should manage room subscriptions and unsubscriptions correctly', () => {
    const mockSocket: ExtendedWebSocket = {
      readyState: 1, // OPEN
      isAlive: true,
      rooms: new Set(),
      send: () => {},
      ping: () => {},
      terminate: () => {},
      close: () => {}
    } as any;

    const room = 'complex:cpx-test';
    realtimeService.joinRoom(mockSocket, room);
    expect(realtimeService.getRoomSubscribersCount(room)).toBe(1);
    expect(mockSocket.rooms.has(room)).toBe(true);

    realtimeService.leaveRoom(mockSocket, room);
    expect(realtimeService.getRoomSubscribersCount(room)).toBe(0);
    expect(mockSocket.rooms.has(room)).toBe(false);
  });

  it('should broadcast events to connected room sockets without crashing', () => {
    let sentPayload: string | null = null;
    const mockSocket: ExtendedWebSocket = {
      readyState: 1, // WebSocket.OPEN
      isAlive: true,
      rooms: new Set(),
      send: (data: string) => {
        sentPayload = data;
      },
      ping: () => {},
      terminate: () => {},
      close: () => {}
    } as any;

    const room = 'complex:cpx-broadcast';
    realtimeService.joinRoom(mockSocket, room);

    realtimeService.broadcastToComplex('cpx-broadcast', 'NEW_ANNOUNCEMENT', {
      title: 'جلسه ساختمان',
      content: 'ساعت ۱۹ در لابی'
    });

    expect(sentPayload).not.toBeNull();
    const parsed = JSON.parse(sentPayload!);
    expect(parsed.event).toBe('NEW_ANNOUNCEMENT');
    expect(parsed.data.title).toBe('جلسه ساختمان');

    realtimeService.leaveRoom(mockSocket, room);
  });
});
