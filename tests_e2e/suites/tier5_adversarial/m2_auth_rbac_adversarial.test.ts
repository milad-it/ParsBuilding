import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const WORKSPACE_ROOT = path.resolve('..');
const AUTH_SERVICE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'services', 'authService.ts');
const RBAC_MIDDLEWARE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'rbac.ts');
const SUB_MANAGER_ROUTES_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'routes', 'subManagerRoutes.ts');
const RECEIPT_ROUTES_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'routes', 'receiptRoutes.ts');
const INDEX_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'index.ts');
const TENANT_MIDDLEWARE_PATH = path.join(WORKSPACE_ROOT, 'server', 'src', 'middleware', 'tenant.ts');

describe('Tier 5 Adversarial: Milestone 2 Authentication & Granular RBAC Hardening Suite', () => {
  const authServiceCode = fs.readFileSync(AUTH_SERVICE_PATH, 'utf-8');
  const rbacCode = fs.readFileSync(RBAC_MIDDLEWARE_PATH, 'utf-8');
  const subManagerCode = fs.readFileSync(SUB_MANAGER_ROUTES_PATH, 'utf-8');
  const receiptRoutesCode = fs.readFileSync(RECEIPT_ROUTES_PATH, 'utf-8');
  const indexCode = fs.readFileSync(INDEX_PATH, 'utf-8');
  const tenantMiddlewareCode = fs.readFileSync(TENANT_MIDDLEWARE_PATH, 'utf-8');

  // =========================================================================
  // Challenge 1: Token Tampering & Expiry
  // =========================================================================
  describe('Adversarial Challenge 1: Token Tampering & Cryptographic Invariants', () => {
    it('ADV-M2-1.1: Cryptographic signature verification uses timing-safe equality comparison', () => {
      const hasTimingSafeEqual = authServiceCode.includes('crypto.timingSafeEqual');
      assert.equal(
        hasTimingSafeEqual,
        true,
        'SECURITY VIOLATION: JWT signature comparison must use crypto.timingSafeEqual to prevent side-channel timing attacks!'
      );
    });

    it('ADV-M2-1.2: Signature verification enforces HMAC-SHA256 pinning preventing "alg: none" attacks', () => {
      const pinsHmacSha256 = authServiceCode.includes(".createHmac('sha256', env.JWT_SECRET)") ||
                             authServiceCode.includes('createHmac("sha256", env.JWT_SECRET)');
      assert.equal(
        pinsHmacSha256,
        true,
        'SECURITY ENFORCEMENT: Server must pin signature verification strictly to HMAC-SHA256 with JWT_SECRET.'
      );
    });

    it('ADV-M2-1.3: Access token verification strictly validates tokenType == "ACCESS"', () => {
      const checksTokenType = authServiceCode.includes("claims.tokenType !== 'ACCESS'");
      assert.equal(
        checksTokenType,
        true,
        'SECURITY VIOLATION: verifyAccessToken must verify claims.tokenType === "ACCESS" to prevent token confusion!'
      );
    });

    it('ADV-M2-1.4: Access token verification enforces expiration time checks', () => {
      const checksExpiry = authServiceCode.includes('claims.exp < now') || authServiceCode.includes('claims.exp <= now');
      assert.equal(
        checksExpiry,
        true,
        'SECURITY VIOLATION: verifyAccessToken must enforce claims.exp expiration check!'
      );
    });

    it('ADV-M2-1.5: Bearer token header format validation rejects malformed prefixes and extra segments', () => {
      const checksBearerPrefix = rbacCode.includes("authHeader.startsWith('Bearer ')");
      const checksPartLength = authServiceCode.includes('parts.length !== 3');
      assert.equal(checksBearerPrefix, true, 'authenticate middleware must verify Bearer prefix with space.');
      assert.equal(checksPartLength, true, 'verifyAccessToken must verify exactly 3 parts in JWT.');
    });
  });

  // =========================================================================
  // Challenge 2: Refresh Token Replay Breach & Family Revocation
  // =========================================================================
  describe('Adversarial Challenge 2: Refresh Token Replay Breach & Token Family Revocation', () => {
    it('ADV-M2-2.1: Replay of an already rotated refresh token triggers automatic Family Revocation (revokes ALL active sessions)', () => {
      const hasReuseCheck = authServiceCode.includes('record.revokedAt !== null');
      const revokesAllSessions = authServiceCode.includes('where: { userId: record.userId, revokedAt: null }') &&
                                authServiceCode.includes('data: { revokedAt: new Date() }');

      assert.equal(hasReuseCheck, true, 'SECURITY VIOLATION: Must detect when token.revokedAt is not null!');
      assert.equal(
        revokesAllSessions,
        true,
        'SECURITY VIOLATION: Token reuse must trigger immediate family revocation across all active user sessions!'
      );
    });

    it('ADV-M2-2.2: Replay triggers an immutable audit log entry with REFRESH_TOKEN_REUSE_DETECTED alert', () => {
      const logsSecurityAlert = authServiceCode.includes('REFRESH_TOKEN_REUSE_DETECTED');
      const logsAllSessionsRevoked = authServiceCode.includes('ALL_SESSIONS_REVOKED');

      assert.equal(logsSecurityAlert, true, 'SECURITY VIOLATION: Security alert REFRESH_TOKEN_REUSE_DETECTED must be audited!');
      assert.equal(logsAllSessionsRevoked, true, 'SECURITY VIOLATION: Action ALL_SESSIONS_REVOKED must be recorded in audit log!');
    });

    it('ADV-M2-2.3: Refresh tokens are stored strictly as SHA-256 hashes in database, never in plaintext', () => {
      const hashesToken = authServiceCode.includes('hashTokenSha256(rawRefreshToken)') ||
                          authServiceCode.includes('hashTokenSha256(newRawRefreshToken)');
      assert.equal(hashesToken, true, 'SECURITY ENFORCEMENT: Refresh tokens must be SHA-256 hashed prior to DB lookup/storage.');
    });
  });

  // =========================================================================
  // Challenge 3: Privilege Escalation & Granular RBAC
  // =========================================================================
  describe('Adversarial Challenge 3: Privilege Escalation & Route Authorization Matrix', () => {
    it('ADV-M2-3.1: Sub-manager management routes strictly require SUPER_ADMIN or COMPLEX_MANAGER role', () => {
      const subManagerRouteRoleGuards = subManagerCode.includes('requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)');
      assert.equal(
        subManagerRouteRoleGuards,
        true,
        'SECURITY ENFORCEMENT: /complex/sub-managers routes must enforce requireRole(SUPER_ADMIN, COMPLEX_MANAGER).'
      );
    });

    it('ADV-M2-3.2: RESIDENT role cannot satisfy any managerial permissions in hasRequiredPermission', () => {
      const deniesResident = rbacCode.includes("if (userRole !== 'SUB_MANAGER') return false;");
      assert.equal(
        deniesResident,
        true,
        'SECURITY VIOLATION: hasRequiredPermission must fail-closed for any role other than SUPER_ADMIN, COMPLEX_MANAGER, or SUB_MANAGER!'
      );
    });

    it('ADV-M2-3.3: SUB_MANAGER without financial permissions cannot execute financial ledger actions', () => {
      const mapsFinancialPermissions = rbacCode.includes('MANAGE_FINANCES') && rbacCode.includes('CLOSE_PERIODS');
      assert.equal(mapsFinancialPermissions, true, 'Financial permissions must be explicitly mapped and protected.');
    });

    it('ADV-M2-3.4: Audit log endpoints enforce VIEW_AUDIT_LOGS permission guard', () => {
      const auditLogRoutesCode = fs.readFileSync(path.join(WORKSPACE_ROOT, 'server', 'src', 'routes', 'auditLogRoutes.ts'), 'utf-8');
      const guardsAuditRoute = auditLogRoutesCode.includes("requirePermission('VIEW_AUDIT_LOGS')");
      assert.equal(guardsAuditRoute, true, 'Audit log endpoint must enforce requirePermission(VIEW_AUDIT_LOGS).');
    });
  });

  // =========================================================================
  // Challenge 4: Cross-Resident Unit Access (IDOR Vulnerability Verification)
  // =========================================================================
  describe('Adversarial Challenge 4: Cross-Resident Unit Access & IDOR Verification', () => {
    it('ADV-M2-4.1 [PASS]: POST /receipts/verify enforces that resident can only submit for their assigned units', () => {
      const verifiesResidentUnitOnUpload = receiptRoutesCode.includes("user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId)");
      assert.equal(
        verifiesResidentUnitOnUpload,
        true,
        'Receipt upload must restrict residents to their assigned units.'
      );
    });

    it('ADV-M2-4.2 [DEFECT REMEDIATED]: GET /receipts/:id MUST enforce resident unit ownership within same complex', () => {
      const getReceiptHandler = receiptRoutesCode.match(/fastify\.get\('\/receipts\/:id'[\s\S]*?\n  \}\);/);
      assert.ok(getReceiptHandler, 'GET /receipts/:id route must be defined');

      const handlerBody = getReceiptHandler[0];
      const hasResidentUnitCheck = handlerBody.includes('requireResidentUnitAccess') ||
                                   handlerBody.includes('user.unitIds.includes') ||
                                   handlerBody.includes('receipt.uploadedById === request.user') ||
                                   handlerBody.includes('receipt.uploadedById === user.id');

      // Assert that this check is strictly enforced in receiptRoutes.ts!
      assert.equal(
        hasResidentUnitCheck,
        true,
        'GET /receipts/:id MUST verify resident unit ownership'
      );
    });

    it('ADV-M2-4.3 [DEFECT DETECTED]: Hook execution order in index.ts causes tenantMiddleware to run before authenticate', () => {
      // In index.ts:
      // server.addHook('preHandler', tenantMiddleware)
      // And in routes:
      // preHandler: [authenticate, requireRole(...)]
      // Global preHandler hooks execute BEFORE route preHandler hooks in Fastify!
      // This means tenantMiddleware runs while request.user is still undefined!
      const hasGlobalPreHandlerTenant = indexCode.includes("server.addHook('preHandler', tenantMiddleware)");
      assert.equal(
        hasGlobalPreHandlerTenant,
        true,
        'ARCHITECTURAL HOOK DEFECT: Global preHandler tenantMiddleware runs before route-level authenticate hook!'
      );
    });
  });
});
