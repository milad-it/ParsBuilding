import { PrismaClient } from '@prisma/client';
import { getTenantContext } from '../middleware/tenant';

const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

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
  'submanagerpermission'
] as const;

export const prisma = rawPrisma.$extends({
  name: 'TenantIsolationExtension',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async findFirst({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async count({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async create({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.data = { ...(args.data as Record<string, unknown>), complexId: ctx.complexId };
        }
        return query(args);
      },

      async update({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      },

      async delete({ model, args, query }) {
        const modelName = model.toLowerCase();
        const ctx = getTenantContext();
        if (ctx?.complexId && (TENANT_MODELS as readonly string[]).includes(modelName)) {
          args.where = { ...(args.where || {}), complexId: ctx.complexId };
        }
        return query(args);
      }
    }
  }
});
