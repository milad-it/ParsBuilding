import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/authService';
import { authenticate } from '../middleware/rbac';
import { loginRateLimitConfig } from '../config/security';
import { env } from '../config/env';

const registerSchema = z.object({
  phone: z.string().min(10).max(20),
  fullName: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['SUPER_ADMIN', 'COMPLEX_MANAGER', 'SUB_MANAGER', 'RESIDENT']).optional(),
  complexId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional()
});

const loginSchema = z.object({
  phone: z.string().min(10).max(20),
  password: z.string().min(1).max(128)
});

export async function authRoutes(fastify: FastifyInstance) {
  // Public: Register new account
  fastify.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const user = await authService.register(body);
    return reply.code(201).send({
      message: 'کاربر با موفقیت ثبت نام شد',
      user
    });
  });

  // Public: Login with strict rate limiting & HttpOnly refresh token cookie
  fastify.post('/auth/login', loginRateLimitConfig, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await authService.login({
      phone: body.phone,
      password: body.password,
      ipAddress,
      userAgent
    });

    // Set signed HttpOnly refresh cookie
    reply.setCookie('refreshToken', result.refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      signed: true,
      maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
    });

    return reply.code(200).send({
      message: 'ورود با موفقیت انجام شد',
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken, // Included for non-browser/test runners
      expiresIn: result.expiresIn
    });
  });

  // Public/Cookie: Rotating refresh token
  fastify.post('/auth/refresh', async (request, reply) => {
    // Read from signed cookie or Authorization / request body
    const signedCookie = request.cookies.refreshToken;
    let rawToken: string | undefined;

    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid) {
        rawToken = unsigned.value;
      }
    }

    if (!rawToken && (request.body as any)?.refreshToken) {
      rawToken = (request.body as any).refreshToken;
    }

    if (!rawToken) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Refresh token is required' });
    }

    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await authService.rotateRefreshToken(rawToken, ipAddress, userAgent);

    // Set new rotated signed cookie
    reply.setCookie('refreshToken', result.newRefreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      signed: true,
      maxAge: 7 * 24 * 60 * 60
    });

    return reply.code(200).send({
      accessToken: result.accessToken,
      refreshToken: result.newRefreshToken,
      expiresIn: result.expiresIn
    });
  });

  // Logout current session
  fastify.post('/auth/logout', async (request, reply) => {
    let rawToken: string | undefined;
    const signedCookie = request.cookies.refreshToken;
    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid) rawToken = unsigned.value;
    }
    if (!rawToken && (request.body as any)?.refreshToken) {
      rawToken = (request.body as any).refreshToken;
    }

    if (rawToken) {
      await authService.logout(rawToken);
    }

    reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return reply.code(200).send({ message: 'خروج موفقیت‌آمیز بود' });
  });

  // Authenticated: Current profile
  fastify.get('/auth/me', { preHandler: [authenticate] }, async (request) => {
    return { user: request.user };
  });

  // Authenticated: Active user device sessions
  fastify.get('/auth/sessions', { preHandler: [authenticate] }, async (request) => {
    const sessions = await authService.getActiveSessions(request.user!.id);
    return { sessions };
  });

  // Authenticated: Revoke all device sessions (Force global logout)
  fastify.post('/auth/revoke-all', { preHandler: [authenticate] }, async (request, reply) => {
    await authService.revokeAllSessions(request.user!.id);
    reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return reply.code(200).send({ message: 'تمام نشست‌های فعال با موفقیت منقضی شدند' });
  });
}
