import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/rbac';
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
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'شما فقط مجاز به بارگذاری فیش برای واحدهای اختصاصی خود هستید'
      });
    }

    // Verify unit exists and get its complexId
    const unit = await rawPrisma.unit.findUnique({
      where: { id: body.unitId }
    });

    if (!unit) {
      return reply.code(404).send({ error: 'Not Found', message: 'واحد مسکونی یافت نشد' });
    }

    const complexId = unit.complexId;

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
      return reply.code(404).send({ error: 'Not Found', message: 'رسید پرداخت یافت نشد' });
    }

    // Tenant check
    if (request.user!.role !== 'SUPER_ADMIN' && request.user!.complexId !== receipt.complexId) {
      return reply.code(403).send({ error: 'Forbidden', message: 'عدم دسترسی به فیش مجتمع دیگر' });
    }

    return reply.code(200).send({ receipt });
  });
}
