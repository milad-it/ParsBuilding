/**
 * ParsBuilding Commercial SaaS Platform - E2E Test Suite Types & Contracts
 * Based on PROJECT.md § Interface Contracts & Feature Inventory
 */

export type Role = 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';

export type SubManagerPermission =
  | 'MANAGE_UNITS'
  | 'MANAGE_RESIDENTS'
  | 'MANAGE_EXPENSES'
  | 'CLOSE_PERIODS'
  | 'VIEW_FINANCIAL_REPORTS'
  | 'MANAGE_ANNOUNCEMENTS'
  | 'VERIFY_RECEIPTS'
  | 'VIEW_AUDIT_LOGS';

export interface Complex {
  id: string;
  name: string;
  address?: string;
  initialFund: number;
  currentFund: number;
  createdAt: string;
}

export interface Building {
  id: string;
  complexId: string;
  name: string;
  floorsCount: number;
  unitsCount: number;
}

export interface Unit {
  id: string;
  complexId: string;
  buildingId: string;
  unitNumber: number;
  floor: number;
  area: number; // in square meters (ماده ۴ قانون تملک)
  occupants: number;
  hasPackage: boolean;
  ownerName: string;
  ownerPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  balance: number; // positive = credit, negative = debt
  isOccupied: boolean;
}

export interface Resident {
  id: string;
  complexId: string;
  unitId: string;
  fullName: string;
  phone: string;
  isOwner: boolean;
  nationalCode?: string;
}

export interface User {
  id: string;
  complexId?: string;
  unitId?: string;
  username: string;
  role: Role;
  permissions: SubManagerPermission[];
  token?: string;
}

export interface PeriodExpenseInput {
  fixedPerUnit?: number;
  waterTotal?: number;
  gasTotal?: number;
  electricityTotal?: number;
  incidentalTotal?: number;
  specialTotal?: number;
  specialMode?: 'all' | 'active' | 'custom';
  customUnitIds?: string[];
  areaExpenseTotal?: number; // Distributed strictly by area
  roundUp?: boolean;
  roundStep?: number; // Default 50,000 Rials
  exemptEmptyUnits?: boolean;
}

export interface UnitChargeOutput {
  unitId: string;
  unitNumber: number;
  fixed: number;
  water: number;
  gas: number;
  electricity: number;
  incidental: number;
  areaShare: number;
  specialShare: number;
  roundingDelta: number;
  totalCharge: number;
}

export interface CalculationResult {
  charges: UnitChargeOutput[];
  totalDistributed: number;
  totalInputExpenses: number;
  conservationDelta: number; // MUST be 0 (Zero-loss principle)
}

export interface Period {
  id: string;
  complexId: string;
  title: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  totalExpenses: number;
  totalCollected: number;
  charges: UnitChargeOutput[];
}

export interface Transaction {
  id: string;
  complexId: string;
  unitId?: string;
  amount: number;
  type: 'EXPENSE' | 'PERIOD_CHARGE' | 'PAYMENT' | 'MANUAL_ADJUSTMENT' | 'DEPOSIT';
  description: string;
  createdAt: string;
  periodId?: string;
}

export interface AuditLogEntry {
  id: string;
  complexId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  beforeDelta?: Record<string, any>;
  afterDelta?: Record<string, any>;
  timestamp: string;
}

export interface LegacyExportPayload {
  units: any[];
  periods: any[];
  initialFund: number;
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

export interface TenantContext {
  complexId: string;
  buildingId?: string;
  userId: string;
  role: Role;
  permissions: SubManagerPermission[];
}
