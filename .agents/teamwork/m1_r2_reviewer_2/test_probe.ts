import assert from 'node:assert/strict';
import { prisma, rawPrisma, TenantIsolationError, TENANT_MODELS } from '../../../server/src/config/database';
import { runWithTenantContext, TenantContext } from '../../../server/src/middleware/tenant';

async function runAdversarialProbes() {
  console.log('--- Starting Adversarial Runtime Probes ---');

  // Probe 1: Fail-Closed on all 15 operations without context
  console.log('Probe 1: Verifying Fail-Closed on all 15 operations without context...');
  const operations = [
    { name: 'findMany', fn: () => prisma.unit.findMany() },
    { name: 'findFirst', fn: () => prisma.unit.findFirst() },
    { name: 'findFirstOrThrow', fn: () => prisma.unit.findFirstOrThrow() },
    { name: 'findUnique', fn: () => prisma.unit.findUnique({ where: { id: 'test-id' } }) },
    { name: 'findUniqueOrThrow', fn: () => prisma.unit.findUniqueOrThrow({ where: { id: 'test-id' } }) },
    { name: 'count', fn: () => prisma.unit.count() },
    { name: 'create', fn: () => prisma.unit.create({ data: { unitNumber: 999 } as any }) },
    { name: 'createMany', fn: () => prisma.unit.createMany({ data: [{ unitNumber: 999 }] as any }) },
    { name: 'update', fn: () => prisma.unit.update({ where: { id: 'test-id' }, data: { unitNumber: 100 } }) },
    { name: 'updateMany', fn: () => prisma.unit.updateMany({ data: { unitNumber: 100 } }) },
    { name: 'upsert', fn: () => prisma.unit.upsert({ where: { id: 'test-id' }, create: { unitNumber: 1 } as any, update: {} }) },
    { name: 'delete', fn: () => prisma.unit.delete({ where: { id: 'test-id' } }) },
    { name: 'deleteMany', fn: () => prisma.unit.deleteMany() },
    { name: 'aggregate', fn: () => prisma.unit.aggregate({ _count: true }) },
    { name: 'groupBy', fn: () => (prisma.unit as any).groupBy({ by: ['occType'] }) }
  ];

  let failClosedCount = 0;
  for (const op of operations) {
    try {
      await op.fn();
      assert.fail(`Operation ${op.name} DID NOT fail closed without tenant context!`);
    } catch (err: any) {
      if (err instanceof TenantIsolationError || err.name === 'TenantIsolationError') {
        failClosedCount++;
      } else {
        throw new Error(`Operation ${op.name} threw unexpected error type: ${err.message}`);
      }
    }
  }
  assert.equal(failClosedCount, 15, 'All 15 operations must throw TenantIsolationError fail-closed');
  console.log(`✓ Probe 1 Passed: All 15 operations threw TenantIsolationError fail-closed.`);

  // Probe 2: Non-tenant model bypass check
  console.log('Probe 2: Verifying non-tenant model handling...');
  try {
    await prisma.complex.findFirst();
  } catch (err: any) {
    assert.notEqual(err.name, 'TenantIsolationError', 'Non-tenant model Complex must not throw TenantIsolationError');
    console.log(`✓ Probe 2 Passed: Complex model is correctly exempt from tenant isolation error.`);
  }

  // Probe 3: Super Admin without complexId bypass
  console.log('Probe 3: Verifying Super Admin global bypass...');
  await runWithTenantContext({ complexId: '', role: 'SUPER_ADMIN', userId: 'admin', permissions: [] }, async () => {
    try {
      await prisma.unit.findMany();
    } catch (err: any) {
      assert.notEqual(err.name, 'TenantIsolationError', 'Super Admin without complexId must bypass TenantIsolationError');
      console.log(`✓ Probe 3 Passed: Super Admin without complexId bypasses TenantIsolationError.`);
    }
  });

  // Probe 4: Scoped tenant context injection and cross-tenant mutation blocking
  console.log('Probe 4: Verifying tenant scoping in mutations & queries...');
  const testTenantId = 'tenant-complex-123';
  await runWithTenantContext({ complexId: testTenantId, role: 'COMPLEX_MANAGER', userId: 'mgr', permissions: [] }, async () => {
    const originalFindUnique = (rawPrisma as any).unit.findUnique;
    const originalFindFirst = (rawPrisma as any).unit.findFirst;

    try {
      // 4.1 Cross-tenant update blocked
      (rawPrisma as any).unit.findUnique = async (args: any) => {
        return { id: 'u-foreign', complexId: 'victim-complex-999' };
      };

      try {
        await prisma.unit.update({ where: { id: 'u-foreign' }, data: { unitNumber: 99 } });
        assert.fail('Update on cross-tenant entity must throw TenantIsolationError!');
      } catch (err: any) {
        assert.ok(err instanceof TenantIsolationError || err.name === 'TenantIsolationError', 'Must throw TenantIsolationError');
        console.log(`✓ Probe 4.1 Passed: Cross-tenant update blocked by TenantIsolationError.`);
      }

      // 4.2 Cross-tenant delete blocked
      try {
        await prisma.unit.delete({ where: { id: 'u-foreign' } });
        assert.fail('Delete on cross-tenant entity must throw TenantIsolationError!');
      } catch (err: any) {
        assert.ok(err instanceof TenantIsolationError || err.name === 'TenantIsolationError', 'Must throw TenantIsolationError');
        console.log(`✓ Probe 4.2 Passed: Cross-tenant delete blocked by TenantIsolationError.`);
      }

      // 4.3 Cross-tenant upsert blocked
      try {
        await prisma.unit.upsert({
          where: { id: 'u-foreign', complexId: 'victim-complex-999' } as any,
          create: { unitNumber: 1 } as any,
          update: {}
        });
        assert.fail('Upsert with cross-tenant complexId in where must throw TenantIsolationError!');
      } catch (err: any) {
        assert.ok(err instanceof TenantIsolationError || err.name === 'TenantIsolationError');
        console.log(`✓ Probe 4.3 Passed: Cross-tenant upsert blocked by TenantIsolationError.`);
      }

      // 4.4 findUnique delegation to findFirst with complexId
      let delegatedArgs: any = null;
      (rawPrisma as any).unit.findFirst = async (args: any) => {
        delegatedArgs = args;
        return { id: 'unit-mine', complexId: testTenantId };
      };

      const found = await prisma.unit.findUnique({ where: { id: 'unit-mine' } });
      assert.ok(delegatedArgs);
      assert.equal(delegatedArgs.where.id, 'unit-mine');
      assert.equal(delegatedArgs.where.complexId, testTenantId);
      assert.equal(found?.id, 'unit-mine');
      console.log(`✓ Probe 4.4 Passed: findUnique correctly delegated to findFirst with complexId scoping.`);

      // 4.5 findUnique with cross-tenant where.complexId returns null immediately
      const crossTenantResult = await prisma.unit.findUnique({
        where: { id: 'unit-foreign', complexId: 'other-complex' } as any
      });
      assert.equal(crossTenantResult, null, 'findUnique with mismatched complexId must return null immediately');
      console.log(`✓ Probe 4.5 Passed: findUnique with mismatched complexId returns null.`);

    } finally {
      (rawPrisma as any).unit.findUnique = originalFindUnique;
      (rawPrisma as any).unit.findFirst = originalFindFirst;
    }
  });

  console.log('--- All Adversarial Runtime Probes Passed Successfully! ---');
}

runAdversarialProbes().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});
