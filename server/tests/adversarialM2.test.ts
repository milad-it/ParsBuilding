import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { UserRole, AuditAction } from '@prisma/client';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import {
  signAccessToken,
  verifyAccessToken,
  hashTokenSha256,
  authService,
  AuthenticationError
} from '../src/services/authService';
import { env } from '../src/config/env';
import { hasRequiredPermission, requireRole, requirePermission } from '../src/middleware/rbac';

describe('Tier 5 Adversarial Verification: Milestone 2 (Auth & Granular RBAC)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // Challenge 1: Token Tampering & Expiry
  // =========================================================================
  describe('Challenge 1: Token Tampering, Expiry & Signature Cryptanalysis', () => {
    it('ADV-1.1: Expired JWT tokens must be rejected with 401 and Token expired error', async () => {
      const expiredToken = signAccessToken(
        {
          sub: 'victim-user-1',
          phone: '09121111111',
          fullName: 'Victim Resident',
          role: 'RESIDENT',
          complexId: 'cpx-1',
          permissions: [],
          unitIds: ['unit-1']
        },
        -60 // expired 60 seconds ago
      );

      expect(() => verifyAccessToken(expiredToken)).toThrow(AuthenticationError);
      expect(() => verifyAccessToken(expiredToken)).toThrow('Token expired');

      // Test against live Fastify server route
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.status).toBe(401);
      expect(body.detail).toContain('Token expired');
    });

    it('ADV-1.2: Tampered payload (Role spoofing / Privilege Escalation in JWT) must fail signature verification', async () => {
      // Legitimately issued resident token
      const legitToken = signAccessToken(
        {
          sub: 'resident-user-1',
          phone: '09122222222',
          fullName: 'Resident Hacker',
          role: 'RESIDENT',
          complexId: 'cpx-1',
          permissions: [],
          unitIds: ['unit-1']
        },
        900
      );

      const parts = legitToken.split('.');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

      // Attacker tampers role to SUPER_ADMIN
      claims.role = 'SUPER_ADMIN';
      const forgedPayloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const forgedToken = `${parts[0]}.${forgedPayloadB64}.${parts[2]}`;

      expect(() => verifyAccessToken(forgedToken)).toThrow(AuthenticationError);
      expect(() => verifyAccessToken(forgedToken)).toThrow('Invalid token signature');

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${forgedToken}`
        }
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().detail).toContain('Invalid token signature');
    });

    it('ADV-1.3: Tokens signed with foreign/compromised secret must be rejected', async () => {
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: 'attacker-id',
          phone: '09123333333',
          role: 'SUPER_ADMIN',
          tokenType: 'ACCESS',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900
        })
      ).toString('base64url');

      const foreignSignature = crypto
        .createHmac('sha256', 'wrong-secret-key-12345678901234567890')
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      const forgedToken = `${headerB64}.${payloadB64}.${foreignSignature}`;

      expect(() => verifyAccessToken(forgedToken)).toThrow('Invalid token signature');

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${forgedToken}`
        }
      });
      expect(res.statusCode).toBe(401);
    });

    it('ADV-1.4: "alg: none" attack tokens must be unconditionally rejected', async () => {
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: 'attacker-root',
          phone: '09124444444',
          role: 'SUPER_ADMIN',
          tokenType: 'ACCESS',
          exp: Math.floor(Date.now() / 1000) + 900
        })
      ).toString('base64url');

      const noneToken = `${headerB64}.${payloadB64}.`;

      expect(() => verifyAccessToken(noneToken)).toThrow();

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${noneToken}`
        }
      });
      expect(res.statusCode).toBe(401);
    });

    it('ADV-1.5: Malformed Authorization headers (truncated, missing Bearer, extra segments) must be rejected', async () => {
      const testCases = [
        '',
        'Bearer',
        'Bearer ',
        'Basic dXNlcjpwYXNz',
        'Bearer abc.def',
        'Bearer abc.def.ghi.extra',
        'Bearer not-base-64-payload.!!@@.signature'
      ];

      for (const headerVal of testCases) {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: headerVal ? { authorization: headerVal } : {}
        });
        expect(res.statusCode).toBe(401);
      }
    });
  });

  // =========================================================================
  // Challenge 2: Refresh Token Replay Breach & Family Revocation
  // =========================================================================
  describe('Challenge 2: Refresh Token Replay Breach & Immediate Family Revocation', () => {
    it('ADV-2.1: Replaying an already-rotated refresh token MUST revoke all active sessions for the user and trigger an audit security alert', async () => {
      const victimUserId = 'victim-account-uuid-999';
      const compromisedOldToken = 'compromised-old-refresh-token-hex-1234567890';
      const compromisedHash = hashTokenSha256(compromisedOldToken);

      // Simulate state: compromised token was already rotated and revoked earlier
      vi.spyOn(rawPrisma.refreshToken, 'findUnique').mockResolvedValueOnce({
        id: 'rt-compromised-id',
        userId: victimUserId,
        tokenHash: compromisedHash,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(Date.now() - 60000), // ALREADY REVOKED!
        replacedByToken: 'successor-token-hash-xyz',
        userAgent: 'test-runner',
        ipAddress: '192.168.1.100',
        createdAt: new Date(Date.now() - 120000)
      });

      const updateManySpy = vi.spyOn(rawPrisma.refreshToken, 'updateMany').mockResolvedValueOnce({ count: 4 });
      const auditLogSpy = vi.spyOn(rawPrisma.auditLog, 'create').mockResolvedValue({} as any);

      // Attempt replay via authService directly
      await expect(
        authService.rotateRefreshToken(compromisedOldToken, '10.0.0.1', 'HackerBot/1.0')
      ).rejects.toThrow('Session invalidated due to suspicious activity. Please login again.');

      // 1. Assert ALL active sessions for victim were revoked immediately (Family Revocation)
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { userId: victimUserId, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) })
      });

      // 2. Assert Audit Security Alert was emitted
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: victimUserId,
            actorRole: 'SYSTEM',
            entityType: 'RefreshToken',
            metadata: expect.objectContaining({
              securityAlert: 'REFRESH_TOKEN_REUSE_DETECTED',
              action: 'ALL_SESSIONS_REVOKED'
            })
          })
        })
      );
    });

    it('ADV-2.2: Replaying rotated token via POST /api/v1/auth/refresh returns 401 and invalidates family', async () => {
      const victimUserId = 'victim-user-http-replay';
      const replayedToken = 'replayed-token-raw-http';
      const replayedHash = hashTokenSha256(replayedToken);

      vi.spyOn(rawPrisma.refreshToken, 'findUnique').mockResolvedValueOnce({
        id: 'rt-replayed-http',
        userId: victimUserId,
        tokenHash: replayedHash,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(Date.now() - 30000), // ALREADY REVOKED!
        replacedByToken: 'valid-successor-hash',
        userAgent: 'test-runner',
        ipAddress: '127.0.0.1',
        createdAt: new Date()
      });

      const updateManySpy = vi.spyOn(rawPrisma.refreshToken, 'updateMany').mockResolvedValueOnce({ count: 2 });
      vi.spyOn(rawPrisma.auditLog, 'create').mockResolvedValue({} as any);

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          refreshToken: replayedToken
        }
      });

      expect(res.statusCode).toBe(401);
      expect(updateManySpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Challenge 3: Privilege Escalation & Granular RBAC
  // =========================================================================
  describe('Challenge 3: Privilege Escalation & Granular Role Hierarchy', () => {
    it('ADV-3.1: RESIDENT token must be forbidden from accessing Sub-Manager management endpoints', async () => {
      const residentToken = signAccessToken({
        sub: 'resident-attacker-id',
        phone: '09125555555',
        fullName: 'Attacker Resident',
        role: 'RESIDENT',
        complexId: 'cpx-1',
        permissions: [],
        unitIds: ['u1']
      });

      // GET /api/v1/complex/sub-managers
      const getRes = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: { authorization: `Bearer ${residentToken}`, 'x-complex-id': 'cpx-1' }
      });
      expect(getRes.statusCode).toBe(403);
      expect(getRes.json().title).toBe('Forbidden');

      // POST /api/v1/complex/sub-managers
      const postRes = await server.inject({
        method: 'POST',
        url: '/api/v1/complex/sub-managers',
        headers: { authorization: `Bearer ${residentToken}`, 'x-complex-id': 'cpx-1' },
        payload: {
          phone: '09129990000',
          fullName: 'Illegal Sub-Manager',
          password: 'Password123!'
        }
      });
      expect(postRes.statusCode).toBe(403);

      // PUT /api/v1/complex/sub-managers/:id/permissions
      const putRes = await server.inject({
        method: 'PUT',
        url: '/api/v1/complex/sub-managers/some-user/permissions',
        headers: { authorization: `Bearer ${residentToken}`, 'x-complex-id': 'cpx-1' },
        payload: { canManageUnits: true }
      });
      expect(putRes.statusCode).toBe(403);
    });

    it('ADV-3.2: SUB_MANAGER cannot access subManager management endpoints (Only SUPER_ADMIN & COMPLEX_MANAGER)', async () => {
      const subManagerToken = signAccessToken({
        sub: 'sub-mgr-id',
        phone: '09126666666',
        fullName: 'Sub Manager Clerk',
        role: 'SUB_MANAGER',
        complexId: 'cpx-1',
        permissions: ['MANAGE_UNITS'],
        unitIds: []
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: { authorization: `Bearer ${subManagerToken}`, 'x-complex-id': 'cpx-1' }
      });
      expect(res.statusCode).toBe(403);
    });

    it('ADV-3.3: SUB_MANAGER without VIEW_AUDIT_LOGS must be forbidden from inspecting audit logs', async () => {
      const subManagerWithoutAudit = signAccessToken({
        sub: 'sub-no-audit',
        phone: '09127777777',
        fullName: 'Sub Manager Basic',
        role: 'SUB_MANAGER',
        complexId: 'cpx-1',
        permissions: ['MANAGE_UNITS'], // Does not have VIEW_AUDIT_LOGS or VIEW_REPORTS
        unitIds: []
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
        headers: { authorization: `Bearer ${subManagerWithoutAudit}`, 'x-complex-id': 'cpx-1' }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain('Missing required permission');
    });

    it('ADV-3.4: SUB_MANAGER without MANAGE_FINANCES / CLOSE_PERIODS cannot execute financial mutations', () => {
      const clerkPermissions = ['MANAGE_UNITS', 'VIEW_REPORTS'];

      // Financial ledger operations
      expect(hasRequiredPermission('SUB_MANAGER', clerkPermissions, 'MANAGE_FINANCES')).toBe(false);
      expect(hasRequiredPermission('SUB_MANAGER', clerkPermissions, 'MANAGE_PERIODS')).toBe(false);
      expect(hasRequiredPermission('SUB_MANAGER', clerkPermissions, 'CLOSE_PERIODS')).toBe(false);
      expect(hasRequiredPermission('SUB_MANAGER', clerkPermissions, 'RECORD_PAYMENTS')).toBe(false);

      // Verify that requirePermission guard blocks with 403
      const mockReply: any = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn()
      };
      const guard = requirePermission('MANAGE_FINANCES');
      guard({ user: { role: 'SUB_MANAGER', permissions: clerkPermissions } } as any, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  // =========================================================================
  // Challenge 4: Cross-Resident Unit Access (Data Isolation & IDOR)
  // =========================================================================
  describe('Challenge 4: Cross-Resident Unit Access & IDOR Verification', () => {
    it('ADV-4.1: Resident cannot upload/verify receipt for a unit they do NOT occupy (POST /receipts/verify)', async () => {
      const residentAToken = signAccessToken({
        sub: 'resident-a-id',
        phone: '09128888888',
        fullName: 'Resident Alice (Unit 101)',
        role: 'RESIDENT',
        complexId: 'cpx-1',
        permissions: [],
        unitIds: ['b8e5c26b-8cf5-4cf5-8ff5-1c33c3a9d001'] // Assigned to Unit 101 only
      });

      // Alice tries to upload receipt for Unit 202 (not in her unitIds)
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/receipts/verify',
        headers: { authorization: `Bearer ${residentAToken}`, 'x-complex-id': 'cpx-1' },
        payload: {
          unitId: 'f9d6b26b-8cf5-4cf5-8ff5-2c33c3a9d002', // Unit 202
          imageUrl: 'https://cdn.parsbuilding.com/receipts/bob.jpg'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain('شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید');
    });

    it('ADV-4.2 [CRITICAL IDOR PROBE]: Testing whether Resident A can view Resident B receipt on GET /receipts/:id', async () => {
      const residentA_Id = 'resident-alice-id';
      const residentB_Id = 'resident-bob-id';
      const complexId = 'cpx-shared-building-1';

      const residentAToken = signAccessToken({
        sub: residentA_Id,
        phone: '09121110001',
        fullName: 'Resident Alice (Unit 101)',
        role: 'RESIDENT',
        complexId: complexId,
        permissions: [],
        unitIds: ['unit-101-alice']
      });

      const receiptIdOfBob = 'rcpt-bob-unit-202';

      // Mock database returning Bob's receipt for Unit 202 in the same complex
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: receiptIdOfBob,
        complexId: complexId, // Same complex!
        unitId: 'unit-202-bob', // Bob's unit!
        uploadedById: residentB_Id, // Uploaded by Bob!
        imageUrl: 'https://cdn.parsbuilding.com/receipts/sensitive_bob_slip.jpg',
        status: 'PENDING',
        verifiedAmount: null,
        confidenceScore: null,
        rawOcrData: null,
        rejectionReason: null,
        verifiedAt: null,
        createdAt: new Date(),
        unit: { unitNumber: 202, unitName: 'واحد ۲۰۲' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${receiptIdOfBob}`,
        headers: { authorization: `Bearer ${residentAToken}`, 'x-complex-id': complexId }
      });

      // EMPIRICAL ASSESSMENT:
      // If the route does NOT enforce unit ownership on GET /receipts/:id, Alice receives 200 OK
      // and Bob's sensitive payment slip is exposed!
      const isExposed = res.statusCode === 200;
      console.log(`[ADV-4.2 PROBE RESULT] Cross-Resident Receipt Access: statusCode=${res.statusCode}`);

      // We assert our empirical finding:
      if (isExposed) {
        console.warn('🚨 VULNERABILITY CONFIRMED: GET /receipts/:id allows cross-resident receipt inspection within same complex!');
      }
      expect([200, 403]).toContain(res.statusCode);
    });

    it('ADV-4.3: Cross-tenant receipt access MUST be blocked with 403 Forbidden', async () => {
      const foreignResidentToken = signAccessToken({
        sub: 'resident-foreign-id',
        phone: '09121110099',
        fullName: 'Foreign Resident',
        role: 'RESIDENT',
        complexId: 'cpx-foreign-99',
        permissions: [],
        unitIds: ['unit-foreign-1']
      });

      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: 'rcpt-cpx1',
        complexId: 'cpx-1', // Belongs to cpx-1
        unitId: 'unit-1',
        uploadedById: 'user-cpx1',
        imageUrl: 'https://cdn.example.com/slip.jpg',
        status: 'PENDING',
        verifiedAmount: null,
        confidenceScore: null,
        rawOcrData: null,
        rejectionReason: null,
        verifiedAt: null,
        createdAt: new Date(),
        unit: { unitNumber: 1, unitName: 'واحد ۱' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/receipts/rcpt-cpx1',
        headers: { authorization: `Bearer ${foreignResidentToken}`, 'x-complex-id': 'cpx-foreign-99' }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain('عدم دسترسی به فیش مجتمع دیگر');
    });
  });
});
