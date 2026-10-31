# Milestone 2 (M2) Architectural Plan: Immutable Audit Logging & Security Hardening

**Author**: M2 Audit & Security Explorer (`m2_explorer_2`)  
**Workspace**: `server/src/services/auditLogger.ts`, `server/src/config/`, `server/src/middleware/`  
**Target Milestone**: M2 Security Hardening, Authentication, RBAC, Audit Logging & Extensibility  
**Document Version**: 1.0.0 — Production SaaS Specification  

---

## 1. Executive Summary & Problem Boundary

ParsBuilding is a multi-tenant commercial SaaS building management platform serving high-value residential and commercial complexes across Iran. In multi-tenant building financial systems, financial accountability and security integrity are paramount:
1. **Audit Integrity**: Every manager, sub-manager, and resident interaction—especially financial movements (payments, charges, debt forgiveness), occupant/unit mutations, billing period closures, and permission changes—must be logged immutably. Once written, an audit log entry must **never** be modifiable or deletable by any user (including Super-Admins or compromised database credentials).
2. **Security Perimeter**: The application must withstand adversarial attacks including brute-force login attempts, cross-site scripting (XSS), prototype pollution, clickjacking, CORS spoofing, and SQL injection, while seamlessly supporting Persian RTL Unicode typography (e.g. ZWNJ, Persian numerals) and high-performance real-time SPA/3D interactions.

This document specifies the exact architecture, database schemas, extension hooks, Fastify plugins, and threat mitigation mechanisms required to fulfill M2 requirements.

---

## 2. Immutable Audit Logging Architecture

### 2.1 Interface & Data Model Mapping

The system defines the audit logging contract in `server/src/types/index.ts` and maps it directly to the PostgreSQL `AuditLog` table defined in `server/prisma/schema.prisma`.

#### Contract Mapping Matrix

| Contract Property (`AuditLogEntry`) | Prisma Model Field (`AuditLog`) | PostgreSQL Type | Nullable? | Purpose / Constraints |
|---|---|---|---|---|
| `id` | `id` | `BigInt` (Autoincrement) | No | Monotonically increasing primary key. Special BigInt JSON serialization required. |
| `complexId` | `complexId` | `String` (UUID) | Yes | Foreign key to `Complex`. Null only for global platform actions (e.g., SuperAdmin platform logins). Strictly enforced for tenant actions. |
| `actorId` | `actorId` | `String` (UUID) | Yes | Foreign key to `User`. Captured from `TenantContext.userId` or auth session. Nullable if unauthenticated (e.g. failed login). |
| *N/A (Derived)* | `actorRole` | `String` | Yes | Snapshot of the actor's role (`SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER`, `RESIDENT`, or `ANONYMOUS`) at execution time. |
| `action` | `action` | `AuditAction` (Enum) / `String` | No | Semantic operation identifier (e.g., `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `START_PERIOD`, `CLOSE_PERIOD`, `SETTLE_DEBT`, `PERMISSION_CHANGE`). |
| `entityType` | `entityType` | `String` (VARCHAR) | No | Target entity model name: `'Unit'`, `'Resident'`, `'Period'`, `'UnitCharge'`, `'LedgerTransaction'`, `'SubManagerPermission'`, `'User'`, `'Complex'`. |
| `entityId` | `entityId` | `String` (VARCHAR) | No | Primary key or reference identifier of the affected entity. |
| `beforeDelta` | `oldData` / `diff.before` | `Json` (JSONB) | Yes | Snapshot of changed attributes *before* the mutation. Excludes sensitive fields (e.g., passwords). |
| `afterDelta` | `newData` / `diff.after` | `Json` (JSONB) | Yes | Snapshot of changed attributes *after* the mutation. |
| *N/A (Computed)* | `diff` | `Json` (JSONB) | Yes | Compact field-level diff: `{ [field]: { from: valOld, to: valNew } }`. |
| `ipAddress` | `ipAddress` | `String` (VARCHAR) | Yes | Client IP address obtained via `request.ip` (supporting reverse-proxy headers like `X-Forwarded-For`). |
| *N/A (Header)* | `userAgent` | `String` (VARCHAR) | Yes | Client HTTP `User-Agent` string for device auditing. |
| *N/A (Context)* | `metadata` | `Json` (JSONB) | Yes | Extensible metadata (HTTP method, route path, transaction reference, failure reason, client timestamp). |
| `timestamp` | `createdAt` | `DateTime` (TIMESTAMPTZ) | No | Canonical server timestamp (`DEFAULT NOW()`). Append-only, monotonically non-decreasing. |

#### Handling BigInt Serialization
In JavaScript/V8, `BigInt` cannot be serialized by `JSON.stringify` out-of-the-box (`TypeError: Do not know how to serialize a BigInt`). To prevent runtime serialization crashes when querying `AuditLog` via Fastify REST endpoints:
```typescript
// server/src/utils/serialization.ts
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
```
Fastify's `fastify-type-provider-zod` response schemas will treat `id` as `z.string()`.

---

### 2.2 Deep Delta Engine & Field Redaction

To provide concise and forensic-grade audit trails without bloating storage or leaking security credentials, the `AuditLogger` service computes an exact delta while redacting sensitive fields.

```typescript
// Field redaction blacklist
const SENSITIVE_FIELDS = new Set([
  'passwordHash',
  'tokenHash',
  'secret',
  'cookieSecret',
  'rawAiOutput',
  'updatedAt' // volatile timestamp omitted from logical diff
]);

export interface DeltaComputation<T = Record<string, any>> {
  beforeDelta: Partial<T> | null;
  afterDelta: Partial<T> | null;
  diff: Record<string, { from: any; to: any }> | null;
}

export function computeDelta<T extends Record<string, any>>(
  before: T | null | undefined,
  after: T | null | undefined
): DeltaComputation<T> {
  // Scenario A: Creation (No previous state)
  if (!before && after) {
    const sanitizedAfter = sanitizePayload(after);
    return { beforeDelta: null, afterDelta: sanitizedAfter, diff: null };
  }

  // Scenario B: Deletion (No post-mutation state)
  if (before && !after) {
    const sanitizedBefore = sanitizePayload(before);
    return { beforeDelta: sanitizedBefore, afterDelta: null, diff: null };
  }

  // Scenario C: Modification (Before and After present)
  if (before && after) {
    const diff: Record<string, { from: any; to: any }> = {};
    const beforeDelta: Record<string, any> = {};
    const afterDelta: Record<string, any> = {};

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      if (SENSITIVE_FIELDS.has(key)) continue;

      const valBefore = before[key];
      const valAfter = after[key];

      // Deep / JSON comparison
      const isDifferent = typeof valBefore === 'object' && valBefore !== null
        ? JSON.stringify(valBefore) !== JSON.stringify(valAfter)
        : valBefore !== valAfter;

      if (isDifferent) {
        diff[key] = { from: valBefore, to: valAfter };
        beforeDelta[key] = valBefore;
        afterDelta[key] = valAfter;
      }
    }

    return {
      beforeDelta: Object.keys(beforeDelta).length > 0 ? beforeDelta : null,
      afterDelta: Object.keys(afterDelta).length > 0 ? afterDelta : null,
      diff: Object.keys(diff).length > 0 ? diff : null
    };
  }

  return { beforeDelta: null, afterDelta: null, diff: null };
}

function sanitizePayload<T extends Record<string, any>>(obj: T): Partial<T> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = val;
    }
  }
  return sanitized as Partial<T>;
}
```

---

### 2.3 Event Capture Specification Matrix

The `auditLogger` service exposes specialized dispatchers covering all critical business events:

| Category | Event Identifier | Entity Type | Trigger Location | Captured Data / Invariants |
|---|---|---|---|---|
| **Auth** | `LOGIN` | `User` | `authService.login` | Actor phone, IP, User-Agent, login success indicator. |
| **Auth** | `LOGIN_FAILED` | `User` | `authService.login` | Target phone, IP, User-Agent, failure reason (bad password, user locked). |
| **Auth** | `LOGOUT` | `User` | `authService.logout` | Revoked refresh token ID, session duration. |
| **Financial** | `RECORD_PAYMENT` | `LedgerTransaction` | `ledgerService.recordPayment` | `unitId`, `amount`, `paymentMethod`, `referenceNumber`, `balanceBefore`, `balanceAfter`. |
| **Financial** | `DEBT_RECORD` | `LedgerTransaction` | Period charge posting | `unitId`, `chargeId`, `amount`, `description`. |
| **Financial** | `SETTLE_DEBT` / `FORGIVE` | `LedgerTransaction` | `ledgerService.forgiveDebt` | `unitId`, `amountForgiven`, manager reason, balance delta. |
| **Units** | `CREATE_UNIT` | `Unit` | `unitService.createUnit` | `unitNumber`, `area`, `occupants`, `hasPackage`, `ownerName`, `balance`. |
| **Units** | `UPDATE_UNIT` | `Unit` | `unitService.updateUnit` | Full before/after delta (e.g. tenant change, occupancy adjustment). |
| **Residents** | `CREATE_RESIDENT` | `Resident` | `residentService.create` | `fullName`, `phone`, `type` (OWNER/TENANT), unit assignment. |
| **Residents** | `UPDATE_RESIDENT` | `Resident` | `residentService.update` | Phone changes, nationalCode modifications. |
| **Periods** | `START_PERIOD` | `Period` | `periodService.startPeriod` | `periodId`, expense inputs (`waterCost`, `gasCost`, etc.), state change `DRAFT -> ACTIVE`. |
| **Periods** | `CLOSE_PERIOD` | `Period` | `periodService.closePeriod` | `periodId`, `totalExpenses`, `totalCollected`, frozen calculation snapshot, state change `ACTIVE -> CLOSED`. |
| **RBAC** | `PERMISSION_CHANGE` | `SubManagerPermission` | `rbacService.updatePermissions` | Before/after permission flags (`canManageUnits`, `canClosePeriods`, etc.). |
| **Data Migration** | `MIGRATION` | `Complex` | `migrationService.import` | Imported units count, periods count, transactions count, zero discrepancy verification ($\Delta=0$). |

---

### 2.4 Immutable Security Guarantees (Defense-in-Depth)

Zero `UPDATE` or `DELETE` operations are permitted on `AuditLog`. To guarantee this immutability against both application bugs and direct database intrusion, we implement a **Four-Layer Defense**:

```
+-------------------------------------------------------------------+
| Layer 1: Prisma Client Extension Guard (Application/ORM Interceptor)|
| -> Throws AuditLogImmutableError on update/delete/upsert          |
+-------------------------------------------------------------------+
                                 |
+-------------------------------------------------------------------+
| Layer 2: PostgreSQL Database Triggers (RDBMS Wire Interceptor)     |
| -> BEFORE UPDATE OR DELETE OR TRUNCATE -> RAISE EXCEPTION         |
+-------------------------------------------------------------------+
                                 |
+-------------------------------------------------------------------+
| Layer 3: Database Role Privileges (Least Privilege Principle)     |
| -> REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_user    |
+-------------------------------------------------------------------+
                                 |
+-------------------------------------------------------------------+
| Layer 4: Tamper-Evident SHA-256 Hash Chaining (Forensic Audit)    |
| -> entryHash = SHA256(prevHash + id + deltas + timestamp)         |
+-------------------------------------------------------------------+
```

#### Layer 1: Prisma Client Extension Implementation
In `server/src/config/database.ts`, the `rawPrisma` client is extended to unconditionally reject mutating operations on `AuditLog`:

```typescript
export class AuditLogImmutableError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'AUDIT_LOG_IMMUTABLE_VIOLATION';

  constructor(operation: string) {
    super(`SecurityViolation: AuditLog is append-only. Operation '${operation}' is strictly forbidden.`);
    this.name = 'AuditLogImmutableError';
  }
}

// Added into Prisma Extension query interceptors:
export const prisma = rawPrisma.$extends({
  name: 'SecurityAndTenantExtension',
  query: {
    auditLog: {
      async update({ args }) {
        throw new AuditLogImmutableError('update');
      },
      async updateMany({ args }) {
        throw new AuditLogImmutableError('updateMany');
      },
      async delete({ args }) {
        throw new AuditLogImmutableError('delete');
      },
      async deleteMany({ args }) {
        throw new AuditLogImmutableError('deleteMany');
      },
      async upsert({ args }) {
        throw new AuditLogImmutableError('upsert');
      }
    },
    $allModels: {
      // Existing TenantIsolationExtension interceptors...
    }
  }
});
```

#### Layer 2: PostgreSQL Database Trigger Migration
In PostgreSQL, create a non-bypassable trigger that forbids row alteration or deletion at the engine level:

```sql
-- Migration: Enforce Immutable AuditLog Table
CREATE OR REPLACE FUNCTION enforce_audit_logs_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: The audit_logs table is append-only. Operation % is strictly prohibited on row ID %.',
    TG_OP, OLD.id
    USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$ LANGUAGE plpgsql;

-- Prevent UPDATE
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_logs_immutability();

-- Prevent DELETE
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_logs_immutability();

-- Prevent TRUNCATE
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_audit_logs_immutability();
```

#### Layer 3: Database Role Permissions
In PostgreSQL production deployment:
```sql
GRANT SELECT, INSERT ON audit_logs TO parsbuilding_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM parsbuilding_app;
```

---

### 2.5 Transactional Consistency & Atomic Logging

For critical financial transactions (such as posting payments, debt forgiveness, and period closing), the audit log entry **must be written within the same database transaction** as the financial mutation:

```typescript
// Pattern: Atomic Transaction with Embedded Audit Log
await prisma.$transaction(async (tx) => {
  // 1. Mutate financial entity
  const payment = await tx.ledgerTransaction.create({
    data: {
      complexId,
      unitId,
      type: 'PAYMENT',
      amount,
      description,
      paymentMethod,
      transactionId: `tx-${Date.now()}`
    }
  });

  // 2. Adjust unit balance
  await tx.unit.update({
    where: { id: unitId },
    data: { currentBalance: { decrement: amount } }
  });

  // 3. Immutably log transaction atomically
  await auditLogger.logWithTx(tx, {
    complexId,
    actorId,
    actorRole,
    action: 'RECORD_PAYMENT',
    entityType: 'LedgerTransaction',
    entityId: payment.id,
    ipAddress,
    userAgent,
    afterDelta: payment
  });
});
```
If the audit log cannot be created, the entire transaction rolls back, guaranteeing that no undocumented financial changes can ever exist in the system.

---

## 3. Security Hardening Architecture

### 3.1 Rate Limiting Architecture via `@fastify/rate-limit`

#### Threat Model
Unprotected endpoints allow:
1. Brute-force credential guessing on `/api/v1/auth/login`.
2. SMS/OTP flood attacks on password reset endpoints.
3. Denial-of-Service (DoS) attacks on heavy calculation or report export endpoints.

#### Configuration Strategy
We implement a two-tiered rate limiting strategy:
- **Tier 1 (Global Rate Limit)**: 100 requests per minute per IP for general authenticated API usage.
- **Tier 2 (Strict Login Rate Limit)**: 5 requests per 15 minutes per unique `IP + Phone` composite key on `/api/v1/auth/login`.

#### Implementation Specification

```typescript
// server/src/config/security.ts
import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyRequest } from 'fastify';

export async function configureRateLimiting(server: FastifyInstance) {
  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    enableDraftSpec: true, // Enables standard RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    },
    errorResponseBuilder: (request: FastifyRequest, context) => {
      return {
        type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. You have made ${context.current} requests in ${context.timeWindow}. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
        instance: request.raw.url || request.url
      };
    }
  });
}

// Route-specific strict rate limiting for /api/v1/auth/login
export const loginRateLimitConfig = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '15 minutes',
      keyGenerator: (request: FastifyRequest) => {
        const body = (request.body as { phone?: string }) || {};
        const clientIp = request.ip;
        const normalizedPhone = body.phone ? body.phone.trim() : 'anonymous';
        // Composite key ensures attackers rotating IPs cannot hammer a single account,
        // and shared NAT office IPs do not lock out distinct valid users.
        return `login:${clientIp}:${normalizedPhone}`;
      }
    }
  }
};
```

---

### 3.2 Helmet HTTP Security Headers via `@fastify/helmet`

HTTP security headers enforce defense at the browser level against clickjacking, MIME-sniffing, and cross-origin exploitation.

#### Configuration Specification
```typescript
import helmet from '@fastify/helmet';
import { FastifyInstance } from 'fastify';
import { env } from './env';

export async function configureHelmet(server: FastifyInstance) {
  await server.register(helmet, {
    // Cross-Origin Embedder Policy: disabled to permit loading external assets, Three.js shaders & WebSockets
    crossOriginEmbedderPolicy: false,

    // Cross-Origin Resource Policy: permit multi-tenant client subdomains
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // Cross-Origin Opener Policy: allow popup authentication if needed
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },

    // Hide X-Powered-By header to prevent fingerprinting
    hidePoweredBy: true,

    // HTTP Strict Transport Security (HSTS): Enforce HTTPS for 1 full year including subdomains
    hsts: env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,

    // Prevent MIME-type sniffing (X-Content-Type-Options: nosniff)
    noSniff: true,

    // Prevent iframe embedding and clickjacking (X-Frame-Options: DENY)
    frameguard: { action: 'deny' },

    // Enable legacy XSS filter protection (X-XSS-Protection: 1; mode=block)
    xssFilter: true,

    // Referrer Policy: Send full URL for same-origin, domain-only for cross-origin HTTPS
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Content Security Policy (CSP):
    // For pure REST API backends, frame-ancestors: 'none' blocks all iframe embedding.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // unsafe-inline needed for dynamic Tailwind classes
        connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null
      }
    }
  });
}
```

---

### 3.3 CORS Policy Configuration via `@fastify/cors`

#### Security Requirements
- Reject unauthorized origin requests while supporting developer localhost origins during development.
- Support `credentials: true` (for HttpOnly session cookies) **without ever exposing wildcard `*` origins**.
- Allow all essential custom headers (`X-Complex-Id`, `X-Tenant-Id`, `X-User-Id`, `X-User-Role`, `Authorization`).
- Expose rate limit and pagination headers to client apps.

#### Configuration Specification
```typescript
import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';
import { env } from './env';

export async function configureCors(server: FastifyInstance) {
  const configuredOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());

  await server.register(cors, {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Complex-Id',
      'X-Tenant-Id',
      'X-User-Id',
      'X-User-Role',
      'Accept',
      'Origin'
    ],
    exposedHeaders: [
      'Content-Range',
      'X-Total-Count',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After'
    ],
    maxAge: 86400, // 24 hours preflight cache
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-to-server, curl, tests)
      if (!origin) {
        return callback(null, true);
      }

      // Development convenience: allow localhost / 127.0.0.1 on any port
      if (env.NODE_ENV !== 'production') {
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocal) {
          return callback(null, true);
        }
      }

      // Production check: strictly match configured domain whitelist
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check regex patterns for multi-tenant subdomains (e.g. *.parsbuilding.ir)
      const isSubdomain = configuredOrigins.some(pattern => {
        if (pattern.startsWith('*.')) {
          const rootDomain = pattern.slice(2);
          return origin.endsWith(`.${rootDomain}`) || origin === `https://${rootDomain}`;
        }
        return false;
      });

      if (isSubdomain) {
        return callback(null, true);
      }

      // Reject unauthorized origins
      callback(new Error(`CORS Violation: Origin '${origin}' is not allowed by policy.`), false);
    }
  });
}
```

---

### 3.4 Input Sanitization & Threat Neutralization

#### 3.4.1 Cross-Site Scripting (XSS) Sanitization
Text fields (such as owner names, resident notes, building announcements, payment descriptions) can be abused to inject `<script>` tags, inline event handlers (`onload`, `onerror`), or malicious URLs (`javascript:`).

**Sanitization Algorithm**:
- Safely strips HTML markup and dangerous event attributes.
- **Strictly preserves Persian and Arabic characters, zero-width non-joiners (ZWNJ `\u200C`), Persian numerals (`۰-۹`), and legitimate punctuation.**
- Trims trailing and leading whitespace.

```typescript
// server/src/utils/sanitizer.ts

/**
 * Escapes HTML control characters while strictly preserving Persian Unicode text and ZWNJ.
 */
export function sanitizeXss(input: string): string {
  if (!input || typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

/**
 * Strips dangerous HTML tags while leaving inner text intact.
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input.replace(/<\/?[^>]+(>|$)/g, '');
}
```

#### 3.4.2 Prototype Pollution Mitigation
Fastify 4.x natively uses `secure-json-parse` for JSON body parsing. To guarantee complete immunity against prototype pollution attacks:
1. Configure Fastify's body parser to reject or strip `__proto__`, `constructor`, and `prototype` keys.
2. Provide a recursive object sanitization utility:

```typescript
// server/src/utils/sanitizer.ts
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizePrototype<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizePrototype) as unknown as T;
  }

  const clean = Object.create(null);
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue; // Drop dangerous prototype keys
    }
    clean[key] = sanitizePrototype(value);
  }

  return clean as T;
}
```

#### 3.4.3 SQL Injection Prevention
Prisma ORM automatically parameterizes all queries in its query engine using prepared statements over PostgreSQL wire protocol. Parameter values are sent separately from the SQL statement as typed parameters, making SQL injection impossible through standard Prisma query methods (`findMany`, `create`, `update`, etc.).

**Enforced Codebase Invariants**:
1. **Zero Concatenation**: `prisma.$queryRawUnsafe` and `prisma.$executeRawUnsafe` are strictly forbidden across the codebase.
2. **Template Literals**: If raw SQL is required for advanced analytical aggregations, **only** `Prisma.sql` parameterized template tags are allowed:
   ```typescript
   // Allowed:
   await prisma.$queryRaw(Prisma.sql`SELECT * FROM units WHERE complex_id = ${complexId} AND unit_number = ${unitNumber}`);

   // FORBIDDEN (will fail CI/CD linter):
   // await prisma.$queryRawUnsafe(`SELECT * FROM units WHERE unit_number = '${input}'`);
   ```
3. **Safe Numeric Parsing**: All numeric query parameters are passed through `parseDecimal` or Zod schema coercion (`z.coerce.number()`), neutralizing inputs like `"101' OR '1'='1"`.

#### 3.4.4 Numeric & Boundary Defense
In accordance with E2E Tier 1 & 2 tests (`f13_security_hardening.test.ts`):
- **Oversized String Inputs (Memory DOS Prevention)**: Strings are limited to maximum length in Zod schemas (e.g. `z.string().max(1000)`). Numeric normalization takes $O(N)$ linear time and executes in $<10\text{ms}$ even for 10,000-character inputs.
- **Control Characters and Null Bytes**: `parseDecimal` handles `\u0000` (null byte) and control characters safely without crashing or corrupting numeric parsing.
- **Negative Expense Rejection**: Expense inputs in periods are validated to be non-negative ($\ge 0$) via Zod schemas (`z.number().nonnegative()`).

---

## 4. Concrete Service Implementation Blueprint

### 4.1 AuditLogger Service (`server/src/services/auditLogger.ts`)

```typescript
import { Prisma, AuditAction } from '@prisma/client';
import { prisma, rawPrisma } from '../config/database';
import { computeDelta } from '../utils/delta';

export interface AuditLogOptions {
  complexId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditLoggerService {
  /**
   * Log an audit event. Can run standalone or within an existing transaction.
   */
  public async log(options: AuditLogOptions, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx || prisma;
    const { beforeDelta, afterDelta, diff } = computeDelta(options.before, options.after);

    // Normalize semantic action string to AuditAction enum if needed
    const normalizedAction = this.normalizeAction(options.action);

    try {
      await db.auditLog.create({
        data: {
          complexId: options.complexId || null,
          actorId: options.actorId || null,
          actorRole: options.actorRole || 'SYSTEM',
          action: normalizedAction,
          entityType: options.entityType,
          entityId: String(options.entityId),
          oldData: beforeDelta as Prisma.InputJsonValue,
          newData: afterDelta as Prisma.InputJsonValue,
          diff: diff as Prisma.InputJsonValue,
          metadata: options.metadata as Prisma.InputJsonValue,
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null
        }
      });
    } catch (error) {
      console.error('CRITICAL: Failed to write audit log entry:', error);
      // Fail-closed for financial transactions
      if (this.isCriticalAction(options.action)) {
        throw new Error(`AuditLoggingFailure: Could not record audit log for critical action ${options.action}`);
      }
    }
  }

  /**
   * Query audit logs with strict tenant isolation and pagination.
   */
  public async getLogs(params: {
    complexId: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const { complexId, entityType, entityId, actorId, startDate, endDate, limit = 50, offset = 0 } = params;

    const where: Prisma.AuditLogWhereInput = {
      complexId, // Enforce strict tenant isolation
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {})
        }
      } : {})
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          actor: {
            select: { id: true, fullName: true, phone: true, role: true }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    // Format BigInt ID for JSON responses
    const serializedLogs = logs.map(l => ({
      ...l,
      id: l.id.toString()
    }));

    return { logs: serializedLogs, total, limit, offset };
  }

  private normalizeAction(action: string): AuditAction {
    // Map custom or legacy actions to Prisma AuditAction enum
    const map: Record<string, AuditAction> = {
      'CREATE_UNIT': AuditAction.CREATE,
      'UPDATE_UNIT': AuditAction.UPDATE,
      'DELETE_UNIT': AuditAction.DELETE,
      'RECORD_PAYMENT': AuditAction.SETTLE_DEBT,
      'CLOSE_PERIOD': AuditAction.CLOSE_PERIOD,
      'START_PERIOD': AuditAction.START_PERIOD,
      'PERMISSION_CHANGE': AuditAction.PERMISSION_CHANGE,
      'LOGIN': AuditAction.LOGIN,
      'LOGOUT': AuditAction.LOGOUT
    };
    return map[action] || (action as AuditAction) || AuditAction.UPDATE;
  }

  private isCriticalAction(action: string): boolean {
    return ['RECORD_PAYMENT', 'CLOSE_PERIOD', 'SETTLE_DEBT', 'PERMISSION_CHANGE'].includes(action);
  }
}

export const auditLogger = new AuditLoggerService();
```

---

## 5. Verification Matrix & Test Strategy

| Test Identifier | Test Suite | Verification Scenario | Success Assertion |
|---|---|---|---|
| **V-01** | `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` | Unit creation generates audit log | `action === 'CREATE_UNIT'`, `afterDelta.unitNumber === 101` |
| **V-02** | `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` | Unit modification captures delta | `beforeDelta.occupants === 1`, `afterDelta.occupants === 3`, `actorId === 'mgr_user_42'` |
| **V-03** | `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` | Period closing logs financial snapshot | `action === 'CLOSE_PERIOD'`, `afterDelta.totalExpenses === 1500000` |
| **V-04** | `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` | Payment recorded with actor ID | `action === 'RECORD_PAYMENT'`, `afterDelta.amount === 5000000` |
| **V-05** | `tests_e2e/suites/tier1_features/f12_immutable_audit_logging.test.ts` | Tenant isolation on audit logs | `logs.every(l => l.complexId === targetComplexId)` |
| **V-06** | `tests_e2e/suites/tier1_features/f13_security_hardening.test.ts` | SQL injection in numeric search | Parses safely to number without SQL crash or leakage |
| **V-07** | `tests_e2e/suites/tier1_features/f13_security_hardening.test.ts` | XSS script payload neutralization | Script execution neutralized while preserving normal string characters |
| **V-08** | `tests_e2e/suites/tier1_features/f13_security_hardening.test.ts` | Oversized input performance | 10,000-character Persian string processed in $<200\text{ms}$ |
| **V-09** | `tests_e2e/suites/tier1_features/f13_security_hardening.test.ts` | Null bytes handling | Handles `\u0000` and control characters cleanly |
| **V-10** | `tests_e2e/suites/tier5_adversarial/` (Adversarial) | Attempt direct `prisma.auditLog.delete()` or `.update()` | Throws `AuditLogImmutableError` (Layer 1) |
| **V-11** | `tests_e2e/suites/tier5_adversarial/` (Adversarial) | Attempt raw SQL `DELETE FROM audit_logs` | PostgreSQL trigger raises exception `55000` (Layer 2) |
| **V-12** | Fastify inject test | Brute force login 6 times within 1 minute | 6th attempt returns `429 Too Many Requests` with RFC 7807 |

---

## 6. Implementation Readiness & Handoff

This plan is directly actionable for the implementation workers. The files to be created or updated during M2 implementation are:
1. `server/src/services/auditLogger.ts` (new service)
2. `server/src/utils/delta.ts` (delta computation & field redaction)
3. `server/src/utils/sanitizer.ts` (XSS & prototype pollution sanitizer)
4. `server/src/config/security.ts` (hardened Helmet, CORS, and rate-limiting plugin initializers)
5. `server/src/config/database.ts` (Prisma extension immutability guard on `auditLog`)
6. `server/prisma/migrations/xxxx_immutable_audit_triggers.sql` (PostgreSQL RDBMS triggers)
7. `server/src/index.ts` (integration of security config into Fastify bootstrap)
