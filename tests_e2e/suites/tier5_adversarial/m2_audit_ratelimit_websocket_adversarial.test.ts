import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Resolve workspace root reliably regardless of current working directory
const CURRENT_DIR = process.cwd();
const WORKSPACE_ROOT = CURRENT_DIR.endsWith('tests_e2e') ? path.resolve('..') : CURRENT_DIR;

const DB_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'config', 'database.ts');
const SECURITY_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'config', 'security.ts');
const ERROR_HANDLER_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'errorHandler.ts');
const REALTIME_SERVICE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'services', 'realtimeService.ts');
const AUTH_ROUTES_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'routes', 'authRoutes.ts');

describe('Tier 5 Adversarial Hardening (M2): Audit Immutability, Rate Limiting & WebSocket Isolation', () => {

  // =========================================================================
  // Challenge 1: Audit Immutability Static & Contract Invariants
  // =========================================================================
  describe('Adversarial Challenge 1: Audit Log Immutability Enforcement (Prisma Extension Interceptors)', () => {
    const dbCode = fs.readFileSync(DB_CONFIG_PATH, 'utf-8');

    it('ADV-M2.1.1 [ENFORCED]: Verifies AuditLogImmutableError class is defined with HTTP 403 status', () => {
      assert.ok(dbCode.includes('class AuditLogImmutableError extends Error'), 'AuditLogImmutableError must be defined');
      assert.ok(dbCode.includes("code = 'AUDIT_LOG_IMMUTABLE_VIOLATION'"), 'Must define standard security violation error code');
      assert.ok(dbCode.includes('statusCode = 403'), 'Must designate HTTP 403 status code');
    });

    it('ADV-M2.1.2 [ENFORCED]: Verifies prisma.auditLog.update is intercepted and throws AuditLogImmutableError', () => {
      assert.ok(
        dbCode.includes("throw new AuditLogImmutableError('update')"),
        'update must throw AuditLogImmutableError'
      );
    });

    it('ADV-M2.1.3 [ENFORCED]: Verifies prisma.auditLog.updateMany is intercepted and throws AuditLogImmutableError', () => {
      assert.ok(
        dbCode.includes("throw new AuditLogImmutableError('updateMany')"),
        'updateMany must throw AuditLogImmutableError'
      );
    });

    it('ADV-M2.1.4 [ENFORCED]: Verifies prisma.auditLog.delete is intercepted and throws AuditLogImmutableError', () => {
      assert.ok(
        dbCode.includes("throw new AuditLogImmutableError('delete')"),
        'delete must throw AuditLogImmutableError'
      );
    });

    it('ADV-M2.1.5 [ENFORCED]: Verifies prisma.auditLog.deleteMany is intercepted and throws AuditLogImmutableError', () => {
      assert.ok(
        dbCode.includes("throw new AuditLogImmutableError('deleteMany')"),
        'deleteMany must throw AuditLogImmutableError'
      );
    });

    it('ADV-M2.1.6 [ENFORCED]: Verifies prisma.auditLog.upsert is intercepted and throws AuditLogImmutableError', () => {
      assert.ok(
        dbCode.includes("throw new AuditLogImmutableError('upsert')"),
        'upsert must throw AuditLogImmutableError'
      );
    });
  });

  // =========================================================================
  // Challenge 2: Rate Limiting & Problem Details Architecture
  // =========================================================================
  describe('Adversarial Challenge 2: Rate Limiting Invariants & Error Handling', () => {
    const secCode = fs.readFileSync(SECURITY_CONFIG_PATH, 'utf-8');
    const authCode = fs.readFileSync(AUTH_ROUTES_PATH, 'utf-8');
    const errCode = fs.readFileSync(ERROR_HANDLER_PATH, 'utf-8');

    it('ADV-M2.2.1 [ENFORCED]: Verifies login route specifies max 5 attempts within 15 minutes', () => {
      assert.ok(secCode.includes("max: 5"), 'login rate limit must enforce max 5 attempts');
      assert.ok(secCode.includes("timeWindow: '15 minutes'"), 'login rate limit window must be 15 minutes');
      assert.ok(
        authCode.includes("fastify.post('/auth/login', loginRateLimitConfig"),
        'login route must bind loginRateLimitConfig middleware'
      );
    });

    it('ADV-M2.2.2 [ENFORCED]: Verifies errorResponseBuilder returns RFC 7807 problem details structure', () => {
      assert.ok(secCode.includes("type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded'"));
      assert.ok(secCode.includes("title: 'Too Many Requests'"));
      assert.ok(secCode.includes("status: 429"));
      assert.ok(secCode.includes("retryAfter:"));
    });

    it('ADV-M2.2.3 [ENFORCED]: Check if errorHandler properly maps rate limit errors to 429 RFC 7807', () => {
      // Fastify converts unhandled rate limit errors into 500 unless explicitly intercepted
      const handlesRateLimitInErrorHandler =
        errCode.includes('429') ||
        errCode.includes('rate-limit') ||
        errCode.includes('RateLimit');

      assert.equal(
        handlesRateLimitInErrorHandler,
        true,
        'Rate limit error must be mapped to 429 RFC 7807'
      );
    });
  });

  // =========================================================================
  // Challenge 3: WebSocket Cross-Tenant Isolation
  // =========================================================================
  describe('Adversarial Challenge 3: WebSocket Cross-Tenant Room Isolation', () => {
    const wsCode = fs.readFileSync(REALTIME_SERVICE_PATH, 'utf-8');

    it('ADV-M2.3.1 [ENFORCED]: Verifies canSubscribe isolates complex channels strictly to user.complexId', () => {
      assert.ok(wsCode.includes("room.startsWith('complex:')"), 'Must check complex: room prefix');
      assert.ok(
        wsCode.includes('return user.complexId === targetComplex'),
        'Must strictly compare user.complexId to targetComplex'
      );
    });

    it('ADV-M2.3.2 [ENFORCED]: Verifies canSubscribe isolates user channels strictly to user.userId', () => {
      assert.ok(wsCode.includes("room.startsWith('user:')"), 'Must check user: room prefix');
      assert.ok(
        wsCode.includes('return room === `user:${user.userId}`'),
        'Must strictly match user personal channel'
      );
    });

    it('ADV-M2.3.3 [ENFORCED]: Verifies unit channel authorization enforces unitBelongsToComplex for managers', () => {
      const hasManagerBypass = wsCode.includes("user.role === 'COMPLEX_MANAGER' || user.role === 'SUB_MANAGER'");
      assert.ok(hasManagerBypass, 'Manager check exists');
      const hasComplexValidationForUnit = wsCode.includes('targetUnit.complexId') || wsCode.includes('unitBelongsToComplex');
      assert.equal(
        hasComplexValidationForUnit,
        true,
        'WebSocket canSubscribe must enforce unitBelongsToComplex'
      );
    });
  });
});
