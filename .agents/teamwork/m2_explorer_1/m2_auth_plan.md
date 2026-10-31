# Milestone 2 (M2) Technical Architecture Specification: Authentication & Granular RBAC

**Document ID**: `M2-AUTH-RBAC-SPEC-v1.0`  
**Author**: M2 Auth & RBAC Explorer  
**Status**: APPROVED ARCHITECTURE SPECIFICATION  
**Target Modules**: `server/src/services/authService.ts`, `server/src/middleware/auth.ts`, `server/src/middleware/tenant.ts`, `server/src/routes/auth.ts`, `server/src/routes/subManagers.ts`

---

## 1. Executive Summary & Problem Scope

In Milestone 1 (M1), the core multi-tenant foundation and deterministic calculation engine were established with preliminary header-based tenant simulation (`x-complex-id`, `x-user-id`, `x-user-role`). 

Milestone 2 (M2) transitions ParsBuilding from a simulated developer environment into a commercial, hardened multi-tenant SaaS platform. This specification establishes:
1. **Password Security**: OWASP-compliant Argon2id password hashing using `@node-rs/argon2`.
2. **Session / Token Lifecycle**: Short-lived (15 min) JWT access tokens paired with rotating, single-use, HttpOnly refresh tokens stored with SHA-256 hashing, revocation tracking, and automatic token-family breach detection.
3. **Granular 4-Tier RBAC**: Complete role hierarchy (`SUPER_ADMIN`, `COMPLEX_MANAGER`, `SUB_MANAGER`, `RESIDENT`) with dynamic module permission resolution and strict resident unit-isolation boundaries.
4. **Fastify Route Guards**: PreHandler pipeline (`authenticate`, `requireRole`, `requirePermission`, `requireResidentUnitAccess`) seamlessly integrated with the fail-closed `tenantStorage` (AsyncLocalStorage) context.

---

## 2. Password Security & Cryptographic Specification

### 2.1 Algorithm & OWASP Parameter Selection
Password hashing is implemented strictly with **Argon2id** via `@node-rs/argon2` (native Rust SIMD bindings), providing resistance against both GPU-accelerated brute-forcing (Argon2d component) and side-channel timing/cache attacks (Argon2i component).

| Parameter | Value | Rationale |
|---|---|---|
| **Algorithm** | `Algorithm.Argon2id` (v19) | Hybrid mode mandated by OWASP Password Storage Guidelines & RFC 9106 |
| **Memory Cost (`m`)** | `65536` KiB (64 MiB) | High memory-hardness to prevent ASIC/GPU parallel dictionary attacks |
| **Time Cost (`t`)** | `3` iterations | Provides ~80-120ms computational delay on standard server vCPUs |
| **Parallelism (`p`)** | `4` threads | Matches modern multi-core server processors |
| **Output Length** | `32` bytes (256-bit) | Standard high-entropy derived key length |
| **Salt Handling** | 16-byte CSPRNG | Automatically generated per-password by `@node-rs/argon2` |

### 2.2 Password Complexity & Input Normalization
1. **Normalization**:
   - Phone numbers (primary login identifier in Iranian SaaS) must be normalized: convert Persian/Arabic numerals (`۰-۹`, `٠-٩`) to ASCII (`0-9`), strip all whitespace, dashes, and country prefixes (`+98` or `0098` normalized to standard `09xxxxxxxxx`).
2. **Password Validation Policy**:
   - Minimum 8 characters, maximum 128 characters.
   - At least 1 uppercase letter (`A-Z`), 1 lowercase letter (`a-z`), 1 numerical digit (`0-9`), and 1 special symbol (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

### 2.3 Service Interface Contract (`server/src/services/authService.ts`)
```typescript
import { hash, verify, Algorithm } from '@node-rs/argon2';

const ARGON2_CONFIG = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  algorithm: Algorithm.Argon2id
};

export async function hashPassword(plainText: string): Promise<string> {
  return hash(plainText, ARGON2_CONFIG);
}

export async function verifyPassword(passwordHash: string, plainText: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plainText);
  } catch {
    return false;
  }
}
```

---

## 3. Session & Token Lifecycle Management

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Client / Browser Storage                          │
├──────────────────────────────────┬─────────────────────────────────────┤
│ In-Memory / Authorization Header │ Signed HttpOnly Cookie (Strict/Lax) │
│ Access Token: JWT (15 min)       │ Refresh Token: Random 64B (7 days)  │
└────────────────┬─────────────────┴──────────────────┬──────────────────┘
                 │                                    │
                 ▼                                    ▼
       Protected API Endpoints              POST /api/v1/auth/refresh
  (authenticate -> verify JWT)           (Look up SHA-256 hash in DB)
                 │                                    │
                 ▼                                    ▼
       AsyncLocalStorage Ctx                Token Reuse Check:
    (complexId, userId, role)          [If revokedAt != null -> BREACH!]
                                       [Revoke ALL user tokens, 401]
                                                      │
                                                      ▼
                                           [If valid: Rotate token]
                                           New RefreshToken in DB
                                           New HttpOnly Cookie + New JWT
```

### 3.1 Dual-Token Architecture
1. **Access Token (Short-Lived JWT)**:
   - **Lifespan**: 15 minutes (`15m` = 900 seconds).
   - **Signature**: HMAC-SHA256 using `env.JWT_SECRET`.
   - **Delivery**: Returned in HTTP response body `{ accessToken, expiresIn: 900 }`; sent by client via `Authorization: Bearer <token>`.
   - **JWT Claims Payload**:
     ```typescript
     export interface JWTAccessTokenClaims {
       sub: string;            // User ID (UUID)
       phone: string;          // User Phone Number
       role: UserRole;         // SUPER_ADMIN | COMPLEX_MANAGER | SUB_MANAGER | RESIDENT
       complexId: string | null;// Complex ID (null for platform SUPER_ADMIN)
       permissions: string[];  // Sub-manager active permissions array
       unitIds: string[];      // Associated unit IDs for RESIDENT role
       tokenType: 'ACCESS';
       iat: number;
       exp: number;
     }
     ```

2. **Refresh Token (Long-Lived, Rotating, Stateful)**:
   - **Lifespan**: 7 days (604,800 seconds).
   - **Entropy**: 64 random cryptographically secure bytes (`crypto.randomBytes(64).toString('hex')`).
   - **Database Hashing**: The database **never stores the raw refresh token**. The raw token is hashed using SHA-256:
     $$\text{tokenHash} = \text{SHA-256}(\text{rawRefreshToken})$$
   - **Cookie Configuration**:
     ```typescript
     reply.setCookie('refreshToken', rawRefreshToken, {
       path: '/api/v1/auth',
       httpOnly: true,
       secure: env.NODE_ENV === 'production',
       sameSite: 'strict',
       signed: true,
       maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
     });
     ```

### 3.2 Database Schema Alignment (`RefreshToken` Model)
The schema in `server/prisma/schema.prisma` is fully aligned with zero schema changes required:
```prisma
model RefreshToken {
  id              String      @id @default(uuid())
  userId          String
  tokenHash       String      @unique // SHA-256 hash of the raw token
  expiresAt       DateTime
  revokedAt       DateTime?
  replacedByToken String?     // Points to successor token hash upon rotation
  userAgent       String?     // Device / browser fingerprint
  ipAddress       String?     // Origin IP address
  createdAt       DateTime    @default(now())

  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@map("refresh_tokens")
}
```

### 3.3 Token Rotation & Automatic Breach Detection (Family Revocation)
When `POST /api/v1/auth/refresh` is called:
1. Extract and unsign `rawRefreshToken` from the cookie.
2. Compute `hash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')`.
3. Query `RefreshToken` where `tokenHash = hash`.
4. **Reuse Detection (Critical Security Rule)**:
   - If the token record exists AND `revokedAt IS NOT NULL`:
     - 🚨 **Token Reuse Detected**: An attacker or compromised device is presenting a previously rotated refresh token.
     - **Action**: Immediately revoke all refresh tokens for `userId`:
       ```typescript
       await prisma.refreshToken.updateMany({
         where: { userId: record.userId, revokedAt: null },
         data: { revokedAt: new Date() }
       });
       ```
     - Log high-priority security audit event: `AuditAction.LOGIN` with metadata `{ securityAlert: 'REFRESH_TOKEN_REUSE_DETECTED', tokenHash: hash }`.
     - Clear cookie and respond with HTTP 401 Unauthorized (`Invalid or reused session`).
5. **Expiration Check**:
   - If `record.expiresAt < new Date()`:
     - Mark `revokedAt = new Date()`.
     - Return HTTP 401 Unauthorized (`Refresh token expired`).
6. **Legitimate Rotation**:
   - Mark old token revoked: `revokedAt = new Date()`, `replacedByToken = newHash`.
   - Issue new raw refresh token and compute `newHash`.
   - Insert new `RefreshToken` record with current `ipAddress` and `userAgent`.
   - Issue fresh 15-minute JWT access token.
   - Send new signed HttpOnly cookie and return new access token.

### 3.4 Device & IP Tagging and Session Management
- **Audit Tracking**: Each refresh token record captures `ipAddress` (resolving proxies via `request.ip`) and `userAgent`.
- **Session API Endpoints**:
  - `GET /api/v1/auth/sessions`: Returns all active sessions (`revokedAt IS NULL AND expiresAt > NOW()`) with IP, device, and login date.
  - `POST /api/v1/auth/logout`: Revokes the current session's refresh token and clears cookie.
  - `POST /api/v1/auth/revoke-all`: Revokes all sessions for the authenticated user, forcing global logout.

---

## 4. Granular 4-Tier RBAC Architecture

```
                  ┌───────────────────────────────┐
                  │          SUPER_ADMIN          │
                  │   Platform-wide operations    │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │        COMPLEX_MANAGER        │
                  │  Full tenant administrative   │
                  │    rights within complexId    │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │          SUB_MANAGER          │
                  │ Modular configurable rights:  │
                  │  - MANAGE_UNITS               │
                  │  - MANAGE_RESIDENTS           │
                  │  - MANAGE_FINANCES            │
                  │  - VIEW_REPORTS               │
                  │  - MANAGE_SETTINGS            │
                  │  - BROADCAST_NOTICES          │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │           RESIDENT            │
                  │   Strictly scoped to own      │
                  │   unit's ledger & notices     │
                  └───────────────────────────────┘
```

### 4.1 Role Definitions & Boundaries

#### Tier 1: `SUPER_ADMIN`
- **Scope**: Platform-level cross-tenant administration.
- **Capabilities**: Create new complexes, view cross-tenant SaaS metrics, create initial complex managers, perform platform migrations.
- **Tenant Context**: May operate without `complexId` (cross-tenant queries) or specify `x-complex-id` header to impersonate/manage a specific tenant.
- **RBAC**: Inherently satisfies all permission checks (`hasPermission` returns `true`).

#### Tier 2: `COMPLEX_MANAGER`
- **Scope**: Complete administrative sovereignty restricted strictly to their assigned `complexId`.
- **Capabilities**:
  - Full CRUD on Units and Residents.
  - Full financial sovereignty: open/close billing periods, run `CalculationEngine`, record payments, settle debts, adjust ledger.
  - Delegated administration: Create `SUB_MANAGER` accounts and configure their modular permissions.
  - Bulletin board announcements and complex settings.
- **RBAC**: Inherently possesses all sub-manager permissions within their own complex.

#### Tier 3: `SUB_MANAGER`
- **Scope**: Bound strictly to single `complexId`.
- **Capabilities**: Strictly confined to the modular permissions assigned in `SubManagerPermission`.
- **Permission Matrix & Mapping**:

| Canonical Permission Key | `SubManagerPermission` DB Column | Description & Allowed Actions |
|---|---|---|
| `MANAGE_UNITS` | `canManageUnits` | Add/edit/delete units, change floor/area, update occupancy status |
| `MANAGE_RESIDENTS` | `canManageResidents` | Register resident profiles, assign/unassign residents to units |
| `MANAGE_FINANCES` | `canManagePeriods` AND `canRecordPayments` | Create periods, enter utility expenses, record manual payments |
| `CLOSE_PERIODS` | `canClosePeriods` | Finalize calculation, freeze charge snapshots, close period |
| `VIEW_REPORTS` | `canViewReports` | Access financial ledgers, balance sheets, debtor reports |
| `VIEW_AUDIT_LOGS` | `canViewReports` | Inspect tenant audit logs |
| `BROADCAST_NOTICES` | `canSendNotifications` | Post announcements to digital bulletin board / complex chat |
| `MANAGE_SETTINGS` | `canManageSettings` | Update complex name, rounding step, notification rules |
| `VERIFY_RECEIPTS` | `canRecordPayments` (or custom flag) | Review and verify resident AI-extracted payment receipts |

#### Tier 4: `RESIDENT`
- **Scope**: Bound strictly to their associated `unitId`(s) within their `complexId`.
- **Capabilities**:
  - View personal unit invoices (`UnitCharge` where `unitId` is assigned).
  - View personal ledger transactions (`LedgerTransaction` where `unitId` is assigned).
  - View complex digital announcements (`ChatMessage` where `isNotice = true`).
  - Upload payment receipts (`ReceiptVerification`) for their assigned unit.
- **Strict Boundary Enforcements**:
  - Denied access to any management or administrative endpoint (returns HTTP 403).
  - Denied access to other units' financial data or residents' profiles (returns HTTP 403).
  - Denied access to tenant-level audit logs (returns HTTP 403).

### 4.2 Dynamic Permission Resolver
```typescript
import { SubManagerPermission } from '@prisma/client';

export const PERMISSION_ALIASES: Record<string, string[]> = {
  MANAGE_FINANCES: ['MANAGE_PERIODS', 'MANAGE_EXPENSES', 'RECORD_PAYMENTS'],
  VIEW_REPORTS: ['VIEW_FINANCIAL_REPORTS', 'VIEW_AUDIT_LOGS'],
  BROADCAST_NOTICES: ['MANAGE_ANNOUNCEMENTS'],
  RECORD_PAYMENTS: ['VERIFY_RECEIPTS']
};

export function resolvePermissionsFromDb(perm: SubManagerPermission | null): string[] {
  if (!perm) return [];
  const set = new Set<string>();

  if (perm.canManageUnits) set.add('MANAGE_UNITS');
  if (perm.canManageResidents) set.add('MANAGE_RESIDENTS');
  if (perm.canManagePeriods) {
    set.add('MANAGE_PERIODS');
    set.add('MANAGE_EXPENSES');
    set.add('MANAGE_FINANCES');
  }
  if (perm.canRecordPayments) {
    set.add('RECORD_PAYMENTS');
    set.add('VERIFY_RECEIPTS');
    set.add('MANAGE_FINANCES');
  }
  if (perm.canClosePeriods) {
    set.add('CLOSE_PERIODS');
  }
  if (perm.canViewReports) {
    set.add('VIEW_REPORTS');
    set.add('VIEW_FINANCIAL_REPORTS');
    set.add('VIEW_AUDIT_LOGS');
  }
  if (perm.canSendNotifications) {
    set.add('BROADCAST_NOTICES');
    set.add('MANAGE_ANNOUNCEMENTS');
  }
  if (perm.canManageSettings) {
    set.add('MANAGE_SETTINGS');
  }

  return Array.from(set);
}

export function hasRequiredPermission(userRole: string, userPermissions: string[], required: string): boolean {
  if (userRole === 'SUPER_ADMIN' || userRole === 'COMPLEX_MANAGER') return true;
  if (userRole !== 'SUB_MANAGER') return false;

  if (userPermissions.includes(required)) return true;

  // Check parent aliases (e.g. user having MANAGE_FINANCES satisfies MANAGE_EXPENSES)
  for (const [parent, children] of Object.entries(PERMISSION_ALIASES)) {
    if (children.includes(required) && userPermissions.includes(parent)) {
      return true;
    }
  }

  return false;
}
```

---

## 5. Fastify PreHandlers, Guards & Tenant Integration

```
                         HTTP Request
                              │
                              ▼
                ┌───────────────────────────┐
                │      isPublicRoute?       │──(Yes)──► Route Handler
                └─────────────┬─────────────┘
                              │ (No)
                              ▼
                ┌───────────────────────────┐
                │    authenticate Guard     │
                │  - Verify JWT signature   │
                │  - Check exp & isActive   │
                │  - Set request.user       │
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │ tenantStorage.enterWith() │
                │ Establish AsyncLocalStorage│
                │ context with verified ID  │
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │    requireRole Guard      │
                │ (SUPER_ADMIN / MGR / ...) │
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │ requirePermission Guard   │
                │ (MANAGE_UNITS / FINANCES) │
                └─────────────┬─────────────┘
                              │
                              ▼
                        Route Handler
```

### 5.1 Type Declarations (`server/src/types/auth.ts`)
```typescript
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  fullName: string;
  role: UserRole;
  complexId: string | null;
  permissions: string[];
  unitIds: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
```

### 5.2 `authenticate` Guard
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantStorage } from './tenant';
import { prisma } from '../config/database';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Bearer authentication token is required.'
      });
    }

    const token = authHeader.substring(7);
    const decoded = request.server.jwt.verify<JWTAccessTokenClaims>(token);

    if (decoded.tokenType !== 'ACCESS') {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token type' });
    }

    const user: AuthenticatedUser = {
      id: decoded.sub,
      phone: decoded.phone,
      fullName: '', // Can be loaded or populated from claims
      role: decoded.role,
      complexId: decoded.complexId,
      permissions: decoded.permissions || [],
      unitIds: decoded.unitIds || []
    };

    request.user = user;

    // Securely bridge to multi-tenant AsyncLocalStorage context
    tenantStorage.enterWith({
      complexId: user.complexId || (request.headers['x-complex-id'] as string) || '',
      userId: user.id,
      role: user.role,
      permissions: user.permissions
    });
  } catch (err: any) {
    return reply.code(401).header('Content-Type', 'application/problem+json').send({
      type: 'https://api.parsbuilding.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: err.message || 'Token verification failed.'
    });
  }
}
```

### 5.3 `requireRole` Guard
```typescript
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (request.user.role === 'SUPER_ADMIN') {
      return; // Global access
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `Insufficient role permissions. Required one of: [${allowedRoles.join(', ')}]. Current role: '${request.user.role}'.`
      });
    }
  };
}
```

### 5.4 `requirePermission` Guard
```typescript
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { role, permissions } = request.user;
    if (role === 'SUPER_ADMIN' || role === 'COMPLEX_MANAGER') {
      return; // Managers hold all module permissions within their complex
    }

    if (role !== 'SUB_MANAGER') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Action restricted to management roles' });
    }

    const hasAll = requiredPermissions.every(p => hasRequiredPermission(role, permissions, p));
    if (!hasAll) {
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `Missing required permission(s): [${requiredPermissions.join(', ')}]`
      });
    }
  };
}
```

### 5.5 `requireResidentUnitAccess` Guard
```typescript
export async function requireResidentUnitAccess(request: FastifyRequest<{ Params: { unitId: string } }>, reply: FastifyReply) {
  const user = request.user;
  if (!user) return reply.code(401).send({ error: 'Unauthorized' });

  if (user.role === 'SUPER_ADMIN' || user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
    return; // Managers have cross-unit access within the complex
  }

  const requestedUnitId = request.params.unitId;
  if (!user.unitIds.includes(requestedUnitId)) {
    return reply.code(403).header('Content-Type', 'application/problem+json').send({
      type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
      title: 'Forbidden Unit Access',
      status: 403,
      detail: `Access denied. You are not registered as an active occupant or owner of unit ${requestedUnitId}.`
    });
  }
}
```

---

## 6. Complete Auth REST API Contract

### Endpoints Overview

| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Public (Rate: 5/min) | Authenticate with phone & password; issues JWT + HttpOnly refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Cookie (`refreshToken`) | Rotates refresh token and issues fresh 15-min JWT |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revokes current refresh token and clears cookie |
| `GET` | `/api/v1/auth/me` | Authenticated | Fetches profile, active tenant, role, permissions, unitIds |
| `GET` | `/api/v1/auth/sessions` | Authenticated | Lists active devices and logins with IP & UserAgent |
| `DELETE` | `/api/v1/auth/sessions/:id`| Authenticated | Terminates a specific device session |
| `POST` | `/api/v1/auth/revoke-all` | Authenticated | Forces global logout across all devices |
| `POST` | `/api/v1/complex/sub-managers` | `COMPLEX_MANAGER` | Creates sub-manager account and sets module permissions |
| `PUT` | `/api/v1/complex/sub-managers/:id/permissions` | `COMPLEX_MANAGER` | Updates granular permissions for a sub-manager |

---

## 7. Migration & Compatibility with M1

1. **Prisma Schema Stability**:
   - `schema.prisma` already defines `User`, `RefreshToken`, and `SubManagerPermission` with all requisite fields.
   - No destructive migrations are needed.
2. **Backward Compatibility in Tests**:
   - In `server/src/middleware/tenant.ts`, preserve the fallback reading of `x-complex-id`, `x-user-id`, and `x-user-role` **only when `request.user` is undefined and `NODE_ENV === 'test'`**.
   - For all production routes, `request.user` populated by the `authenticate` hook takes absolute precedence, ensuring headers cannot be spoofed to breach tenant boundaries.

---

## 8. Verification & Test Plan

1. **Unit Tests (`server/tests/auth.test.ts`)**:
   - Verify Argon2id password hashing parameters and output format (`$argon2id$v=19$m=65536,t=3,p=4$...`).
   - Verify password verification success on correct credentials and failure on invalid passwords.
   - Verify refresh token SHA-256 hashing and family revocation upon simulated token reuse.
   - Test permission resolver with all alias combinations.
2. **Server Integration Tests**:
   - `POST /api/v1/auth/login`: Valid credentials return 200, JWT token, and signed HttpOnly cookie.
   - `POST /api/v1/auth/login`: Invalid credentials return 401 with generic error (no user enumeration).
   - `POST /api/v1/auth/refresh`: Legitimate call returns new JWT and rotated cookie; reused old token revokes all user sessions and returns 401.
   - Protected endpoint with valid token succeeds; expired or missing token returns 401.
   - RBAC tests: Resident calling manager endpoints receives 403. Sub-manager without `CLOSE_PERIODS` receives 403 on close period.
3. **E2E Test Pass Assertion**:
   - `f10_hardened_auth.test.ts` (T1.10.1 through T1.10.5) 100% pass.
   - `f11_granular_rbac.test.ts` (T1.11.1 through T1.11.5) 100% pass.
   - `rbac_resident_portal_access.test.ts` (T3.2.1 through T3.2.5) 100% pass.
