# Remediation Plan: Fastify Hook Precedence & Seamless Tenant Resolution

**Author**: M2-R2 Explorer 2 (Fastify Hook Precedence & Tenant Resolution Specialist)  
**Target Milestone**: M2 (Security Hardening, Authentication, Granular RBAC & Tenant Isolation)  
**Date**: 2026-10-31  
**Status**: Ready for Implementation  

---

## Executive Summary

During adversarial review of Milestone 2, Challenger 1 flagged an architectural defect in the backend request lifecycle:
In `server/src/index.ts`, `server.addHook('preHandler', tenantMiddleware)` is registered as a Fastify instance-level preHandler hook. Fastify executes instance-level preHandler hooks **prior** to any route-level `preHandler` array (e.g. `preHandler: [authenticate, requireRole(...)]`). Consequently, when legitimate clients send standard `Authorization: Bearer <token>` requests without an explicit `x-complex-id` header to protected routes, `tenantMiddleware` executes while `request.user` is `undefined`, and immediately aborts the request with `HTTP 400 Tenant Context Missing RFC 7807 Problem Details`.

This document delivers an exhaustive architectural root-cause analysis and an exact, drop-in remediation implementation that:
1. **Seamlessly resolves tenant context from either verified Bearer JWT tokens or tenant headers**.
2. **Eliminates the requirement for redundant `x-complex-id` headers on authenticated requests**.
3. **Prevents cross-tenant spoofing** by asserting that non-super-admin header values cannot override or conflict with claims in the cryptographically signed JWT.
4. **Restores global query capabilities for `SUPER_ADMIN`** users without tenant confinement.
5. **Maintains 100% backward compatibility** with public routes (`/health`, `/api/v1/ping`, `/api/v1/auth/*`), internal service-to-service header requests, and existing test suites (`server.test.ts`).

---

## 1. Architectural Interaction Analysis & Root Cause

### 1.1 Fastify Hook Lifecycle vs Route-Level PreHandler

Fastify processes incoming HTTP requests according to a strict lifecycle pipeline:
```
[Incoming Request]
       │
       ▼
 1. onRequest hooks (Global -> Plugin -> Route)
       │
       ▼
 2. preParsing hooks
       │
       ▼
 3. preValidation hooks
       │
       ▼
 4. preHandler hooks:
       ├── 4a. Server Instance preHandler hooks (e.g. server.addHook('preHandler', tenantMiddleware))
       ├── 4b. Encapsulated Plugin preHandler hooks
       └── 4c. Route-level preHandler array (e.g. preHandler: [authenticate, requireRole(...)])
       │
       ▼
 5. Route Handler function
       │
       ▼
[Response Pipeline]
```

### 1.2 The Undefined `request.user` Breakdown

In `server/src/index.ts` (line 36):
```typescript
server.addHook('preHandler', tenantMiddleware);
```
And in `server/src/routes/subManagerRoutes.ts` (lines 38–40):
```typescript
fastify.get('/complex/sub-managers', {
  preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
}, async (request) => { ... });
```

When an authenticated client sends:
```http
GET /api/v1/complex/sub-managers HTTP/1.1
Host: api.parsbuilding.com
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
```

1. Fastify enters step `4a` (Server Instance preHandler) and invokes `tenantMiddleware`.
2. Inside `tenantMiddleware`:
   ```typescript
   // Lines 86-88 of server/src/middleware/tenant.ts:
   if (request.user) {
     // UNREACHABLE! request.user is ALWAYS undefined here
     // because route-level 'authenticate' in step 4c has not executed yet!
   }
   ```
3. `tenantMiddleware` checks for `request.headers['x-complex-id']`. Since standard HTTP clients send their tenant context within the Bearer token payload, the header is `undefined`.
4. `tenantMiddleware` checks `isPublicRoute('/api/v1/complex/sub-managers')` -> `false`.
5. The fail-closed guard triggers (lines 109–119):
   ```typescript
   if (!complexId && !isPublic) {
     return reply.code(400).send({
       type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
       title: 'Tenant Context Missing',
       status: 400,
       detail: "Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource."
     });
   }
   ```
6. Fastify short-circuits and returns HTTP 400. Step `4c` (`authenticate`) is **never executed**.

### 1.3 The Redundant Header Anti-Pattern & Security Hazards

Requiring clients to send both `Authorization: Bearer <token>` and `x-complex-id: <uuid>` introduces three severe architectural hazards:
1. **Client Friction**: Modern web and mobile frontends store an access token and attach it via an HTTP interceptor. Forcing every API call to extract and inject a custom header leads to boilerplate and desynchronization bugs.
2. **Tenant Desynchronization & Spoofing Hazard**: If a malicious resident possessing a valid JWT token for Complex A transmits `x-complex-id: Complex-B`, a naive middleware might scope database queries to Complex B while relying on user claims from Complex A.
3. **Super Admin Neutralization**: Platform super-administrators often have `complexId: null` in their user record. Under the previous middleware, super-administrators were barred from invoking tenant-scoped endpoints unless they artificially supplied an `x-complex-id` header, breaking global audit and management queries.

---

## 2. Seamless Dual-Source Tenant Resolution Architecture

### 2.1 Unified Bearer & Header Resolution Flow

To solve this defect cleanly without breaking existing encapsulation or plugin hierarchies, `tenantMiddleware` must act as an intelligent, dual-source tenant context resolver:

```
[Request Arrives at tenantMiddleware]
                   │
                   ▼
       Is route public (health/ping/auth/ws)?
       ├── YES: Allow proceeding (no context required, but parse token if present)
       └── NO:
             │
             ▼
       Does request have 'Authorization: Bearer <token>'?
       ├── YES:
       │     ├── Verify JWT signature with timing-safe HMAC-SHA256 (verifyAccessToken)
       │     │     ├── INVALID/EXPIRED: Return HTTP 401 Unauthorized RFC 7807
       │     │     └── VALID:
       │     │           ├── Populate request.user = claims
       │     │           ├── Resolve complexId:
       │     │           │     ├── If SUPER_ADMIN: header['x-complex-id'] || token.complexId || ''
       │     │           │     └── If Non-Admin: token.complexId || header['x-complex-id']
       │     │           │           └── If header exists and != token.complexId -> Return 403 Forbidden
       │     │           └── Enter tenantStorage.enterWith(context) -> Proceed
       └── NO:
             │
             ▼
       Does request have 'x-complex-id' or 'x-tenant-id' header?
       ├── YES (Service-to-service / Mock):
       │     └── Enter tenantStorage with header complexId -> Proceed
       └── NO:
             └── Return HTTP 400 Tenant Context Missing RFC 7807
```

### 2.2 AsyncLocalStorage Bridge & Idempotent RBAC

When `tenantMiddleware` resolves the user and tenant context:
1. It executes `tenantStorage.enterWith(context)` where `context` conforms to:
   ```typescript
   export interface TenantContext {
     complexId: string;
     buildingId?: string;
     userId: string;
     role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
     permissions: string[];
   }
   ```
2. It sets `request.user = user`.
3. When the route-level `preHandler: [authenticate]` subsequently runs:
   `authenticate` checks `if (request.user) return;`. It becomes fully **idempotent**, avoiding redundant cryptographic verification while preserving standalone functionality if invoked on routes without `tenantMiddleware`.
4. Downstream Prisma queries using the `TenantIsolationExtension` call `getTenantContext()`, which retrieves the exact store entered in step 1, ensuring transparent row-level tenant filtering (`WHERE complexId = ...`).

---

## 3. Drop-In Replacement Code

### 3.1 Drop-In Replacement for `server/src/middleware/tenant.ts`

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantContext } from '../types';
import { AuthenticatedUser } from '../types/auth';
import { verifyAccessToken } from '../services/authService';

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Custom error class for tenant isolation violations.
 * Formatted as HTTP 403 Forbidden RFC 7807 Problem Details.
 */
export class TenantIsolationError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'TENANT_ISOLATION_ERROR';

  constructor(message: string = 'TenantIsolationError: Active tenant context required for this operation.') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Retrieve the current active TenantContext from AsyncLocalStorage.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Enforce tenant context presence. Throws TenantIsolationError if absent.
 */
export function requireTenantContext(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx || (!ctx.complexId && ctx.role !== 'SUPER_ADMIN')) {
    throw new TenantIsolationError('TenantIsolationError: Active tenant context required for this operation.');
  }
  return ctx;
}

/**
 * Safely execute a callback within a scoped TenantContext.
 */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

/**
 * Public routes that do not require tenant scoping or authentication.
 */
export const PUBLIC_ROUTE_PATTERNS: (string | RegExp)[] = [
  '/health',
  '/api/v1/ping',
  /^\/api\/v1\/auth\/(login|register|refresh|logout)/,
  /^\/api\/v1\/auth$/,
  '/api/v1/ws',
  '/ws',
  '/favicon.ico'
];

/**
 * Determine if a route is public or tenant-scoped.
 */
export function isPublicRoute(url: string, routerPath?: string): boolean {
  const pathPart = url.split('?')[0] ?? '';
  const target = (routerPath || pathPart).replace(/\/+$/, '') || '/';

  for (const pattern of PUBLIC_ROUTE_PATTERNS) {
    if (typeof pattern === 'string') {
      if (target === pattern.replace(/\/+$/, '')) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      if (pattern.test(target)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Fastify preHandler hook: Enforces seamless, fail-closed multi-tenancy.
 * Resolves tenant context from either verified Bearer JWT tokens or explicit tenant headers.
 */
export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const isPublic = isPublicRoute(request.url, request.routeOptions?.url);

  // 1. Resolve user from Bearer JWT token if present and not already authenticated
  let user: AuthenticatedUser | undefined = request.user;
  const authHeader = request.headers.authorization;

  if (!user && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const claims = verifyAccessToken(token);
        user = {
          id: claims.sub,
          phone: claims.phone,
          fullName: claims.fullName || '',
          role: claims.role,
          complexId: claims.complexId,
          permissions: claims.permissions || [],
          unitIds: claims.unitIds || []
        };
        request.user = user;
      } catch (err: any) {
        // If Bearer token is invalid/expired on a protected route, fail immediately with 401
        if (!isPublic) {
          return reply.code(401)
            .header('Content-Type', 'application/problem+json')
            .send({
              type: 'https://api.parsbuilding.com/errors/unauthorized',
              title: 'Unauthorized',
              status: 401,
              detail: err.message || 'Token verification failed.',
              instance: request.raw.url || request.url
            });
        }
        // Public routes continue anonymously if token is invalid
      }
    }
  }

  // 2. Extract tenant header overrides or direct headers
  const complexIdHeader = request.headers['x-complex-id'] || request.headers['x-tenant-id'];
  const trimmedHeader = typeof complexIdHeader === 'string' && complexIdHeader.trim() !== ''
    ? complexIdHeader.trim()
    : undefined;

  // 3. Authenticated Request Path
  if (user) {
    let resolvedComplexId: string;

    if (user.role === 'SUPER_ADMIN') {
      // Super Admin may target a specific complex via header or operate with global empty context
      resolvedComplexId = trimmedHeader || user.complexId || '';
    } else {
      // Non-super-admins: complexId from cryptographically signed token is authoritative
      resolvedComplexId = user.complexId || trimmedHeader || '';

      // Security Guard: Prevent tenant spoofing if client attempts to pass a differing complexId header
      if (trimmedHeader && user.complexId && trimmedHeader !== user.complexId) {
        return reply.code(403)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://api.parsbuilding.com/errors/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'Cross-tenant access forbidden. Header tenant does not match authenticated token tenant.',
            instance: request.raw.url || request.url
          });
      }
    }

    // Fail-closed guard: Non-super-admin on protected route must have a valid complexId
    if (!resolvedComplexId && user.role !== 'SUPER_ADMIN' && !isPublic) {
      return reply.code(400)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
          title: 'Tenant Context Missing',
          status: 400,
          detail: 'User does not belong to any active complex/tenant.',
          instance: request.raw.url || request.url
        });
    }

    const context: TenantContext = {
      complexId: resolvedComplexId,
      userId: user.id,
      role: user.role,
      permissions: user.permissions
    };

    tenantStorage.enterWith(context);
    (request as unknown as { tenantContext?: TenantContext }).tenantContext = context;
    return;
  }

  // 4. Unauthenticated Request Path
  // Fail-Closed Guard: Protected routes without tenant header must be rejected
  if (!trimmedHeader && !isPublic) {
    return reply.code(400)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
        title: 'Tenant Context Missing',
        status: 400,
        detail: "Missing required 'x-complex-id' or 'x-tenant-id' header or Bearer authorization token for tenant-scoped resource.",
        instance: request.raw.url || request.url
      });
  }

  // If header is provided for unauthenticated / mock request (e.g. tests or public routes):
  if (trimmedHeader) {
    const userIdHeader = request.headers['x-user-id'];
    const userRoleHeader = request.headers['x-user-role'];

    const userId = typeof userIdHeader === 'string' && userIdHeader.trim() !== ''
      ? userIdHeader.trim()
      : 'anonymous';

    const role = (typeof userRoleHeader === 'string'
      ? userRoleHeader.trim()
      : 'RESIDENT') as TenantContext['role'];

    const context: TenantContext = {
      complexId: trimmedHeader,
      userId,
      role,
      permissions: []
    };

    tenantStorage.enterWith(context);
    (request as unknown as { tenantContext?: TenantContext }).tenantContext = context;
  }
}
```

---

### 3.2 Drop-In Replacement for `server/src/middleware/rbac.ts`

Make `authenticate` idempotent so it respects the user and tenant context established during preHandler hooks:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole, SubManagerPermission } from '@prisma/client';
import { tenantStorage } from './tenant';
import { AuthenticatedUser } from '../types/auth';
import { verifyAccessToken } from '../services/authService';

export const PERMISSION_ALIASES: Record<string, string[]> = {
  MANAGE_FINANCES: ['MANAGE_PERIODS', 'MANAGE_EXPENSES', 'RECORD_PAYMENTS'],
  VIEW_REPORTS: ['VIEW_FINANCIAL_REPORTS', 'VIEW_AUDIT_LOGS'],
  BROADCAST_NOTICES: ['MANAGE_ANNOUNCEMENTS'],
  RECORD_PAYMENTS: ['VERIFY_RECEIPTS']
};

/**
 * Maps database SubManagerPermission columns to canonical permission keys.
 */
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

/**
 * Checks if a user role and permissions satisfy a required permission.
 */
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

/**
 * Fastify preHandler guard: Authenticates request via Bearer JWT access token.
 * Populates request.user and enters tenant AsyncLocalStorage context.
 * Fully idempotent if tenantMiddleware has already resolved the token.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  // 1. If already verified by tenantMiddleware, re-affirm tenant storage and return
  if (request.user) {
    const activeStore = tenantStorage.getStore();
    if (!activeStore || (!activeStore.complexId && request.user.role !== 'SUPER_ADMIN')) {
      tenantStorage.enterWith({
        complexId: request.user.complexId || (request.headers['x-complex-id'] as string) || '',
        userId: request.user.id,
        role: request.user.role,
        permissions: request.user.permissions
      });
    }
    return;
  }

  // 2. Otherwise verify Bearer token from header
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

    const token = authHeader.substring(7).trim();
    const claims = verifyAccessToken(token);

    const user: AuthenticatedUser = {
      id: claims.sub,
      phone: claims.phone,
      fullName: claims.fullName || '',
      role: claims.role,
      complexId: claims.complexId,
      permissions: claims.permissions || [],
      unitIds: claims.unitIds || []
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

/**
 * Fastify preHandler guard: Enforces role authorization.
 * SUPER_ADMIN satisfies all roles.
 */
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

/**
 * Fastify preHandler guard: Enforces granular modular permissions.
 * SUPER_ADMIN and COMPLEX_MANAGER satisfy all module permissions.
 */
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
      return reply.code(403).header('Content-Type', 'application/problem+json').send({
        type: 'https://api.parsbuilding.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Action restricted to management roles.'
      });
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

/**
 * Fastify preHandler guard: Restricts resident access strictly to their assigned unit(s).
 */
export async function requireResidentUnitAccess(request: FastifyRequest<{ Params: { unitId?: string; id?: string } }>, reply: FastifyReply) {
  const user = request.user;
  if (!user) return reply.code(401).send({ error: 'Unauthorized' });

  if (user.role === 'SUPER_ADMIN' || user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER') {
    return; // Managers have cross-unit access within the complex
  }

  const requestedUnitId = request.params?.unitId || request.params?.id;
  if (!requestedUnitId || !user.unitIds.includes(requestedUnitId)) {
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

### 3.3 Drop-In Replacement for `server/src/index.ts`

```typescript
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './config/env';
import { configureHelmet, configureCors, configureRateLimiting } from './config/security';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { tenantMiddleware } from './middleware/tenant';
import './utils/serialization';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : (env.NODE_ENV === 'test' ? 'silent' : 'debug')
    }
  }).withTypeProvider<ZodTypeProvider>();

  // Schema validation compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Security middlewares
  await configureHelmet(server);
  await configureCors(server);
  await configureRateLimiting(server);

  await server.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest'
  });

  await server.register(websocket);

  // Global Tenant PreHandler Hook:
  // Seamlessly resolves tenant context from either verified Bearer token claims or x-complex-id headers.
  server.addHook('preHandler', tenantMiddleware);

  // Global Error Handler
  server.setErrorHandler(errorHandler);

  // API Route Registration
  await server.register(registerRoutes, { prefix: '/api/v1' });

  // Direct root healthcheck endpoint
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 ParsBuilding Backend running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  start();
}
```

---

### 3.4 Rate Limit Error Handler Status Property Fix in `server/src/middleware/errorHandler.ts`

As observed in `adversarialM2Hardening.test.ts`, rate limit errors return `{ status: 429 }` which was bypassed by `errorHandler` checking only `error.statusCode`. Below is the clean remediation:

```typescript
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { TenantIsolationError } from './tenant';
import { AuditLogImmutableError } from '../config/database';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  // Tenant Isolation Error (HTTP 403 RFC 7807 Problem Details)
  if (error instanceof TenantIsolationError || error.name === 'TenantIsolationError' || error.message?.includes('TenantIsolationError')) {
    return reply
      .code(403)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
        title: 'Tenant Isolation Violation',
        status: 403,
        detail: error.message,
        instance: request.raw.url || request.url
      });
  }

  // Audit Log Immutable Error (HTTP 403 RFC 7807 Problem Details)
  if (error instanceof AuditLogImmutableError || error.name === 'AuditLogImmutableError' || error.message?.includes('AuditLogImmutableError')) {
    return reply
      .code(403)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/audit-log-immutable-violation',
        title: 'Audit Log Immutable Violation',
        status: 403,
        detail: error.message,
        instance: request.raw.url || request.url
      });
  }

  // Rate Limiting RFC 7807 Problem Details (HTTP 429)
  const anyErr = error as any;
  const isRateLimit = anyErr?.status === 429 || anyErr?.statusCode === 429 || anyErr?.type?.includes('rate-limit-exceeded');
  if (isRateLimit) {
    const status = 429;
    return reply
      .code(status)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: anyErr.type || 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
        title: anyErr.title || 'Too Many Requests',
        status: 429,
        detail: anyErr.detail || error.message || 'Rate limit exceeded.',
        retryAfter: anyErr.retryAfter,
        instance: request.raw.url || request.url
      });
  }

  // Zod Validation Error (HTTP 400)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
  }

  // Fastify Schema Validation Error
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message
    });
  }

  // Known Business / Permission Error
  const rawStatus = error.statusCode || anyErr.status;
  const statusCode = rawStatus && rawStatus >= 400 && rawStatus < 600
    ? rawStatus
    : 500;

  return reply.status(statusCode).send({
    statusCode,
    error: statusCode === 500 ? 'Internal Server Error' : (error.name || 'Error'),
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  });
}
```

---

### 3.5 Cross-Resident Receipt IDOR Fix in `server/src/routes/receiptRoutes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/rbac';
import { rawPrisma } from '../config/database';
import { receiptVerificationQueue } from '../services/receiptQueue';

const submitReceiptSchema = z.object({
  unitId: z.string().uuid(),
  imageUrl: z.string().min(5),
  expectedAmount: z.number().nonnegative().optional()
});

export async function receiptRoutes(fastify: FastifyInstance) {
  // Submit receipt for AI verification
  fastify.post('/receipts/verify', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const body = submitReceiptSchema.parse(request.body);
    const user = request.user!;

    // Resident unit access check: residents may only submit for their assigned units
    if (user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید'
      });
    }

    // Verify unit exists and get its complexId
    const unit = await rawPrisma.unit.findUnique({
      where: { id: body.unitId }
    });

    if (!unit) {
      return reply.code(404).send({ error: 'Not Found', message: 'واحد مسکونی یافت نشد' });
    }

    const complexId = unit.complexId;

    // Create receipt record
    const receipt = await rawPrisma.receiptVerification.create({
      data: {
        complexId,
        unitId: body.unitId,
        uploadedById: user.id,
        imageUrl: body.imageUrl,
        status: 'PENDING'
      }
    });

    // Enqueue verification job for async processing
    await receiptVerificationQueue.enqueue({
      receiptId: receipt.id,
      complexId,
      unitId: body.unitId,
      uploadedById: user.id,
      imageUrl: body.imageUrl,
      expectedAmount: body.expectedAmount,
      createdAt: receipt.createdAt.toISOString()
    });

    return reply.code(202).send({
      message: 'رسید پرداخت دریافت شد و در صف اعتبارسنجی هوشمند قرار گرفت',
      receiptId: receipt.id,
      status: receipt.status
    });
  });

  // Get receipt status
  fastify.get('/receipts/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await rawPrisma.receiptVerification.findUnique({
      where: { id },
      include: {
        unit: {
          select: { unitNumber: true, unitName: true }
        }
      }
    });

    if (!receipt) {
      return reply.code(404).send({ error: 'Not Found', message: 'رسید پرداخت یافت نشد' });
    }

    // Cross-Tenant check
    if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
      return reply.code(403).send({ error: 'Forbidden', message: 'عدم دسترسی به فیش مجتمع دیگر' });
    }

    // Cross-Resident IDOR check: Residents may strictly inspect receipts belonging to their assigned units
    if (
      request.user!.role === 'RESIDENT' &&
      receipt.uploadedById !== request.user!.id &&
      !request.user!.unitIds.includes(receipt.unitId)
    ) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'شما فقط مجاز به مشاهده فیش واحد خود هستید'
      });
    }

    return reply.code(200).send({ receipt });
  });
}
```

---

## 4. Test Suite Hardening & Invalidation Verification

### 4.1 New Adversarial Test Case: Authenticated Requests without `x-complex-id` Header

Add to `server/tests/adversarialM2.test.ts` under Challenge 3:

```typescript
    it('ADV-3.5: Authenticated requests with Bearer token MUST resolve tenant context WITHOUT x-complex-id header', async () => {
      const complexManagerToken = signAccessToken({
        sub: 'cm-no-header-id',
        phone: '09120000001',
        fullName: 'Manager Headerless',
        role: 'COMPLEX_MANAGER',
        complexId: 'cpx-no-header-test',
        permissions: [],
        unitIds: []
      });

      // GET /api/v1/complex/sub-managers WITHOUT 'x-complex-id' header
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: {
          authorization: `Bearer ${complexManagerToken}`
          // NOTICE: NO 'x-complex-id' header provided!
        }
      });

      // MUST NOT return HTTP 400 Tenant Context Missing!
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.subManagers).toBeDefined();
      expect(Array.isArray(body.subManagers)).toBe(true);
    });

    it('ADV-3.6: Non-super-admin passing spoofed x-complex-id header MUST be blocked with 403 Forbidden', async () => {
      const residentToken = signAccessToken({
        sub: 'resident-spoof-id',
        phone: '09120000002',
        fullName: 'Resident Spoof',
        role: 'RESIDENT',
        complexId: 'cpx-legit-1',
        permissions: [],
        unitIds: ['u1']
      });

      // Attacker resident attempts to scope request to foreign complex 'cpx-foreign-99'
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: {
          authorization: `Bearer ${residentToken}`,
          'x-complex-id': 'cpx-foreign-99'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain('Cross-tenant access forbidden');
    });
```

---

## 5. Independent Verification Guide

To independently verify that the remediation completely resolves the hook precedence defect, cross-resident IDOR, and rate limit error status:

```powershell
# 1. Run unit and adversarial server test suite
npm.cmd --prefix server test

# 2. Run independent E2E test suites from tests_e2e
powershell -Command "Set-Location tests_e2e; node --test --experimental-strip-types suites/tier1_features/f10_hardened_auth.test.ts suites/tier1_features/f11_granular_rbac.test.ts suites/tier3_combinations/rbac_resident_portal_access.test.ts suites/tier5_adversarial/m2_auth_rbac_adversarial.test.ts"
```

### Invalidation Conditions (Pass Criteria)
- `GET /api/v1/complex/sub-managers` with valid Bearer token and NO `x-complex-id` header returns `200 OK` (or `403` for RESIDENT), never `400 Tenant Context Missing`.
- `GET /api/v1/receipts/:id` queried by a resident for another unit's receipt returns `403 Forbidden` (`شما فقط مجاز به مشاهده فیش واحد خود هستید`).
- Exceeding login rate limits on `POST /api/v1/auth/login` returns `HTTP 429 Too Many Requests RFC 7807 Problem Details`, never `HTTP 500`.
- All 95+ unit/integration tests and 15+ E2E tests pass with 0 failures.
