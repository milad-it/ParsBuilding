import { PrismaClient } from '@prisma/client';
import { getTenantContext, TenantIsolationError } from '../middleware/tenant';

export { TenantIsolationError };

export class AuditLogImmutableError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'AUDIT_LOG_IMMUTABLE_VIOLATION';

  constructor(operation: string) {
    super(`SecurityViolation: AuditLog is append-only. Operation '${operation}' is strictly forbidden.`);
    this.name = 'AuditLogImmutableError';
  }
}

export const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

export const TENANT_MODELS = [
  'building',
  'unit',
  'resident',
  'unitresident',
  'period',
  'periodcustomunit',
  'unitcharge',
  'ledgertransaction',
  'auditlog',
  'chatmessage',
  'receiptverification',
  'submanagerpermission',
  'user'
] as const;

function enforceTenantScope(model: string, action: string): string {
  const modelName = model.toLowerCase();
  const isTenantModel = (TENANT_MODELS as readonly string[]).includes(modelName);
  if (!isTenantModel) return '';

  const ctx = getTenantContext();

  // Super Admin global view bypass
  if (ctx?.role === 'SUPER_ADMIN' && !ctx.complexId) {
    return '';
  }

  // Fail-Closed Guard:
  // If no complexId is present, reject immediately rather than executing un-scoped SQL.
  if (!ctx || !ctx.complexId) {
    throw new TenantIsolationError(
      `TenantIsolationError: Fail-closed violation on ${model}.${action}. ` +
      `Active tenant context with valid 'complexId' is required for tenant data operations.`
    );
  }

  return ctx.complexId;
}

export const prisma = rawPrisma.$extends({
  name: 'TenantIsolationExtension',
  query: {
    auditLog: {
      async update() {
        throw new AuditLogImmutableError('update');
      },
      async updateMany() {
        throw new AuditLogImmutableError('updateMany');
      },
      async delete() {
        throw new AuditLogImmutableError('delete');
      },
      async deleteMany() {
        throw new AuditLogImmutableError('deleteMany');
      },
      async upsert() {
        throw new AuditLogImmutableError('upsert');
      }
    },
    $allModels: {
      async findMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findFirst({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findFirst');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findFirstOrThrow({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findFirstOrThrow');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async findUnique({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findUnique');
        if (!complexId) {
          return query(args);
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          return null;
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && typeof delegate.findFirst === 'function') {
          return delegate.findFirst({
            ...args,
            where: { ...whereAny, complexId }
          });
        }

        const result = await query(args);
        if (result && (result as any).complexId && (result as any).complexId !== complexId) {
          return null;
        }
        return result;
      },

      async findUniqueOrThrow({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findUniqueOrThrow');
        if (!complexId) {
          return query(args);
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          throw new Error(`NotFoundError: No ${model} found for tenant ${complexId}`);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && typeof delegate.findFirstOrThrow === 'function') {
          return delegate.findFirstOrThrow({
            ...args,
            where: { ...whereAny, complexId }
          });
        }

        const result = await query(args);
        if (result && (result as any).complexId && (result as any).complexId !== complexId) {
          throw new Error(`NotFoundError: No ${model} found for tenant ${complexId}`);
        }
        return result;
      },

      async count({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'count');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async create({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'create');
        if (complexId) {
          args.data = { ...(args.data as Record<string, unknown>), complexId };
        }
        return query(args);
      },

      async createMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'createMany');
        if (complexId) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: any) => ({ ...item, complexId }));
          } else if (args.data) {
            args.data = { ...(args.data as Record<string, unknown>), complexId };
          }
        }
        return query(args);
      },

      async update({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'update');
        if (!complexId) {
          return query(args);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        const whereAny = (args.where || {}) as Record<string, any>;

        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (!existing || existing.complexId !== complexId) {
            throw new TenantIsolationError(`TenantIsolationError: Cannot update ${model} outside active tenant context`);
          }
        } else {
          (args as any).where = { ...whereAny, complexId };
        }

        return query(args);
      },

      async updateMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'updateMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async upsert({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'upsert');
        if (!complexId) {
          return query(args);
        }

        if (args.create) {
          args.create = { ...(args.create as Record<string, unknown>), complexId };
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          throw new TenantIsolationError(`TenantIsolationError: Cross-tenant upsert rejected for ${model}`);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (existing && existing.complexId !== complexId) {
            throw new TenantIsolationError(`TenantIsolationError: Cannot upsert ${model} belonging to another tenant`);
          }
        }

        return query(args);
      },

      async delete({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'delete');
        if (!complexId) {
          return query(args);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        const whereAny = (args.where || {}) as Record<string, any>;

        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (!existing || existing.complexId !== complexId) {
            throw new TenantIsolationError(`TenantIsolationError: Cannot delete ${model} outside active tenant context`);
          }
        } else {
          (args as any).where = { ...whereAny, complexId };
        }

        return query(args);
      },

      async deleteMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'deleteMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async aggregate({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'aggregate');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      },

      async groupBy({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'groupBy');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return query(args);
      }
    }
  }
});
