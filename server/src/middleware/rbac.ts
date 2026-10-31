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
 */
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
