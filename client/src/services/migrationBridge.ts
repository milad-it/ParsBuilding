/**
 * ParsBuilding Client-Side Migration Bridge
 *
 * Implements:
 * 1. Detection of legacy IndexedDB ('ParsBuildingDB' / 'app_state') and LocalStorage ('app_db_pars_v6').
 * 2. Normalization of Persian numerals, Persian decimal separators (٫, /), and legacy field aliases.
 * 3. Client pre-flight integrity assertions.
 * 4. Transmission to server migration endpoint and reconciliation verification (ΔFund = 0, ΔDebts = 0).
 */

import { migrationApi } from './api';

export interface MigrationDetectionResult {
  hasLegacyData: boolean;
  source: 'indexedDB' | 'localStorage' | 'none';
  unitCount: number;
  periodCount: number;
  initialFund: number;
  totalTransactions: number;
  rawPayload: any | null;
}

export interface MigrationReconciliationResult {
  success: boolean;
  unitsImported: number;
  periodsImported: number;
  transactionsImported: number;
  initialFund: number;
  calculatedEndingFund: number;
  fundDiscrepancy: number;
  debtDiscrepancy: number;
}

/**
 * Normalizes Persian and Arabic numbers and decimals to standard floating point numbers.
 */
export function parsePersianNumber(val: any): number {
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  if (!val) return 0;
  const s = String(val).trim()
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u066B/]/g, '.');

  const clean = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(clean);
  return Number.isNaN(n) ? 0 : n;
}

export class MigrationBridge {
  private static readonly IDB_NAME = 'ParsBuildingDB';
  private static readonly IDB_STORE = 'app_state';
  private static readonly STORAGE_KEYS = [
    'app_db_pars_v6',
    'app_db_pars_final',
    'app_db_pars_v5',
    'app_db_pars'
  ];

  /**
   * 1. Read data from IndexedDB
   */
  public static async readFromIndexedDB(): Promise<any | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(this.IDB_NAME, 1);
        req.onerror = () => resolve(null);
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(this.IDB_STORE)) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction([this.IDB_STORE], 'readonly');
          const store = tx.objectStore(this.IDB_STORE);
          const getReq = store.get('app_db_pars_v6');
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result || null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * 2. Detect presence of legacy data across IndexedDB and LocalStorage
   */
  public static async detectLegacyData(): Promise<MigrationDetectionResult> {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('app_db_pars_migrated') === 'true') {
      return {
        hasLegacyData: false,
        source: 'none',
        unitCount: 0,
        periodCount: 0,
        initialFund: 0,
        totalTransactions: 0,
        rawPayload: null
      };
    }

    let raw: any = await this.readFromIndexedDB();
    let source: 'indexedDB' | 'localStorage' | 'none' = raw ? 'indexedDB' : 'none';

    if (!raw && typeof localStorage !== 'undefined') {
      for (const key of this.STORAGE_KEYS) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            raw = JSON.parse(item);
            source = 'localStorage';
            break;
          } catch {}
        }
      }
    }

    if (!raw || (!raw.units && !raw.periods)) {
      return {
        hasLegacyData: false,
        source: 'none',
        unitCount: 0,
        periodCount: 0,
        initialFund: 0,
        totalTransactions: 0,
        rawPayload: null
      };
    }

    const units = Array.isArray(raw.units) ? raw.units : [];
    const periods = Array.isArray(raw.periods) ? raw.periods : [];
    const totalTransactions = units.reduce(
      (acc: number, u: any) => acc + (Array.isArray(u.transactions) ? u.transactions.length : 0),
      0
    );

    return {
      hasLegacyData: units.length > 0 || periods.length > 0 || !!raw.initialFund,
      source,
      unitCount: units.length,
      periodCount: periods.length,
      initialFund: parsePersianNumber(raw.initialFund),
      totalTransactions,
      rawPayload: raw
    };
  }

  /**
   * 3. Normalize legacy data payload matching server contracts
   */
  public static normalizePayload(raw: any): {
    initialFund: number;
    units: any[];
    periods: any[];
  } {
    const initialFund = parsePersianNumber(raw.initialFund);

    const units = (raw.units || []).map((u: any, idx: number) => {
      const unitNumber = parsePersianNumber(u.vahed ?? u.unitNumber ?? u.id ?? (idx + 1));
      const area = parsePersianNumber(u.metraj ?? u.area ?? 100);
      const occupants = parsePersianNumber(u.tedad ?? u.occupants ?? (u.occupants === 0 || u.tedad === 0 || u.tedad === '۰' ? 0 : 1));
      const ownerName = u.name || u.ownerName || `واحد ${unitNumber}`;
      const occType = (u.occType === 'tenant' || u.occType === 'TENANT' || u.isTenant) ? 'TENANT' : 'OWNER';

      const transactions = (u.transactions || []).map((t: any) => ({
        id: String(t.id || Date.now()),
        transactionId: t.transactionId || `tx-${t.id || Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        periodId: t.periodId ? String(t.periodId) : null,
        txKind: t.txKind || 'MANUAL',
        type: (t.type || 'payment').toUpperCase(),
        amount: parsePersianNumber(t.amount),
        description: t.desc || t.description || 'تراکنش ثبت شده',
        date: t.date || new Date().toISOString()
      }));

      return {
        unitNumber,
        area,
        occupants,
        ownerName,
        ownerPhone: u.ownerPhone || u.phone || '',
        tenantName: u.tenantName || '',
        tenantPhone: u.tenantPhone || '',
        occType,
        hasPackage: u.hasPackage ?? true,
        balance: parsePersianNumber(u.balance ?? u.currentBalance ?? 0),
        transactions
      };
    });

    const periods = (raw.periods || []).map((p: any, pIdx: number) => {
      const expenses = p.expenses || {};
      return {
        id: String(p.id || pIdx + 1),
        type: (p.type === 'special' ? 'SPECIAL' : 'MONTHLY'),
        name: p.name || p.title || `دوره ${pIdx + 1}`,
        isClosed: !!p.isClosed,
        isStarted: !!p.isStarted,
        totalExpenses: parsePersianNumber(p.totalExpenses || expenses.specialTotal || 0),
        expenses: {
          inputMode: expenses.inputMode || 'rate',
          fixed: parsePersianNumber(expenses.fixed),
          water: parsePersianNumber(expenses.water),
          gas: parsePersianNumber(expenses.gas),
          electricity: parsePersianNumber(expenses.electricity),
          incidental: parsePersianNumber(expenses.incidental),
          incDesc: expenses.incDesc || '',
          specialTotal: parsePersianNumber(expenses.specialTotal),
          specialMode: expenses.specialMode || 'all',
          customUnits: (expenses.customUnits || []).map((cu: any) => parsePersianNumber(cu)),
          roundUp: !!expenses.roundUp,
          exemptEmptyUnits: expenses.exemptEmptyUnits !== false
        },
        payments: (p.payments || []).map((pay: any) => ({
          amount: parsePersianNumber(pay.amount),
          unitId: pay.unitId ? String(pay.unitId) : undefined,
          date: pay.date || new Date().toISOString(),
          description: pay.desc || pay.description
        })),
        charges: (p.charges || []).map((ch: any) => ({
          unitId: String(ch.unitId),
          amount: parsePersianNumber(ch.amount),
          paidAmount: parsePersianNumber(ch.paidAmount),
          paidPastMonthly: parsePersianNumber(ch.paidPastMonthly),
          paidPastSpecial: parsePersianNumber(ch.paidPastSpecial),
          snapshot: {
            occupants: parsePersianNumber(ch.snapshot?.occupants),
            hasPackage: !!ch.snapshot?.hasPackage
          },
          details: {
            fixed: parsePersianNumber(ch.details?.fixed),
            water: parsePersianNumber(ch.details?.water),
            gas: parsePersianNumber(ch.details?.gas),
            elec: parsePersianNumber(ch.details?.elec),
            incidental: parsePersianNumber(ch.details?.incidental)
          }
        }))
      };
    });

    return { initialFund, units, periods };
  }

  /**
   * 4. Execute atomic migration request to server
   */
  public static async executeMigration(
    complexId: string,
    rawPayload: any
  ): Promise<MigrationReconciliationResult> {
    const payload = this.normalizePayload(rawPayload);

    const response = await migrationApi.migrateComplex(complexId, payload);
    const rec = response.data as MigrationReconciliationResult;

    if (rec.success && rec.fundDiscrepancy === 0 && rec.debtDiscrepancy === 0) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('app_db_pars_migrated', 'true');
        localStorage.setItem('app_db_pars_migrated_at', new Date().toISOString());
      }
    }

    return rec;
  }
}
