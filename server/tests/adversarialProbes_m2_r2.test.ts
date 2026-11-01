import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { rawPrisma } from '../src/config/database';
import { signAccessToken } from '../src/services/authService';

describe('M2-R2 Empirical Adversarial Probes: IDOR & Fastify Hook Precedence', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // PROBE SUITE 1: IDOR & INTRA-TENANT RESIDENT ISOLATION
  // =========================================================================
  describe('Probe Suite 1: Intra-Tenant Resident IDOR on GET /api/v1/receipts/:id', () => {
    const complexId = 'cpx-pars-building-10';
    const aliceId = 'usr-resident-alice';
    const bobId = 'usr-resident-bob';
    const charlieId = 'usr-resident-charlie';
    const managerId = 'usr-complex-manager';
    const superAdminId = 'usr-super-admin';

    const unit101 = 'unit-101-uuid';
    const unit202 = 'unit-202-uuid';

    const aliceToken = signAccessToken({
      sub: aliceId,
      phone: '09121000001',
      fullName: 'Alice Resident',
      role: 'RESIDENT',
      complexId,
      permissions: [],
      unitIds: [unit101]
    });

    const bobToken = signAccessToken({
      sub: bobId,
      phone: '09121000002',
      fullName: 'Bob Resident',
      role: 'RESIDENT',
      complexId,
      permissions: [],
      unitIds: [unit202]
    });

    const foreignResidentToken = signAccessToken({
      sub: charlieId,
      phone: '09121000003',
      fullName: 'Charlie Foreign Resident',
      role: 'RESIDENT',
      complexId: 'cpx-different-complex-99',
      permissions: [],
      unitIds: ['unit-foreign-999']
    });

    const managerToken = signAccessToken({
      sub: managerId,
      phone: '09121000004',
      fullName: 'Manager Mansoor',
      role: 'COMPLEX_MANAGER',
      complexId,
      permissions: [],
      unitIds: []
    });

    const foreignManagerToken = signAccessToken({
      sub: 'usr-foreign-manager',
      phone: '09121000005',
      fullName: 'Foreign Manager Farhad',
      role: 'COMPLEX_MANAGER',
      complexId: 'cpx-different-complex-99',
      permissions: [],
      unitIds: []
    });

    const superAdminToken = signAccessToken({
      sub: superAdminId,
      phone: '09121000006',
      fullName: 'Root Admin',
      role: 'SUPER_ADMIN',
      complexId: '',
      permissions: [],
      unitIds: []
    });

    const bobReceipt = {
      id: 'receipt-bob-202',
      complexId,
      unitId: unit202,
      uploadedById: bobId,
      imageUrl: 'https://cdn.parsbuilding.com/receipts/bob_may_charge.jpg',
      status: 'VERIFIED',
      verifiedAmount: 2500000,
      confidenceScore: 0.98,
      rawOcrData: { bank: 'Mellat', traceNo: '123456' },
      rejectionReason: null,
      verifiedAt: new Date(),
      createdAt: new Date(),
      unit: { unitNumber: 202, unitName: 'واحد ۲۰۲' }
    };

    it('PROBE 1.1: Resident Alice querying Resident Bob receipt in same complex MUST be rejected with HTTP 403 Forbidden RFC 7807', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
          'x-complex-id': complexId
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(403);
      expect(body.type).toBe('https://api.parsbuilding.com/errors/forbidden-unit-access');
      expect(body.title).toBe('Forbidden Unit Access');
      expect(body.detail).toBe('شما فقط مجاز به مشاهده فیش‌های واریزی واحدهای اختصاصی خود هستید');
    });

    it('PROBE 1.2: Resident Bob querying his own receipt in same complex MUST succeed with HTTP 200 OK', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${bobToken}`,
          'x-complex-id': complexId
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt).toBeDefined();
      expect(body.receipt.id).toBe(bobReceipt.id);
      expect(body.receipt.unitId).toBe(unit202);
    });

    it('PROBE 1.3: Resident Alice querying a receipt for her assigned unit (Unit 101) uploaded by co-tenant MUST succeed with HTTP 200 OK', async () => {
      const unit101CoTenantReceipt = {
        ...bobReceipt,
        id: 'receipt-unit-101-cotenant',
        unitId: unit101, // Alice's unit
        uploadedById: 'usr-alice-husband', // uploaded by someone else
        unit: { unitNumber: 101, unitName: 'واحد ۱۰۱' }
      };

      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(unit101CoTenantReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${unit101CoTenantReceipt.id}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
          'x-complex-id': complexId
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt.id).toBe(unit101CoTenantReceipt.id);
    });

    it('PROBE 1.4: Cross-complex resident (Charlie) querying Bob receipt MUST be rejected with HTTP 403 Tenant Isolation Violation', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${foreignResidentToken}`,
          'x-complex-id': 'cpx-different-complex-99'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(403);
      expect(body.type).toBe('https://api.parsbuilding.com/errors/tenant-isolation-violation');
      expect(body.detail).toBe('عدم دسترسی به فیش مجتمع دیگر');
    });

    it('PROBE 1.5: Complex Manager of same complex querying Bob receipt MUST succeed with HTTP 200 OK', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${managerToken}`,
          'x-complex-id': complexId
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt.id).toBe(bobReceipt.id);
    });

    it('PROBE 1.6: Complex Manager of foreign complex querying Bob receipt MUST be rejected with HTTP 403 Tenant Isolation Violation', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${foreignManagerToken}`,
          'x-complex-id': 'cpx-different-complex-99'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/tenant-isolation-violation');
    });

    it('PROBE 1.7: SuperAdmin querying Bob receipt MUST succeed with HTTP 200 OK', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(bobReceipt as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceipt.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt.id).toBe(bobReceipt.id);
    });
  });

  // =========================================================================
  // PROBE SUITE 2: FASTIFY HOOK PRECEDENCE & BEARER TENANT EXTRACTION
  // =========================================================================
  describe('Probe Suite 2: Bearer Token Tenant Extraction Without x-complex-id Header', () => {
    const complexId = 'cpx-precedence-test-20';
    const residentId = 'usr-resident-prec';
    const managerId = 'usr-manager-prec';

    const residentToken = signAccessToken({
      sub: residentId,
      phone: '09122000001',
      fullName: 'Precedence Resident',
      role: 'RESIDENT',
      complexId,
      permissions: [],
      unitIds: ['unit-resident-prec']
    });

    const managerToken = signAccessToken({
      sub: managerId,
      phone: '09122000002',
      fullName: 'Precedence Manager',
      role: 'COMPLEX_MANAGER',
      complexId,
      permissions: [],
      unitIds: []
    });

    it('PROBE 2.1: Request with valid Bearer token WITHOUT x-complex-id header succeeds without HTTP 400', async () => {
      const receipt = {
        id: 'rcpt-prec-1',
        complexId,
        unitId: 'unit-resident-prec',
        uploadedById: residentId,
        imageUrl: 'https://cdn.example.com/slip.jpg',
        status: 'PENDING',
        verifiedAmount: null,
        confidenceScore: null,
        rawOcrData: null,
        rejectionReason: null,
        verifiedAt: null,
        createdAt: new Date(),
        unit: { unitNumber: 1, unitName: 'واحد ۱' }
      };

      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(receipt as any);

      // CRITICAL TEST: Note ABSENCE of 'x-complex-id' or 'x-tenant-id' headers!
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${receipt.id}`,
        headers: {
          authorization: `Bearer ${residentToken}`
        }
      });

      // Must NOT be 400 Tenant Context Missing!
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt).toBeDefined();
      expect(body.receipt.id).toBe(receipt.id);
    });

    it('PROBE 2.2: Manager request on /complex/sub-managers with Bearer token WITHOUT x-complex-id succeeds without HTTP 400', async () => {
      vi.spyOn(rawPrisma.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'sub-mgr-1',
          fullName: 'Sub Manager One',
          phone: '09123000001',
          role: 'SUB_MANAGER',
          complexId,
          createdAt: new Date(),
          subManagerPermission: {
            canManageUnits: true,
            canManageResidents: true,
            canManagePeriods: false,
            canRecordPayments: false,
            canClosePeriods: false,
            canViewReports: true,
            canSendNotifications: false,
            canManageSettings: false
          }
        }
      ] as any);

      // Note ABSENCE of x-complex-id header
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: {
          authorization: `Bearer ${managerToken}`
        }
      });

      // Must succeed with 200, resolving complexId strictly from Bearer token
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.subManagers)).toBe(true);
      expect(body.subManagers.length).toBe(1);
    });

    it('PROBE 2.3: Tenant Spoofing Attack: Valid token for complex A but header x-complex-id points to complex B MUST return 403 Forbidden', async () => {
      // Attacker has token for complexId ('cpx-precedence-test-20')
      // but injects header x-complex-id = 'cpx-victim-target-88'
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/complex/sub-managers',
        headers: {
          authorization: `Bearer ${managerToken}`,
          'x-complex-id': 'cpx-victim-target-88' // Mismatch spoofing attempt!
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(403);
      expect(body.detail).toContain('Cross-tenant access forbidden. Header tenant does not match authenticated token tenant.');
    });

    it('PROBE 2.4: Unauthenticated request to protected route without token or header MUST fail-closed with HTTP 400 or 401', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/receipts/rcpt-dummy-id'
      });

      expect([400, 401]).toContain(res.statusCode);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.title).toMatch(/Tenant Context Missing|Unauthorized/);
    });

    it('PROBE 2.5: Invalid/corrupt Bearer token on protected route without header MUST return HTTP 401 Unauthorized', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/receipts/rcpt-dummy-id',
        headers: {
          authorization: 'Bearer invalid.corrupted.jwttoken'
        }
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.status).toBe(401);
      expect(body.title).toBe('Unauthorized');
    });
  });
});
