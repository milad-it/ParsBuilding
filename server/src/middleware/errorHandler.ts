import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { TenantIsolationError } from './tenant';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  // Tenant Isolation Error (HTTP 403 RFC 7807 Problem Details)
  if (error instanceof TenantIsolationError || error.name === 'TenantIsolationError' || error.message?.includes('TenantIsolationError')) {
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

  // Zod Validation Error (HTTP 400)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
  }

  // Fastify Schema Validation Error
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message
    });
  }

  // Known Business / Permission Error
  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;

  return reply.status(statusCode).send({
    statusCode,
    error: statusCode === 500 ? 'Internal Server Error' : error.name,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  });
}
