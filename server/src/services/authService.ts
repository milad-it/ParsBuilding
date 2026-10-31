import crypto from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { UserRole, AuditAction } from '@prisma/client';
import { rawPrisma } from '../config/database';
import { env } from '../config/env';
import { toEnDigit } from '../utils/numberUtils';
import { JWTAccessTokenClaims, AuthenticatedUser } from '../types/auth';
import { resolvePermissionsFromDb } from '../middleware/rbac';
import { auditLogger } from './auditLogger';

// OWASP Argon2id recommended configuration
const ARGON2_CONFIG = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
  algorithm: Algorithm.Argon2id
};

export class AuthenticationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 401, code = 'AUTHENTICATION_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Normalizes Iranian phone numbers:
 * - Converts Persian/Arabic digits to ASCII
 * - Removes non-digits, whitespace, dashes
 * - Converts +98 or 0098 prefix to standard 09xxxxxxxxx
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = toEnDigit(raw).replace(/\D/g, '');
  if (cleaned.startsWith('0098')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('98')) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Validates password complexity:
 * Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, 1 special symbol.
 */
export function validatePasswordComplexity(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'رمز عبور نمی‌تواند بیشتر از ۱۲۸ کاراکتر باشد.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'رمز عبور باید حداقل شامل یک حرف بزرگ انگلیسی (A-Z) باشد.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'رمز عبور باید حداقل شامل یک حرف کوچک انگلیسی (a-z) باشد.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'رمز عبور باید حداقل شامل یک عدد (0-9) باشد.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    return { valid: false, reason: 'رمز عبور باید حداقل شامل یک نماد خاص (!@#$%^&*) باشد.' };
  }
  return { valid: true };
}

/**
 * Hashes a plaintext password using Argon2id with OWASP parameters.
 */
export async function hashPassword(plainText: string): Promise<string> {
  return hash(plainText, ARGON2_CONFIG);
}

/**
 * Verifies a plaintext password against an Argon2id hash with timing safety.
 */
export async function verifyPassword(passwordHash: string, plainText: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plainText);
  } catch {
    return false;
  }
}

/**
 * Computes SHA-256 hash of a raw string (e.g., refresh token).
 */
export function hashTokenSha256(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Sign standard JWT access token with HMAC-SHA256
 */
export function signAccessToken(payload: Omit<JWTAccessTokenClaims, 'tokenType' | 'iat' | 'exp'>, expiresInSeconds = 900): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTAccessTokenClaims = {
    ...payload,
    tokenType: 'ACCESS',
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify standard JWT access token
 */
export function verifyAccessToken(token: string): JWTAccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthenticationError('Invalid token format');
  }

  const headerB64 = parts[0];
  const payloadB64 = parts[1];
  const sigB64 = parts[2];
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new AuthenticationError('Invalid token format');
  }

  const expectedSig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AuthenticationError('Invalid token signature');
  }

  let claims: JWTAccessTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AuthenticationError('Malformed token payload');
  }

  if (claims.tokenType !== 'ACCESS') {
    throw new AuthenticationError('Invalid token type');
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) {
    throw new AuthenticationError('Token expired');
  }

  return claims;
}

export class AuthService {
  /**
   * User registration with validation and Argon2id hashing
   */
  public async register(params: {
    phone: string;
    fullName: string;
    password: string;
    role?: UserRole;
    complexId?: string | null;
    email?: string;
  }) {
    const normalizedPhone = normalizePhone(params.phone);
    if (!normalizedPhone || !/^09\d{9}$/.test(normalizedPhone)) {
      throw new AuthenticationError('شماره موبایل نامعتبر است (الگوی صحیح: ۰۹xxxxxxxxx)', 400);
    }

    const complexity = validatePasswordComplexity(params.password);
    if (!complexity.valid) {
      throw new AuthenticationError(complexity.reason || 'رمز عبور شرایط پیچیدگی را دارا نیست', 400);
    }

    // Check existing phone
    const existing = await rawPrisma.user.findUnique({
      where: { phone: normalizedPhone }
    });
    if (existing) {
      throw new AuthenticationError('این شماره تلفن قبلاً در سامانه ثبت شده است', 409);
    }

    const passwordHash = await hashPassword(params.password);
    const role = params.role || UserRole.RESIDENT;

    const user = await rawPrisma.user.create({
      data: {
        phone: normalizedPhone,
        fullName: params.fullName.trim(),
        passwordHash,
        role,
        complexId: params.complexId || null,
        email: params.email?.trim() || null,
        isActive: true
      }
    });

    await auditLogger.log({
      complexId: user.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'User',
      entityId: user.id,
      after: { id: user.id, phone: user.phone, role: user.role, fullName: user.fullName }
    });

    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      complexId: user.complexId
    };
  }

  /**
   * User login with timing-safe password check and token generation
   */
  public async login(params: {
    phone: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const normalizedPhone = normalizePhone(params.phone);
    if (!normalizedPhone) {
      throw new AuthenticationError('نام کاربری یا رمز عبور نامعتبر است', 401);
    }

    const user = await rawPrisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        subManagerPerm: true,
        residents: {
          include: {
            unitAssignments: {
              where: { isCurrent: true },
              select: { unitId: true }
            }
          }
        }
      }
    });

    if (!user || !user.isActive) {
      await auditLogger.log({
        actorRole: 'ANONYMOUS',
        action: AuditAction.LOGIN,
        entityType: 'User',
        entityId: normalizedPhone,
        metadata: { success: false, reason: 'USER_NOT_FOUND_OR_INACTIVE' },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
      throw new AuthenticationError('نام کاربری یا رمز عبور نامعتبر است', 401);
    }

    const isValidPassword = await verifyPassword(user.passwordHash, params.password);
    if (!isValidPassword) {
      await auditLogger.log({
        complexId: user.complexId,
        actorId: user.id,
        actorRole: user.role,
        action: AuditAction.LOGIN,
        entityType: 'User',
        entityId: user.id,
        metadata: { success: false, reason: 'INVALID_CREDENTIALS' },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
      throw new AuthenticationError('نام کاربری یا رمز عبور نامعتبر است', 401);
    }

    // Resolve permissions and unit IDs
    const permissions = resolvePermissionsFromDb(user.subManagerPerm);
    const unitIds = user.residents.flatMap(r => r.unitAssignments.map(u => u.unitId));

    // Update lastLoginAt
    await rawPrisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate Tokens
    const accessToken = signAccessToken({
      sub: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      complexId: user.complexId,
      permissions,
      unitIds
    });

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = hashTokenSha256(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await rawPrisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null
      }
    });

    await auditLogger.log({
      complexId: user.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: user.id,
      metadata: { success: true },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      complexId: user.complexId,
      permissions,
      unitIds
    };

    return {
      user: authenticatedUser,
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900 // 15 minutes
    };
  }

  /**
   * Rotating refresh token with automatic token-reuse detection (Family Revocation)
   */
  public async rotateRefreshToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new AuthenticationError('Refresh token is required', 401);
    }

    const tokenHash = hashTokenSha256(rawRefreshToken);
    const record = await rawPrisma.refreshToken.findUnique({
      where: { tokenHash }
    });

    if (!record) {
      throw new AuthenticationError('Invalid refresh token session', 401);
    }

    // 🚨 Reuse Detection: If token is already revoked, an attacker is using an old token!
    if (record.revokedAt !== null) {
      console.warn(`[SECURITY ALERT] Token reuse detected for user ${record.userId}! Revoking all sessions.`);
      await rawPrisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });

      await auditLogger.log({
        actorId: record.userId,
        actorRole: 'SYSTEM',
        action: AuditAction.LOGIN,
        entityType: 'RefreshToken',
        entityId: record.id,
        metadata: {
          securityAlert: 'REFRESH_TOKEN_REUSE_DETECTED',
          tokenHash,
          action: 'ALL_SESSIONS_REVOKED'
        },
        ipAddress,
        userAgent
      });

      throw new AuthenticationError('Session invalidated due to suspicious activity. Please login again.', 401);
    }

    // Expiration Check
    if (record.expiresAt < new Date()) {
      await rawPrisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() }
      });
      throw new AuthenticationError('Refresh token expired', 401);
    }

    // Fetch user details
    const user = await rawPrisma.user.findUnique({
      where: { id: record.userId },
      include: {
        subManagerPerm: true,
        residents: {
          include: {
            unitAssignments: {
              where: { isCurrent: true },
              select: { unitId: true }
            }
          }
        }
      }
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User account is inactive or disabled', 401);
    }

    // Legitimate Token Rotation:
    const newRawRefreshToken = crypto.randomBytes(64).toString('hex');
    const newHash = hashTokenSha256(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await rawPrisma.$transaction([
      // 1. Revoke old token and link successor
      rawPrisma.refreshToken.update({
        where: { id: record.id },
        data: {
          revokedAt: new Date(),
          replacedByToken: newHash
        }
      }),
      // 2. Insert new refresh token
      rawPrisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null
        }
      })
    ]);

    const permissions = resolvePermissionsFromDb(user.subManagerPerm);
    const unitIds = user.residents.flatMap(r => r.unitAssignments.map(u => u.unitId));

    const newAccessToken = signAccessToken({
      sub: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      complexId: user.complexId,
      permissions,
      unitIds
    });

    return {
      accessToken: newAccessToken,
      newRefreshToken: newRawRefreshToken,
      expiresIn: 900
    };
  }

  /**
   * Revoke a single refresh token (Logout)
   */
  public async logout(rawRefreshToken: string) {
    if (!rawRefreshToken) return;
    const tokenHash = hashTokenSha256(rawRefreshToken);
    await rawPrisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  /**
   * Revoke all active sessions for a user
   */
  public async revokeAllSessions(userId: string) {
    await rawPrisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  /**
   * Get all active sessions for a user
   */
  public async getActiveSessions(userId: string) {
    return rawPrisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const authService = new AuthService();
