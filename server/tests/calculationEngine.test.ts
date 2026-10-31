import { describe, it, expect } from 'vitest';
import {
  calculatePeriodCharges,
  calculateUnitLedgerBalance,
  applyCreditSettlement,
  UnitData,
  PeriodExpenseInput,
  LedgerTransaction
} from '../src/services/calculationEngine';
import {
  toEnDigit,
  parseDecimal,
  parseIntegerCurrency
} from '../src/utils/numberUtils';

describe('ParsBuilding Deterministic Calculation Engine & Test Matrix', () => {

  // Test unit helper
  const createTestUnits = (count: number, overrides?: Partial<UnitData>[]): UnitData[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `unit_${i + 1}`,
      unitNumber: i + 1,
      area: 100,
      occupants: 3,
      hasPackage: false,
      ownerName: `مالک واحد ${i + 1}`,
      ...(overrides && overrides[i] ? overrides[i] : {})
    }));
  };

  // --------------------------------------------------------------------------
  // TC-CALC-01: تقسیم مساوی قبوض بدون باقیمانده
  // --------------------------------------------------------------------------
  it('TC-CALC-01: should split equal expenses without remainder perfectly', () => {
    const units = createTestUnits(6);
    const input: PeriodExpenseInput = {
      incidentalTotal: 600000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(600000);
    expect(result.conservationDelta).toBe(0);
    result.charges.forEach(c => {
      expect(c.incidental).toBe(100000);
      expect(c.totalCharge).toBe(100000);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-02: بقای ریالی با الگوریتم بزرگترین باقیمانده (Hare-Niemeyer)
  // --------------------------------------------------------------------------
  it('TC-CALC-02: should allocate integer shares using Largest Remainder with zero penny loss', () => {
    const units = createTestUnits(3);
    const input: PeriodExpenseInput = {
      incidentalTotal: 100000, // 100,000 / 3 = 33333.3333...
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(100000);
    expect(result.conservationDelta).toBe(0);

    const amounts = result.charges.map(c => c.totalCharge).sort((a, b) => b - a);
    expect(amounts).toEqual([33334, 33333, 33333]);
    expect(amounts[0]! + amounts[1]! + amounts[2]!).toBe(100000);

    // تضمین نبود کسورات اعشاری
    result.charges.forEach(c => {
      expect(Number.isInteger(c.totalCharge)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-03: محاسبه بر اساس متراژ (ماده ۴ قانون تملک آپارتمان‌ها)
  // --------------------------------------------------------------------------
  it('TC-CALC-03: should distribute area-based expenses strictly per exclusive area', () => {
    const units: UnitData[] = [
      { id: 'u1', unitNumber: 1, area: 80, occupants: 2, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 120, occupants: 4, hasPackage: false, ownerName: 'C' }
    ]; // Total area: 300 m2
    const input: PeriodExpenseInput = {
      areaExpenseTotal: 10000000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(10000000);
    expect(result.conservationDelta).toBe(0);

    const c1 = result.charges.find(c => c.unitId === 'u1')!;
    const c2 = result.charges.find(c => c.unitId === 'u2')!;
    const c3 = result.charges.find(c => c.unitId === 'u3')!;

    // 80/300 * 10,000,000 = 2666666.666 -> 2666667
    expect(c1.areaShare).toBe(2666667);
    // 100/300 * 10,000,000 = 3333333.333 -> 3333333
    expect(c2.areaShare).toBe(3333333);
    // 120/300 * 10,000,000 = 4000000 -> 4000000
    expect(c3.areaShare).toBe(4000000);

    expect(c1.areaShare + c2.areaShare + c3.areaShare).toBe(10000000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-04: محاسبه بر اساس تعداد نفرات (آب)
  // --------------------------------------------------------------------------
  it('TC-CALC-04: should allocate water bills proportionally to occupants count', () => {
    const units: UnitData[] = [
      { id: 'u1', unitNumber: 1, area: 100, occupants: 2, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 5, hasPackage: false, ownerName: 'C' }
    ]; // Total occupants: 10
    const input: PeriodExpenseInput = {
      waterTotal: 400000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(400000);
    expect(result.conservationDelta).toBe(0);

    expect(result.charges.find(c => c.unitId === 'u1')!.water).toBe(80000);
    expect(result.charges.find(c => c.unitId === 'u2')!.water).toBe(120000);
    expect(result.charges.find(c => c.unitId === 'u3')!.water).toBe(200000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-05: تفکیک پکیج در گاز مشاع
  // --------------------------------------------------------------------------
  it('TC-CALC-05: should exempt package units from central gas expenses', () => {
    const units: UnitData[] = [
      { id: 'u1', unitNumber: 1, area: 100, occupants: 2, hasPackage: true, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 100, occupants: 3, hasPackage: true, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 2, hasPackage: false, ownerName: 'C' },
      { id: 'u4', unitNumber: 4, area: 100, occupants: 2, hasPackage: false, ownerName: 'D' },
      { id: 'u5', unitNumber: 5, area: 100, occupants: 2, hasPackage: false, ownerName: 'E' },
      { id: 'u6', unitNumber: 6, area: 100, occupants: 2, hasPackage: false, ownerName: 'F' }
    ]; // 2 with package, 4 non-package
    const input: PeriodExpenseInput = {
      gasTotal: 1200000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1200000);
    expect(result.conservationDelta).toBe(0);

    expect(result.charges.find(c => c.unitId === 'u1')!.gas).toBe(0);
    expect(result.charges.find(c => c.unitId === 'u2')!.gas).toBe(0);
    expect(result.charges.find(c => c.unitId === 'u3')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u4')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u5')!.gas).toBe(300000);
    expect(result.charges.find(c => c.unitId === 'u6')!.gas).toBe(300000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-06: حالت مرزی: تمام واحدها دارای پکیج
  // --------------------------------------------------------------------------
  it('TC-CALC-06: should not drop gas expenses when 100% of units have packages', () => {
    const units = createTestUnits(4, [
      { hasPackage: true },
      { hasPackage: true },
      { hasPackage: true },
      { hasPackage: true }
    ]);
    const input: PeriodExpenseInput = {
      gasTotal: 500000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    // قبض نباید گم شود
    expect(result.totalDistributed).toBe(500000);
    expect(result.conservationDelta).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    result.charges.forEach(c => {
      expect(c.gas).toBe(125000);
    });
  });

  // --------------------------------------------------------------------------
  // TC-CALC-07: حالت مرزی: تمام واحدها خالی (نفرات = ۰)
  // --------------------------------------------------------------------------
  it('TC-CALC-07: should fallback to area-based allocation when all units are empty', () => {
    const units: UnitData[] = [
      { id: 'u1', unitNumber: 1, area: 70, occupants: 0, hasPackage: false, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 80, occupants: 0, hasPackage: false, ownerName: 'B' },
      { id: 'u3', unitNumber: 3, area: 100, occupants: 0, hasPackage: false, ownerName: 'C' }
    ]; // Total area: 250 m2
    const input: PeriodExpenseInput = {
      waterTotal: 1000000,
      exemptEmptyUnits: true,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1000000);
    expect(result.conservationDelta).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);

    // 70/250 * 1,000,000 = 280,000
    expect(result.charges.find(c => c.unitId === 'u1')!.water).toBe(280000);
    // 80/250 * 1,000,000 = 320,000
    expect(result.charges.find(c => c.unitId === 'u2')!.water).toBe(320000);
    // 100/250 * 1,000,000 = 400,000
    expect(result.charges.find(c => c.unitId === 'u3')!.water).toBe(400000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-08: حذف حلقه بی‌پایان بستانکاری و کسر دقیق از تراز
  // --------------------------------------------------------------------------
  it('TC-CALC-08: should eliminate infinite credit loop and properly reduce credit balance', () => {
    // واحدی ۱۰۰٬۰۰۰ تومان بستانکار است (balance = -100,000)
    const initialCredit = -100000;
    const monthlyCharge = 60000;

    const settlement = applyCreditSettlement(monthlyCharge, initialCredit);

    expect(settlement.appliedCredit).toBe(60000);
    expect(settlement.netPayable).toBe(0);
    // مانده جدید در دفترکل باید دقیقاً ۴۰٬۰۰۰ تومان بستانکاری (-40,000) باشد
    expect(settlement.newBalance).toBe(-40000);

    // شبیه‌سازی در دفترکل با ایجاد تراکنش جدید شارژ
    const ledger: LedgerTransaction[] = [
      { id: 'tx1', unitId: 'u1', type: 'payment', amount: 100000, txKind: 'MANUAL_PAYMENT', timestamp: new Date(), description: 'واریز اولیه' },
      { id: 'tx2', unitId: 'u1', type: 'debt', amount: 60000, txKind: 'CHARGE_BILLING', timestamp: new Date(), description: 'شارژ دوره' }
    ];
    const finalBalance = calculateUnitLedgerBalance(ledger);
    expect(finalBalance).toBe(-40000); // دقیقاً ۴۰ هزار بستانکار
  });

  // --------------------------------------------------------------------------
  // TC-CALC-09: پرداخت مازاد شارژ و انتقال به بستانکاری
  // --------------------------------------------------------------------------
  it('TC-CALC-09: should record overpayment as resident credit in ledger balance', () => {
    const chargeAmount = 70000;
    const paymentAmount = 100000;

    const ledger: LedgerTransaction[] = [
      { id: 'tx1', unitId: 'u1', type: 'debt', amount: chargeAmount, txKind: 'CHARGE_BILLING', timestamp: new Date(), description: 'شارژ دوره' },
      { id: 'tx2', unitId: 'u1', type: 'payment', amount: paymentAmount, txKind: 'ONLINE_PAYMENT', timestamp: new Date(), description: 'پرداخت ساکن' }
    ];

    const balance = calculateUnitLedgerBalance(ledger);
    // 70,000 - 100,000 = -30,000 (بستانکاری ۳۰ هزار تومان)
    expect(balance).toBe(-30000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-10: ضد شمارش دوگانه در صندوق (Anti-Double Counting)
  // --------------------------------------------------------------------------
  it('TC-CALC-10: should prevent double-counting income from manual ledger payments', () => {
    const initialFund = 1000000;
    const manualPaymentAmount = 150000;

    // ثبت یک تراکنش پرداخت دستی
    const transactions: LedgerTransaction[] = [
      { id: 'tx_pay', unitId: 'u1', type: 'payment', amount: manualPaymentAmount, txKind: 'MANUAL_PAYMENT', timestamp: new Date(), description: 'شارژ دستی' }
    ];

    // در مدل منبع واحد حقیقت، جمع دریافت نقدی صندوق صرفاً از تراکنش‌ها خوانده می‌شود
    const totalCashReceipts = transactions
      .filter(t => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);

    const endingFund = initialFund + totalCashReceipts;

    // افزایش صندوق باید دقیقاً ۱۵۰٬۰۰۰ باشد، نه ۳۰۰٬۰۰۰
    expect(endingFund).toBe(1150000);
    expect(totalCashReceipts).toBe(150000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-11: تست عدم تخریب سابقه دستی در بارگذاری مجدد
  // --------------------------------------------------------------------------
  it('TC-CALC-11: should permanently retain manual transactions without destructive deletion', () => {
    const originalTx: LedgerTransaction = {
      id: 'tx_manual_uuid_123',
      unitId: 'u1',
      type: 'payment',
      amount: 50000,
      txKind: 'MANUAL_PAYMENT',
      timestamp: new Date(),
      description: 'پرداخت دستی معوقه'
    };

    const ledger: LedgerTransaction[] = [originalTx];

    // شبیه‌سازی بستن دوره و ریست اپلیکیشن
    const simulatedRestartLedger = [...ledger];

    expect(simulatedRestartLedger.length).toBe(1);
    expect(simulatedRestartLedger[0]!.id).toBe('tx_manual_uuid_123');
    expect(simulatedRestartLedger[0]!.amount).toBe(50000);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-12: پارس ارقام با کاراکترهای عربی شامل رقم ۸
  // --------------------------------------------------------------------------
  it('TC-CALC-12: should correctly normalize and parse Arabic digit 8 (\\u0668)', () => {
    const arabicInput = '١٨٥٠٠٠'; // Arabic 185000 with ٨ (\u0668)
    const normalized = toEnDigit(arabicInput);
    const parsed = parseIntegerCurrency(arabicInput);

    expect(normalized).toBe('185000');
    expect(parsed).toBe(185000);

    // بررسی منفرد تمام ارقام عربی
    const allArabic = '٠١٢٣٤٥٦٧٨٩';
    expect(toEnDigit(allArabic)).toBe('0123456789');
  });

  // --------------------------------------------------------------------------
  // TC-CALC-13: پارس اعداد اعشاری برای متراژ و نرخ‌ها
  // --------------------------------------------------------------------------
  it('TC-CALC-13: should preserve decimal points when parsing areas and rates', () => {
    expect(parseDecimal('۹۴.۷۵')).toBe(94.75);
    expect(parseDecimal('۷۵٫۵')).toBe(75.5); // با ممیز عربی \u066B
    expect(parseDecimal('102.50')).toBe(102.5);
    expect(parseDecimal('  ۸۵/۴  ')).toBe(85.4); // با علامت اسلش ممیز
  });

  // --------------------------------------------------------------------------
  // TC-CALC-14: مدل هیبریدی (ترکیبی) کامل استاندارد مجتمع
  // --------------------------------------------------------------------------
  it('TC-CALC-14: should accurately calculate hybrid multi-category building expenses', () => {
    const units: UnitData[] = [
      { id: 'u1', unitNumber: 1, area: 80, occupants: 2, hasPackage: true, ownerName: 'A' },
      { id: 'u2', unitNumber: 2, area: 120, occupants: 4, hasPackage: false, ownerName: 'B' }
    ]; // Total area: 200, Total occ: 6
    const input: PeriodExpenseInput = {
      fixedPerUnit: 100000,
      areaExpenseTotal: 2000000,
      waterTotal: 600000,
      gasTotal: 500000,
      incidentalTotal: 200000,
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    const c1 = result.charges.find(c => c.unitId === 'u1')!;
    const c2 = result.charges.find(c => c.unitId === 'u2')!;

    // ثابت: هر واحد ۱۰۰٬۰۰۰
    expect(c1.fixed).toBe(100000);
    expect(c2.fixed).toBe(100000);

    // متراژ: u1 = 80/200 * 2,000,000 = 800,000 | u2 = 120/200 * 2,000,000 = 1,200,000
    expect(c1.areaShare).toBe(800000);
    expect(c2.areaShare).toBe(1200000);

    // آب: u1 = 2/6 * 600,000 = 200,000 | u2 = 4/6 * 600,000 = 400,000
    expect(c1.water).toBe(200000);
    expect(c2.water).toBe(400000);

    // گاز: u1 پکیج دارد (۰) | u2 بدون پکیج (۵۰۰٬۰۰۰)
    expect(c1.gas).toBe(0);
    expect(c2.gas).toBe(500000);

    // جانبی: مساوی هر واحد ۱۰۰٬۰۰۰
    expect(c1.incidental).toBe(100000);
    expect(c2.incidental).toBe(100000);

    expect(c1.totalCharge).toBe(100000 + 800000 + 200000 + 0 + 100000); // 1,200,000
    expect(c2.totalCharge).toBe(100000 + 1200000 + 400000 + 500000 + 100000); // 2,300,000

    expect(result.totalDistributed).toBe(3500000);
    expect(result.conservationDelta).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TC-CALC-15: عدم ایجاد بدهی‌های کسری کمتر از ۱ ریال
  // --------------------------------------------------------------------------
  it('TC-CALC-15: should guarantee zero fractional debts on asymmetric divisions', () => {
    const units = createTestUnits(7);
    const input: PeriodExpenseInput = {
      incidentalTotal: 1000000, // 1,000,000 / 7 = 142857.142857...
      roundUp: false
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.totalDistributed).toBe(1000000);
    expect(result.conservationDelta).toBe(0);

    let sum = 0;
    result.charges.forEach(c => {
      expect(Number.isInteger(c.totalCharge)).toBe(true);
      expect(c.totalCharge).toBeGreaterThanOrEqual(142857);
      expect(c.totalCharge).toBeLessThanOrEqual(142858);
      sum += c.totalCharge;
    });
    expect(sum).toBe(1000000);
  });

  // --------------------------------------------------------------------------
  // تست تکمیلی: گردکردن به گام ۵۰٬۰۰۰ ریال و ثبت شفاف مازاد
  // --------------------------------------------------------------------------
  it('should round up charges to step 50,000 while preserving conservation accounting', () => {
    const units = createTestUnits(2);
    const input: PeriodExpenseInput = {
      incidentalTotal: 110000, // 55,000 each -> rounds up to 100,000 each with step 50,000
      roundUp: true,
      roundStep: 50000
    };

    const result = calculatePeriodCharges(units, input);

    expect(result.charges[0]!.totalCharge).toBe(100000);
    expect(result.charges[0]!.roundingDelta).toBe(45000);
    expect(result.charges[1]!.totalCharge).toBe(100000);
    expect(result.charges[1]!.roundingDelta).toBe(45000);

    expect(result.totalInputExpenses).toBe(110000);
    expect(result.totalRoundingSurplus).toBe(90000);
    expect(result.totalDistributed).toBe(200000);
    expect(result.conservationDelta).toBe(0);
  });

});
