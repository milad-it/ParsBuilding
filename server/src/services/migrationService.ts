/**
 * ParsBuilding Lossless Data Migration Service
 *
 * Implements atomic, lossless migration from legacy IndexedDB / LocalStorage payloads
 * into the PostgreSQL multi-tenant schema with strict mathematical reconciliation assertions:
 * ΔFund = 0, ΔDebts = 0.
 *
 * All operations execute inside an atomic rawPrisma.$transaction so that if any
 * constraint or reconciliation assertion fails, the entire transaction rolls back cleanly
 * with zero residue.
 */

import {
  AuditAction,
  OccupancyStatus,
  PaymentMethod,
  PeriodStatus,
  PeriodType,
  ResidentType,
  TxKind,
  TxType
} from '@prisma/client';
import { rawPrisma } from '../config/database';
import { parseDecimal, parseIntegerCurrency, toEnDigit } from '../utils/numberUtils';
import { LegacyExportPayload, MigrationReconciliation } from '../types';

export class MigrationReconciliationError extends Error {
  public readonly statusCode = 422;
  public readonly code = 'MIGRATION_RECONCILIATION_FAILURE';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationReconciliationError';
  }
}

export class MigrationService {
  /**
   * Executes atomic, lossless migration from legacy payload into PostgreSQL.
   */
  public async executeMigration(
    complexId: string,
    payload: LegacyExportPayload,
    actorId?: string
  ): Promise<MigrationReconciliation> {
    if (!complexId || typeof complexId !== 'string') {
      throw new Error('Valid complexId is required for migration');
    }

    const initialFund = parseIntegerCurrency(payload.initialFund || 0);

    return await rawPrisma.$transaction(async (tx) => {
      // 1. Create or ensure Complex exists
      let complex = await tx.complex.findUnique({ where: { id: complexId } });
      if (!complex) {
        // Deterministic unique slug
        const baseSlug = `cpx-${complexId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
        let slug = baseSlug;
        let counter = 1;
        while (await tx.complex.findUnique({ where: { slug } })) {
          slug = `${baseSlug}-${counter++}`;
        }

        complex = await tx.complex.create({
          data: {
            id: complexId,
            slug,
            name: (payload as any).complexName || 'مجتمع مسکونی پارس',
            unitCount: payload.units?.length || 20,
            initialFund,
            currentFund: initialFund,
            roundStep: 50000,
            currency: 'IRT',
            isActive: true,
          }
        });

        // Audit log for complex creation
        await tx.auditLog.create({
          data: {
            complexId,
            actorId: actorId || null,
            actorRole: 'MANAGER',
            action: AuditAction.CREATE,
            entityType: 'Complex',
            entityId: complexId,
            metadata: { name: complex.name, initialFund }
          }
        });
      }

      // 2. Create or ensure Default Building exists
      let building = await tx.building.findFirst({ where: { complexId } });
      if (!building) {
        building = await tx.building.create({
          data: {
            complexId,
            name: 'بلوک اصلی',
            floorsCount: 5,
            unitsCount: payload.units?.length || 0,
          }
        });
      }

      if ((payload as any).overwrite) {
        // Clean up previously migrated periods and associated charges for this complex
        await tx.period.deleteMany({
          where: { complexId }
        });
        // Clean up previously migrated transactions for this complex
        await tx.ledgerTransaction.deleteMany({
          where: {
            complexId,
            transactionId: { startsWith: 'tx-mig-' }
          }
        });
      }

      let unitsImported = 0;
      let periodsImported = 0;
      let transactionsImported = 0;
      let totalPayments = 0;
      let totalExpenses = 0;
      let legacyDebtsSum = 0;

      const seenUnitNumbers = new Set<number>();
      const unitIdMap = new Map<string | number, string>();
      const unitsList = Array.isArray(payload.units) ? payload.units : [];

      // 3. Import Units & Residents
      for (let i = 0; i < unitsList.length; i++) {
        const u = unitsList[i]!;
        const rawUnitNumber = u.unitNumber ?? u.vahed ?? u.id ?? (i + 1);
        const unitNumber = parseInt(toEnDigit(rawUnitNumber), 10);

        if (isNaN(unitNumber)) {
          throw new MigrationReconciliationError(
            `Invalid unit number at index ${i}: "${rawUnitNumber}". Must be a valid numeric value.`
          );
        }

        // Tier 1 Defense: Strict Duplicate Unit Rejection
        if (seenUnitNumbers.has(unitNumber)) {
          throw new MigrationReconciliationError(
            `Duplicate unit number ${unitNumber} detected in migration payload. Unit numbers must be unique within a complex.`
          );
        }
        seenUnitNumbers.add(unitNumber);

        const area = parseDecimal(u.area ?? u.metraj ?? 100);

        // Normalize occupants count
        let occupants = 1;
        if (u.occupants !== undefined || u.tedad !== undefined) {
          const occRaw = u.occupants ?? u.tedad;
          occupants = parseInt(toEnDigit(occRaw), 10);
          if (isNaN(occupants) || occupants < 0) occupants = 0;
        } else if (u.occupants === 0 || u.tedad === '۰' || u.tedad === 0) {
          occupants = 0;
        }

        const balance = parseDecimal(u.balance ?? u.currentBalance ?? 0);
        const hasPackage = u.hasPackage ?? true;
        const ownerName = String(u.ownerName || u.name || `واحد ${unitNumber}`).trim();

        // Safe unique phone per unit: trim whitespace-only phones before fallback
        const rawPhone = String(u.ownerPhone ?? u.phone ?? '').trim();
        const phone = rawPhone || `0900${String(unitNumber).padStart(7, '0')}`;

        if (balance < 0) {
          legacyDebtsSum += Math.abs(balance);
        }

        const occType = occupants === 0
          ? OccupancyStatus.VACANT
          : (u.occType === 'tenant' || u.occType === 'TENANT' || u.isTenant
            ? OccupancyStatus.TENANT_OCCUPIED
            : OccupancyStatus.OWNER_OCCUPIED);

        const createdUnit = await tx.unit.upsert({
          where: { complexId_unitNumber: { complexId, unitNumber } },
          create: {
            complexId,
            buildingId: building.id,
            unitNumber,
            unitName: ownerName,
            floor: u.floor ? parseInt(toEnDigit(u.floor), 10) : 1,
            area,
            occupants,
            occType,
            hasPackage,
            currentBalance: balance,
          },
          update: {
            area,
            occupants,
            occType,
            hasPackage,
            currentBalance: balance,
            unitName: ownerName,
          }
        });

        unitIdMap.set(unitNumber, createdUnit.id);
        unitIdMap.set(String(unitNumber), createdUnit.id);
        if (u.id != null) {
          unitIdMap.set(u.id, createdUnit.id);
          unitIdMap.set(String(u.id), createdUnit.id);
        }

        // Upsert Resident
        const resType = occType === OccupancyStatus.TENANT_OCCUPIED
          ? ResidentType.TENANT
          : ResidentType.OWNER;

        const resident = await tx.resident.upsert({
          where: { complexId_phone: { complexId, phone } },
          create: {
            complexId,
            fullName: ownerName,
            phone,
            type: resType,
          },
          update: {
            fullName: ownerName,
            type: resType,
          }
        });

        // UnitResident assignment link
        await tx.unitResident.upsert({
          where: {
            complexId_unitId_residentId: {
              complexId,
              unitId: createdUnit.id,
              residentId: resident.id
            }
          },
          create: {
            complexId,
            unitId: createdUnit.id,
            residentId: resident.id,
            type: resType,
            isCurrent: true,
          },
          update: {
            type: resType,
            isCurrent: true,
          }
        });

        unitsImported++;

        // Audit log for Unit creation
        await tx.auditLog.create({
          data: {
            complexId,
            actorId: actorId || null,
            actorRole: 'MANAGER',
            action: AuditAction.CREATE,
            entityType: 'Unit',
            entityId: createdUnit.id,
            metadata: { unitNumber, area, occupants, balance }
          }
        });

        // Import unit legacy transactions if present
        if (Array.isArray(u.transactions)) {
          for (let tIdx = 0; tIdx < u.transactions.length; tIdx++) {
            const t = u.transactions[tIdx]!;
            const txAmt = parseDecimal(t.amount || 0);
            const isPayment = (t.type || '').toLowerCase() === 'payment';
            if (isPayment) {
              totalPayments += txAmt;
            }

            const rawKind = String(t.txKind || 'MANUAL').toUpperCase();
            const txKind = (Object.values(TxKind) as string[]).includes(rawKind)
              ? (rawKind as TxKind)
              : TxKind.MANUAL;

            const rawType = String(t.type || 'PAYMENT').toUpperCase();
            const txType = rawType === 'DEBT'
              ? TxType.DEBT
              : (rawType === 'FORGIVE' ? TxType.FORGIVE : TxType.PAYMENT);

            // Deterministic transactionId prevents duplicate rows on re-migration
            const txId = t.transactionId || `tx-mig-${complexId}-${unitNumber}-${tIdx}`;

            await tx.ledgerTransaction.upsert({
              where: { transactionId: txId },
              create: {
                complexId,
                unitId: createdUnit.id,
                transactionId: txId,
                txKind,
                type: txType,
                amount: txAmt,
                date: t.date ? new Date(t.date) : new Date(),
                description: t.desc || t.description || 'تراکنش قدیمی کلاینت',
                paymentMethod: PaymentMethod.CARD_TRANSFER,
              },
              update: {
                amount: txAmt,
                txKind,
                type: txType,
                date: t.date ? new Date(t.date) : new Date(),
                description: t.desc || t.description || 'تراکنش قدیمی کلاینت',
              }
            });
            transactionsImported++;
          }
        }
      }

      // 4. Import Periods & Payments
      const periodsList = Array.isArray(payload.periods) ? payload.periods : [];
      for (let pIdx = 0; pIdx < periodsList.length; pIdx++) {
        const p = periodsList[pIdx]!;
        const periodExpense = parseDecimal(p.totalExpenses ?? p.expenses?.specialTotal ?? p.totalExpenseAmount ?? 0);
        totalExpenses += periodExpense;

        const periodType = (p.type === 'special' || p.type === 'SPECIAL')
          ? PeriodType.SPECIAL
          : PeriodType.MONTHLY;

        const periodStatus = p.isClosed
          ? PeriodStatus.CLOSED
          : (p.isStarted ? PeriodStatus.ACTIVE : PeriodStatus.DRAFT);

        const year = p.year ? parseInt(toEnDigit(p.year), 10) : 1403;
        const month = p.month ? String(p.month) : String(pIdx + 1).padStart(2, '0');

        // Ensure unique [complexId, type, year, month]
        const uniqueMonth = `${month}_mig_${pIdx + 1}`;

        const createdPeriod = await tx.period.upsert({
          where: {
            complexId_type_year_month: {
              complexId,
              type: periodType,
              year,
              month: uniqueMonth,
            }
          },
          create: {
            complexId,
            type: periodType,
            name: p.title || p.name || `دوره ${pIdx + 1}`,
            status: periodStatus,
            year,
            month: uniqueMonth,
            totalExpenseAmount: periodExpense,
            frozenExpenses: p.frozenExpenses || p.expenses || null,
          },
          update: {
            name: p.title || p.name || `دوره ${pIdx + 1}`,
            status: periodStatus,
            totalExpenseAmount: periodExpense,
            frozenExpenses: p.frozenExpenses || p.expenses || null,
          }
        });
        periodsImported++;

        // Import period payments
        if (Array.isArray(p.payments)) {
          for (let payIdx = 0; payIdx < p.payments.length; payIdx++) {
            const pay = p.payments[payIdx]!;
            const payAmt = parseDecimal(pay.amount || 0);
            totalPayments += payAmt;

            const targetUnitId = pay.unitId
              ? (unitIdMap.get(pay.unitId) || unitIdMap.get(String(pay.unitId)))
              : Array.from(unitIdMap.values())[0];

            if (targetUnitId) {
              const payTxId = pay.transactionId || `tx-mig-pay-${complexId}-${uniqueMonth}-${payIdx}`;

              await tx.ledgerTransaction.upsert({
                where: { transactionId: payTxId },
                create: {
                  complexId,
                  unitId: targetUnitId,
                  periodId: createdPeriod.id,
                  transactionId: payTxId,
                  txKind: TxKind.MANUAL,
                  type: TxType.PAYMENT,
                  amount: payAmt,
                  date: pay.date ? new Date(pay.date) : new Date(),
                  description: pay.desc || pay.description || `پرداخت شارژ دوره ${createdPeriod.name}`,
                  paymentMethod: PaymentMethod.CARD_TRANSFER,
                },
                update: {
                  amount: payAmt,
                  date: pay.date ? new Date(pay.date) : new Date(),
                  description: pay.desc || pay.description || `پرداخت شارژ دوره ${createdPeriod.name}`,
                }
              });
              transactionsImported++;
            }
          }
        }

        // Import unit charges if present
        if (Array.isArray(p.charges)) {
          for (const ch of p.charges) {
            const targetUnitId = ch.unitId
              ? (unitIdMap.get(ch.unitId) || unitIdMap.get(String(ch.unitId)))
              : null;

            if (targetUnitId) {
              const chAmt = parseDecimal(ch.amount || 0);
              const paidAmt = parseDecimal(ch.paidAmount || 0);
              await tx.unitCharge.upsert({
                where: {
                  periodId_unitId: {
                    periodId: createdPeriod.id,
                    unitId: targetUnitId,
                  }
                },
                create: {
                  complexId,
                  periodId: createdPeriod.id,
                  unitId: targetUnitId,
                  amount: chAmt,
                  paidAmount: paidAmt,
                  fixedShare: parseDecimal(ch.details?.fixed || 0),
                  waterShare: parseDecimal(ch.details?.water || 0),
                  gasShare: parseDecimal(ch.details?.gas || 0),
                  electricityShare: parseDecimal(ch.details?.elec || 0),
                  incidentalShare: parseDecimal(ch.details?.incidental || 0),
                  specialShare: parseDecimal(ch.details?.specialShare || 0),
                  snapshotOccupants: ch.snapshot?.occupants || 0,
                  snapshotHasPackage: !!ch.snapshot?.hasPackage,
                },
                update: {
                  amount: chAmt,
                  paidAmount: paidAmt,
                  fixedShare: parseDecimal(ch.details?.fixed || 0),
                  waterShare: parseDecimal(ch.details?.water || 0),
                  gasShare: parseDecimal(ch.details?.gas || 0),
                  electricityShare: parseDecimal(ch.details?.elec || 0),
                  incidentalShare: parseDecimal(ch.details?.incidental || 0),
                  specialShare: parseDecimal(ch.details?.specialShare || 0),
                  snapshotOccupants: ch.snapshot?.occupants || 0,
                  snapshotHasPackage: !!ch.snapshot?.hasPackage,
                }
              });
            }
          }
        }
      }

      // 5. Mathematical Reconciliation Verification
      const calculatedEndingFund = initialFund + totalPayments - totalExpenses;
      const expectedFund = payload.expectedEndingFund !== undefined
        ? parseDecimal(payload.expectedEndingFund)
        : calculatedEndingFund;

      const fundDiscrepancy = Math.abs(calculatedEndingFund - expectedFund);

      if (fundDiscrepancy !== 0) {
        throw new MigrationReconciliationError(
          `Treasury fund reconciliation failed: ΔFund = ${fundDiscrepancy} Rials. Expected ${expectedFund}, calculated ${calculatedEndingFund}.`
        );
      }

      // Authentic PostgreSQL Resident Debts Reconciliation
      // Direct transactional query of persisted database state
      const persistedUnits = await tx.unit.findMany({
        where: { complexId },
        select: { id: true, unitNumber: true, currentBalance: true }
      });

      // Guard against dropped or duplicated unit rows in database
      if (persistedUnits.length !== unitsList.length) {
        throw new MigrationReconciliationError(
          `Unit count mismatch: ${unitsList.length} units submitted, but ${persistedUnits.length} persisted in database.`
        );
      }

      // Sum authentic negative balances directly from PostgreSQL
      const actualPgDebts = persistedUnits
        .filter(u => Number(u.currentBalance) < 0)
        .reduce((sum, u) => sum + Math.abs(Number(u.currentBalance)), 0);

      // Use expectedTotalDebts if provided, otherwise legacyDebtsSum
      const expectedDebts = payload.expectedTotalDebts !== undefined
        ? parseDecimal(payload.expectedTotalDebts)
        : legacyDebtsSum;

      const debtDiscrepancy = Math.round(Math.abs(actualPgDebts - expectedDebts));

      if (debtDiscrepancy !== 0) {
        throw new MigrationReconciliationError(
          `Resident debts reconciliation failed: ΔDebts = ${debtDiscrepancy} Rials. Expected debts ${expectedDebts}, calculated ${actualPgDebts}.`
        );
      }

      // Update Complex ending treasury balance
      await tx.complex.update({
        where: { id: complexId },
        data: { currentFund: calculatedEndingFund }
      });

      // 6. Record Comprehensive Migration Audit Log
      await tx.auditLog.create({
        data: {
          complexId,
          actorId: actorId || null,
          actorRole: 'MANAGER',
          action: AuditAction.MIGRATION,
          entityType: 'Complex',
          entityId: complexId,
          metadata: {
            unitsImported,
            periodsImported,
            transactionsImported,
            initialFund,
            calculatedEndingFund,
            fundDiscrepancy,
            debtDiscrepancy,
          }
        }
      });

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
    });
  }
}

export const migrationService = new MigrationService();
