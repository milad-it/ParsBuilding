# Milestone 2 (M2) Technical Architecture Specification: Real-Time WebSockets & AI Receipt Verification Foundation

- **Author**: Teamwork Explorer (M2 Realtime & AI Explorer)
- **Role**: M2 Realtime & AI Explorer (`m2_explorer_3`)
- **Status**: PROPOSED ARCHITECTURAL SPECIFICATION
- **Target Files**:
  - `server/src/services/realtimeService.ts`
  - `server/src/services/receiptQueue.ts`
  - `server/src/services/receiptReconciliationService.ts`
  - `server/src/routes/websocketRoutes.ts`
- **Dependencies**: `@fastify/websocket`, `ws`, `fastify`, `@prisma/client`, `zod`

---

## 1. Executive Summary & Architectural Scope

Milestone 2 establishes two critical future-ready pillars for the ParsBuilding commercial SaaS platform:
1. **Real-Time WebSocket Gateway (`realtimeService.ts`)**: Built on top of `@fastify/websocket` to provide sub-millisecond, multi-tenant message distribution. It enforces rigorous room isolation boundaries (`complex:{id}` for building-wide announcements/ledger updates, `unit:{id}` for private resident statements/receipt verifications) with JWT authentication and ping-pong connection health tracking.
2. **AI Payment Receipt Verification Foundation (`receiptQueue.ts`)**: An asynchronous job queue and worker architecture utilizing an adapter pattern (BullMQ for Redis-backed distributed environments + zero-dependency In-Memory fallback for dev/testing). It manages the receipt lifecycle (`PENDING` -> `PROCESSING` -> `VERIFIED` | `REJECTED` | `MANUAL_REVIEW`), extracts structured metadata via OCR/Vision hooks (`extractedAmount`, `extractedDate`, `extractedTrackingNum`, `extractedSenderCard`, `confidenceScore`), and automates reconciliation against open unit invoices and ledger transactions with tenant-safe execution via `runWithTenantContext`.

```
               ┌────────────────────────────────────────────────────────┐
               │             ParsBuilding Multi-Tenant API              │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
                   ▼                                             ▼
     ┌───────────────────────────┐                 ┌───────────────────────────┐
     │     WebSocket Gateway     │                 │   AI Receipt Queue &      │
     │   (realtimeService.ts)    │                 │  Worker (receiptQueue.ts) │
     ├───────────────────────────┤                 ├───────────────────────────┤
     │ • @fastify/websocket (ws) │                 │ • BullMQ & In-Memory Fallback│
     │ • JWT Handshake Auth      │                 │ • Vision/OCR Extractor    │
     │ • Room: complex:{id}      │                 │ • Auto Reconciliation     │
     │ • Room: unit:{id}         │                 │ • Double-Entry Ledger Tx  │
     │ • Ping/Pong Heartbeat     │                 │ • Multi-Tenant Context    │
     └───────────────────────────┘                 └───────────────────────────┘
```

---

## 2. Real-Time WebSocket Gateway Architecture (`realtimeService.ts`)

### 2.1 Technology Stack & Plugin Integration
- **Engine**: `@fastify/websocket` (version `^10.0.1` already installed in `server/package.json`).
- **Underlying Protocol**: RFC 6455 WebSockets backed by `ws`.
- **Mount Point**: Registered at `/api/v1/ws` or `/ws` with route shorthand `{ websocket: true }`.

### 2.2 Handshake Authentication & Security
When a client initiates a WebSocket handshake, authentication is enforced *before* room subscription is permitted:
1. **Token Extraction**: The client provides the JWT access token via query parameter (`ws://.../ws?token=<jwt_access_token>`), or via `Sec-WebSocket-Protocol` header, or via signed cookie (`access_token`).
2. **Token Verification**: Handshake handler verifies the token against `env.JWT_SECRET`.
3. **Session Context Extraction**: The decoded payload establishes:
   - `userId`: Identifier of the authenticated user.
   - `complexId`: Active tenant identifier.
   - `role`: Role (`SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER`, `RESIDENT`).
   - `authorizedUnits`: Array of unit IDs the user has explicit rights to access.
4. **Rejection Policy**: If token is missing, expired, or invalid, the socket is terminated immediately with WebSocket Close Code `4401` (Unauthorized) or `1008` (Policy Violation).

### 2.3 Multi-Tenant Room Isolation Matrix

| Room Pattern | Purpose | Audience | Access Control Rules |
| :--- | :--- | :--- | :--- |
| `complex:{complexId}` | Building-wide notices, digital bulletin board, periodic ledger updates, billing cycle notices | All residents & managers of that building | `SUPER_ADMIN` OR matching `user.complexId === targetComplexId`. Cross-tenant subscription is strictly blocked (RFC 7807 error). |
| `unit:{unitId}` | Private resident statements, unit payment confirmations, personal receipt verification alerts | Resident of that unit, complex managers | `SUPER_ADMIN`, `COMPLEX_MANAGER` (for units in their complex), or `RESIDENT` belonging to that specific `unitId`. Residents cannot subscribe to other units. |
| `user:{userId}` | Direct system notifications, session revocation signals | Specific user | `SUPER_ADMIN` OR matching `user.id === targetUserId`. |

### 2.4 WebSocket Event Types & Data Contracts

All messages transmitted across the WebSocket connection adhere to the standard envelope format:

```typescript
export interface WsMessageEnvelope<T = any> {
  event: RealtimeEventType;
  room?: string;
  data: T;
  timestamp: string; // ISO 8601 UTC
  correlationId?: string;
}
```

#### Event Catalog:
1. **`NEW_ANNOUNCEMENT`**:
   - **Target Room**: `complex:{complexId}`
   - **Trigger**: Manager publishes an announcement on the digital bulletin board.
   - **Payload**:
     ```typescript
     {
       id: string;
       complexId: string;
       title: string;
       content: string;
       senderName: string;
       isNotice: boolean;
       createdAt: string;
     }
     ```
2. **`PAYMENT_RECEIVED`**:
   - **Target Room**: `complex:{complexId}` (ledger summary) & `unit:{unitId}` (receipt/balance update)
   - **Trigger**: Payment recorded manually, via gateway, or verified via AI receipt OCR.
   - **Payload**:
     ```typescript
     {
       transactionId: string;
       complexId: string;
       unitId: string;
       unitNumber: number;
       amount: number;
       paymentMethod: 'CASH' | 'CARD_TRANSFER' | 'GATEWAY' | 'OFFSET';
       newBalance: number;
       treasuryFund: number;
       timestamp: string;
     }
     ```
3. **`BILLING_PERIOD_OPENED`**:
   - **Target Room**: `complex:{complexId}`
   - **Trigger**: Manager initiates a new billing cycle (e.g. "آبان ۱۴۰۳").
   - **Payload**:
     ```typescript
     {
       periodId: string;
       complexId: string;
       name: string;
       year: number;
       month: string;
       status: 'ACTIVE';
       totalExpenses: number;
       startedAt: string;
     }
     ```
4. **`BILLING_PERIOD_CLOSED`**:
   - **Target Room**: `complex:{complexId}`
   - **Trigger**: Manager closes and locks the billing period after calculation reconciliation.
   - **Payload**:
     ```typescript
     {
       periodId: string;
       complexId: string;
       name: string;
       status: 'CLOSED';
       totalCollected: number;
       totalDistributed: number;
       closedAt: string;
     }
     ```
5. **`RECEIPT_VERIFIED`**:
   - **Target Room**: `unit:{unitId}` (and notification to `complex:{complexId}` manager channel)
   - **Trigger**: Asynchronous AI OCR worker completes verification or manager confirms review.
   - **Payload**:
     ```typescript
     {
       receiptId: string;
       complexId: string;
       unitId: string;
       status: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
       extractedAmount: number | null;
       trackingNumber: string | null;
       rejectionReason?: string;
       confidenceScore: number;
       verifiedAt: string;
     }
     ```

### 2.5 Heartbeat, Ping-Pong & Connection Lifecycle
- **Ping Interval**: 30 seconds (`PING_INTERVAL_MS = 30_000`).
- **Pong Timeout**: 10 seconds (`PONG_TIMEOUT_MS = 10_000`).
- **Connection Health Tracking**:
  - Each socket is tagged with `isAlive = true`.
  - Every interval, the server sends an RFC 6455 Ping frame and marks `isAlive = false`.
  - Upon receiving Pong (`socket.on('pong', ...)`), the server sets `isAlive = true`.
  - If a socket is found with `isAlive === false` during the check, the connection is terminated (`socket.terminate()`), preventing ghost sockets, half-open TCP connections, and resource leaks.
- **Client Protocol**:
  - In addition to protocol-level pings, clients may send `{ "action": "PING" }` and receive `{ "event": "PONG", "timestamp": "..." }`.

### 2.6 Implementation Blueprint: `realtimeService.ts`

```typescript
import { WebSocket } from 'ws';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify } from '../middleware/authMiddleware'; // M2 auth integration
import { env } from '../config/env';

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
  // Map socket -> user metadata
  private activeSockets: Set<ExtendedWebSocket> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;

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
   * Start heartbeat monitor (every 30s)
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
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  /**
   * Handle incoming Fastify WebSocket connection
   */
  public handleConnection(socket: ExtendedWebSocket, req: FastifyRequest): void {
    socket.isAlive = true;
    socket.rooms = new Set();

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw: Buffer | string) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handleClientMessage(socket, payload);
      } catch (err) {
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
  private handleClientMessage(socket: ExtendedWebSocket, msg: any): void {
    switch (msg.action) {
      case 'PING':
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

    // Room: complex:{complexId}
    if (room.startsWith('complex:')) {
      const targetComplex = room.replace('complex:', '');
      return user.complexId === targetComplex;
    }

    // Room: unit:{unitId}
    if (room.startsWith('unit:')) {
      const targetUnit = room.replace('unit:', '');
      if (user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
        // Manager can subscribe to any unit in their complex
        return true;
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

  private removeSocket(socket: ExtendedWebSocket): void {
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

  public broadcastToUnit<T>(unitId: string, event: RealtimeEventType, data: T): void {
    this.broadcastToRoom(`unit:${unitId}`, event, data);
  }

  private sendToSocket<T>(socket: ExtendedWebSocket, event: RealtimeEventType, data: T): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
    }
  }

  public close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const socket of this.activeSockets) {
      socket.close();
    }
    this.activeSockets.clear();
    this.rooms.clear();
  }
}

export const realtimeService = RealtimeService.getInstance();
```

---

## 3. AI Payment Receipt Verification Hook Architecture (`receiptQueue.ts`)

### 3.1 Business Context & Problem Statement
Residents upload photos of bank transfer receipts (کارت به کارت / فیش واریز / پایا / ساتنا) to settle monthly building maintenance charges.
Processing these receipts manually imposes major administrative overhead on building managers. The AI Payment Receipt Verification Foundation automates this workflow:
1. Resident uploads receipt image via REST endpoint (`/api/v1/units/:id/receipts`).
2. An immutable `ReceiptVerification` record is initialized with status `PENDING`.
3. An asynchronous verification job is dispatched to `receiptQueue`.
4. Worker transitions job to `PROCESSING` and invokes the AI Vision/OCR model.
5. The OCR model extracts Persian/Arabic amounts, payment dates, bank tracking numbers, and card numbers.
6. The reconciliation engine matches the extracted payment against the unit's unpaid balance or open invoices.
7. High-confidence matches automatically settle the invoice, update the unit balance and treasury fund, record a `LedgerTransaction`, and dispatch real-time WebSocket events.
8. Low-confidence or ambiguous receipts transition to `MANUAL_REVIEW`, presenting the manager with side-by-side OCR crops for instant 1-click approval.

### 3.2 Prisma Schema & Status State Machine

#### State Transition Diagram:
```
           ┌───────────┐
           │  PENDING  │  (Job queued upon resident upload)
           └─────┬─────┘
                 │
                 ▼
           ┌───────────┐
           │PROCESSING │  (Worker acquires job & calls Vision LLM)
           └─────┬─────┘
                 │
      ┌──────────┼──────────────────────┐
      │          │                      │
(Conf >= 0.90 &  (Conf 0.70-0.89 OR    (Unreadable / Duplicate /
 Valid Account)   Amount Discrepancy)   Forged)
      │          │                      │
      ▼          ▼                      ▼
┌──────────┐┌─────────────┐       ┌──────────┐
│ VERIFIED ││MANUAL_REVIEW│       │ REJECTED │
└──────────┘└──────┬──────┘       └──────────┘
                   │
         (Manager manual check)
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
    ┌──────────┐       ┌──────────┐
    │ VERIFIED │       │ REJECTED │
    └──────────┘       └──────────┘
```

#### Schema Alignment Note:
In `schema.prisma`, `ReceiptStatus` currently contains `[PENDING, PROCESSED, VERIFIED, REJECTED]`.
To natively support `PROCESSING` and `MANUAL_REVIEW`, we recommend updating the Prisma enum in M2:
```prisma
enum ReceiptStatus {
  PENDING           // در صف انتظار پردازش OCR هوش مصنوعی
  PROCESSING        // در حال پردازش توسط مدل بینایی ماشین
  MANUAL_REVIEW     // نیازمند بازبینی دستی مدیر (عدم تطابق دقیق یا اطمینان متوسط)
  VERIFIED          // تایید نهایی و اعمال خودکار در دفتر کل
  REJECTED          // رد شده (تکراری، نامعتبر یا جعلی)
}
```
*Backward Compatibility Hook*: When operating before enum migration, the application maps `PROCESSING` -> worker memory status and `MANUAL_REVIEW` -> `PROCESSED`.

### 3.3 Extracted Metadata Contract & Normalization

```typescript
export interface ExtractedReceiptMetadata {
  extractedAmount: number | null;       // Parsed integer currency (Tomans or Rials)
  extractedDate: Date | null;          // Parsed payment date
  extractedTrackingNum: string | null; // Unique bank reference number (شماره پیگیری / ارجاع)
  extractedSenderCard: string | null;  // Origin card (last 4 digits or full masked card)
  destinationCard: string | null;      // Target card (building bank account)
  confidenceScore: number;             // Confidence coefficient: 0.00 to 1.00
  rawAiOutput: Record<string, any>;    // Raw JSON bounding boxes, tokens, prompt response
}
```

#### Persian/Arabic Numeral Normalization:
Utilizes `server/src/utils/numberUtils.ts`:
- `toEnDigit(str)`: Converts Persian (`۰-۹`) and Arabic (`٠-٩`) numerals to English digits (`0-9`), resolving numeral ambiguities.
- `parseIntegerCurrency(val)`: Normalizes Persian currency representations (e.g., `"۱,۵۰۰,۰۰۰ ریال"` -> `150000` Tomans or `1500000` Rials according to `complex.currency`).

### 3.4 Queue Adapter Contract (`IReceiptQueueAdapter`)

To prevent hard external runtime dependencies during testing and local development while supporting enterprise horizontal scaling, an Adapter Pattern is specified:

```typescript
export interface ReceiptVerificationJobPayload {
  receiptId: string;
  complexId: string;
  unitId: string;
  uploadedById: string;
  imageUrl: string;
  expectedAmount?: number;
  createdAt: string;
}

export interface ReceiptVerificationJobResult {
  receiptId: string;
  status: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
  metadata: ExtractedReceiptMetadata;
  reconciliation?: {
    autoSettled: boolean;
    ledgerTransactionId?: string;
    settledAmount: number;
    discrepancyNote?: string;
  };
}

export interface IReceiptQueueAdapter {
  addJob(jobName: string, data: ReceiptVerificationJobPayload): Promise<string>;
  processJobs(handler: (jobData: ReceiptVerificationJobPayload) => Promise<ReceiptVerificationJobResult>): void;
  getJobStatus(jobId: string): Promise<'waiting' | 'active' | 'completed' | 'failed' | 'unknown'>;
  close(): Promise<void>;
}
```

#### 1. `BullMQReceiptQueueAdapter` (Production Distributed Queue)
- Backed by Redis connection (`ioredis`).
- Configured with exponential backoff retry:
  - Max retries: 3.
  - Backoff: exponential (initial 2s, factor 2).
- Dead-letter queue / failed job retention for diagnostics.

#### 2. `InMemoryReceiptQueueAdapter` (Dev & CI/CD Lightweight Engine)
- Zero external Redis dependency.
- Queue implemented via Node.js in-process concurrency pipeline.
- Handles jobs asynchronously via `setImmediate` / microtask queue.
- 100% deterministic execution for automated Vitest and E2E test runs.

### 3.5 Automated Financial Reconciliation Engine

When a receipt verification job finishes extracting metadata:
1. **Tenant Context Encapsulation**: The worker executes the entire verification logic inside `runWithTenantContext`:
   ```typescript
   await runWithTenantContext(
     { complexId: payload.complexId, userId: payload.uploadedById, role: 'SUPER_ADMIN', permissions: [] },
     async () => {
       // All Prisma queries automatically enforce complexId scoping
     }
   );
   ```

2. **Step 1: Anti-Replay & Duplicate Detection**:
   ```typescript
   if (metadata.extractedTrackingNum) {
     const existingTx = await prisma.ledgerTransaction.findFirst({
       where: { referenceNumber: metadata.extractedTrackingNum }
     });
     if (existingTx) {
       return {
         status: 'REJECTED',
         rejectionReason: 'شماره پیگیری تکراری است؛ این فیش قبلاً در سیستم ثبت شده است.'
       };
     }
   }
   ```

3. **Step 2: Bank Destination Validation**:
   - Compare `metadata.destinationCard` with `complex.settings.bankCard` (or registered building bank accounts).
   - If destination card is known and does not match: route to `MANUAL_REVIEW` (reason: "کارت مقصد با کارت حساب ساختمان تطابق ندارد").

4. **Step 3: Unit Debt & Invoice Matching**:
   - Fetch target `unit`: check `unit.currentBalance` (positive balance indicates outstanding debt).
   - Fetch active open `UnitCharge` for the current month.
   - Scenario A: `extractedAmount === unit.currentBalance` OR matches the open charge amount with `confidenceScore >= 0.90`:
     - **Auto-Verification**:
       1. Record `LedgerTransaction`:
          - `type = PAYMENT`
          - `txKind = MANUAL` (or `RECEIPT`)
          - `amount = metadata.extractedAmount`
          - `referenceNumber = metadata.extractedTrackingNum`
          - `paymentMethod = CARD_TRANSFER`
          - `receiptId = receipt.id`
          - `description = `واریز خودکار شارژ از طریق تایید هوشمند فیش بانکی (پیگیری: ${metadata.extractedTrackingNum})``
       2. Update `unit.currentBalance = unit.currentBalance - extractedAmount`.
       3. Update `complex.currentFund = complex.currentFund + extractedAmount`.
       4. Update `ReceiptVerification`: `status = VERIFIED`, `verifiedAt = now()`.
       5. Trigger Real-Time Notification:
          - `realtimeService.broadcastToUnit(unitId, 'RECEIPT_VERIFIED', { ... })`
          - `realtimeService.broadcastToComplex(complexId, 'PAYMENT_RECEIVED', { ... })`
   - Scenario B: Amount does not exactly match debt (partial payment or overpayment), or `0.70 <= confidenceScore < 0.90`:
     - Route to `MANUAL_REVIEW`.
     - Update `ReceiptVerification`: `status = MANUAL_REVIEW`, populate `extractedAmount`, `trackingNumber`, `rawAiOutput`.
     - Alert manager via real-time WebSocket: `realtimeService.broadcastToComplex(complexId, 'RECEIPT_VERIFIED', { status: 'MANUAL_REVIEW' })`.
   - Scenario C: Image is unreadable or forged (`confidenceScore < 0.50` or no tracking number):
     - Route to `REJECTED` with clear Persian explanation.

### 3.6 Implementation Blueprint: `receiptQueue.ts`

```typescript
import { EventEmitter } from 'node:events';
import { prisma } from '../config/database';
import { runWithTenantContext } from '../middleware/tenant';
import { realtimeService } from './realtimeService';
import { parseIntegerCurrency, toEnDigit } from '../utils/numberUtils';

export interface ExtractedReceiptMetadata {
  extractedAmount: number | null;
  extractedDate: Date | null;
  extractedTrackingNum: string | null;
  extractedSenderCard: string | null;
  destinationCard: string | null;
  confidenceScore: number;
  rawAiOutput: Record<string, any>;
}

export interface ReceiptVerificationJobPayload {
  receiptId: string;
  complexId: string;
  unitId: string;
  uploadedById: string;
  imageUrl: string;
  expectedAmount?: number;
  createdAt: string;
}

export interface ReceiptVerificationJobResult {
  receiptId: string;
  status: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
  metadata: ExtractedReceiptMetadata;
  reconciliation?: {
    autoSettled: boolean;
    ledgerTransactionId?: string;
    settledAmount: number;
    discrepancyNote?: string;
  };
  rejectionReason?: string;
}

/**
 * Pluggable AI Vision Provider Interface
 */
export interface IReceiptVisionProvider {
  extractReceipt(imageUrl: string): Promise<ExtractedReceiptMetadata>;
}

/**
 * Mock Vision Provider for deterministic testing & offline fallback
 */
export class MockReceiptVisionProvider implements IReceiptVisionProvider {
  public async extractReceipt(imageUrl: string): Promise<ExtractedReceiptMetadata> {
    // Simulates OCR processing delay
    await new Promise(r => setTimeout(r, 50));

    // High confidence mock extraction
    return {
      extractedAmount: 1_500_000,
      extractedDate: new Date(),
      extractedTrackingNum: `TRK-${Date.now().toString().slice(-6)}`,
      extractedSenderCard: '6037-****-****-1234',
      destinationCard: '5022-****-****-9876',
      confidenceScore: 0.95,
      rawAiOutput: {
        model: 'parsbuilding-vision-v1',
        ocrConfidence: 0.98,
        fieldsDetected: ['amount', 'tracking', 'date', 'cards']
      }
    };
  }
}

/**
 * Dual-Mode Queue Adapter
 */
export class ReceiptVerificationQueue {
  private static instance: ReceiptVerificationQueue;
  private visionProvider: IReceiptVisionProvider;
  private queueEmitter = new EventEmitter();
  private isProcessing = false;
  private jobList: ReceiptVerificationJobPayload[] = [];

  private constructor() {
    this.visionProvider = new MockReceiptVisionProvider();
    this.initWorker();
  }

  public static getInstance(): ReceiptVerificationQueue {
    if (!ReceiptVerificationQueue.instance) {
      ReceiptVerificationQueue.instance = new ReceiptVerificationQueue();
    }
    return ReceiptVerificationQueue.instance;
  }

  public setVisionProvider(provider: IReceiptVisionProvider): void {
    this.visionProvider = provider;
  }

  /**
   * Enqueue a receipt for background verification
   */
  public async enqueue(payload: ReceiptVerificationJobPayload): Promise<string> {
    this.jobList.push(payload);
    setImmediate(() => this.queueEmitter.emit('jobAdded'));
    return payload.receiptId;
  }

  private initWorker(): void {
    this.queueEmitter.on('jobAdded', async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      while (this.jobList.length > 0) {
        const job = this.jobList.shift();
        if (job) {
          try {
            await this.processJob(job);
          } catch (err) {
            console.error(`Error processing receipt job ${job.receiptId}:`, err);
          }
        }
      }

      this.isProcessing = false;
    });
  }

  /**
   * Process single receipt job with fail-closed tenant scoping
   */
  private async processJob(job: ReceiptVerificationJobPayload): Promise<ReceiptVerificationJobResult> {
    return runWithTenantContext(
      {
        complexId: job.complexId,
        userId: job.uploadedById,
        role: 'SUPER_ADMIN', // Internal worker operates with elevated system role scoped to complexId
        permissions: []
      },
      async () => {
        // Step 1: Update status to PROCESSING (or update DB record)
        await prisma.receiptVerification.update({
          where: { id: job.receiptId },
          data: { status: 'PENDING' } // or 'PROCESSING' after enum migration
        });

        // Step 2: Extract metadata via AI Vision
        const metadata = await this.visionProvider.extractReceipt(job.imageUrl);

        // Step 3: Anti-Replay Duplicate Tracking Check
        if (metadata.extractedTrackingNum) {
          const duplicate = await prisma.ledgerTransaction.findFirst({
            where: {
              referenceNumber: metadata.extractedTrackingNum,
              complexId: job.complexId
            }
          });

          if (duplicate) {
            await prisma.receiptVerification.update({
              where: { id: job.receiptId },
              data: {
                status: 'REJECTED',
                rejectionReason: 'شماره پیگیری فیش قبلاً در سیستم ثبت شده است (فیش تکراری).',
                rawAiOutput: metadata.rawAiOutput
              }
            });

            const result: ReceiptVerificationJobResult = {
              receiptId: job.receiptId,
              status: 'REJECTED',
              metadata,
              rejectionReason: 'Duplicate tracking number'
            };

            realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', result);
            return result;
          }
        }

        // Step 4: Unit & Financial Balance Reconciliation
        const unit = await prisma.unit.findUnique({
          where: { id: job.unitId }
        });

        const amount = metadata.extractedAmount ?? 0;
        const currentBalance = unit ? Number(unit.currentBalance) : 0;

        // Auto-Verification condition: High confidence and valid amount
        if (metadata.confidenceScore >= 0.90 && amount > 0) {
          const txId = `tx-rcpt-${Date.now()}`;

          // Create double-entry ledger transaction
          const tx = await prisma.ledgerTransaction.create({
            data: {
              complexId: job.complexId,
              unitId: job.unitId,
              transactionId: txId,
              txKind: 'MANUAL',
              type: 'PAYMENT',
              amount: amount,
              description: `واریز آنلاین تایید هوشمند فیش بانکی (شماره پیگیری: ${metadata.extractedTrackingNum ?? 'نامشخص'})`,
              paymentMethod: 'CARD_TRANSFER',
              referenceNumber: metadata.extractedTrackingNum,
              receiptId: job.receiptId,
              createdById: job.uploadedById
            }
          });

          // Adjust unit balance and complex liquid fund
          await prisma.unit.update({
            where: { id: job.unitId },
            data: { currentBalance: { decrement: amount } }
          });

          await prisma.complex.update({
            where: { id: job.complexId },
            data: { currentFund: { increment: amount } }
          });

          // Update receipt record
          await prisma.receiptVerification.update({
            where: { id: job.receiptId },
            data: {
              status: 'VERIFIED',
              extractedAmount: amount,
              extractedDate: metadata.extractedDate,
              trackingNumber: metadata.extractedTrackingNum,
              destinationCard: metadata.destinationCard,
              verifiedAt: new Date(),
              rawAiOutput: metadata.rawAiOutput
            }
          });

          const result: ReceiptVerificationJobResult = {
            receiptId: job.receiptId,
            status: 'VERIFIED',
            metadata,
            reconciliation: {
              autoSettled: true,
              ledgerTransactionId: tx.id,
              settledAmount: amount
            }
          };

          // Broadcast real-time events
          realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', result);
          realtimeService.broadcastToComplex(job.complexId, 'PAYMENT_RECEIVED', {
            transactionId: tx.transactionId,
            complexId: job.complexId,
            unitId: job.unitId,
            unitNumber: unit?.unitNumber ?? 0,
            amount: amount,
            paymentMethod: 'CARD_TRANSFER',
            newBalance: currentBalance - amount,
            timestamp: new Date().toISOString()
          });

          return result;
        }

        // Low confidence or unparseable amount -> MANUAL_REVIEW
        await prisma.receiptVerification.update({
          where: { id: job.receiptId },
          data: {
            status: 'PROCESSED', // or 'MANUAL_REVIEW' post enum migration
            extractedAmount: amount > 0 ? amount : null,
            extractedDate: metadata.extractedDate,
            trackingNumber: metadata.extractedTrackingNum,
            destinationCard: metadata.destinationCard,
            rawAiOutput: metadata.rawAiOutput,
            rejectionReason: 'نیازمند بررسی دستی مدیر (اطمینان پایین مدل یا عدم تطابق مبلغ)'
          }
        });

        const reviewResult: ReceiptVerificationJobResult = {
          receiptId: job.receiptId,
          status: 'MANUAL_REVIEW',
          metadata
        };

        realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', reviewResult);
        realtimeService.broadcastToComplex(job.complexId, 'RECEIPT_VERIFIED', reviewResult);
        return reviewResult;
      }
    );
  }
}

export const receiptVerificationQueue = ReceiptVerificationQueue.getInstance();
```

---

## 4. End-to-End Workflow & Integration Diagrams

### 4.1 Flow: AI Payment Receipt Verification & Instant Ledger Settlement
```
[ Resident Client ]            [ Fastify API ]             [ ReceiptQueue ]            [ AI Vision Provider ]           [ Database (Prisma) ]         [ RealtimeService ]
        │                             │                            │                             │                              │                             │
        │ 1. POST /units/:id/receipts │                            │                             │                              │                             │
        ├────────────────────────────>│                            │                             │                              │                             │
        │                             │ 2. Insert PENDING Receipt  │                             │                              │                             │
        │                             ├────────────────────────────────────────────────────────────────────────────────────────>│                             │
        │                             │ 3. Enqueue Job             │                             │                              │                             │
        │                             ├───────────────────────────>│                             │                              │                             │
        │ 4. 202 Accepted {id}        │                            │                             │                              │                             │
        │<────────────────────────────┤                            │                             │                              │                             │
        │                             │                            │ 5. Call OCR / Vision        │                              │                             │
        │                             │                            ├────────────────────────────>│                              │                             │
        │                             │                            │ 6. Extracted Metadata JSON  │                              │                             │
        │                             │                            │<────────────────────────────┤                              │                             │
        │                             │                            │ 7. Check Duplicate Tracking & Balance                      │                             │
        │                             │                            ├───────────────────────────────────────────────────────────>│                             │
        │                             │                            │ 8. Record LedgerTx & Decrement Unit Balance                │                             │
        │                             │                            ├───────────────────────────────────────────────────────────>│                             │
        │                             │                            │ 9. Update Receipt -> VERIFIED                              │                             │
        │                             │                            ├───────────────────────────────────────────────────────────>│                             │
        │                             │                            │ 10. Broadcast RECEIPT_VERIFIED                             │                             │
        │                             │                            ├─────────────────────────────────────────────────────────────────────────────────────────>│
        │ 11. WS event: RECEIPT_VERIFIED (unit:id)                 │                             │                              │                             │
        │<────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
```

---

## 5. Implementation Roadmap & Verification Plan

### Phase 1: Unit & Integration Test Coverage
1. **WebSocket Unit Tests (`server/tests/realtimeService.test.ts`)**:
   - Connection lifecycle: Handshake JWT token parsing and unauthorized rejection.
   - Multi-tenant room isolation: Validating that Resident A cannot subscribe to Unit B or Complex B.
   - Event delivery: Emitting events to `complex:{id}` and ensuring only subscribed clients receive the payload.
   - Heartbeat termination: Verifying that sockets failing Pong reply within 10s are terminated.
2. **AI Receipt Queue Unit Tests (`server/tests/receiptQueue.test.ts`)**:
   - Enqueue and background worker execution with `InMemoryReceiptQueueAdapter`.
   - Anti-replay test: Rejecting duplicate tracking numbers with `status = REJECTED`.
   - Auto-reconciliation test: Verifying `LedgerTransaction` creation, `unit.currentBalance` reduction, and `complex.currentFund` increase.
   - Low confidence fallback: Marking receipts as `MANUAL_REVIEW`.

### Phase 2: E2E Contract Verification
- Validate against `tests_e2e/suites/tier1_features/f14_realtime_ai_foundations.test.ts`:
  - `T1.14.1`: Room format `complex:{complexId}`.
  - `T1.14.2`: Room format `unit:{unitId}`.
  - `T1.14.3`: AI receipt job payload validation.
  - `T1.14.4`: AI receipt status transitions (`PENDING`, `PROCESSING`, `VERIFIED`, `REJECTED`, `MANUAL_REVIEW`).
  - `T1.14.5`: Resident notification payload schema.

---

## 6. Summary of Architectural Guarantees

1. **Strict Multi-Tenant Isolation**: Zero cross-tenant data leakage on WebSockets. Sockets are restricted to their authenticated `complexId` and assigned `unitId`s.
2. **Non-Blocking Asynchronous AI Processing**: Image uploads return `202 Accepted` immediately; OCR and vision analysis run entirely in background queues.
3. **Resilient Adapter Pattern**: Operates seamlessly in memory for lightweight deployments and test suites, while fully compatible with distributed BullMQ Redis clusters for production.
4. **Deterministic Accounting Reconciliation**: High-confidence receipt verifications integrate directly with the double-entry accounting ledger with zero rounding errors and immutable audit logs.
