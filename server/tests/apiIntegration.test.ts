import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { hashPassword } from '../src/services/authService';
import { UserRole } from '@prisma/client';

describe('Fastify REST API & Security Hardening Integration', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health should return 200 and timestamp', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('Security Headers: should include Helmet security headers on responses', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-xss-protection']).toBe('0'); // Modern Helmet disables legacy buggy filter
  });

  it('Rate Limiting: should attach standard rate limit headers', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ping'
    });

    const hasRateLimitHeader =
      res.headers['x-ratelimit-limit'] !== undefined ||
      res.headers['ratelimit-limit'] !== undefined;
    expect(hasRateLimitHeader).toBe(true);
  });

  it('POST /api/v1/auth/login should reject invalid credentials with generic 401', async () => {
    vi.spyOn(rawPrisma.user, 'findUnique').mockResolvedValueOnce(null);
    vi.spyOn(rawPrisma.auditLog, 'create').mockResolvedValue({} as any);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '09120000000',
        password: 'WrongPassword!123'
      }
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toContain('نامعتبر');
  });

  it('POST /api/v1/auth/login should return 200, JWT accessToken, and Set-Cookie for valid credentials', async () => {
    const passwordHash = await hashPassword('ValidP@ssword123');
    const mockUser = {
      id: 'test-user-id',
      phone: '09121234567',
      fullName: 'مدیر تستی',
      role: UserRole.COMPLEX_MANAGER,
      complexId: 'cpx-test-1',
      passwordHash,
      isActive: true,
      email: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      subManagerPerm: null,
      residents: []
    };

    vi.spyOn(rawPrisma.user, 'findUnique').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(rawPrisma.user, 'update').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(rawPrisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(rawPrisma.auditLog, 'create').mockResolvedValueOnce({} as any);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '09121234567',
        password: 'ValidP@ssword123'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.phone).toBe('09121234567');
    expect(body.user.role).toBe('COMPLEX_MANAGER');
    // Check HttpOnly refresh token cookie
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('GET /api/v1/auth/me should reject unauthenticated requests with 401 Problem Details', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me'
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json();
    expect(body.title).toBe('Unauthorized');
  });
});
