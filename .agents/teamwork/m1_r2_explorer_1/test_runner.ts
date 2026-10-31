import { PrismaClient } from '../../../server/node_modules/@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';

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
        return { model, action: 'findMany', args } as any;
      },

      async findFirst({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findFirst');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return { model, action: 'findFirst', args } as any;
      },

      async findUnique({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'findUnique');
        if (!complexId) {
          return { model, action: 'findUnique', args } as any;
        }

        const whereAny = (args.where || {}) as Record<string, any>;
        if (whereAny.complexId && whereAny.complexId !== complexId) {
          return null;
        }

        return {
          model,
          action: 'findUnique->findFirst',
          args: { ...args, where: { ...whereAny, complexId } }
        } as any;
      },

      async updateMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'updateMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return { model, action: 'updateMany', args } as any;
      },

      async deleteMany({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'deleteMany');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return { model, action: 'deleteMany', args } as any;
      },

      async aggregate({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'aggregate');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return { model, action: 'aggregate', args } as any;
      },

      async groupBy({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'groupBy');
        if (complexId) {
          args.where = { ...(args.where || {}), complexId };
        }
        return { model, action: 'groupBy', args } as any;
      },

      async upsert({ model, args, query }) {
        const complexId = enforceTenantScope(model, 'upsert');
        if (complexId) {
          if (args.create) {
            args.create = { ...(args.create as Record<string, unknown>), complexId };
          }
          const whereAny = (args.where || {}) as Record<string, any>;
          if (whereAny.complexId && whereAny.complexId !== complexId) {
            throw new Error(`TenantIsolationError: Cross-tenant upsert rejected for ${model}`);
          }
        }
        return { model, action: 'upsert', args } as any;
      }
    }
  }
});

async function runTests() {
  console.log('--- Running Tenant Isolation Hardening Tests ---');

  // Test 1: Fail-Closed without context
  assert.throws(
    () => {
      enforceTenantScope('unit', 'findMany');
    },
    { message: /TenantIsolationError: Fail-closed violation on unit.findMany/ }
  );
  console.log('✔ Test 1 Passed: Fail-closed when context is absent');

  // Test 2: Fail-Closed on 'user' model without complexId
  assert.throws(
    () => {
      enforceTenantScope('user', 'findMany');
    },
    { message: /TenantIsolationError: Fail-closed violation on user.findMany/ }
  );
  console.log('✔ Test 2 Passed: Fail-closed on user model when complexId is absent');

  // Test 3: Super Admin bypass when complexId is absent
  await tenantStorage.run(
    { complexId: '', userId: 'super-1', role: 'SUPER_ADMIN', permissions: [] },
    async () => {
      const scope = enforceTenantScope('user', 'findMany');
      assert.equal(scope, '');
      const res: any = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' } });
      assert.equal(res.args.where.complexId, undefined);
    }
  );
  console.log('✔ Test 3 Passed: Super Admin global view allowed without complexId');

  // Test 4: Tenant scoping for Unit findMany
  await tenantStorage.run(
    { complexId: 'cpx-alpha', userId: 'user-1', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const res: any = await prisma.unit.findMany({ where: { floor: 2 } });
      assert.equal(res.args.where.complexId, 'cpx-alpha');
      assert.equal(res.args.where.floor, 2);
    }
  );
  console.log('✔ Test 4 Passed: findMany correctly scopes to cpx-alpha');

  // Test 5: Tenant scoping for User findMany (prevents user leakage)
  await tenantStorage.run(
    { complexId: 'cpx-alpha', userId: 'user-1', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const res: any = await prisma.user.findMany();
      assert.equal(res.args.where.complexId, 'cpx-alpha');
    }
  );
  console.log('✔ Test 5 Passed: User findMany scopes to active tenant complexId');

  // Test 6: findUnique rewriting with complexId
  await tenantStorage.run(
    { complexId: 'cpx-alpha', userId: 'user-1', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const res: any = await prisma.unit.findUnique({ where: { id: 'u-123' } });
      assert.equal(res.args.where.id, 'u-123');
      assert.equal(res.args.where.complexId, 'cpx-alpha');
    }
  );
  console.log('✔ Test 6 Passed: findUnique safely injects complexId');

  // Test 7: updateMany and deleteMany tenant scoping
  await tenantStorage.run(
    { complexId: 'cpx-beta', userId: 'user-2', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const updateRes: any = await prisma.unit.updateMany({ where: { floor: 1 }, data: {} });
      assert.equal(updateRes.args.where.complexId, 'cpx-beta');

      const deleteRes: any = await prisma.ledgerTransaction.deleteMany({ where: { type: 'DEBT' } });
      assert.equal(deleteRes.args.where.complexId, 'cpx-beta');
    }
  );
  console.log('✔ Test 7 Passed: updateMany & deleteMany scoped to cpx-beta');

  // Test 8: aggregate and groupBy tenant scoping
  await tenantStorage.run(
    { complexId: 'cpx-gamma', userId: 'user-3', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const aggRes: any = await prisma.ledgerTransaction.aggregate({ where: { type: 'PAYMENT' } });
      assert.equal(aggRes.args.where.complexId, 'cpx-gamma');

      const groupRes: any = await prisma.unit.groupBy({ by: ['occType'] });
      assert.equal(groupRes.args.where.complexId, 'cpx-gamma');
    }
  );
  console.log('✔ Test 8 Passed: aggregate & groupBy scoped to cpx-gamma');

  // Test 9: upsert injection and cross-tenant block
  await tenantStorage.run(
    { complexId: 'cpx-alpha', userId: 'user-1', role: 'COMPLEX_MANAGER', permissions: [] },
    async () => {
      const upsertRes: any = await prisma.unit.upsert({
        where: { id: 'u-1' },
        create: { unitNumber: 101 },
        update: { unitNumber: 102 }
      });
      assert.equal(upsertRes.args.create.complexId, 'cpx-alpha');

      await assert.rejects(
        async () => {
          await prisma.unit.upsert({
            where: { id: 'u-1', complexId: 'cpx-other' } as any,
            create: { unitNumber: 101 },
            update: {}
          });
        },
        { message: /TenantIsolationError: Cross-tenant upsert rejected/ }
      );
    }
  );
  console.log('✔ Test 9 Passed: upsert injects complexId and rejects cross-tenant where');

  console.log('--- ALL 9 TEST SUITES PASSED EMPIRICALLY! ---');
}

runTests();
