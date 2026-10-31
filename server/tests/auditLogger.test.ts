import { describe, it, expect } from 'vitest';
import { computeDelta, sanitizePayload, SENSITIVE_FIELDS } from '../src/utils/delta';
import { auditLogger } from '../src/services/auditLogger';
import { prisma, AuditLogImmutableError } from '../src/config/database';
import { AuditAction } from '@prisma/client';

describe('AuditLogger & Immutability Enforcement', () => {
  describe('Delta Engine & Sensitive Field Redaction', () => {
    it('should compute creation delta with sanitized payload', () => {
      const createdObj = {
        unitNumber: 101,
        area: 95,
        passwordHash: '$argon2id$...secret...',
        ownerName: 'Ahmadi'
      };

      const { beforeDelta, afterDelta, diff } = computeDelta(null, createdObj);
      expect(beforeDelta).toBeNull();
      expect(diff).toBeNull();
      expect(afterDelta).toEqual({
        unitNumber: 101,
        area: 95,
        ownerName: 'Ahmadi'
      });
      // Sensitive field must be redacted
      expect(afterDelta).not.toHaveProperty('passwordHash');
    });

    it('should compute update delta and field diff accurately', () => {
      const before = { occupants: 2, floor: 3, notes: 'old' };
      const after = { occupants: 4, floor: 3, notes: 'updated' };

      const { beforeDelta, afterDelta, diff } = computeDelta(before, after);
      expect(beforeDelta).toEqual({ occupants: 2, notes: 'old' });
      expect(afterDelta).toEqual({ occupants: 4, notes: 'updated' });
      expect(diff).toEqual({
        occupants: { from: 2, to: 4 },
        notes: { from: 'old', to: 'updated' }
      });
      // Unchanged field omitted from delta
      expect(beforeDelta).not.toHaveProperty('floor');
    });

    it('should compute deletion delta', () => {
      const deletedObj = { id: 'u1', unitNumber: 5, secret: 'topsecret' };
      const { beforeDelta, afterDelta, diff } = computeDelta(deletedObj, null);

      expect(afterDelta).toBeNull();
      expect(diff).toBeNull();
      expect(beforeDelta).toEqual({ id: 'u1', unitNumber: 5 });
      expect(beforeDelta).not.toHaveProperty('secret');
    });

    it('should sanitize all blacklisted sensitive fields', () => {
      const payload: Record<string, any> = {};
      for (const key of SENSITIVE_FIELDS) {
        payload[key] = 'sensitive-value';
      }
      payload.regularField = 'safe-value';

      const sanitized = sanitizePayload(payload);
      expect(sanitized).toEqual({ regularField: 'safe-value' });
    });
  });

  describe('Immutable Audit Guard (Layer 1 Application Interceptor)', () => {
    it('should throw AuditLogImmutableError when attempting prisma.auditLog.update', async () => {
      await expect(prisma.auditLog.update({
        where: { id: BigInt(1) },
        data: {}
      })).rejects.toThrow(AuditLogImmutableError);
    });

    it('should throw AuditLogImmutableError when attempting prisma.auditLog.updateMany', async () => {
      await expect(prisma.auditLog.updateMany({
        data: {}
      })).rejects.toThrow(AuditLogImmutableError);
    });

    it('should throw AuditLogImmutableError when attempting prisma.auditLog.delete', async () => {
      await expect(prisma.auditLog.delete({
        where: { id: BigInt(1) }
      })).rejects.toThrow(AuditLogImmutableError);
    });

    it('should throw AuditLogImmutableError when attempting prisma.auditLog.deleteMany', async () => {
      await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(AuditLogImmutableError);
    });

    it('should throw AuditLogImmutableError when attempting prisma.auditLog.upsert', async () => {
      await expect(prisma.auditLog.upsert({
        where: { id: BigInt(1) },
        create: {} as any,
        update: {}
      })).rejects.toThrow(AuditLogImmutableError);
    });
  });

  describe('Action Normalization', () => {
    it('should normalize legacy actions to Prisma AuditAction enum', () => {
      expect(auditLogger.normalizeAction('CREATE_UNIT')).toBe(AuditAction.CREATE);
      expect(auditLogger.normalizeAction('UPDATE_UNIT')).toBe(AuditAction.UPDATE);
      expect(auditLogger.normalizeAction('RECORD_PAYMENT')).toBe(AuditAction.SETTLE_DEBT);
      expect(auditLogger.normalizeAction('CLOSE_PERIOD')).toBe(AuditAction.CLOSE_PERIOD);
      expect(auditLogger.normalizeAction('PERMISSION_CHANGE')).toBe(AuditAction.PERMISSION_CHANGE);
    });

    it('should recognize critical actions for fail-closed guarantees', () => {
      expect(auditLogger.isCriticalAction('RECORD_PAYMENT')).toBe(true);
      expect(auditLogger.isCriticalAction('CLOSE_PERIOD')).toBe(true);
      expect(auditLogger.isCriticalAction('PERMISSION_CHANGE')).toBe(true);
      expect(auditLogger.isCriticalAction('UPDATE_UNIT')).toBe(false);
    });
  });
});
