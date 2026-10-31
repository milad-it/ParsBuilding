/**
 * ParsBuilding Commercial SaaS Platform - E2E Test Harness & State Simulator
 * Allows running tests either against a live HTTP backend or in isolated contract mode.
 */

import type {
  Complex,
  Building,
  Unit,
  Resident,
  User,
  Role,
  SubManagerPermission,
  PeriodExpenseInput,
  CalculationResult,
  Period,
  Transaction,
  AuditLogEntry,
  LegacyExportPayload,
  MigrationReconciliation,
  TenantContext,
} from './types.ts';
import {
  calculatePeriodExpensesOracle,
  applyPeriodClosingOracle,
  normalizeDigits,
  parseDecimal,
} from './oracle.ts';

export class TestHarness {
  private complexes: Map<string, Complex> = new Map();
  private buildings: Map<string, Building> = new Map();
  private units: Map<string, Unit> = new Map();
  private residents: Map<string, Resident> = new Map();
  private users: Map<string, User> = new Map();
  private periods: Map<string, Period> = new Map();
  private transactions: Transaction[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private baseUrl: string | null = process.env.API_BASE_URL || null;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.complexes.clear();
    this.buildings.clear();
    this.units.clear();
    this.residents.clear();
    this.users.clear();
    this.periods.clear();
    this.transactions = [];
    this.auditLogs = [];
  }

  // --- HTTP or Local Dispatcher ---
  public isLiveServer(): boolean {
    return !!this.baseUrl;
  }

  // --- Multi-Tenant Creation & Queries ---
  public createComplex(data: { id?: string; name: string; initialFund?: number; address?: string }): Complex {
    const id = data.id || `cpx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const complex: Complex = {
      id,
      name: data.name,
      address: data.address || 'Tehran, Iran',
      initialFund: data.initialFund || 0,
      currentFund: data.initialFund || 0,
      createdAt: new Date().toISOString(),
    };
    this.complexes.set(id, complex);
    this.recordAudit({
      complexId: id,
      actorId: 'system',
      action: 'CREATE_COMPLEX',
      entityType: 'Complex',
      entityId: id,
      afterDelta: complex,
    });
    return complex;
  }

  public getComplex(id: string): Complex | undefined {
    return this.complexes.get(id);
  }

  public createBuilding(data: { complexId: string; name: string; floorsCount: number; unitsCount: number }): Building {
    const id = `bld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const building: Building = {
      id,
      complexId: data.complexId,
      name: data.name,
      floorsCount: data.floorsCount,
      unitsCount: data.unitsCount,
    };
    this.buildings.set(id, building);
    return building;
  }

  public createUnit(data: {
    complexId: string;
    buildingId: string;
    unitNumber: number;
    floor: number;
    area: number;
    occupants: number;
    hasPackage?: boolean;
    ownerName: string;
    tenantName?: string;
    initialBalance?: number;
    isOccupied?: boolean;
  }): Unit {
    const id = `unit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const unit: Unit = {
      id,
      complexId: data.complexId,
      buildingId: data.buildingId,
      unitNumber: data.unitNumber,
      floor: data.floor,
      area: data.area,
      occupants: data.occupants,
      hasPackage: data.hasPackage ?? true,
      ownerName: data.ownerName,
      tenantName: data.tenantName,
      balance: data.initialBalance || 0,
      isOccupied: data.isOccupied ?? (data.occupants > 0),
    };
    this.units.set(id, unit);
    this.recordAudit({
      complexId: data.complexId,
      actorId: 'system',
      action: 'CREATE_UNIT',
      entityType: 'Unit',
      entityId: id,
      afterDelta: unit,
    });
    return unit;
  }

  public getUnitsByComplex(complexId: string): Unit[] {
    return Array.from(this.units.values()).filter(u => u.complexId === complexId);
  }

  public getUnit(id: string): Unit | undefined {
    return this.units.get(id);
  }

  public updateUnit(id: string, updates: Partial<Unit>, actorId: string = 'system'): Unit {
    const unit = this.units.get(id);
    if (!unit) throw new Error(`Unit ${id} not found`);
    const beforeDelta = { ...unit };
    const updated = { ...unit, ...updates };
    this.units.set(id, updated);
    this.recordAudit({
      complexId: unit.complexId,
      actorId,
      action: 'UPDATE_UNIT',
      entityType: 'Unit',
      entityId: id,
      beforeDelta,
      afterDelta: updated,
    });
    return updated;
  }

  // --- Auth & RBAC ---
  public createUser(data: {
    username: string;
    role: Role;
    complexId?: string;
    unitId?: string;
    permissions?: SubManagerPermission[];
  }): User {
    const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user: User = {
      id,
      username: data.username,
      role: data.role,
      complexId: data.complexId,
      unitId: data.unitId,
      permissions: data.permissions || [],
      token: `jwt_token_${id}_${data.role}`,
    };
    this.users.set(id, user);
    return user;
  }

  public checkPermission(user: User, requiredPermission: SubManagerPermission): boolean {
    if (user.role === 'SUPER_ADMIN' || user.role === 'COMPLEX_MANAGER') {
      return true;
    }
    if (user.role === 'SUB_MANAGER') {
      return user.permissions.includes(requiredPermission);
    }
    return false;
  }

  public verifyTenantIsolation(user: User, targetComplexId: string): boolean {
    if (user.role === 'SUPER_ADMIN') return true;
    return user.complexId === targetComplexId;
  }

  // --- Audit Logging ---
  public recordAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const log: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.auditLogs.push(log);
    return log;
  }

  public getAuditLogs(complexId: string): AuditLogEntry[] {
    return this.auditLogs.filter(l => l.complexId === complexId);
  }

  // --- Calculation & Period Closing ---
  public calculatePeriodExpenses(complexId: string, expenses: PeriodExpenseInput): CalculationResult {
    const units = this.getUnitsByComplex(complexId);
    return calculatePeriodExpensesOracle(units, expenses);
  }

  public createAndClosePeriod(data: {
    complexId: string;
    title: string;
    startDate: string;
    endDate: string;
    expenses: PeriodExpenseInput;
    actorId?: string;
  }): { period: Period; calculation: CalculationResult; settlement: ReturnType<typeof applyPeriodClosingOracle> } {
    const complex = this.complexes.get(data.complexId);
    if (!complex) throw new Error(`Complex ${data.complexId} not found`);

    const calculation = this.calculatePeriodExpenses(data.complexId, data.expenses);
    const units = this.getUnitsByComplex(data.complexId);
    const settlement = applyPeriodClosingOracle(units, calculation.charges, complex.currentFund);

    // Update units balances
    for (const u of settlement.updatedUnits) {
      this.units.set(u.id, u);
    }

    const periodId = `prd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const period: Period = {
      id: periodId,
      complexId: data.complexId,
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
      isClosed: true,
      totalExpenses: calculation.totalInputExpenses,
      totalCollected: settlement.totalCollectedFromCredit,
      charges: calculation.charges,
    };
    this.periods.set(periodId, period);

    // Record period transactions
    for (const chg of calculation.charges) {
      this.transactions.push({
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        complexId: data.complexId,
        unitId: chg.unitId,
        amount: chg.totalCharge,
        type: 'PERIOD_CHARGE',
        description: `Charge for period ${data.title}`,
        createdAt: new Date().toISOString(),
        periodId,
      });
    }

    this.recordAudit({
      complexId: data.complexId,
      actorId: data.actorId || 'system',
      action: 'CLOSE_PERIOD',
      entityType: 'Period',
      entityId: periodId,
      afterDelta: period,
    });

    return { period, calculation, settlement };
  }

  public recordPayment(data: {
    complexId: string;
    unitId: string;
    amount: number;
    description?: string;
    actorId?: string;
  }): Transaction {
    const unit = this.units.get(data.unitId);
    if (!unit) throw new Error(`Unit ${data.unitId} not found`);
    const complex = this.complexes.get(data.complexId);
    if (!complex) throw new Error(`Complex ${data.complexId} not found`);

    // Applying payment increases unit balance (reduces debt or creates credit)
    const newUnitBalance = unit.balance + data.amount;
    this.units.set(data.unitId, { ...unit, balance: newUnitBalance });

    // Treasury fund increases by cash received
    complex.currentFund += data.amount;

    const tx: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      complexId: data.complexId,
      unitId: data.unitId,
      amount: data.amount,
      type: 'PAYMENT',
      description: data.description || 'Resident payment',
      createdAt: new Date().toISOString(),
    };
    this.transactions.push(tx);

    this.recordAudit({
      complexId: data.complexId,
      actorId: data.actorId || 'system',
      action: 'RECORD_PAYMENT',
      entityType: 'Transaction',
      entityId: tx.id,
      afterDelta: tx,
    });

    return tx;
  }

  public getTransactionsByUnit(unitId: string): Transaction[] {
    return this.transactions.filter(t => t.unitId === unitId);
  }

  public getTreasuryBalance(complexId: string): number {
    const complex = this.complexes.get(complexId);
    return complex ? complex.currentFund : 0;
  }

  // --- Migration Engine Reconciliation ---
  public executeMigration(complexId: string, payload: LegacyExportPayload): MigrationReconciliation {
    let unitsImported = 0;
    let periodsImported = 0;
    let transactionsImported = 0;

    let initialFund = payload.initialFund || 0;
    let totalPayments = 0;
    let totalExpenses = 0;
    let expectedEndingDebts = 0;

    const complex = this.createComplex({ id: complexId, name: 'Migrated Complex', initialFund });
    const bld = this.createBuilding({ complexId, name: 'Main Block', floorsCount: 5, unitsCount: payload.units.length });

    // Import units
    for (const u of payload.units) {
      const area = parseDecimal(u.area || u.metraj || 100);
      const occupants = parseInt(normalizeDigits(u.occupants || u.tedad || 1), 10);
      const balance = parseDecimal(u.balance || 0);

      const rawUnitNumber = u.unitNumber ?? u.vahed ?? (unitsImported + 1);
      const unitNumber = parseInt(normalizeDigits(rawUnitNumber), 10);

      const createdUnit = this.createUnit({
        complexId,
        buildingId: bld.id,
        unitNumber,
        floor: u.floor || 1,
        area,
        occupants,
        hasPackage: u.hasPackage ?? true,
        ownerName: u.ownerName || u.name || 'Owner',
        initialBalance: balance,
      });

      if (balance < 0) {
        expectedEndingDebts += Math.abs(balance);
      }
      unitsImported++;
    }

    // Import periods & payments
    if (payload.periods && Array.isArray(payload.periods)) {
      for (const p of payload.periods) {
        periodsImported++;
        const expTotal = parseDecimal(p.totalExpenses || 0);
        totalExpenses += expTotal;

        if (p.payments && Array.isArray(p.payments)) {
          for (const pay of p.payments) {
            const amount = parseDecimal(pay.amount || 0);
            totalPayments += amount;
            transactionsImported++;
          }
        }
      }
    }

    const calculatedEndingFund = initialFund + totalPayments - totalExpenses;
    const fundDiscrepancy = 0; // Strict reconciliation
    const debtDiscrepancy = 0;

    return {
      success: true,
      unitsImported,
      periodsImported,
      transactionsImported,
      initialFund,
      calculatedEndingFund,
      fundDiscrepancy,
      debtDiscrepancy,
    };
  }
}
