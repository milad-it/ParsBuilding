import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { TenantIsolationError } from './tenant';
import { AuditLogImmutableError } from '../config/database';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  // 1. Tenant Isolation Error (HTTP 403 RFC 7807 Problem Details)
  if (
    error instanceof TenantIsolationError ||
    error.name === 'TenantIsolationError' ||
    error.message?.includes('TenantIsolationError')
  ) {
    return reply
      .code(403)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
        title: 'Tenant Isolation Violation',
        status: 403,
        detail: error.message,
        instance: request.raw.url || request.url
      });
  }

  // 2. Audit Log Immutable Error (HTTP 403 RFC 7807 Problem Details)
  if (
    error instanceof AuditLogImmutableError ||
    error.name === 'AuditLogImmutableError' ||
    error.message?.includes('AuditLogImmutableError')
  ) {
    return reply
      .code(403)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://api.parsbuilding.com/errors/audit-log-immutable-violation',
        title: 'Audit Log Immutable Violation',
        status: 403,
        detail: error.message,
        instance: request.raw.url || request.url
      });
  }

  // 3. Rate Limit Exceeded Error (HTTP 429 RFC 7807 Problem Details)
  const candidateStatus = (error as any).status || error.statusCode;
  const isRateLimit =
    candidateStatus === 429 ||
    error.statusCode === 429 ||
    (error as any).status === 429 ||
    error.code === 'FST_ERR_RATE_LIMIT_EXCEEDED' ||
    (error as any).type?.includes('rate-limit') ||
    error.name === 'RateLimitError';

  if (isRateLimit) {
    const rawRetryAfter =
      (error as any).retryAfter ??
      reply.getHeader('retry-after') ??
      reply.getHeader('Retry-After') ??
      900;
    const retryAfter =
      typeof rawRetryAfter === 'number'
        ? rawRetryAfter
        : parseInt(String(rawRetryAfter), 10) || 900;

    return reply
      .code(429)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: (error as any).type || 'https://api.parsbuilding.com/errors/rate-limit-exceeded',
        title: (error as any).title || 'Too Many Requests',
        status: 429,
        detail:
          (error as any).detail ||
          error.message ||
          `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        retryAfter,
        instance: (error as any).instance || request.raw.url || request.url
      });
  }

  // 4. Pre-formatted RFC 7807 Problem Details Error Objects
  if ((error as any).type && (error as any).title) {
    const problemStatus =
      typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 600
        ? candidateStatus
        : 500;
    return reply
      .code(problemStatus)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: (error as any).type,
        title: (error as any).title,
        status: problemStatus,
        detail: (error as any).detail || error.message,
        instance: (error as any).instance || request.raw.url || request.url,
        ...((error as any).retryAfter !== undefined ? { retryAfter: (error as any).retryAfter } : {})
      });
  }

  // 5. Zod Validation Error (HTTP 400)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
  }

  // 6. Fastify Schema Validation Error (HTTP 400)
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message
    });
  }

  // 7. Known Business / Permission Error (Check (error as any).status || error.statusCode || 500)
  const statusCode =
    typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 600
      ? candidateStatus
      : 500;

  return reply.status(statusCode).send({
    statusCode,
    error: statusCode === 500 ? 'Internal Server Error' : (error.name || 'Error'),
    message:
      statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : (error.message || 'An unexpected error occurred')
  });
}
