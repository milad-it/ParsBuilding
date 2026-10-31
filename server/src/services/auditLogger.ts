import { Prisma, AuditAction } from '@prisma/client';
import { rawPrisma } from '../config/database';
import { computeDelta } from '../utils/delta';
import '../utils/serialization';

export interface AuditLogOptions {
  complexId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditLoggerService {
  /**
   * Log an audit event. Can run standalone or within an existing Prisma transaction.
   */
  public async log(options: AuditLogOptions, tx?: Prisma.TransactionClient): Promise<any> {
    const db = tx || rawPrisma;
    const { beforeDelta, afterDelta, diff } = computeDelta(options.before, options.after);

    // Normalize semantic action string to AuditAction enum
    const normalizedAction = this.normalizeAction(options.action);

    try {
      return await db.auditLog.create({
        data: {
          complexId: options.complexId || null,
          actorId: options.actorId || null,
          actorRole: options.actorRole || 'SYSTEM',
          action: normalizedAction,
          entityType: options.entityType,
          entityId: String(options.entityId),
          oldData: (beforeDelta || Prisma.DbNull) as Prisma.InputJsonValue,
          newData: (afterDelta || Prisma.DbNull) as Prisma.InputJsonValue,
          diff: (diff || Prisma.DbNull) as Prisma.InputJsonValue,
          metadata: (options.metadata || Prisma.DbNull) as Prisma.InputJsonValue,
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null
        }
      });
    } catch (error) {
      console.error('CRITICAL: Failed to write audit log entry:', error);
      // Fail-closed for critical financial transactions and permission changes
      if (this.isCriticalAction(options.action)) {
        throw new Error(`AuditLoggingFailure: Could not record audit log for critical action ${options.action}`);
      }
    }
  }

  /**
   * Query audit logs with strict tenant isolation and pagination.
   */
  public async getLogs(params: {
    complexId: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const { complexId, entityType, entityId, actorId, startDate, endDate, limit = 50, offset = 0 } = params;

    const where: Prisma.AuditLogWhereInput = {
      complexId, // Enforce strict tenant isolation
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {})
        }
      } : {})
    };

    const [logs, total] = await Promise.all([
      rawPrisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          actor: {
            select: { id: true, fullName: true, phone: true, role: true }
          }
        }
      }),
      rawPrisma.auditLog.count({ where })
    ]);

    // Format BigInt ID for JSON responses
    const serializedLogs = logs.map(l => ({
      ...l,
      id: l.id.toString()
    }));

    return { logs: serializedLogs, total, limit, offset };
  }

  public normalizeAction(action: string | AuditAction): AuditAction {
    if (typeof action !== 'string') return action;
    const map: Record<string, AuditAction> = {
      'CREATE': AuditAction.CREATE,
      'CREATE_UNIT': AuditAction.CREATE,
      'CREATE_COMPLEX': AuditAction.CREATE,
      'CREATE_RESIDENT': AuditAction.CREATE,
      'UPDATE': AuditAction.UPDATE,
      'UPDATE_UNIT': AuditAction.UPDATE,
      'UPDATE_RESIDENT': AuditAction.UPDATE,
      'DELETE': AuditAction.DELETE,
      'DELETE_UNIT': AuditAction.DELETE,
      'DELETE_RESIDENT': AuditAction.DELETE,
      'RECORD_PAYMENT': AuditAction.SETTLE_DEBT,
      'SETTLE_DEBT': AuditAction.SETTLE_DEBT,
      'CLOSE_PERIOD': AuditAction.CLOSE_PERIOD,
      'START_PERIOD': AuditAction.START_PERIOD,
      'PERMISSION_CHANGE': AuditAction.PERMISSION_CHANGE,
      'LOGIN': AuditAction.LOGIN,
      'LOGOUT': AuditAction.LOGOUT,
      'DATA_EXPORT': AuditAction.DATA_EXPORT,
      'MIGRATION': AuditAction.MIGRATION
    };
    return map[action] || (AuditAction as any)[action] || AuditAction.UPDATE;
  }

  public isCriticalAction(action: string | AuditAction): boolean {
    const actStr = String(action);
    return ['RECORD_PAYMENT', 'CLOSE_PERIOD', 'SETTLE_DEBT', 'PERMISSION_CHANGE'].includes(actStr);
  }
}

export const auditLogger = new AuditLoggerService();
