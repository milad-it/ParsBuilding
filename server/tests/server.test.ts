import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';

describe('Fastify Server Bootstrap & Health Endpoint', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health should return 200 and status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/v1/ping should return 200 and operational message', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/ping'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('ParsBuilding API v1 operational');
  });

  it('Protected route without x-complex-id should be rejected with 400 RFC 7807 Problem Details', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/units'
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = JSON.parse(response.body);
    expect(body.type).toBe('https://api.parsbuilding.com/errors/tenant-context-missing');
    expect(body.status).toBe(400);
    expect(body.title).toBe('Tenant Context Missing');
  });

  it('Protected route with x-complex-id header should pass tenant middleware', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/units',
      headers: {
        'x-complex-id': 'complex-test-101'
      }
    });

    // Passes tenant middleware (would be 400 if tenant missing) and reaches route authentication (401)
    expect(response.statusCode).toBe(401);
  });
});
