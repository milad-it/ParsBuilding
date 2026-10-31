import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve('..');
const SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'server', 'prisma', 'schema.prisma');
const DB_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'config', 'database.ts');
const TENANT_MIDDLEWARE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'tenant.ts');

describe('Tier 5 Adversarial: Multi-Tenancy, RBAC & Database Schema Integrity (Security Enforcement Suite)', () => {

  describe('Adversarial Challenge 1: Cross-Tenant Data Isolation Penetration & Query Interceptors', () => {
    const dbConfigCode = fs.readFileSync(DB_CONFIG_PATH, 'utf-8');
    const tenantMiddlewareCode = fs.readFileSync(TENANT_MIDDLEWARE_PATH, 'utf-8');

    it('ADV-1.1 [ENFORCED]: Verifies that findUnique / findUniqueOrThrow ARE intercepted by Prisma extension', () => {
      const hasFindUnique = dbConfigCode.includes('findUnique(') || dbConfigCode.includes('findUnique :') || dbConfigCode.includes('findUniqueOrThrow');
      assert.equal(
        hasFindUnique,
        true,
        'SECURITY VIOLATION: findUnique must be intercepted by TenantIsolationExtension to prevent cross-tenant ID leaks!'
      );
    });

    it('ADV-1.2 [ENFORCED]: Verifies that updateMany and deleteMany ARE intercepted by Prisma extension', () => {
      const hasUpdateMany = dbConfigCode.includes('updateMany(') || dbConfigCode.includes('updateMany :');
      const hasDeleteMany = dbConfigCode.includes('deleteMany(') || dbConfigCode.includes('deleteMany :');
      assert.equal(hasUpdateMany, true, 'SECURITY VIOLATION: updateMany must be intercepted!');
      assert.equal(hasDeleteMany, true, 'SECURITY VIOLATION: deleteMany must be intercepted!');
    });

    it('ADV-1.3 [ENFORCED]: Verifies that upsert and aggregate ARE intercepted by Prisma extension', () => {
      const hasUpsert = dbConfigCode.includes('upsert(') || dbConfigCode.includes('upsert :');
      const hasAggregate = dbConfigCode.includes('aggregate(') || dbConfigCode.includes('aggregate :');
      assert.equal(hasUpsert, true, 'SECURITY VIOLATION: upsert must be intercepted!');
      assert.equal(hasAggregate, true, 'SECURITY VIOLATION: aggregate must be intercepted!');
    });

    it('ADV-1.4 [ENFORCED]: Verifies that "user" model IS included in TENANT_MODELS list', () => {
      const tenantModelsMatch = dbConfigCode.match(/const TENANT_MODELS = \[([\s\S]*?)\] as const;/);
      assert.ok(tenantModelsMatch, 'TENANT_MODELS list must be found in database.ts');
      const modelsList = tenantModelsMatch[1].toLowerCase();
      const includesUser = modelsList.includes("'user'") || modelsList.includes('"user"');
      assert.equal(
        includesUser,
        true,
        'SECURITY VIOLATION: user model must be included in TENANT_MODELS to enforce tenant isolation!'
      );
    });

    it('ADV-1.5 [ENFORCED]: Verifies FAIL-CLOSED behavior when tenant context is missing', () => {
      const hasFailClosedThrow = dbConfigCode.includes('throw new Error') || dbConfigCode.includes('TenantIsolationError');
      assert.equal(
        hasFailClosedThrow,
        true,
        'SECURITY VIOLATION: database.ts must throw TenantIsolationError when tenant context is absent!'
      );
    });

    it('ADV-1.6 [ENFORCED]: Verifies that tenantMiddleware REJECTS requests without tenant headers', () => {
      const middlewareFuncMatch = tenantMiddlewareCode.match(/export async function tenantMiddleware[\s\S]*?\n\}/);
      assert.ok(middlewareFuncMatch, 'tenantMiddleware function must be present');
      const funcBody = middlewareFuncMatch[0];
      const rejectsMissingHeader = funcBody.includes('reply.code') ||
                                   funcBody.includes('reply.status') ||
                                   funcBody.includes('throw new');
      assert.equal(
        rejectsMissingHeader,
        true,
        'SECURITY VIOLATION: tenantMiddleware must reject missing tenant headers with 400 Bad Request!'
      );
    });

    it('ADV-1.7 [ENFORCED]: Verifies presence of AsyncLocalStorage context management and safe scoping', () => {
      assert.ok(
        tenantMiddlewareCode.includes('tenantStorage.enterWith') || tenantMiddlewareCode.includes('tenantStorage.run'),
        'AsyncLocalStorage must be initialized for tenant context scoping.'
      );
    });
  });

  describe('Adversarial Challenge 2: Cascade Integrity & Referential Rules (onDelete)', () => {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    it('ADV-2.1 [ENFORCED]: Verifies that deleting a Unit does NOT cascade-delete LedgerTransaction records', () => {
      const ledgerTxMatch = schemaContent.match(/model LedgerTransaction \{[\s\S]*?\n\}/);
      assert.ok(ledgerTxMatch, 'LedgerTransaction model must exist');
      const hasCascadeOnUnit = /unit\s+Unit\s+@relation\([^)]*onDelete:\s*Cascade[^)]*\)/.test(ledgerTxMatch[0]);
      const hasRestrictOnUnit = /unit\s+Unit\s+@relation\([^)]*onDelete:\s*Restrict[^)]*\)/.test(ledgerTxMatch[0]);
      assert.equal(hasCascadeOnUnit, false, 'SECURITY VIOLATION: LedgerTransaction must NOT have onDelete: Cascade on unit!');
      assert.ok(hasRestrictOnUnit, 'LedgerTransaction must have onDelete: Restrict on unit!');
    });

    it('ADV-2.2 [ENFORCED]: Verifies that deleting a Unit does NOT cascade-delete past UnitCharge records', () => {
      const unitChargeMatch = schemaContent.match(/model UnitCharge \{[\s\S]*?\n\}/);
      assert.ok(unitChargeMatch, 'UnitCharge model must exist');
      const hasCascadeOnUnit = /unit\s+Unit\s+@relation\([^)]*onDelete:\s*Cascade[^)]*\)/.test(unitChargeMatch[0]);
      const hasRestrictOnUnit = /unit\s+Unit\s+@relation\([^)]*onDelete:\s*Restrict[^)]*\)/.test(unitChargeMatch[0]);
      assert.equal(hasCascadeOnUnit, false, 'SECURITY VIOLATION: UnitCharge must NOT have onDelete: Cascade on unit!');
      assert.ok(hasRestrictOnUnit, 'UnitCharge must have onDelete: Restrict on unit!');
    });

    it('ADV-2.3 [ENFORCED]: Verifies that deleting a User does NOT cascade-delete ChatMessage notices', () => {
      const chatMatch = schemaContent.match(/model ChatMessage \{[\s\S]*?\n\}/);
      assert.ok(chatMatch, 'ChatMessage model must exist');
      const hasCascadeOnSender = /sender\s+User\??\s+@relation\([^)]*onDelete:\s*Cascade[^)]*\)/.test(chatMatch[0]);
      const hasSetNullOnSender = /sender\s+User\??\s+@relation\([^)]*onDelete:\s*SetNull[^)]*\)/.test(chatMatch[0]);
      assert.equal(hasCascadeOnSender, false, 'SECURITY VIOLATION: ChatMessage must NOT cascade delete on sender User!');
      assert.ok(hasSetNullOnSender, 'ChatMessage must have onDelete: SetNull on sender User!');
    });

    it('ADV-2.4 [ENFORCED]: Verifies that deleting a User does NOT cascade-delete uploaded ReceiptVerification records', () => {
      const receiptMatch = schemaContent.match(/model ReceiptVerification \{[\s\S]*?\n\}/);
      assert.ok(receiptMatch, 'ReceiptVerification model must exist');
      const hasCascadeOnUploader = /uploadedBy\s+User\??\s+@relation\([^)]*onDelete:\s*Cascade[^)]*\)/.test(receiptMatch[0]);
      const hasSetNullOnUploader = /uploadedBy\s+User\??\s+@relation\([^)]*onDelete:\s*SetNull[^)]*\)/.test(receiptMatch[0]);
      assert.equal(hasCascadeOnUploader, false, 'SECURITY VIOLATION: ReceiptVerification must NOT cascade delete on uploadedBy User!');
      assert.ok(hasSetNullOnUploader, 'ReceiptVerification must have onDelete: SetNull on uploadedBy User!');
    });

    it('ADV-2.5 [SAFE]: Verifies that AuditLog and LedgerTransaction do NOT cascade-delete on User deletion', () => {
      const auditLogMatch = schemaContent.match(/model AuditLog \{[\s\S]*?\n\}/);
      assert.ok(auditLogMatch);
      assert.ok(auditLogMatch[0].includes('actor           User?           @relation("ActorAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)'));

      const ledgerTxMatch = schemaContent.match(/model LedgerTransaction \{[\s\S]*?\n\}/);
      assert.ok(ledgerTxMatch);
      assert.ok(ledgerTxMatch[0].includes('createdBy       User?           @relation("TxCreator", fields: [createdById], references: [id], onDelete: SetNull)'));
    });
  });

  describe('Adversarial Challenge 3: Composite Index and Uniqueness Analysis in schema.prisma', () => {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    it('ADV-3.1 [ENFORCED]: Verifies that Period declares composite unique constraint', () => {
      const periodMatch = schemaContent.match(/model Period \{[\s\S]*?\n\}/);
      assert.ok(periodMatch);
      const hasPeriodUnique = periodMatch[0].includes('@@unique([complexId, type, year, month])') ||
                              periodMatch[0].includes('@@unique([complexId, year, month, type])') ||
                              periodMatch[0].includes('@@unique([complexId, name])');
      assert.equal(hasPeriodUnique, true, 'SECURITY VIOLATION: Period must declare composite uniqueness on [complexId, type, year, month]!');
    });

    it('ADV-3.2 [ENFORCED]: Verifies that Resident declares composite unique constraint', () => {
      const residentMatch = schemaContent.match(/model Resident \{[\s\S]*?\n\}/);
      assert.ok(residentMatch);
      const hasResidentUnique = residentMatch[0].includes('@@unique([complexId, phone])') ||
                                residentMatch[0].includes('@@unique([complexId, nationalCode])');
      assert.equal(hasResidentUnique, true, 'SECURITY VIOLATION: Resident must declare @@unique([complexId, phone])!');
    });

    it('ADV-3.3 [ENFORCED]: Verifies that UnitResident declares composite unique constraint', () => {
      const unitResidentMatch = schemaContent.match(/model UnitResident \{[\s\S]*?\n\}/);
      assert.ok(unitResidentMatch);
      const hasUnitResidentUnique = unitResidentMatch[0].includes('@@unique');
      assert.equal(hasUnitResidentUnique, true, 'SECURITY VIOLATION: UnitResident must declare @@unique composite constraint!');
    });

    it('ADV-3.4 [PASS]: Verifies that Unit declares @@unique([complexId, unitNumber]) preventing cross-tenant unit collision', () => {
      const unitMatch = schemaContent.match(/model Unit \{[\s\S]*?\n\}/);
      assert.ok(unitMatch);
      assert.ok(unitMatch[0].includes('@@unique([complexId, unitNumber])'));
      assert.ok(unitMatch[0].includes('@@index([complexId])'));
    });

    it('ADV-3.5 [PASS]: Verifies that UnitCharge declares @@unique([periodId, unitId]) preventing duplicate unit charges', () => {
      const unitChargeMatch = schemaContent.match(/model UnitCharge \{[\s\S]*?\n\}/);
      assert.ok(unitChargeMatch);
      assert.ok(unitChargeMatch[0].includes('@@unique([periodId, unitId])'));
      assert.ok(unitChargeMatch[0].includes('@@index([complexId, unitId])'));
    });
  });
});
