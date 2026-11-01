/**
 * ParsBuilding Real-Time WebSocket Client
 *
 * Implements:
 * - JWT-authenticated handshake
 * - Exponential backoff auto-reconnection
 * - Periodic heartbeat monitor (PING/PONG)
 * - Room subscription management
 * - Event listener dispatch supporting dual naming
 */

import { tokenStorage } from './api';

export interface WsMessage<T = any> {
  event: string;
  room?: string;
  data: T;
  timestamp: string;
}

export type WsEventListener<T = any> = (data: T, message: WsMessage<T>) => void;

export class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isExplicitDisconnect = false;
  private listeners: Map<string, Set<WsEventListener>> = new Map();
  private subscribedRooms: Set<string> = new Set();
  private statusListeners: Set<(status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR') => void> = new Set();

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public onStatusChange(cb: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR') => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR') {
    this.statusListeners.forEach(cb => cb(status));
  }

  public connect(): void {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) return;

    this.isExplicitDisconnect = false;
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
    const url = `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(accessToken)}`;

    try {
      this.setStatus('CONNECTING');
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.setStatus('CONNECTED');
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        // Re-subscribe to active rooms
        for (const room of this.subscribedRooms) {
          this.ws?.send(JSON.stringify({ action: 'SUBSCRIBE', room }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          this.dispatchMessage(msg);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.setStatus('DISCONNECTED');
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }

  public subscribe(room: string): void {
    this.subscribedRooms.add(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SUBSCRIBE', room }));
    }
  }

  public unsubscribe(room: string): void {
    this.subscribedRooms.delete(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'UNSUBSCRIBE', room }));
    }
  }

  public on<T = any>(event: string, listener: WsEventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.off(event, listener);
    };
  }

  public off<T = any>(event: string, listener: WsEventListener<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  private dispatchMessage(msg: WsMessage): void {
    const { event, data } = msg;

    // Dispatch to exact event listeners
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(listener => {
        try {
          listener(data, msg);
        } catch (e) {
          console.error(`Error in WebSocket listener for ${event}:`, e);
        }
      });
    }

    // Also dispatch to wildcard listeners
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach(listener => listener(data, msg));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (typeof window !== 'undefined') {
      this.pingInterval = window.setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PING' }));
        }
      }, 25000);
    }
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('ERROR');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000) + Math.random() * 500;
    this.reconnectAttempts++;
    this.setStatus('RECONNECTING');

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }
}

export const wsClient = WebSocketClient.getInstance();
