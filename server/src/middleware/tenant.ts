import { AsyncLocalStorage } from 'node:async_hooks';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantContext } from '../types';

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx || !ctx.complexId) {
    throw new Error('TenantIsolationError: No active tenant context found for this operation.');
  }
  return ctx;
}

/**
 * Fastify preHandler hook for tenant isolation and context injection.
 * Extracts tenant context from request headers/auth and enters AsyncLocalStorage.
 */
export async function tenantMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const complexIdHeader = request.headers['x-complex-id'] || request.headers['x-tenant-id'];
  const userIdHeader = request.headers['x-user-id'];
  const userRoleHeader = request.headers['x-user-role'];

  const complexId = typeof complexIdHeader === 'string' ? complexIdHeader : undefined;
  const userId = typeof userIdHeader === 'string' ? userIdHeader : 'anonymous';
  const role = (typeof userRoleHeader === 'string' ? userRoleHeader : 'RESIDENT') as TenantContext['role'];

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
