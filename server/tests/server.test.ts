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
});
