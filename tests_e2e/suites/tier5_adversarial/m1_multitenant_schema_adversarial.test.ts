import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve('..');
const SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'server', 'prisma', 'schema.prisma');
const DB_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'config', 'database.ts');
const TENANT_MIDDLEWARE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'tenant.ts');

describe('Tier 5 Adversarial: Multi-Tenancy, RBAC & Database Schema Integrity', () => {

  describe('Adversarial Challenge 1: Cross-Tenant Data Isolation Penetration & Query Interceptors', () => {
    const dbConfigCode = fs.readFileSync(DB_CONFIG_PATH, 'utf-8');
    const tenantMiddlewareCode = fs.readFileSync(TENANT_MIDDLEWARE_PATH, 'utf-8');

    it('ADV-1.1 [CRITICAL]: Detects that findUnique / findUniqueOrThrow are NOT intercepted by Prisma extension', () => {
      // If findUnique is not intercepted, any tenant can fetch records from other tenants by ID
      const hasFindUnique = dbConfigCode.includes('findUnique(') || dbConfigCode.includes('findUnique :') || dbConfigCode.includes('findUniqueOrThrow');
      assert.equal(
        hasFindUnique,
        false,
        'VULNERABILITY CONFIRMED: findUnique is missing from TenantIsolationExtension, allowing cross-tenant read leaks by ID!'
      );
    });

    it('ADV-1.2 [CRITICAL]: Detects that updateMany and deleteMany are NOT intercepted by Prisma extension', () => {
      // If updateMany/deleteMany are unintercepted, bulk mutations/deletions affect all complexes
      const hasUpdateMany = dbConfigCode.includes('updateMany(') || dbConfigCode.includes('updateMany :');
      const hasDeleteMany = dbConfigCode.includes('deleteMany(') || dbConfigCode.includes('deleteMany :');
      assert.equal(
        hasUpdateMany,
        false,
        'VULNERABILITY CONFIRMED: updateMany is missing from TenantIsolationExtension!'
      );
      assert.equal(
        hasDeleteMany,
        false,
        'VULNERABILITY CONFIRMED: deleteMany is missing from TenantIsolationExtension!'
      );
    });

    it('ADV-1.3 [HIGH]: Detects that upsert and aggregate are NOT intercepted by Prisma extension', () => {
      const hasUpsert = dbConfigCode.includes('upsert(') || dbConfigCode.includes('upsert :');
      const hasAggregate = dbConfigCode.includes('aggregate(') || dbConfigCode.includes('aggregate :');
      assert.equal(
        hasUpsert,
        false,
        'VULNERABILITY CONFIRMED: upsert is missing from TenantIsolationExtension!'
      );
      assert.equal(
        hasAggregate,
        false,
        'VULNERABILITY CONFIRMED: aggregate is missing from TenantIsolationExtension!'
      );
    });

    it('ADV-1.4 [CRITICAL]: Detects that "user" model is OMITTED from TENANT_MODELS list', () => {
      // In database.ts, TENANT_MODELS lists tenant models.
      // If 'user' is missing, querying users under tenant context returns ALL users across all tenants!
      const tenantModelsMatch = dbConfigCode.match(/const TENANT_MODELS = \[([\s\S]*?)\] as const;/);
      assert.ok(tenantModelsMatch, 'TENANT_MODELS list must be found in database.ts');
      const modelsList = tenantModelsMatch[1].toLowerCase();
      const includesUser = modelsList.includes("'user'") || modelsList.includes('"user"');
      assert.equal(
        includesUser,
        false,
        'VULNERABILITY CONFIRMED: user model is missing from TENANT_MODELS, allowing cross-tenant user listing/leakage!'
      );
    });

    it('ADV-1.5 [CRITICAL]: Detects FAIL-OPEN behavior when tenant context is missing', () => {
      // If ctx?.complexId is false/undefined, the query runs UNFILTERED instead of failing closed!
      const hasFailClosedThrow = dbConfigCode.includes('throw new Error') || dbConfigCode.includes('TenantIsolationError');
      assert.equal(
        hasFailClosedThrow,
        false,
        'VULNERABILITY CONFIRMED: database.ts fails open when tenant context is absent, returning global unfiltered data!'
      );
    });

    it('ADV-1.6 [HIGH]: Detects that tenantMiddleware does NOT reject requests without tenant headers', () => {
      // Extract tenantMiddleware function body
      const middlewareFuncMatch = tenantMiddlewareCode.match(/export async function tenantMiddleware[\s\S]*?\n\}/);
      assert.ok(middlewareFuncMatch, 'tenantMiddleware function must be present');
      const funcBody = middlewareFuncMatch[0];
      const rejectsMissingHeader = funcBody.includes('reply.code') ||
                                   funcBody.includes('reply.status') ||
                                   funcBody.includes('throw new');
      assert.equal(
        rejectsMissingHeader,
        false,
        'VULNERABILITY CONFIRMED: tenantMiddleware silently ignores missing tenant headers, allowing unconstrained execution!'
      );
    });

    it('ADV-1.7 [MEDIUM]: Detects usage of asyncLocalStorage.enterWith instead of safe run / scope chaining', () => {
      assert.ok(
        tenantMiddlewareCode.includes('tenantStorage.enterWith'),
        'VULNERABILITY CONFIRMED: tenantStorage.enterWith is used, which can cause context leakage across async operations.'
      );
    });
  });

  describe('Adversarial Challenge 2: Cascade Integrity & Referential Rules (onDelete)', () => {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    it('ADV-2.1 [CRITICAL]: Detects that deleting a Unit CASCADE-DELETES financial LedgerTransaction records', () => {
      // In LedgerTransaction: unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)
      // If a unit is deleted, all past accounting ledger transactions are destroyed!
      const ledgerTxMatch = schemaContent.match(/model LedgerTransaction \{[\s\S]*?\n\}/);
      assert.ok(ledgerTxMatch, 'LedgerTransaction model must exist');
      const hasCascadeOnUnit = ledgerTxMatch[0].includes('unit            Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)');
      assert.ok(
        hasCascadeOnUnit,
        'CRITICAL DEFECT CONFIRMED: LedgerTransaction has onDelete: Cascade on unit! Deleting a unit destroys ledger history!'
      );
    });

    it('ADV-2.2 [CRITICAL]: Detects that deleting a Unit CASCADE-DELETES past UnitCharge records', () => {
      // In UnitCharge: unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)
      const unitChargeMatch = schemaContent.match(/model UnitCharge \{[\s\S]*?\n\}/);
      assert.ok(unitChargeMatch, 'UnitCharge model must exist');
      const hasCascadeOnUnit = unitChargeMatch[0].includes('unit                    Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)');
      assert.ok(
        hasCascadeOnUnit,
        'CRITICAL DEFECT CONFIRMED: UnitCharge has onDelete: Cascade on unit! Deleting a unit wipes charge history!'
      );
    });

    it('ADV-2.3 [HIGH]: Detects that deleting a User CASCADE-DELETES ChatMessage notices and messages', () => {
      // In ChatMessage: sender User @relation(fields: [senderId], references: [id], onDelete: Cascade)
      const chatMatch = schemaContent.match(/model ChatMessage \{[\s\S]*?\n\}/);
      assert.ok(chatMatch, 'ChatMessage model must exist');
      const hasCascadeOnSender = chatMatch[0].includes('sender          User            @relation(fields: [senderId], references: [id], onDelete: Cascade)');
      assert.ok(
        hasCascadeOnSender,
        'HIGH DEFECT CONFIRMED: ChatMessage has onDelete: Cascade on sender User! Deleting a user destroys notices and chat history!'
      );
    });

    it('ADV-2.4 [HIGH]: Detects that deleting a User CASCADE-DELETES uploaded ReceiptVerification records', () => {
      // In ReceiptVerification: uploadedBy User @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: Cascade)
      const receiptMatch = schemaContent.match(/model ReceiptVerification \{[\s\S]*?\n\}/);
      assert.ok(receiptMatch, 'ReceiptVerification model must exist');
      const hasCascadeOnUploader = receiptMatch[0].includes('uploadedBy      User            @relation("ReceiptUploader", fields: [uploadedById], references: [id], onDelete: Cascade)');
      assert.ok(
        hasCascadeOnUploader,
        'HIGH DEFECT CONFIRMED: ReceiptVerification has onDelete: Cascade on uploadedBy User! Payment proof is lost on user deletion!'
      );
    });

    it('ADV-2.5 [SAFE]: Verifies that AuditLog and LedgerTransaction do NOT cascade-delete on User deletion', () => {
      // Verify that actor/creator deletion sets null on AuditLog and LedgerTransaction
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

    it('ADV-3.1 [HIGH]: Detects that Period lacks @@unique([complexId, year, month, type])', () => {
      // Without composite uniqueness, duplicate monthly periods for the same month can be created concurrently
      const periodMatch = schemaContent.match(/model Period \{[\s\S]*?\n\}/);
      assert.ok(periodMatch);
      const hasPeriodUnique = periodMatch[0].includes('@@unique([complexId, year, month') || periodMatch[0].includes('@@unique([complexId, name])');
      assert.equal(
        hasPeriodUnique,
        false,
        'DEFECT CONFIRMED: Period lacks @@unique constraint, permitting duplicate billing periods for the same month!'
      );
    });

    it('ADV-3.2 [MEDIUM]: Detects that Resident lacks @@unique([complexId, phone]) or @@unique([complexId, nationalCode])', () => {
      const residentMatch = schemaContent.match(/model Resident \{[\s\S]*?\n\}/);
      assert.ok(residentMatch);
      const hasResidentUnique = residentMatch[0].includes('@@unique([complexId, phone])') || residentMatch[0].includes('@@unique([complexId, nationalCode])');
      assert.equal(
        hasResidentUnique,
        false,
        'DEFECT CONFIRMED: Resident lacks composite unique constraints, allowing duplicate residents with the same phone in the same complex!'
      );
    });

    it('ADV-3.3 [MEDIUM]: Detects that UnitResident lacks @@unique constraint', () => {
      const unitResidentMatch = schemaContent.match(/model UnitResident \{[\s\S]*?\n\}/);
      assert.ok(unitResidentMatch);
      const hasUnitResidentUnique = unitResidentMatch[0].includes('@@unique');
      assert.equal(
        hasUnitResidentUnique,
        false,
        'DEFECT CONFIRMED: UnitResident has no @@unique constraint, permitting duplicate active assignments of the same resident to the same unit!'
      );
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
