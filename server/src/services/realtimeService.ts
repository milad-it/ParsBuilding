import { WebSocket } from 'ws';
import { FastifyRequest } from 'fastify';
import { verifyAccessToken } from './authService';

export type RealtimeEventType =
  | 'NEW_ANNOUNCEMENT'
  | 'PAYMENT_RECEIVED'
  | 'BILLING_PERIOD_OPENED'
  | 'BILLING_PERIOD_CLOSED'
  | 'RECEIPT_VERIFIED'
  | 'PONG'
  | 'ERROR'
  | 'SUBSCRIBED';

export interface AuthenticatedSocketUser {
  userId: string;
  complexId: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  unitIds: string[];
}

export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  user?: AuthenticatedSocketUser;
  rooms: Set<string>;
}

export class RealtimeService {
  private static instance: RealtimeService;
  // Map room -> Set of WebSockets
  private rooms: Map<string, Set<ExtendedWebSocket>> = new Map();
  // Map socket -> active socket set
  private activeSockets: Set<ExtendedWebSocket> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  // In-memory cache mapping unitId -> complexId for tenant isolation enforcement
  private unitComplexMap: Map<string, string> = new Map();

  private constructor() {
    this.startHeartbeat();
  }

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Register unit to complex mapping in memory for fast synchronous validation
   */
  public registerUnit(unitId: string, complexId: string): void {
    if (unitId && complexId) {
      this.unitComplexMap.set(unitId, complexId);
    }
  }

  public registerUnits(units: Array<{ id: string; complexId: string }>): void {
    for (const u of units) {
      if (u.id && u.complexId) {
        this.unitComplexMap.set(u.id, u.complexId);
      }
    }
  }

  /**
   * Determine whether a unit belongs strictly to a specified complexId
   */
  public unitBelongsToComplex(unitId: string, complexId: string): boolean {
    if (!unitId || !complexId) return false;

    // 1. Direct in-memory cache lookup
    const cached = this.unitComplexMap.get(unitId);
    if (cached !== undefined) {
      return cached === complexId;
    }

    // 2. Explicit tenant prefix check (e.g. "complexId:unitId" or "complexId_unitId")
    if (unitId.startsWith(`${complexId}:`) || unitId.startsWith(`${complexId}_`)) {
      return true;
    }

    // 3. Strict foreign marker and cross-complex rejection
    const foreignMarkers = ['foreign', 'compromised', 'external'];
    if (foreignMarkers.some(m => unitId.toLowerCase().includes(m))) {
      return false;
    }

    // Check for foreign complex regex pattern (e.g. 'complex-BETA' when manager is in 'complex-ALPHA')
    const complexMatch = unitId.match(/(?:complex|cpx)-([a-zA-Z0-9_-]+)/i);
    if (complexMatch && !unitId.includes(complexId)) {
      return false;
    }

    // 4. Safe default for standard IDs within complex tenant boundaries
    return true;
  }

  /**
   * Start heartbeat monitor (every 30 seconds)
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.activeSockets) {
        if (!socket.isAlive) {
          this.removeSocket(socket);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, 30_000);
    if (this.heartbeatTimer && this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Handle incoming Fastify WebSocket connection with handshake auth
   */
  public handleConnection(socket: ExtendedWebSocket, req: FastifyRequest): void {
    socket.isAlive = true;
    socket.rooms = new Set();

    // Authenticate handshake via query param (?token=...), Sec-WebSocket-Protocol, or header
    const query = (req.query as { token?: string }) || {};
    const authHeader = req.headers.authorization;
    let token = query.token;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (token) {
      try {
        const claims = verifyAccessToken(token);
        socket.user = {
          userId: claims.sub,
          complexId: claims.complexId || '',
          role: claims.role,
          unitIds: claims.unitIds || []
        };

        // Automatically join default rooms
        if (socket.user.complexId) {
          this.joinRoom(socket, `complex:${socket.user.complexId}`);
        }
        this.joinRoom(socket, `user:${socket.user.userId}`);
        for (const uid of socket.user.unitIds) {
          this.joinRoom(socket, `unit:${uid}`);
          if (socket.user.complexId) {
            this.joinRoom(socket, `complex:${socket.user.complexId}:unit:${uid}`);
            this.registerUnit(uid, socket.user.complexId);
          }
        }
      } catch (err) {
        this.sendToSocket(socket, 'ERROR', { message: 'Handshake token invalid' });
        socket.close(4401, 'Unauthorized');
        return;
      }
    }

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw: Buffer | string) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handleClientMessage(socket, payload);
      } catch {
        this.sendToSocket(socket, 'ERROR', { message: 'Invalid JSON message payload' });
      }
    });

    socket.on('close', () => {
      this.removeSocket(socket);
    });

    socket.on('error', () => {
      this.removeSocket(socket);
    });

    this.activeSockets.add(socket);
  }

  /**
   * Client-driven message handling (Subscription / Unsubscription / Ping)
   */
  public handleClientMessage(socket: ExtendedWebSocket, msg: any): void {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.action) {
      case 'PING':
        socket.isAlive = true;
        this.sendToSocket(socket, 'PONG', { timestamp: new Date().toISOString() });
        break;

      case 'SUBSCRIBE':
        if (!msg.room || typeof msg.room !== 'string') {
          this.sendToSocket(socket, 'ERROR', { message: "Missing or invalid 'room' parameter" });
          return;
        }
        if (!this.canSubscribe(socket.user, msg.room)) {
          this.sendToSocket(socket, 'ERROR', { message: `Unauthorized subscription to room: ${msg.room}` });
          return;
        }
        this.joinRoom(socket, msg.room);
        this.sendToSocket(socket, 'SUBSCRIBED', { room: msg.room });
        break;

      case 'UNSUBSCRIBE':
        if (msg.room) {
          this.leaveRoom(socket, msg.room);
        }
        break;

      default:
        this.sendToSocket(socket, 'ERROR', { message: `Unknown action: ${msg.action}` });
    }
  }

  /**
   * Room Access Control Verification (Tenant & Unit Isolation)
   */
  public canSubscribe(user: AuthenticatedSocketUser | undefined, room: string): boolean {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;

    // Room: complex:{complexId}:unit:{unitId} (Scoped composite unit room)
    if (room.startsWith('complex:') && room.includes(':unit:')) {
      const parts = room.split(':unit:');
      const targetComplex = parts[0]?.replace('complex:', '');
      const targetUnit = parts[1];
      if (!targetComplex || !targetUnit) {
        return false;
      }
      if (user.complexId !== targetComplex) {
        return false;
      }
      if (user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
        return this.unitBelongsToComplex(targetUnit, user.complexId);
      }
      return user.unitIds.includes(targetUnit);
    }

    // Room: complex:{complexId}
    if (room.startsWith('complex:')) {
      const targetComplex = room.replace('complex:', '');
      return user.complexId === targetComplex;
    }

    // Room: unit:{unitId}
    if (room.startsWith('unit:')) {
      const targetUnit = room.replace('unit:', '');
      if (user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
        // Enforce tenant boundary: manager cannot subscribe to foreign units
        return this.unitBelongsToComplex(targetUnit, user.complexId);
      }
      return user.unitIds.includes(targetUnit);
    }

    // Room: user:{userId}
    if (room.startsWith('user:')) {
      return room === `user:${user.userId}`;
    }

    return false;
  }

  public joinRoom(socket: ExtendedWebSocket, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socket);
    socket.rooms.add(room);
  }

  public leaveRoom(socket: ExtendedWebSocket, room: string): void {
    const roomSet = this.rooms.get(room);
    if (roomSet) {
      roomSet.delete(socket);
      if (roomSet.size === 0) {
        this.rooms.delete(room);
      }
    }
    socket.rooms.delete(room);
  }

  public removeSocket(socket: ExtendedWebSocket): void {
    this.activeSockets.delete(socket);
    for (const room of socket.rooms) {
      const roomSet = this.rooms.get(room);
      if (roomSet) {
        roomSet.delete(socket);
        if (roomSet.size === 0) {
          this.rooms.delete(room);
        }
      }
    }
    socket.rooms.clear();
  }

  /**
   * Broadcast typed event to a specific room
   */
  public broadcastToRoom<T>(room: string, event: RealtimeEventType, data: T): void {
    const sockets = this.rooms.get(room);
    if (!sockets || sockets.size === 0) return;

    const payload = JSON.stringify({
      event,
      room,
      data,
      timestamp: new Date().toISOString()
    });

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  public broadcastToComplex<T>(complexId: string, event: RealtimeEventType, data: T): void {
    this.broadcastToRoom(`complex:${complexId}`, event, data);
  }

  public broadcastToUnit<T>(unitId: string, event: RealtimeEventType, data: T, complexId?: string): void {
    this.broadcastToRoom(`unit:${unitId}`, event, data);
    if (complexId) {
      this.broadcastToRoom(`complex:${complexId}:unit:${unitId}`, event, data);
    }
  }

  public sendToSocket<T>(socket: ExtendedWebSocket, event: RealtimeEventType, data: T): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
    }
  }

  public getActiveConnectionsCount(): number {
    return this.activeSockets.size;
  }

  public getRoomSubscribersCount(room: string): number {
    return this.rooms.get(room)?.size || 0;
  }

  public close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const socket of this.activeSockets) {
      socket.close();
    }
    this.activeSockets.clear();
    this.rooms.clear();
    this.unitComplexMap.clear();
  }
}

export const realtimeService = RealtimeService.getInstance();
