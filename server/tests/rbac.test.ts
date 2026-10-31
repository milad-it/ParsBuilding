import { describe, it, expect, vi } from 'vitest';
import {
  resolvePermissionsFromDb,
  hasRequiredPermission,
  requireRole,
  requirePermission,
  requireResidentUnitAccess,
  PERMISSION_ALIASES
} from '../src/middleware/rbac';
import { UserRole } from '@prisma/client';

describe('RBAC & Permission Guards', () => {
  describe('Permission Resolution & Aliases', () => {
    it('should resolve full permissions from DB SubManagerPermission model', () => {
      const perms = resolvePermissionsFromDb({
        id: 'p1',
        complexId: 'c1',
        userId: 'u1',
        canManageUnits: true,
        canManagePeriods: true,
        canRecordPayments: true,
        canClosePeriods: true,
        canViewReports: true,
        canManageResidents: true,
        canSendNotifications: true,
        canManageSettings: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      expect(perms).toContain('MANAGE_UNITS');
      expect(perms).toContain('MANAGE_RESIDENTS');
      expect(perms).toContain('MANAGE_PERIODS');
      expect(perms).toContain('MANAGE_FINANCES');
      expect(perms).toContain('RECORD_PAYMENTS');
      expect(perms).toContain('VERIFY_RECEIPTS');
      expect(perms).toContain('CLOSE_PERIODS');
      expect(perms).toContain('VIEW_REPORTS');
      expect(perms).toContain('VIEW_AUDIT_LOGS');
      expect(perms).toContain('BROADCAST_NOTICES');
      expect(perms).toContain('MANAGE_SETTINGS');
    });

    it('should return empty array for null permission records', () => {
      expect(resolvePermissionsFromDb(null)).toEqual([]);
    });

    it('should satisfy child permissions when parent alias is present', () => {
      // Sub-manager with MANAGE_FINANCES satisfies MANAGE_EXPENSES and MANAGE_PERIODS
      expect(hasRequiredPermission('SUB_MANAGER', ['MANAGE_FINANCES'], 'MANAGE_EXPENSES')).toBe(true);
      expect(hasRequiredPermission('SUB_MANAGER', ['MANAGE_FINANCES'], 'MANAGE_PERIODS')).toBe(true);
      // Sub-manager with VIEW_REPORTS satisfies VIEW_AUDIT_LOGS and VIEW_FINANCIAL_REPORTS
      expect(hasRequiredPermission('SUB_MANAGER', ['VIEW_REPORTS'], 'VIEW_AUDIT_LOGS')).toBe(true);
      expect(hasRequiredPermission('SUB_MANAGER', ['VIEW_REPORTS'], 'VIEW_FINANCIAL_REPORTS')).toBe(true);
      // Sub-manager with BROADCAST_NOTICES satisfies MANAGE_ANNOUNCEMENTS
      expect(hasRequiredPermission('SUB_MANAGER', ['BROADCAST_NOTICES'], 'MANAGE_ANNOUNCEMENTS')).toBe(true);
    });

    it('should unconditionally grant all permissions to SUPER_ADMIN and COMPLEX_MANAGER', () => {
      expect(hasRequiredPermission('SUPER_ADMIN', [], 'ANY_ACTION')).toBe(true);
      expect(hasRequiredPermission('COMPLEX_MANAGER', [], 'CLOSE_PERIODS')).toBe(true);
      expect(hasRequiredPermission('COMPLEX_MANAGER', [], 'VIEW_AUDIT_LOGS')).toBe(true);
    });

    it('should deny permissions to RESIDENT', () => {
      expect(hasRequiredPermission('RESIDENT', ['MANAGE_UNITS'], 'MANAGE_UNITS')).toBe(false);
      expect(hasRequiredPermission('RESIDENT', [], 'VIEW_AUDIT_LOGS')).toBe(false);
    });
  });

  describe('Route PreHandler Guards', () => {
    it('requireRole should allow authorized roles and reject forbidden ones', async () => {
      const guard = requireRole(UserRole.COMPLEX_MANAGER, UserRole.SUB_MANAGER);

      // Super admin passes
      const superAdminReq: any = { user: { role: 'SUPER_ADMIN' } };
      const replyMock: any = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn()
      };
      await guard(superAdminReq, replyMock);
      expect(replyMock.code).not.toHaveBeenCalled();

      // Complex manager passes
      const mgrReq: any = { user: { role: 'COMPLEX_MANAGER' } };
      await guard(mgrReq, replyMock);
      expect(replyMock.code).not.toHaveBeenCalled();

      // Resident rejected with 403
      const residentReq: any = { user: { role: 'RESIDENT' } };
      await guard(residentReq, replyMock);
      expect(replyMock.code).toHaveBeenCalledWith(403);
      expect(replyMock.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });

    it('requirePermission should allow managers and authorized sub-managers', async () => {
      const guard = requirePermission('CLOSE_PERIODS');

      // Manager passes
      const mgrReq: any = { user: { role: 'COMPLEX_MANAGER', permissions: [] } };
      const replyMock: any = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn()
      };
      await guard(mgrReq, replyMock);
      expect(replyMock.code).not.toHaveBeenCalled();

      // Sub-manager with CLOSE_PERIODS passes
      const authSubMgrReq: any = { user: { role: 'SUB_MANAGER', permissions: ['CLOSE_PERIODS'] } };
      await guard(authSubMgrReq, replyMock);
      expect(replyMock.code).not.toHaveBeenCalled();

      // Sub-manager without CLOSE_PERIODS rejected with 403
      const unauthSubMgrReq: any = { user: { role: 'SUB_MANAGER', permissions: ['MANAGE_UNITS'] } };
      await guard(unauthSubMgrReq, replyMock);
      expect(replyMock.code).toHaveBeenCalledWith(403);
    });

    it('requireResidentUnitAccess should enforce unit boundaries for residents', async () => {
      const replyMock: any = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn()
      };

      // Resident accessing their assigned unit passes
      const validResidentReq: any = {
        user: { role: 'RESIDENT', unitIds: ['unit-101', 'unit-102'] },
        params: { unitId: 'unit-101' }
      };
      await requireResidentUnitAccess(validResidentReq, replyMock);
      expect(replyMock.code).not.toHaveBeenCalled();

      // Resident accessing someone else's unit gets 403 Forbidden
      const intruderResidentReq: any = {
        user: { role: 'RESIDENT', unitIds: ['unit-101'] },
        params: { unitId: 'unit-999' }
      };
      await requireResidentUnitAccess(intruderResidentReq, replyMock);
      expect(replyMock.code).toHaveBeenCalledWith(403);
      expect(replyMock.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });
  });
});
