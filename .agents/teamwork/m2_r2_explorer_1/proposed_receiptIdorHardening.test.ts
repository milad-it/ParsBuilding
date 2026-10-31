import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../server/src/index';
import { rawPrisma } from '../../server/src/config/database';
import { signAccessToken } from '../../server/src/services/authService';

describe('Regression Suite: Receipt IDOR & Granular Resident Authorization Hardening', () => {
  let server: FastifyInstance;
  const complexA = 'cpx-tehran-north-101';
  const complexB = 'cpx-shiraz-south-202';

  const unit101Id = 'unit-101-uuid';
  const unit202Id = 'unit-202-uuid';
  const unitForeignId = 'unit-foreign-uuid';

  const residentAliceId = 'user-alice-101';
  const residentBobId = 'user-bob-202';
  const residentCharlieId = 'user-charlie-101-roommate';
  const managerId = 'user-mgr-cpx-a';
  const subManagerWithPermId = 'user-submgr-accountant';
  const subManagerNoPermId = 'user-submgr-cleaner';
  const superAdminId = 'user-super-root';

  const tokenAlice = signAccessToken({
    sub: residentAliceId,
    phone: '09121110001',
    fullName: 'Alice Resident (Unit 101)',
    role: 'RESIDENT',
    complexId: complexA,
    permissions: [],
    unitIds: [unit101Id]
  });

  const tokenCharlie = signAccessToken({
    sub: residentCharlieId,
    phone: '09121110003',
    fullName: 'Charlie Co-Occupant (Unit 101)',
    role: 'RESIDENT',
    complexId: complexA,
    permissions: [],
    unitIds: [unit101Id]
  });

  const tokenBob = signAccessToken({
    sub: residentBobId,
    phone: '09121110002',
    fullName: 'Bob Resident (Unit 202)',
    role: 'RESIDENT',
    complexId: complexA,
    permissions: [],
    unitIds: [unit202Id]
  });

  const tokenManager = signAccessToken({
    sub: managerId,
    phone: '09129990001',
    fullName: 'Building Manager',
    role: 'COMPLEX_MANAGER',
    complexId: complexA,
    permissions: [],
    unitIds: []
  });

  const tokenSubManagerWithPerm = signAccessToken({
    sub: subManagerWithPermId,
    phone: '09129990002',
    fullName: 'Sub Manager Accountant',
    role: 'SUB_MANAGER',
    complexId: complexA,
    permissions: ['VERIFY_RECEIPTS', 'RECORD_PAYMENTS'],
    unitIds: []
  });

  const tokenSubManagerNoPerm = signAccessToken({
    sub: subManagerNoPermId,
    phone: '09129990003',
    fullName: 'Sub Manager Janitor',
    role: 'SUB_MANAGER',
    complexId: complexA,
    permissions: ['MANAGE_ANNOUNCEMENTS'],
    unitIds: []
  });

  const tokenSuperAdmin = signAccessToken({
    sub: superAdminId,
    phone: '09120000000',
    fullName: 'Platform Super Admin',
    role: 'SUPER_ADMIN',
    complexId: null,
    permissions: [],
    unitIds: []
  });

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // Section 1: GET /api/v1/receipts/:id IDOR Protection
  // =========================================================================
  describe('GET /api/v1/receipts/:id: Anti-IDOR Authorization Enforcements', () => {
    it('REG-IDOR-1.1: Resident Alice CANNOT inspect Bob receipt in the same complex (HTTP 403 RFC 7807)', async () => {
      const bobReceiptId = 'rcpt-bob-private-456';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: bobReceiptId,
        complexId: complexA,
        unitId: unit202Id, // Bob's Unit 202
        uploadedById: residentBobId, // Bob's ID
        imageUrl: 'https://cdn.parsbuilding.com/receipts/bob_secret_bank_slip.png',
        status: 'PENDING',
        unit: { unitNumber: 202, unitName: 'واحد ۲۰۲' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${bobReceiptId}`,
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/forbidden-unit-access');
      expect(body.title).toBe('Forbidden Unit Access');
      expect(body.status).toBe(403);
      expect(body.message).toContain('شما فقط مجاز به مشاهده فیش واحد خود هستید');
    });

    it('REG-IDOR-1.2: Resident Alice CAN inspect her own unit receipt (HTTP 200 OK)', async () => {
      const aliceReceiptId = 'rcpt-alice-own-123';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: aliceReceiptId,
        complexId: complexA,
        unitId: unit101Id, // Alice's Unit 101
        uploadedById: residentAliceId,
        imageUrl: 'https://cdn.parsbuilding.com/receipts/alice_bank_slip.png',
        status: 'VERIFIED',
        unit: { unitNumber: 101, unitName: 'واحد ۱۰۱' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${aliceReceiptId}`,
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.receipt.id).toBe(aliceReceiptId);
      expect(body.receipt.unit.unitNumber).toBe(101);
    });

    it('REG-IDOR-1.3: Resident Charlie (co-resident of Unit 101) CAN view receipt uploaded for Unit 101 (HTTP 200 OK)', async () => {
      const unit101ReceiptId = 'rcpt-unit101-shared-789';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: unit101ReceiptId,
        complexId: complexA,
        unitId: unit101Id, // Unit 101
        uploadedById: residentAliceId, // Uploaded by Alice, viewed by co-occupant Charlie
        imageUrl: 'https://cdn.parsbuilding.com/receipts/unit101_charge.png',
        status: 'PENDING',
        unit: { unitNumber: 101, unitName: 'واحد ۱۰۱' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${unit101ReceiptId}`,
        headers: { authorization: `Bearer ${tokenCharlie}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().receipt.id).toBe(unit101ReceiptId);
    });

    it('REG-IDOR-1.4: Resident Alice CAN view a receipt she uploaded even if unit ID has changed (uploadedById check) (HTTP 200 OK)', async () => {
      const legacyReceiptId = 'rcpt-alice-previous-unit-999';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: legacyReceiptId,
        complexId: complexA,
        unitId: 'unit-previous-relocated', // Different unit
        uploadedById: residentAliceId, // Uploaded by Alice!
        imageUrl: 'https://cdn.parsbuilding.com/receipts/alice_past_slip.png',
        status: 'VERIFIED',
        unit: { unitNumber: 99, unitName: 'واحد ۹۹ قدیم' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${legacyReceiptId}`,
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().receipt.id).toBe(legacyReceiptId);
    });

    it('REG-IDOR-1.5: Complex Manager CAN view any receipt in their complex (HTTP 200 OK)', async () => {
      const anyReceiptId = 'rcpt-bob-private-456';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: anyReceiptId,
        complexId: complexA,
        unitId: unit202Id,
        uploadedById: residentBobId,
        imageUrl: 'https://cdn.parsbuilding.com/receipts/bob_slip.png',
        status: 'PENDING',
        unit: { unitNumber: 202, unitName: 'واحد ۲۰۲' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${anyReceiptId}`,
        headers: { authorization: `Bearer ${tokenManager}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().receipt.id).toBe(anyReceiptId);
    });

    it('REG-IDOR-1.6: Super Admin CAN view any receipt across complexes (HTTP 200 OK)', async () => {
      const anyReceiptId = 'rcpt-foreign-999';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: anyReceiptId,
        complexId: complexB,
        unitId: unitForeignId,
        uploadedById: 'user-foreign',
        imageUrl: 'https://cdn.parsbuilding.com/receipts/foreign.png',
        status: 'PENDING',
        unit: { unitNumber: 50, unitName: 'واحد ۵۰' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${anyReceiptId}`,
        headers: { authorization: `Bearer ${tokenSuperAdmin}`, 'x-complex-id': complexB }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().receipt.id).toBe(anyReceiptId);
    });

    it('REG-IDOR-1.7: Cross-tenant receipt request returns HTTP 403 RFC 7807', async () => {
      const foreignReceiptId = 'rcpt-cpx-b-foreign';
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce({
        id: foreignReceiptId,
        complexId: complexB, // Different complex!
        unitId: unitForeignId,
        uploadedById: 'user-foreign',
        imageUrl: 'https://cdn.parsbuilding.com/receipts/foreign.png',
        status: 'PENDING',
        unit: { unitNumber: 1, unitName: 'واحد ۱' }
      } as any);

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/receipts/${foreignReceiptId}`,
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/tenant-isolation-violation');
      expect(body.message).toContain('عدم دسترسی به فیش مجتمع دیگر');
    });

    it('REG-IDOR-1.8: Non-existent receipt returns HTTP 404 RFC 7807', async () => {
      vi.spyOn(rawPrisma.receiptVerification, 'findUnique').mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/receipts/non-existent-uuid',
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA }
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/not-found');
      expect(body.message).toContain('رسید پرداخت یافت نشد');
    });
  });

  // =========================================================================
  // Section 2: POST /api/v1/receipts/verify IDOR & Role Protection
  // =========================================================================
  describe('POST /api/v1/receipts/verify: Anti-IDOR & Upload Hardening', () => {
    it('REG-IDOR-2.1: Resident Alice CANNOT upload receipt for Bob unit (HTTP 403 RFC 7807)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/receipts/verify',
        headers: { authorization: `Bearer ${tokenAlice}`, 'x-complex-id': complexA },
        payload: {
          unitId: 'f9d6b26b-8cf5-4cf5-8ff5-2c33c3a9d002', // Bob's Unit 202
          imageUrl: 'https://cdn.parsbuilding.com/receipts/attacker.jpg'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/forbidden-unit-access');
      expect(body.message).toContain('شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید');
    });

    it('REG-IDOR-2.2: Manager CANNOT upload receipt for unit in a different complex (HTTP 403 RFC 7807)', async () => {
      const foreignUnitId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
      vi.spyOn(rawPrisma.unit, 'findUnique').mockResolvedValueOnce({
        id: foreignUnitId,
        complexId: complexB // Foreign complex!
      } as any);

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/receipts/verify',
        headers: { authorization: `Bearer ${tokenManager}`, 'x-complex-id': complexA },
        payload: {
          unitId: foreignUnitId,
          imageUrl: 'https://cdn.parsbuilding.com/receipts/manager_cross.jpg'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/tenant-isolation-violation');
      expect(body.message).toContain('عدم دسترسی به واحد مجتمع دیگر');
    });

    it('REG-IDOR-2.3: Sub-Manager WITHOUT payment permissions CANNOT upload receipt for non-assigned unit (HTTP 403)', async () => {
      const targetUnitId = 'b8e5c26b-8cf5-4cf5-8ff5-1c33c3a9d001';
      vi.spyOn(rawPrisma.unit, 'findUnique').mockResolvedValueOnce({
        id: targetUnitId,
        complexId: complexA
      } as any);

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/receipts/verify',
        headers: { authorization: `Bearer ${tokenSubManagerNoPerm}`, 'x-complex-id': complexA },
        payload: {
          unitId: targetUnitId,
          imageUrl: 'https://cdn.parsbuilding.com/receipts/janitor.jpg'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body.type).toBe('https://api.parsbuilding.com/errors/forbidden');
    });

    it('REG-IDOR-2.4: Sub-Manager WITH VERIFY_RECEIPTS CAN upload receipt for any unit in their complex (HTTP 202 Accepted)', async () => {
      const targetUnitId = 'b8e5c26b-8cf5-4cf5-8ff5-1c33c3a9d001';
      vi.spyOn(rawPrisma.unit, 'findUnique').mockResolvedValueOnce({
        id: targetUnitId,
        complexId: complexA
      } as any);

      vi.spyOn(rawPrisma.receiptVerification, 'create').mockResolvedValueOnce({
        id: 'rcpt-newly-uploaded-1',
        complexId: complexA,
        unitId: targetUnitId,
        uploadedById: subManagerWithPermId,
        imageUrl: 'https://cdn.parsbuilding.com/receipts/accountant.jpg',
        status: 'PENDING',
        createdAt: new Date()
      } as any);

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/receipts/verify',
        headers: { authorization: `Bearer ${tokenSubManagerWithPerm}`, 'x-complex-id': complexA },
        payload: {
          unitId: targetUnitId,
          imageUrl: 'https://cdn.parsbuilding.com/receipts/accountant.jpg'
        }
      });

      expect(res.statusCode).toBe(202);
      expect(res.json().receiptId).toBe('rcpt-newly-uploaded-1');
    });
  });
});
