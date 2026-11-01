/**
 * ParsBuilding Announcements & Digital Bulletin Board REST Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rawPrisma } from '../config/database';
import { authenticate, requirePermission } from '../middleware/rbac';
import { auditLogger } from '../services/auditLogger';
import { AuditAction } from '@prisma/client';
import { realtimeService } from '../services/realtimeService';

const createAnnouncementSchema = z.object({
  complexId: z.string().optional(),
  buildingId: z.string().uuid().optional(),
  title: z.string().min(2).max(150),
  content: z.string().min(5).max(5000),
  attachments: z.array(z.string()).optional()
});

export async function announcementRoutes(fastify: FastifyInstance) {
  // GET /announcements: List announcements
  fastify.get('/announcements', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as { complexId?: string; buildingId?: string };

    const complexId = query.complexId || user.complexId;
    if (!complexId) {
      return reply.send([]);
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant access' });
    }

    const where: any = {
      complexId,
      isNotice: true
    };

    if (query.buildingId) {
      where.buildingId = query.buildingId;
    }

    const announcements = await rawPrisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, fullName: true, role: true }
        },
        building: {
          select: { id: true, name: true }
        }
      }
    });

    return reply.send(announcements.map(a => {
      // Parse JSON content if title was bundled
      let parsedTitle = 'اطلاعیه مدیریت';
      let parsedBody = a.content;
      try {
        if (a.content.startsWith('{')) {
          const json = JSON.parse(a.content);
          if (json.title) parsedTitle = json.title;
          if (json.content) parsedBody = json.content;
        }
      } catch {}

      return {
        id: a.id,
        complexId: a.complexId,
        buildingId: a.buildingId,
        title: parsedTitle,
        content: parsedBody,
        rawContent: a.content,
        attachments: a.attachments,
        sender: a.sender,
        building: a.building,
        createdAt: a.createdAt
      };
    }));
  });

  // GET /announcements/:id
  fastify.get('/announcements/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const notice = await rawPrisma.chatMessage.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
        building: true
      }
    });

    if (!notice || !notice.isNotice) {
      return reply.code(404).send({ error: 'Announcement not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== notice.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    return reply.send(notice);
  });

  // POST /announcements: Create announcement
  fastify.post('/announcements', {
    preHandler: [authenticate, requirePermission('BROADCAST_NOTICES')]
  }, async (request, reply) => {
    const user = request.user!;
    const parseRes = createAnnouncementSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.code(400).send(parseRes.error.format());
    }

    const data = parseRes.data;
    const complexId = data.complexId || user.complexId;

    if (!complexId) {
      return reply.code(400).send({ error: 'Complex ID required' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    // Bundle title and content in structured JSON representation in message content
    const contentPayload = JSON.stringify({
      title: data.title,
      content: data.content
    });

    const notice = await rawPrisma.chatMessage.create({
      data: {
        complexId,
        buildingId: data.buildingId,
        senderId: user.id,
        content: contentPayload,
        isNotice: true,
        attachments: data.attachments || undefined
      }
    });

    await auditLogger.log({
      complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.CREATE,
      entityType: 'Announcement',
      entityId: notice.id,
      after: notice
    });

    // Real-time broadcast to complex room (dual naming)
    const announcementEventData = {
      id: notice.id,
      title: data.title,
      content: data.content,
      buildingId: data.buildingId,
      createdAt: notice.createdAt.toISOString()
    };
    realtimeService.broadcastToComplex(complexId, 'announcement:created' as any, announcementEventData);
    realtimeService.broadcastToComplex(complexId, 'NEW_ANNOUNCEMENT', announcementEventData);

    return reply.code(201).send({
      id: notice.id,
      complexId: notice.complexId,
      title: data.title,
      content: data.content,
      createdAt: notice.createdAt
    });
  });

  // DELETE /announcements/:id: Delete announcement
  fastify.delete('/announcements/:id', {
    preHandler: [authenticate, requirePermission('BROADCAST_NOTICES')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const notice = await rawPrisma.chatMessage.findUnique({ where: { id } });
    if (!notice || !notice.isNotice) {
      return reply.code(404).send({ error: 'Announcement not found' });
    }

    if (user.role !== 'SUPER_ADMIN' && user.complexId !== notice.complexId) {
      return reply.code(403).send({ error: 'Forbidden cross-tenant' });
    }

    await rawPrisma.chatMessage.delete({ where: { id } });

    await auditLogger.log({
      complexId: notice.complexId,
      actorId: user.id,
      actorRole: user.role,
      action: AuditAction.DELETE,
      entityType: 'Announcement',
      entityId: id,
      before: notice
    });

    return reply.send({ deleted: true });
  });
}
