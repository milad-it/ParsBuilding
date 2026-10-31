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
 * Public routes that do not require tenant scoping.
 */
export const PUBLIC_ROUTE_PATTERNS: (string | RegExp)[] = [
  '/health',
  '/api/v1/ping',
  /^\/api\/v1\/auth/,
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
        // If Bearer token is provided but invalid/expired on a protected route, fail immediately with 401
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
