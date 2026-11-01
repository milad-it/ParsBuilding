/**
 * Shared Type Definitions for ParsBuilding Platform
 */

export * from './auth';

export interface TenantContext {
  complexId: string;
  buildingId?: string;
  userId: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  permissions: string[];
}

export interface AuditLogEntry {
  complexId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  beforeDelta?: Record<string, any>;
  afterDelta?: Record<string, any>;
  timestamp: Date;
}

export interface LegacyExportPayload {
  complexId?: string;
  complexName?: string;
  initialFund: number;
  expectedEndingFund?: number;
  expectedTotalDebts?: number;
  overwrite?: boolean;
  units: any[];
  periods: any[];
}

export interface MigrationReconciliation {
  success: boolean;
  unitsImported: number;
  periodsImported: number;
  transactionsImported: number;
  initialFund: number;
  calculatedEndingFund: number;
  fundDiscrepancy: number; // MUST be 0
  debtDiscrepancy: number; // MUST be 0
}
