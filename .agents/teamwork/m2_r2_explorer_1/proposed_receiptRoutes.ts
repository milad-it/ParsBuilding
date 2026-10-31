import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, hasRequiredPermission } from '../middleware/rbac';
import { rawPrisma } from '../config/database';
import { receiptVerificationQueue } from '../services/receiptQueue';

const submitReceiptSchema = z.object({
  unitId: z.string().uuid(),
  imageUrl: z.string().min(5),
  expectedAmount: z.number().nonnegative().optional()
});

export async function receiptRoutes(fastify: FastifyInstance) {
  // Submit receipt for AI verification
  fastify.post('/receipts/verify', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const body = submitReceiptSchema.parse(request.body);
    const user = request.user!;

    // Resident unit access check: residents may only submit for their assigned units
    if (user.role === 'RESIDENT' && !user.unitIds.includes(body.unitId)) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
          title: 'Forbidden Unit Access',
          status: 403,
          detail: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید'
        });
    }

    // Verify unit exists and get its complexId
    const unit = await rawPrisma.unit.findUnique({
      where: { id: body.unitId }
    });

    if (!unit) {
      return reply.code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'واحد مسکونی یافت نشد',
          instance: request.raw.url || request.url,
          error: 'Not Found',
          message: 'واحد مسکونی یافت نشد'
        });
    }

    const complexId = unit.complexId;

    // Tenant isolation check: non-SUPER_ADMIN managers/sub-managers/residents cannot submit for other complexes
    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
          title: 'Tenant Isolation Violation',
          status: 403,
          detail: 'عدم دسترسی به واحد مجتمع دیگر',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'عدم دسترسی به واحد مجتمع دیگر'
        });
    }

    // Sub-Manager role permission check: must hold RECORD_PAYMENTS or VERIFY_RECEIPTS permission or be unit occupant
    if (user.role === 'SUB_MANAGER') {
      const hasPerm = hasRequiredPermission(user.role, user.permissions, 'RECORD_PAYMENTS') ||
                      hasRequiredPermission(user.role, user.permissions, 'VERIFY_RECEIPTS');
      const isOccupant = Array.isArray(user.unitIds) && user.unitIds.includes(body.unitId);
      if (!hasPerm && !isOccupant) {
        return reply.code(403)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://api.parsbuilding.com/errors/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'مدیر کمکی دسترسی ثبت یا بارگذاری فیش برای این واحد را ندارد',
            instance: request.raw.url || request.url,
            error: 'Forbidden',
            message: 'دسترسی غیرمجاز'
          });
      }
    }

    // Create receipt record
    const receipt = await rawPrisma.receiptVerification.create({
      data: {
        complexId,
        unitId: body.unitId,
        uploadedById: user.id,
        imageUrl: body.imageUrl,
        status: 'PENDING'
      }
    });

    // Enqueue verification job for async processing
    await receiptVerificationQueue.enqueue({
      receiptId: receipt.id,
      complexId,
      unitId: body.unitId,
      uploadedById: user.id,
      imageUrl: body.imageUrl,
      expectedAmount: body.expectedAmount,
      createdAt: receipt.createdAt.toISOString()
    });

    return reply.code(202).send({
      message: 'رسید پرداخت دریافت شد و در صف اعتبارسنجی هوشمند قرار گرفت',
      receiptId: receipt.id,
      status: receipt.status
    });
  });

  // Get receipt status
  fastify.get('/receipts/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await rawPrisma.receiptVerification.findUnique({
      where: { id },
      include: {
        unit: {
          select: { unitNumber: true, unitName: true }
        }
      }
    });

    if (!receipt) {
      return reply.code(404)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'رسید پرداخت یافت نشد',
          instance: request.raw.url || request.url,
          error: 'Not Found',
          message: 'رسید پرداخت یافت نشد'
        });
    }

    // 1. Cross-Tenant isolation check
    if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
      return reply.code(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.parsbuilding.com/errors/tenant-isolation-violation',
          title: 'Tenant Isolation Violation',
          status: 403,
          detail: 'عدم دسترسی به فیش مجتمع دیگر',
          instance: request.raw.url || request.url,
          error: 'Forbidden',
          message: 'عدم دسترسی به فیش مجتمع دیگر'
        });
    }

    // 2. Intra-Tenant Resident IDOR authorization check:
    // Residents are strictly isolated to their assigned unit(s) or receipts they uploaded themselves
    if (request.user!.role === 'RESIDENT') {
      const isAssignedUnit = Array.isArray(request.user!.unitIds) && request.user!.unitIds.includes(receipt.unitId);
      const isUploader = receipt.uploadedById === request.user!.id;

      if (!isAssignedUnit && !isUploader) {
        return reply.code(403)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://api.parsbuilding.com/errors/forbidden-unit-access',
            title: 'Forbidden Unit Access',
            status: 403,
            detail: 'شما فقط مجاز به مشاهده فیش‌های واریزی واحدهای اختصاصی خود هستید',
            instance: request.raw.url || request.url,
            error: 'Forbidden',
            message: 'شما فقط مجاز به مشاهده فیش واحد خود هستید'
          });
      }
    }

    return reply.code(200).send({ receipt });
  });
}
