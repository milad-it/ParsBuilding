import { FastifyInstance, FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './env';

export async function configureHelmet(server: FastifyInstance) {
  await server.register(helmet, {
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    hidePoweredBy: true,
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: false // Disabled for REST API / 3D Canvas / WebSockets
  });
}

export async function configureCors(server: FastifyInstance) {
  const configuredOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());

  await server.register(cors, {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Complex-Id',
      'X-Tenant-Id',
      'X-User-Id',
      'X-User-Role',
      'Accept',
      'Origin'
    ],
    exposedHeaders: [
      'Content-Range',
      'X-Total-Count',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After'
    ],
    maxAge: 86400,
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, server-to-server, test runner)
      if (!origin) {
        return callback(null, true);
      }

      // Development / Testing: allow localhost and 127.0.0.1 on any port
      if (env.NODE_ENV !== 'production') {
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocal) {
          return callback(null, true);
        }
      }

      // Whitelist check
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Multi-tenant subdomain pattern check
      const isSubdomain = configuredOrigins.some(pattern => {
        if (pattern.startsWith('*.')) {
          const rootDomain = pattern.slice(2);
          return origin.endsWith(`.${rootDomain}`) || origin === `https://${rootDomain}`;
        }
        return false;
      });

      if (isSubdomain) {
        return callback(null, true);
      }

      callback(new Error(`CORS Violation: Origin '${origin}' is not allowed by policy.`), false);
    }
  });
}

export async function configureRateLimiting(server: FastifyInstance) {
  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    enableDraftSpec: true,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    },
    errorResponseBuilder: (request: FastifyRequest, context: any) => {
      const ttlSeconds = Math.ceil((context.ttl || 1000) / 1000);
      return {
        statusCode: 429,
        type: 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Retry after ${ttlSeconds} seconds.`,
        retryAfter: ttlSeconds,
        instance: request.raw.url || request.url
      };
    }
  });
}

/**
 * Route-specific strict rate limiting configuration for /api/v1/auth/login:
 * Max 5 attempts per 15 minutes per unique IP + Phone composite key
 */
export const loginRateLimitConfig = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '15 minutes',
      keyGenerator: (request: FastifyRequest) => {
        const body = (request.body as { phone?: string }) || {};
        const clientIp = request.ip;
        const normalizedPhone = body.phone ? body.phone.trim() : 'anonymous';
        return `login:${clientIp}:${normalizedPhone}`;
      }
    }
  }
};
