import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  normalizePhone,
  validatePasswordComplexity,
  hashTokenSha256,
  signAccessToken,
  verifyAccessToken,
  AuthenticationError,
  authService
} from '../src/services/authService';
import { rawPrisma } from '../src/config/database';

describe('AuthService & Cryptographic Token Lifecycle', () => {
  describe('Argon2id Password Security', () => {
    it('should hash passwords using Argon2id with OWASP parameters', async () => {
      const password = 'StrongPassword!123';
      const hash = await hashPassword(password);

      expect(typeof hash).toBe('string');
      // Argon2id header format: $argon2id$v=19$m=65536,t=3,p=4$...
      expect(hash.startsWith('$argon2id$v=19$m=65536,t=3,p=4$')).toBe(true);
    });

    it('should correctly verify valid passwords against the hash', async () => {
      const password = 'MySecurePass#2026';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it('should reject invalid passwords without timing side-channels', async () => {
      const password = 'CorrectPassword@1';
      const hash = await hashPassword(password);

      const isInvalid = await verifyPassword(hash, 'WrongPassword@1');
      expect(isInvalid).toBe(false);
    });

    it('should handle corrupted or malformed hashes safely returning false', async () => {
      const isValid = await verifyPassword('not-a-valid-argon-hash', 'test');
      expect(isValid).toBe(false);
    });
  });

  describe('Phone Normalization & Password Complexity', () => {
    it('should normalize standard Persian numbers with +98 prefix to 09xxxxxxxxx', () => {
      expect(normalizePhone('+989123456789')).toBe('09123456789');
      expect(normalizePhone('00989123456789')).toBe('09123456789');
      expect(normalizePhone('09123456789')).toBe('09123456789');
      expect(normalizePhone('989123456789')).toBe('09123456789');
    });

    it('should convert Persian and Arabic numerals to English ASCII digits', () => {
      // Persian: ۰۹۱۲۳۴۵۶۷۸۹
      expect(normalizePhone('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
      // Arabic: ٠٩١٢٣٤٥٦٧٨٩
      expect(normalizePhone('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
      // Mixed formatting with spaces and hyphens
      expect(normalizePhone('  +۹۸ ۹۱۲-۳۴۵-۶۷۸۹ ')).toBe('09123456789');
    });

    it('should enforce password complexity requirements', () => {
      // Too short
      expect(validatePasswordComplexity('Short1!').valid).toBe(false);
      // No uppercase
      expect(validatePasswordComplexity('lowercase123!').valid).toBe(false);
      // No lowercase
      expect(validatePasswordComplexity('UPPERCASE123!').valid).toBe(false);
      // No digit
      expect(validatePasswordComplexity('NoDigitsHere!').valid).toBe(false);
      // No symbol
      expect(validatePasswordComplexity('NoSymbolHere123').valid).toBe(false);
      // Valid complex password
      expect(validatePasswordComplexity('ValidP@ssword123').valid).toBe(true);
    });
  });

  describe('JWT Access Token Lifecycle', () => {
    it('should sign and verify valid JWT access tokens', () => {
      const payload = {
        sub: 'user-uuid-1234',
        phone: '09121112233',
        fullName: 'Ali Rezaei',
        role: 'COMPLEX_MANAGER' as const,
        complexId: 'cpx-tehran-1',
        permissions: ['MANAGE_UNITS', 'CLOSE_PERIODS'],
        unitIds: ['u1', 'u2']
      };

      const token = signAccessToken(payload, 900);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const claims = verifyAccessToken(token);
      expect(claims.sub).toBe(payload.sub);
      expect(claims.phone).toBe(payload.phone);
      expect(claims.role).toBe(payload.role);
      expect(claims.complexId).toBe(payload.complexId);
      expect(claims.permissions).toEqual(payload.permissions);
      expect(claims.unitIds).toEqual(payload.unitIds);
      expect(claims.tokenType).toBe('ACCESS');
    });

    it('should reject tampered or modified JWT tokens', () => {
      const token = signAccessToken({
        sub: 'user-uuid-1',
        phone: '09121112233',
        fullName: 'User',
        role: 'RESIDENT' as const,
        complexId: 'cpx-1',
        permissions: [],
        unitIds: []
      });

      const parts = token.split('.');
      // Tamper with payload (elevating role)
      const tamperedPayload = Buffer.from(JSON.stringify({ role: 'SUPER_ADMIN' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => verifyAccessToken(tamperedToken)).toThrow(AuthenticationError);
    });

    it('should reject expired JWT tokens', () => {
      const expiredToken = signAccessToken({
        sub: 'user-1',
        phone: '09120000000',
        fullName: 'User',
        role: 'RESIDENT' as const,
        complexId: 'cpx-1',
        permissions: [],
        unitIds: []
      }, -10); // Expired 10 seconds ago

      expect(() => verifyAccessToken(expiredToken)).toThrow('Token expired');
    });
  });

  describe('Refresh Token Family Rotation & Automatic Reuse Detection', () => {
    it('should hash refresh tokens using SHA-256 for secure database storage', () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hash1 = hashTokenSha256(rawToken);
      const hash2 = hashTokenSha256(rawToken);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });

    it('should detect token reuse and trigger family revocation', async () => {
      const userId = 'victim-user-id';
      const compromisedToken = 'compromised-token-hex';
      const tokenHash = hashTokenSha256(compromisedToken);

      // Mock DB: find token that is already revoked
      vi.spyOn(rawPrisma.refreshToken, 'findUnique').mockResolvedValueOnce({
        id: 'rt-1',
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(Date.now() - 5000), // ALREADY REVOKED!
        replacedByToken: 'successor-hash',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        createdAt: new Date()
      });

      const updateManySpy = vi.spyOn(rawPrisma.refreshToken, 'updateMany').mockResolvedValueOnce({ count: 3 });
      vi.spyOn(rawPrisma.auditLog, 'create').mockResolvedValue({} as any);

      await expect(authService.rotateRefreshToken(compromisedToken)).rejects.toThrow(
        'Session invalidated due to suspicious activity. Please login again.'
      );

      // Verify that all active tokens for victim user were revoked
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) })
      });
    });

    it('should successfully rotate an active, unrevoked refresh token', async () => {
      const userId = 'valid-user-id';
      const activeRawToken = 'valid-active-refresh-token';
      const tokenHash = hashTokenSha256(activeRawToken);

      vi.spyOn(rawPrisma.refreshToken, 'findUnique').mockResolvedValueOnce({
        id: 'rt-valid',
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null, // Active
        replacedByToken: null,
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        createdAt: new Date()
      });

      vi.spyOn(rawPrisma.user, 'findUnique').mockResolvedValueOnce({
        id: userId,
        phone: '09129998877',
        fullName: 'Valid User',
        role: 'COMPLEX_MANAGER',
        complexId: 'cpx-1',
        passwordHash: 'hash',
        isActive: true,
        email: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        subManagerPerm: null,
        residents: []
      } as any);

      vi.spyOn(rawPrisma, '$transaction').mockResolvedValueOnce([{}, {}] as any);

      const result = await authService.rotateRefreshToken(activeRawToken);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('newRefreshToken');
      expect(result.expiresIn).toBe(900);
      expect(result.newRefreshToken).not.toBe(activeRawToken);
    });
  });
});
