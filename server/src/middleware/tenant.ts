import { AsyncLocalStorage } from 'node:async_hooks';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantContext } from '../types';

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
  if (!ctx || !ctx.complexId) {
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
 * Fastify preHandler hook: Enforces fail-closed multi-tenancy.
 * Rejects missing tenant headers on protected routes with RFC 7807 error format.
 */
export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const isPublic = isPublicRoute(request.url, request.routeOptions?.url);

  // If request.user is already authenticated, use their tenant scope
  if (request.user) {
    const complexId = request.user.complexId || (request.headers['x-complex-id'] as string) || '';
    const context: TenantContext = {
      complexId,
      userId: request.user.id,
      role: request.user.role,
      permissions: request.user.permissions
    };
    tenantStorage.enterWith(context);
    (request as unknown as { tenantContext?: TenantContext }).tenantContext = context;
    return;
  }

  const complexIdHeader = request.headers['x-complex-id'] || request.headers['x-tenant-id'];
  const userIdHeader = request.headers['x-user-id'];
  const userRoleHeader = request.headers['x-user-role'];

  const complexId = typeof complexIdHeader === 'string' && complexIdHeader.trim() !== ''
    ? complexIdHeader.trim()
    : undefined;

  // Fail-Closed Guard: Protected routes must specify complexId
  if (!complexId && !isPublic) {
    return reply.code(400)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-context-missing',
        title: 'Tenant Context Missing',
        status: 400,
        detail: "Missing required 'x-complex-id' or 'x-tenant-id' header for tenant-scoped resource.",
        instance: request.raw.url || request.url
      });
  }

  const userId = typeof userIdHeader === 'string' && userIdHeader.trim() !== ''
    ? userIdHeader.trim()
    : 'anonymous';

  const role = (typeof userRoleHeader === 'string'
    ? userRoleHeader.trim()
    : 'RESIDENT') as TenantContext['role'];

  if (complexId) {
    const context: TenantContext = {
      complexId,
      userId,
      role,
      permissions: []
    };

    tenantStorage.enterWith(context);
    (request as unknown as { tenantContext?: TenantContext }).tenantContext = context;
  }
}
