import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserRole, AuditAction } from '@prisma/client';
import { rawPrisma } from '../config/database';
import { authenticate, requireRole } from '../middleware/rbac';
import { hashPassword, normalizePhone, validatePasswordComplexity, AuthenticationError } from '../services/authService';
import { auditLogger } from '../services/auditLogger';

const createSubManagerSchema = z.object({
  phone: z.string().min(10).max(20),
  fullName: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  permissions: z.object({
    canManageUnits: z.boolean().default(false),
    canManagePeriods: z.boolean().default(false),
    canRecordPayments: z.boolean().default(false),
    canClosePeriods: z.boolean().default(false),
    canViewReports: z.boolean().default(true),
    canManageResidents: z.boolean().default(false),
    canSendNotifications: z.boolean().default(false),
    canManageSettings: z.boolean().default(false)
  }).default({})
});

const updatePermissionsSchema = z.object({
  canManageUnits: z.boolean().optional(),
  canManagePeriods: z.boolean().optional(),
  canRecordPayments: z.boolean().optional(),
  canClosePeriods: z.boolean().optional(),
  canViewReports: z.boolean().optional(),
  canManageResidents: z.boolean().optional(),
  canSendNotifications: z.boolean().optional(),
  canManageSettings: z.boolean().optional()
});

export async function subManagerRoutes(fastify: FastifyInstance) {
  // List sub-managers in the complex
  fastify.get('/complex/sub-managers', {
    preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
  }, async (request) => {
    const complexId = request.user!.complexId!;
    const subManagers = await rawPrisma.user.findMany({
      where: {
        complexId,
        role: UserRole.SUB_MANAGER
      },
      select: {
        id: true,
        phone: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        subManagerPerm: true
      }
    });

    return { subManagers };
  });

  // Create new sub-manager
  fastify.post('/complex/sub-managers', {
    preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
  }, async (request, reply) => {
    const complexId = request.user!.complexId;
    if (!complexId) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Active complexId is required' });
    }

    const body = createSubManagerSchema.parse(request.body);
    const normalizedPhone = normalizePhone(body.phone);

    const complexity = validatePasswordComplexity(body.password);
    if (!complexity.valid) {
      throw new AuthenticationError(complexity.reason || 'رمز عبور معتبر نیست', 400);
    }

    const existing = await rawPrisma.user.findUnique({
      where: { phone: normalizedPhone }
    });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'کاربر با این شماره تلفن وجود دارد' });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await rawPrisma.user.create({
      data: {
        phone: normalizedPhone,
        fullName: body.fullName.trim(),
        passwordHash,
        role: UserRole.SUB_MANAGER,
        complexId,
        isActive: true,
        subManagerPerm: {
          create: {
            complexId,
            ...body.permissions
          }
        }
      },
      include: { subManagerPerm: true }
    });

    await auditLogger.log({
      complexId,
      actorId: request.user!.id,
      actorRole: request.user!.role,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'SubManagerPermission',
      entityId: user.subManagerPerm?.id || user.id,
      after: {
        userId: user.id,
        permissions: body.permissions
      }
    });

    return reply.code(201).send({
      message: 'مدیر کمکی با موفقیت ایجاد شد',
      subManager: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        permissions: user.subManagerPerm
      }
    });
  });

  // Update sub-manager permissions
  fastify.put('/complex/sub-managers/:userId/permissions', {
    preHandler: [authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.COMPLEX_MANAGER)]
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const complexId = request.user!.complexId;
    const body = updatePermissionsSchema.parse(request.body);

    const targetUser = await rawPrisma.user.findFirst({
      where: { id: userId, complexId, role: UserRole.SUB_MANAGER },
      include: { subManagerPerm: true }
    });

    if (!targetUser) {
      return reply.code(404).send({ error: 'Not Found', message: 'مدیر کمکی در این مجتمع یافت نشد' });
    }

    const beforePerms = targetUser.subManagerPerm ? { ...targetUser.subManagerPerm } : null;

    const updatedPerms = await rawPrisma.subManagerPermission.upsert({
      where: { userId },
      create: {
        complexId: complexId!,
        userId,
        canManageUnits: body.canManageUnits ?? false,
        canManagePeriods: body.canManagePeriods ?? false,
        canRecordPayments: body.canRecordPayments ?? false,
        canClosePeriods: body.canClosePeriods ?? false,
        canViewReports: body.canViewReports ?? true,
        canManageResidents: body.canManageResidents ?? false,
        canSendNotifications: body.canSendNotifications ?? false,
        canManageSettings: body.canManageSettings ?? false
      },
      update: body
    });

    await auditLogger.log({
      complexId: complexId!,
      actorId: request.user!.id,
      actorRole: request.user!.role,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'SubManagerPermission',
      entityId: updatedPerms.id,
      before: beforePerms || undefined,
      after: updatedPerms
    });

    return reply.code(200).send({
      message: 'دسترسی‌های مدیر کمکی با موفقیت به‌روزرسانی شد',
      permissions: updatedPerms
    });
  });
}
