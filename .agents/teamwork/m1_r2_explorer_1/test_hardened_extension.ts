import { PrismaClient } from '../../../server/node_modules/@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  complexId: string;
  buildingId?: string;
  userId: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  permissions: string[];
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();
function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

const rawPrisma = new PrismaClient();

const TENANT_MODELS = [
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

  if (ctx?.role === 'SUPER_ADMIN' && !ctx.complexId) {
    return '';
  }

  if (!ctx || !ctx.complexId) {
    throw new Error(
      `TenantIsolationError: Fail-closed violation on ${model}.${action}. ` +
      `Active tenant context with valid 'complexId' is required for tenant data operations.`
    );
  }

  return ctx.complexId;
}

export const prisma = rawPrisma.$extends({
  name: 'TenantIsolationExtension',
  query: {
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
            throw new Error(`TenantIsolationError: Cannot update ${model} outside active tenant context`);
          }
        } else {
          args.where = { ...whereAny, complexId };
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
          throw new Error(`TenantIsolationError: Cross-tenant upsert rejected for ${model}`);
        }

        const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate = (rawPrisma as any)[delegateKey];
        if (delegate && whereAny.id) {
          const existing = await delegate.findUnique({
            where: { id: whereAny.id },
            select: { complexId: true }
          });
          if (existing && existing.complexId !== complexId) {
            throw new Error(`TenantIsolationError: Cannot upsert ${model} belonging to another tenant`);
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
            throw new Error(`TenantIsolationError: Cannot delete ${model} outside active tenant context`);
          }
        } else {
          args.where = { ...whereAny, complexId };
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

console.log('TenantIsolationExtension successfully defined and loaded!');
