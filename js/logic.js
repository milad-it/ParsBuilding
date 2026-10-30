// --- Core Financial & Period Logic ---

const CHARGE_ROUND_STEP = 50000;

function periodOrderKey(periodId) {
    const pid = Number(periodId);
    return Number.isNaN(pid) ? 0 : pid;
}

function comparePeriodOrder(aId, bId) {
    const ka = periodOrderKey(aId);
    const kb = periodOrderKey(bId);
    if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
    return String(ka).localeCompare(String(kb), 'fa');
}

/** کلید مرتب‌سازی — دستی: زمان ثبت (id)؛ دوره: شناسه دوره + جزء (sub) */
function financialEventSortKey(e) {
    if (e.timeKey != null && !Number.isNaN(e.timeKey)) return e.timeKey;
    const p = typeof e.pSort === 'number' ? e.pSort : 0;
    return p + (e.sub || 0) / 1000;
}

function compareFinancialEvents(a, b, newestFirst) {
    const diff = financialEventSortKey(a) - financialEventSortKey(b);
    return newestFirst ? -diff : diff;
}

/** دوره‌های قبل از دورهٔ جاری؛ excludePId=null یا __none__ = همهٔ دوره‌های شروع‌شده */
function getPriorStartedPeriods(excludePId) {
    const includeAll = excludePId == null || excludePId === '__none__';
    return db.periods
        .filter(p => p.isStarted)
        .filter(p => includeAll || !sameId(p.id, excludePId))
        .filter(p => includeAll || comparePeriodOrder(p.id, excludePId) < 0)
        .sort((a, b) => comparePeriodOrder(a.id, b.id));
}

function getOpenStartedPeriods() {
    return db.periods.filter(p => p.isStarted && !p.isClosed);
}

function getStartedPeriodsSorted() {
    return db.periods
        .filter(p => p.isStarted)
        .sort((a, b) => comparePeriodOrder(a.id, b.id));
}

/** نوع ثبت دفترچه — مستقل از متن شرح (پایدار برای Undo/Restore/گزارش) */
const TX_KIND = {
    MANUAL: 'manual',
    CHARGE_TRANSFER: 'charge_transfer',
    CREDIT_APPLY: 'credit_apply',
    PAST_MONTHLY_PAY: 'past_monthly_pay',
    PAST_SPECIAL_PAY: 'past_special_pay',
    OVERPAY_CREDIT: 'overpay_credit',
    CREDIT_PAST_M: 'credit_past_m',
    CREDIT_PAST_S: 'credit_past_s',
    LEGACY_AUTO: 'legacy_auto'
};

const SYSTEM_TX_KINDS = new Set([
    TX_KIND.CHARGE_TRANSFER, TX_KIND.CREDIT_APPLY, TX_KIND.PAST_MONTHLY_PAY,
    TX_KIND.PAST_SPECIAL_PAY, TX_KIND.OVERPAY_CREDIT, TX_KIND.CREDIT_PAST_M,
    TX_KIND.CREDIT_PAST_S, TX_KIND.LEGACY_AUTO
]);

const TICK_MIRROR_TX_KINDS = new Set([
    TX_KIND.PAST_MONTHLY_PAY, TX_KIND.PAST_SPECIAL_PAY, TX_KIND.CREDIT_APPLY
]);

function inferTxKindFromDesc(desc) {
    const d = stripPeriodLedgerTag(desc || '');
    if (d.startsWith('انتقال مانده شارژ از دوره')) return TX_KIND.CHARGE_TRANSFER;
    if (d.startsWith('استفاده از بستانکاری در فاکتور')) return TX_KIND.CREDIT_APPLY;
    if (d.startsWith('تسویه بدهی پیشین در فاکتور')) return TX_KIND.PAST_MONTHLY_PAY;
    if (d.startsWith('تسویه موارد اضطراری در فاکتور')) return TX_KIND.PAST_SPECIAL_PAY;
    if (d.startsWith('بستانکاری شارژ از دوره')) return TX_KIND.OVERPAY_CREDIT;
    if (d.startsWith('استفاده از بستانکاری بدهی پیشین')) return TX_KIND.CREDIT_PAST_M;
    if (d.startsWith('استفاده از بستانکاری اضطراری')) return TX_KIND.CREDIT_PAST_S;
    if (d.startsWith('مانده بدهی پیشین از دوره')
        || d.startsWith('مانده هزینه اضطراری از دوره')
        || d.startsWith('بستانکاری بدهی پیشین از دوره')
        || d.startsWith('بستانکاری هزینه اضطراری از دوره')
        || d.startsWith('استفاده از بستانکاری')) return TX_KIND.LEGACY_AUTO;
    return TX_KIND.MANUAL;
}

function getTxKind(t) {
    const inferred = inferTxKindFromDesc(t?.desc || '');
    if (SYSTEM_TX_KINDS.has(inferred) || TICK_MIRROR_TX_KINDS.has(inferred)) return inferred;
    if (t?.txKind) return t.txKind;
    return inferred;
}

function getTransactionPeriodId(t) {
    if (t?.periodId != null && t.periodId !== '') return String(t.periodId);
    return periodIdFromLedgerDesc(t?.desc || '');
}

function isAutoPeriodLedgerEntry(t) {
    return SYSTEM_TX_KINDS.has(getTxKind(t));
}

function isPeriodTickMirrorLedgerEntry(t) {
    return TICK_MIRROR_TX_KINDS.has(getTxKind(t));
}

function nextTransactionId() {
    return 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

function periodLedgerTag(periodId) {
    return ` ·#${periodId}`;
}

function stripPeriodLedgerTag(desc) {
    return (desc || '').replace(/\s·#[^·\s]+$/, '');
}

function periodIdFromLedgerDesc(desc) {
    const m = (desc || '').match(/·#(.+)$/);
    return m ? String(m[1]).trim() : null;
}

function periodNameFromLedgerDesc(desc) {
    const bare = stripPeriodLedgerTag(desc);
    if (bare.startsWith('انتقال مانده شارژ از دوره ')) {
        return bare.slice('انتقال مانده شارژ از دوره '.length).trim();
    }
    if (bare.startsWith('بستانکاری شارژ از دوره ')) {
        return bare.slice('بستانکاری شارژ از دوره '.length).trim();
    }
    const m = bare.match(/در فاکتور (.+)$/) || bare.match(/در (.+)$/);
    return m ? m[1].trim() : null;
}

function findPeriodForLedgerEntry(u, tOrDesc, amount) {
    const t = (tOrDesc && typeof tOrDesc === 'object') ? tOrDesc : null;
    const desc = t ? (t.desc || '') : String(tOrDesc || '');
    const pid = t ? getTransactionPeriodId(t) : periodIdFromLedgerDesc(desc);
    if (pid) {
        const p = findPeriod(pid);
        if (p && p.isStarted) return p;
    }
    const pName = periodNameFromLedgerDesc(desc);
    if (!pName) return null;
    const candidates = db.periods.filter(per =>
        per.name === pName && per.isStarted && per.isClosed
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1 && u) {
        const amt = Number(amount) || 0;
        const byAmt = candidates.find(per => {
            const c = getUnitChargeInPeriod(u.id, per);
            if (!c?.frozen) return false;
            const d = desc || '';
            if (d.startsWith('تسویه بدهی پیشین')) {
                return Math.abs((c.frozen.paidPastMonthly || 0) - amt) < 1;
            }
            if (d.startsWith('تسویه موارد اضطراری')) {
                return Math.abs((c.frozen.paidPastSpecial || 0) - amt) < 1;
            }
            if (d.startsWith('انتقال مانده شارژ')) {
                const owed = Math.max(0, (c.frozen.amount || 0) - (c.frozen.paidAmount || 0));
                return Math.abs(owed - amt) < 1;
            }
            return false;
        });
        if (byAmt) return byAmt;
    }
    return candidates[0] || null;
}

function findPeriodForLedgerDesc(u, desc, amount) {
    return findPeriodForLedgerEntry(u, desc, amount);
}

function periodLabelInReport(p, reportPeriods) {
    // Just use the period name — no more ugly internal IDs
    return p.name || '—';
}

function shouldHideTickMirrorLedger(u, t) {
    if (!isPeriodTickMirrorLedgerEntry(t)) return false;
    const p = findPeriodForLedgerEntry(u, t, t.amount);
    if (!p) return false;
    const c = getUnitChargeInPeriod(u.id, p);
    if (!c || !c.frozen) return false;
    const kind = getTxKind(t);
    if (kind === TX_KIND.PAST_MONTHLY_PAY) {
        return (Number(c.frozen.paidPastMonthly) || 0) > 0.01;
    }
    if (kind === TX_KIND.PAST_SPECIAL_PAY) {
        return (Number(c.frozen.paidPastSpecial) || 0) > 0.01;
    }
    if (kind === TX_KIND.CREDIT_APPLY) {
        const tickM = Number(c.frozen.paidPastMonthly) || 0;
        const tickS = Number(c.frozen.paidPastSpecial) || 0;
        return tickM < -0.01 || tickS < -0.01;
    }
    return false;
}

const TX_SOURCE = {
    SYSTEM: 'system',
    PERIOD_TICK: 'period_tick',
    MANUAL: 'manual'
};

function txSourceLabel(source) {
    if (source === TX_SOURCE.SYSTEM) return 'سیستمی';
    if (source === TX_SOURCE.PERIOD_TICK) return 'تایید دستی در دوره';
    return 'ثبت عملیات دستی';
}

function txSourceBadgeClass(source) {
    if (source === TX_SOURCE.SYSTEM) return 'bg-slate-100 text-slate-600';
    if (source === TX_SOURCE.PERIOD_TICK) return 'bg-indigo-100 text-indigo-700';
    return 'bg-amber-100 text-amber-800';
}

function txEffectLabel(category) {
    if (category === 'deposit') return 'واریز';
    if (category === 'debt') return 'بدهی';
    if (category === 'forgive') return 'بخشودگی';
    return category || '—';
}

function txEffectColor(category) {
    if (category === 'deposit') return 'text-emerald-600';
    if (category === 'debt') return 'text-rose-600';
    return 'text-slate-600';
}

function txEffectColorForEvent(e) {
    if (e.isEmergency) {
        return e.category === 'deposit' ? 'text-orange-600' : 'text-orange-700';
    }
    return txEffectColor(e.category);
}

function txSourceFromTransaction(t) {
    if (isPeriodTickMirrorLedgerEntry(t)) return TX_SOURCE.PERIOD_TICK;
    if (isAutoPeriodLedgerEntry(t)) return TX_SOURCE.SYSTEM;
    return TX_SOURCE.MANUAL;
}

function getUnitManualOnlyBalance(uId) {
    const u = findUnit(uId);
    if (!u || !u.transactions) return 0;
    return u.transactions.reduce((sum, t) => {
        if (isAutoPeriodLedgerEntry(t)) return sum;
        if (t.type === 'debt') return sum + t.amount;
        if (t.type === 'payment' || t.type === 'forgive') return sum - t.amount;
        return sum;
    }, 0);
}

function getUnitChargeInPeriod(uId, p) {
    if (!p || !p.charges) return null;
    return p.charges.find(c => sameId(c.unitId, uId)) || null;
}

function pastMonthlyPaymentDesc(periodName, periodId) {
    return `تسویه بدهی پیشین در فاکتور ${periodName}${periodLedgerTag(periodId)}`;
}
function pastSpecialPaymentDesc(periodName, periodId) {
    return `تسویه موارد اضطراری در فاکتور ${periodName}${periodLedgerTag(periodId)}`;
}

function getUnitLedgerBalance(uId) {
    const u = findUnit(uId);
    if (!u || !u.transactions) return 0;
    return u.transactions.reduce((sum, t) => {
        if (t.type === 'debt') return sum + t.amount;
        if (t.type === 'payment' || t.type === 'forgive') return sum - t.amount;
        return sum;
    }, 0);
}
function getUnitManualBalance(uId) { return getUnitLedgerBalance(uId); }

function ledgerHasEntry(u, type, desc, amount) {
    return (u.transactions || []).some(t =>
        t.type === type && (t.desc || '') === desc && (amount === undefined || Math.abs((t.amount || 0) - amount) < 1)
    );
}

function ledgerHasEntryByMeta(u, type, amount, meta) {
    if (!u?.transactions) return false;
    const txKind = meta?.txKind;
    const periodId = meta?.periodId != null ? String(meta.periodId) : null;
    return u.transactions.some(t => {
        if (t.type !== type) return false;
        if (amount !== undefined && Math.abs((t.amount || 0) - amount) >= 1) return false;
        if (txKind && getTxKind(t) !== txKind) return false;
        if (periodId && !sameId(getTransactionPeriodId(t), periodId)) return false;
        return true;
    });
}

function pushLedgerEntry(u, when, type, amount, desc, meta) {
    if (!u || amount < 0.01) return null;
    if (!u.transactions) u.transactions = [];
    const txKind = meta?.txKind || TX_KIND.MANUAL;
    const periodId = meta?.periodId != null ? String(meta.periodId) : null;
    if (ledgerHasEntryByMeta(u, type, amount, { txKind, periodId })) return null;
    if (ledgerHasEntry(u, type, desc, amount)) return null;
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        transactionId: meta?.transactionId || nextTransactionId(),
        periodId,
        txKind,
        date: when,
        type,
        amount,
        desc
    };
    u.transactions.push(entry);
    return entry;
}

function ledgerPush(u, when, type, amount, desc, meta) {
    pushLedgerEntry(u, when, type, amount, desc, meta || {});
}

function pushManualLedgerEntry(u, type, amount, desc) {
    return pushLedgerEntry(u, getPersianDateTime(), type, amount, desc, { txKind: TX_KIND.MANUAL, periodId: null });
}

function migrateLedgerTransactions(u) {
    if (!u?.transactions?.length) return false;
    let changed = false;
    u.transactions.forEach(t => {
        if (!t.transactionId) {
            t.transactionId = 'tx-' + String(t.id || Date.now());
            changed = true;
        }
        const inferred = inferTxKindFromDesc(t.desc);
        if (!t.txKind || (t.txKind === TX_KIND.MANUAL && inferred !== TX_KIND.MANUAL)) {
            if (t.txKind !== inferred) {
                t.txKind = inferred;
                changed = true;
            }
        }
        if (t.periodId == null || t.periodId === '') {
            const pid = periodIdFromLedgerDesc(t.desc || '');
            if (pid) {
                t.periodId = pid;
                changed = true;
            } else if (t.txKind === TX_KIND.MANUAL) {
                t.periodId = null;
            }
        }
    });
    return changed;
}

function settlePastAtClose(pastDue, tickPaid) {
    if (Math.abs(pastDue) < 0.01) return { pay: 0, remain: 0 };
    if (pastDue > 0) {
        const pay = Math.min(Math.max(0, tickPaid), pastDue);
        return { pay, remain: pastDue - pay };
    }
    const pay = tickPaid < 0 ? Math.max(tickPaid, pastDue) : 0;
    return { pay, remain: pastDue - pay };
}

function getChargeRow(p, c) {
    if (p.isClosed && c.frozen) {
        return {
            ...c,
            amount: c.frozen.amount,
            paidAmount: c.frozen.paidAmount,
            paidPastMonthly: c.frozen.paidPastMonthly,
            paidPastSpecial: c.frozen.paidPastSpecial,
            payDate: c.frozen.payDate,
            snapshot: c.frozen.snapshot,
            details: c.frozen.details,
            autoCreditApplied: c.frozen.autoCreditApplied || 0,
            autoCreditAppliedSpecial: c.frozen.autoCreditAppliedSpecial || 0
        };
    }
    return c;
}

function getUnitPayableDetail(uId, p) {
    const empty = {
        payable: 0, creditAppliedToCharge: 0, creditAppliedToSpecial: 0, creditAppliedTotal: 0,
        pastCreditRemaining: 0, pastMonthlyDisplayDebt: 0, openSpecUnpaidAfterCredit: 0,
        unpaidChargeBeforeCredit: 0, showCreditHint: false
    };
    const c = getUnitChargeInPeriod(uId, p);
    if (!c) return empty;

    let debts;
    if (p.isClosed && c.lockedDebts) {
        debts = { pastMonthly: c.lockedDebts.pastMonthly, pastSpecial: c.lockedDebts.pastSpecial };
    } else {
        debts = getDebts(uId, p.id);
    }
    const row = getChargeRow(p, c);
    const isSpecialPeriod = p.type === 'special';
    const autoC = Number(row.autoCreditApplied) || 0;
    const autoS = Number(row.autoCreditAppliedSpecial) || 0;
    const creditAppliedTotal = autoC + autoS;

    if (p.isClosed && c.frozen) {
        const unpaidCharge = Math.max(0, (row.amount || 0) - (row.paidAmount || 0) - autoC);
        const pastMRem = getPastMonthlyRemaining(debts, row);
        const pastSRem = getPastSpecialRemaining(debts, row);
        let payable = isSpecialPeriod
            ? unpaidCharge
            : unpaidCharge + pastMRem + pastSRem;
        let pastCreditRemaining = 0;
        if (pastMRem < -0.01) pastCreditRemaining += Math.abs(pastMRem);
        if (pastSRem < -0.01) pastCreditRemaining += Math.abs(pastSRem);
        return {
            payable,
            creditAppliedToCharge: autoC,
            creditAppliedToSpecial: autoS,
            creditAppliedTotal,
            pastCreditRemaining,
            pastMonthlyDisplayDebt: Math.max(0, pastMRem) + Math.max(0, pastSRem),
            openSpecUnpaidAfterCredit: 0,
            unpaidChargeBeforeCredit: Math.max(0, (row.amount || 0) - (row.paidAmount || 0)),
            showCreditHint: creditAppliedTotal > 0.01
        };
    }

    const unpaidCharge = Math.max(0, (row.amount || 0) - (row.paidAmount || 0));
    let pastMRem = getPastMonthlyRemaining(debts, row);
    let pastSRem = getPastSpecialRemaining(debts, row);

    let creditPool = 0;
    let pastMDebt = 0;
    if (pastMRem < -0.01) creditPool += Math.abs(pastMRem);
    else if (pastMRem > 0.01) pastMDebt = pastMRem;
    if (pastSRem < -0.01) creditPool += Math.abs(pastSRem);
    else if (pastSRem > 0.01) pastMDebt += pastSRem;

    let creditAppliedToCharge = 0;
    let creditAppliedToSpecial = 0;
    let pool = creditPool;

    if (unpaidCharge > 0.01 && pool > 0.01) {
        creditAppliedToCharge = Math.min(pool, unpaidCharge);
        pool -= creditAppliedToCharge;
    }

    let openSpecUnpaid = 0;
    if (!isSpecialPeriod && p.type === 'monthly') {
        openSpecUnpaid = getOpenSpecialChargeInfo(uId).unpaid;
        if (pool > 0.01 && openSpecUnpaid > 0.01) {
            creditAppliedToSpecial = Math.min(pool, openSpecUnpaid);
            pool -= creditAppliedToSpecial;
        }
    }

    const payable = (unpaidCharge - creditAppliedToCharge) + pastMDebt
        + (isSpecialPeriod ? 0 : (openSpecUnpaid - creditAppliedToSpecial));

    const creditAppliedTotalLive = creditAppliedToCharge + creditAppliedToSpecial;

    return {
        payable,
        creditAppliedToCharge,
        creditAppliedToSpecial,
        creditAppliedTotal: creditAppliedTotalLive,
        pastCreditRemaining: pool,
        pastMonthlyDisplayDebt: pastMDebt,
        openSpecUnpaidAfterCredit: Math.max(0, openSpecUnpaid - creditAppliedToSpecial),
        unpaidChargeBeforeCredit: unpaidCharge,
        showCreditHint: creditAppliedTotalLive > 0.01
    };
}

function syncAutoCreditApplication(p) {
    if (!p || p.isClosed || !p.isStarted) return;
    p.charges.forEach(c => {
        const d = getUnitPayableDetail(c.unitId, p);
        c.autoCreditApplied = d.creditAppliedToCharge;
        c.autoCreditAppliedSpecial = d.creditAppliedToSpecial;
    });
}

function showCreditAppliedHint(unitId, periodId) {
    const p = findPeriod(periodId);
    if (!p) return;
    const d = getUnitPayableDetail(unitId, p);
    if (d.creditAppliedTotal < 0.01) return;
    const lines = [`مبلغ «قابل پرداخت» پس از کسر خودکار از بستانکاری واحد محاسبه شده است:`];
    if (d.creditAppliedToCharge > 0.01) {
        lines.push(`• ${fmt(d.creditAppliedToCharge)} تومان از بستانکاری برای شارژ این دوره`);
    }
    if (d.creditAppliedToSpecial > 0.01) {
        lines.push(`• ${fmt(d.creditAppliedToSpecial)} تومان از بستانکاری برای هزینه اضطراری`);
    }
    if (d.pastCreditRemaining > 0.01) {
        lines.push(`بستانکاری باقی‌مانده: ${fmt(d.pastCreditRemaining)} تومان`);
    }
    if (Math.abs(d.payable) < 0.01) {
        lines.push('مانده قابل پرداخت این دوره: تسویه (صفر)');
    } else {
        lines.push(`مانده قابل پرداخت: ${fmt(d.payable)} تومان`);
    }
    customAlert('info', 'کسر از بستانکاری', lines.join('\n'));
}

function getOpenSpecialChargeInfo(uId) {
    let gross = 0;
    let unpaid = 0;
    db.periods.forEach(sp => {
        if (sp.type !== 'special' || sp.isClosed || !sp.isStarted) return;
        const c = getUnitChargeInPeriod(uId, sp);
        if (!c) return;
        const amt = Number(c.amount) || 0;
        if (amt < 0.01) return;
        gross += amt;
        unpaid += Math.max(0, amt - (Number(c.paidAmount) || 0));
    });
    return { gross, unpaid, paid: gross > 0.01 && unpaid < 0.01 };
}

function getOpenSpecialSum(uId) {
    return getOpenSpecialChargeInfo(uId).unpaid;
}

function payOpenSpecialCharges(uId, checked) {
    if (!guardPeriodTickEdit(null, uId)) return;
    saveDB(true);
    const payDate = checked ? getPersianDateTime() : null;
    db.periods.forEach(sp => {
        if (sp.type !== 'special' || sp.isClosed || !sp.isStarted) return;
        const c = getUnitChargeInPeriod(uId, sp);
        if (!c || (Number(c.amount) || 0) < 0.01) return;
        c.paidAmount = checked ? c.amount : 0;
        c.payDate = payDate;
    });
    saveDB(false);
    capPastTicksOnUnit(uId);
    saveDB(false);
    refreshActivePeriodTable();
    refreshUnitsAndReports();
}

function hasConcurrentOpenSpecial(excludePId) {
    return db.periods.some(sp =>
        sp.type === 'special' && sp.isStarted && !sp.isClosed && !sameId(sp.id, excludePId)
    );
}

function getUnpaidPeriodCharge(p, uId) {
    if (!p.isStarted) return 0;
    const c = getUnitChargeInPeriod(uId, p);
    if (!c) return 0;
    const row = getChargeRow(p, c);
    return (Number(row.amount) || 0) - (Number(row.paidAmount) || 0);
}

function isChargeTransferredToLedger(u, p) {
    if (!u || !p) return false;
    const desc = `انتقال مانده شارژ از دوره ${p.name}${periodLedgerTag(p.id)}`;
    const legacy = `انتقال مانده شارژ از دوره ${p.name}`;
    return (u.transactions || []).some(t => {
        if (t.type !== 'debt') return false;
        if (getTxKind(t) === TX_KIND.CHARGE_TRANSFER && sameId(getTransactionPeriodId(t), p.id)) return true;
        return (t.desc || '') === desc || (t.desc || '') === legacy;
    });
}

const PERIOD_MANUAL_LOCK_MSG = 'به دلیل انجام عملیات دستی برای این واحد در دورهٔ جاری، امکان تغییر تیک در این صفحه وجود ندارد.';

function showPeriodManualLockAlert() {
    customAlert('info', 'تغییر تیک غیرفعال', PERIOD_MANUAL_LOCK_MSG);
}

function getManualAllocChargeOnOpen(uId) {
    let sum = 0;
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(uId, p);
        if (c) sum += (Number(c.manualAllocCharge) || 0);
    });
    return sum;
}

function getManualAllocPastOnOpen(uId) {
    let sum = 0;
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(uId, p);
        if (!c) return;
        sum += (Number(c.manualAllocPastM) || 0) + (Number(c.manualAllocPastS) || 0);
    });
    return sum;
}

function getManualAllocOnOpenPeriods(uId) {
    return getManualAllocChargeOnOpen(uId) + getManualAllocPastOnOpen(uId);
}

function isPeriodRowManualLocked(p, uId) {
    if (!p || p.isClosed || !p.isStarted) return false;
    const c = getUnitChargeInPeriod(uId, p);
    return !!(c && c.periodManualLocked);
}

function unitHasManualPaymentInOpenPeriod(uId) {
    const u = findUnit(uId);
    if (!u || !getOpenStartedPeriods().length) return false;
    return (u.transactions || []).some(t =>
        t.type === 'payment'
        && !isAutoPeriodLedgerEntry(t)
        && !isPeriodTickMirrorLedgerEntry(t)
        && (Number(t.amount) || 0) > 0.01
    );
}

function setPeriodManualLockForUnit(uId, locked) {
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(uId, p);
        if (c) c.periodManualLocked = !!locked;
    });
}

function getUnitManualPaymentCredit(uId) {
    const u = findUnit(uId);
    if (!u) return 0;
    return (u.transactions || []).reduce((sum, t) => {
        if (t.type !== 'payment') return sum;
        if (isAutoPeriodLedgerEntry(t) || isPeriodTickMirrorLedgerEntry(t)) return sum;
        return sum + (Number(t.amount) || 0);
    }, 0);
}

function allocateManualPaymentToOpenPeriods(uId, paymentAmt) {
    let remaining = Math.max(0, Number(paymentAmt) || 0);
    const applied = { charge: 0, pastM: 0, pastS: 0 };
    if (remaining < 0.01) return applied;

    const open = getOpenStartedPeriods();
    const monthly = open.find(p => p.type === 'monthly');
    const specials = open.filter(p => p.type === 'special');

    function applyToCharge(period, c) {
        if (remaining < 0.01 || !period || !c) return;
        const row = getChargeRow(period, c);
        const amt = Number(row.amount) || 0;
        const unpaid = Math.max(0, amt - (Number(row.paidAmount) || 0));
        const apply = Math.min(remaining, unpaid);
        if (apply < 0.01) return;
        c.paidAmount = (Number(c.paidAmount) || 0) + apply;
        c.manualAllocCharge = (Number(c.manualAllocCharge) || 0) + apply;
        if (c.paidAmount >= amt - 0.01) c.payDate = getPersianDateTime();
        applied.charge += apply;
        remaining -= apply;
    }

    if (monthly) {
        const c = getUnitChargeInPeriod(uId, monthly);
        applyToCharge(monthly, c);
    }
    specials.forEach(sp => {
        const c = getUnitChargeInPeriod(uId, sp);
        applyToCharge(sp, c);
    });

    if (monthly && remaining > 0.01) {
        const c = getUnitChargeInPeriod(uId, monthly);
        if (c) {
            const debts = getPastDebts(uId, monthly.id);
            const pastRem = getPastMonthlyRemaining(debts, c);
            if (pastRem > 0.01) {
                const apply = Math.min(remaining, pastRem);
                c.paidPastMonthly = (Number(c.paidPastMonthly) || 0) + apply;
                c.manualAllocPastM = (Number(c.manualAllocPastM) || 0) + apply;
                applied.pastM += apply;
                remaining -= apply;
            }
        }
    }

    if (monthly && remaining > 0.01) {
        const c = getUnitChargeInPeriod(uId, monthly);
        if (c) {
            const debts = getPastDebts(uId, monthly.id);
            const pastRem = getPastSpecialRemaining(debts, c);
            if (pastRem > 0.01) {
                const apply = Math.min(remaining, pastRem);
                c.paidPastSpecial = (Number(c.paidPastSpecial) || 0) + apply;
                c.manualAllocPastS = (Number(c.manualAllocPastS) || 0) + apply;
                applied.pastS += apply;
                remaining -= apply;
            }
        }
    }
    return applied;
}

function manualPaymentOverflow(applied, paymentAmt) {
    const appliedTotal = (applied.charge || 0) + (applied.pastM || 0) + (applied.pastS || 0);
    return Math.max(0, paymentAmt - appliedTotal);
}

function sanitizeManualPeriodState(u) {
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(u.id, p);
        if (!c) return;
        const alloc = (Number(c.manualAllocCharge) || 0) + (Number(c.manualAllocPastM) || 0) + (Number(c.manualAllocPastS) || 0);
        if (alloc > 0.01) return;
        if (!c.periodManualLocked) return;
        c.periodManualLocked = false;
        c.paidAmount = 0;
        c.paidPastMonthly = 0;
        c.paidPastSpecial = 0;
        c.payDate = null;
    });
}

function repairLedgerDuplicateManualPayments(u) {
    if (!u.transactions || u.transactions.length < 2) return false;
    const removeIds = new Set();
    db.periods.filter(p => p.isClosed && p.isStarted).forEach(p => {
        const c = getUnitChargeInPeriod(u.id, p);
        if (!c?.frozen) return;
        const tickM = Number(c.frozen.paidPastMonthly) || 0;
        if (tickM < 0.01) return;
        const hasSettle = ledgerHasEntryByMeta(u, 'payment', tickM, {
            txKind: TX_KIND.PAST_MONTHLY_PAY, periodId: p.id
        }) || ledgerHasEntry(u, 'payment', pastMonthlyPaymentDesc(p.name, p.id), tickM);
        if (!hasSettle) return;
        u.transactions.forEach(t => {
            if (t.type !== 'payment' || getTxKind(t) !== TX_KIND.MANUAL) return;
            if (removeIds.has(t.id)) return;
            if (Math.abs((t.amount || 0) - tickM) < 1) removeIds.add(t.id);
        });
    });
    if (!removeIds.size) return false;
    u.transactions = u.transactions.filter(t => !removeIds.has(t.id));
    return true;
}

function repairLedgerStaleChargePayments(u) {
    if (!u.transactions) return false;
    const removeIds = new Set();
    db.periods.filter(p => p.isClosed && p.isStarted).forEach(p => {
        const c = getUnitChargeInPeriod(u.id, p);
        if (!c?.frozen) return;
        const paid = Number(c.frozen.paidAmount) || 0;
        const amt = Number(c.frozen.amount) || 0;
        if (paid < amt - 0.01 || paid < 0.01) return;
        const transferDesc = `انتقال مانده شارژ از دوره ${p.name}${periodLedgerTag(p.id)}`;
        const hasTransfer = ledgerHasEntryByMeta(u, 'debt', amt - paid, {
            txKind: TX_KIND.CHARGE_TRANSFER, periodId: p.id
        }) || ledgerHasEntry(u, 'debt', transferDesc, amt - paid);
        if (hasTransfer) return;
        u.transactions.forEach(t => {
            if (t.type !== 'payment' || getTxKind(t) !== TX_KIND.MANUAL) return;
            if (removeIds.has(t.id)) return;
            if (Math.abs((t.amount || 0) - paid) < 1 && Math.abs(paid - amt) < 1) removeIds.add(t.id);
        });
    });
    if (!removeIds.size) return false;
    u.transactions = u.transactions.filter(t => !removeIds.has(t.id));
    return true;
}

function guardPeriodTickEdit(pId, uId) {
    const locked = getOpenStartedPeriods().some(op => isPeriodRowManualLocked(op, uId));
    if (locked) {
        showPeriodManualLockAlert();
        refreshActivePeriodTable();
        return false;
    }
    return true;
}

function getPastDebts(uId, excludePId) {
    const u = findUnit(uId);
    let pastMonthly = getUnitLedgerBalance(uId);
    let pastSpecial = 0;

    getPriorStartedPeriods(excludePId).forEach(p => {
        const unpaid = getUnpaidPeriodCharge(p, uId);
        if (unpaid < 0.01) return;
        if (p.isClosed && isChargeTransferredToLedger(u, p)) return;
        if (p.type === 'special') pastSpecial += unpaid;
        else pastMonthly += unpaid;
    });
    return { pastMonthly, pastSpecial };
}
function getDebts(uId, excludePId) { return getPastDebts(uId, excludePId); }

function getPastMonthlyRemaining(debts, c) {
    const gross = debts.pastMonthly || 0;
    const tick = c.paidPastMonthly || 0;
    if (gross >= 0) return Math.max(0, gross - Math.max(0, tick));
    return gross - tick;
}

function isPastMonthlyPaid(debts, c) {
    const gross = debts.pastMonthly || 0;
    if (gross < 0.01) return false;
    const rem = getPastMonthlyRemaining(debts, c);
    return Math.abs(rem) < 0.01 && (c.paidPastMonthly || 0) > 0.01;
}

function getPastSpecialRemaining(debts, c) {
    const gross = debts.pastSpecial || 0;
    const tick = c.paidPastSpecial || 0;
    if (gross >= 0) return Math.max(0, gross - Math.max(0, tick));
    return gross - tick;
}

function isPastSpecialPaid(debts, c) {
    const gross = debts.pastSpecial || 0;
    if (gross < 0.01) return false;
    const rem = getPastSpecialRemaining(debts, c);
    return Math.abs(rem) < 0.01 && (c.paidPastSpecial || 0) > 0.01;
}

function getPastDebtTickAmount(debts) {
    return Math.max(0, debts.pastMonthly || 0);
}

function getPastSpecialTickAmount(debts) {
    return Math.max(0, debts.pastSpecial || 0);
}

function getPastMonthlyDisplay(debts, row) {
    const rem = getPastMonthlyRemaining(debts, row);
    const paid = row.paidPastMonthly || 0;
    if (rem > 0.01) return { amt: rem, paid: false, credit: false };
    if (rem < -0.01) return { amt: Math.abs(rem), paid: false, credit: true };
    if (paid > 0.01) return { amt: paid, paid: true, credit: false };
    if (debts.pastMonthly > 0.01) return { amt: debts.pastMonthly, paid: false, credit: false };
    return { amt: 0, paid: false, credit: false };
}

function getPastSpecialDisplay(debts, row) {
    const rem = getPastSpecialRemaining(debts, row);
    const paid = row.paidPastSpecial || 0;
    if (rem > 0.01) return { amt: rem, paid: false, credit: false };
    if (rem < -0.01) return { amt: Math.abs(rem), paid: false, credit: true };
    if (paid > 0.01) return { amt: paid, paid: true, credit: false };
    if (debts.pastSpecial > 0.01) return { amt: debts.pastSpecial, paid: false, credit: false };
    return { amt: 0, paid: false, credit: false };
}

function getPastDebtCellUi(debts, row, payDet) {
    const mDebtGross = Math.max(0, debts.pastMonthly || 0);
    const sDebtGross = Math.max(0, debts.pastSpecial || 0);
    const mPaid = isPastMonthlyPaid(debts, row);
    const sPaid = isPastSpecialPaid(debts, row);
    const poolCredit = payDet.pastCreditRemaining || 0;
    const rawCredit = (debts.pastMonthly < -0.01 ? Math.abs(debts.pastMonthly) : 0)
        + (debts.pastSpecial < -0.01 ? Math.abs(debts.pastSpecial) : 0);
    const creditAmt = poolCredit > 0.01 ? poolCredit : rawCredit;
    const hasCredit = creditAmt > 0.01;
    const hasTickableDebt = mDebtGross > 0.01 || sDebtGross > 0.01 || mPaid || sPaid;

    if (!hasTickableDebt && !hasCredit) return { empty: true };

    if (!hasTickableDebt) {
        return {
            empty: false, creditOnly: true, displayAmt: 0, tickChecked: false, tickStruck: false,
            hasCredit: true, creditAmt, tickHandler: 'monthly'
        };
    }

    let displayAmt = payDet.pastMonthlyDisplayDebt || 0;
    let tickHandler = 'monthly';

    if (mDebtGross > 0.01 || mPaid) {
        if (sDebtGross < 0.01 && !sPaid) {
            displayAmt = mDebtGross > 0.01 ? mDebtGross : (row.paidPastMonthly || 0);
        } else {
            if (mPaid) displayAmt += mDebtGross;
            if (sPaid) displayAmt += sDebtGross;
            if (!mPaid && sPaid && mDebtGross < 0.01) tickHandler = 'special';
        }
    } else if (sDebtGross > 0.01 || sPaid) {
        displayAmt = sDebtGross > 0.01 ? sDebtGross : (row.paidPastSpecial || 0);
        tickHandler = 'special';
    }

    const tickChecked = tickHandler === 'special' ? sPaid : mPaid;
    const tickStruck = tickHandler === 'special'
        ? sPaid
        : (mPaid && (sDebtGross < 0.01 || sPaid));

    return {
        empty: false, creditOnly: false, displayAmt, tickChecked, tickStruck,
        hasCredit, creditAmt, tickHandler
    };
}

function capPastTicksOnUnit(uId) {
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(uId, p);
        if (!c) return;
        const debts = getPastDebts(uId, p.id);
        if ((c.paidPastMonthly || 0) < -0.01) c.paidPastMonthly = 0;
        if ((c.paidPastSpecial || 0) < -0.01) c.paidPastSpecial = 0;
        const tickM = getPastDebtTickAmount(debts);
        const tickS = getPastSpecialTickAmount(debts);
        if (tickM < 0.01) c.paidPastMonthly = 0;
        else if ((c.paidPastMonthly || 0) > tickM + 0.01) c.paidPastMonthly = tickM;
        if (tickS < 0.01) c.paidPastSpecial = 0;
        else if ((c.paidPastSpecial || 0) > tickS + 0.01) c.paidPastSpecial = tickS;
    });
}

function getUnitPeriodPayable(uId, p) {
    return getUnitPayableDetail(uId, p).payable;
}

function getUnitDebtAnchorPeriod() {
    const open = getOpenStartedPeriods();
    if (!open.length) return null;
    const monthly = open.find(p => p.type === 'monthly');
    if (monthly) return monthly;
    const specials = open.filter(p => p.type === 'special')
        .sort((a, b) => comparePeriodOrder(a.id, b.id));
    return specials.length ? specials[specials.length - 1] : open[0];
}

function getUnitTotalDebt(uId) {
    const anchor = getUnitDebtAnchorPeriod();
    if (!anchor) {
        const d = getPastDebts(uId, '__none__');
        return d.pastMonthly + d.pastSpecial;
    }
    const payDet = getUnitPayableDetail(uId, anchor);
    return (payDet.payable || 0) - (payDet.pastCreditRemaining || 0);
}

function getPeriodExpenses(p) {
    if (!p.isStarted) return 0;
    const e = (p.isClosed && p.frozenExpenses) ? p.frozenExpenses : p.expenses;
    if (!e) return 0;
    if (p.type === 'monthly') {
        return (e.water || 0) + (e.gas || 0) + (e.electricity || 0) + (e.incidental || 0);
    }
    return e.specialTotal || 0;
}

function getPeriodTickIncome(p) {
    if (!p.isStarted) return 0;
    let sum = 0;
    p.charges.forEach(c => {
        const row = getChargeRow(p, c);
        sum += (Number(row.paidAmount) || 0) + (Number(row.paidPastMonthly) || 0) + (Number(row.paidPastSpecial) || 0);
    });
    return sum;
}

function getUnitManualCashIncome(u) {
    if (!u || !u.transactions) return 0;
    return u.transactions.reduce((sum, t) => {
        if (t.type !== 'payment') return sum;
        if (isAutoPeriodLedgerEntry(t)) return sum;
        return sum + (Number(t.amount) || 0);
    }, 0);
}

function computeFundTotals() {
    let tickIncome = 0, manualIncome = 0, expense = 0;
    db.periods.forEach(p => {
        if (!p.isStarted) return;
        expense += getPeriodExpenses(p);
        tickIncome += getPeriodTickIncome(p);
    });
    db.units.forEach(u => { manualIncome += getUnitManualCashIncome(u); });
    const income = tickIncome + manualIncome;
    const totalF = (db.initialFund || 0) + income - expense;
    return { income, tickIncome, manualIncome, expense, totalF };
}

function calculateAllDebts() {
    let debts = {};
    db.units.forEach(u => { debts[u.id] = getUnitTotalDebt(u.id); });
    return debts;
}

function collectLedgerExplainLines(u) {
    const lines = [];
    if (!u || !u.transactions) return lines;

    db.periods.filter(p => p.isStarted && p.isClosed).forEach(p => {
        if (!isChargeTransferredToLedger(u, p)) return;
        const desc = `انتقال مانده شارژ از دوره ${p.name}${periodLedgerTag(p.id)}`;
        const legacy = `انتقال مانده شارژ از دوره ${p.name}`;
        const t = u.transactions.find(tr =>
            tr.type === 'debt'
            && getTxKind(tr) === TX_KIND.CHARGE_TRANSFER
            && sameId(getTransactionPeriodId(tr), p.id)
        ) || u.transactions.find(tr =>
            tr.type === 'debt' && ((tr.desc || '') === desc || (tr.desc || '') === legacy)
        );
        if (t && t.amount > 0.01) {
            lines.push({
                label: `بدهی منتقل‌شده از دوره «${periodLabelInReport(p, db.periods)}»`,
                amount: t.amount,
                sub: true,
                emergency: p.type === 'special'
            });
        }
    });

    let manualDebt = 0, manualPay = 0;
    u.transactions.forEach(t => {
        if (isAutoPeriodLedgerEntry(t) || isPeriodTickMirrorLedgerEntry(t)) return;
        const amt = Number(t.amount) || 0;
        if (t.type === 'debt') manualDebt += amt;
        else if (t.type === 'payment' || t.type === 'forgive') manualPay += amt;
    });
    const manualNet = manualDebt - manualPay;
    if (manualNet > 0.01) {
        lines.push({ label: 'ثبت دستی در حساب واحد (معوقه / بدهی)', amount: manualNet, sub: true });
    }
    return lines;
}

function collectUnitDebtDetailLines(uId) {
    const lines = [];
    const u = findUnit(uId);
    if (!u) return lines;
    const open = db.periods.filter(p => p.isStarted && !p.isClosed);
    const anchor = open.find(p => p.type === 'monthly') || open.find(p => p.type === 'special');

    if (anchor) {
        const c = getUnitChargeInPeriod(uId, anchor);
        const row = c ? getChargeRow(anchor, c) : null;
        let debts;
        if (row && anchor.isClosed && c.lockedDebts) {
            debts = { pastMonthly: c.lockedDebts.pastMonthly, pastSpecial: c.lockedDebts.pastSpecial };
        } else if (row) {
            debts = getDebts(uId, anchor.id);
        } else {
            debts = getPastDebts(uId, anchor.id);
        }
        const payDet = getUnitPayableDetail(uId, anchor);
        const cur = Math.max(0, (payDet.unpaidChargeBeforeCredit || 0) - (payDet.creditAppliedToCharge || 0));
        if (cur > 0.01) {
            lines.push({
                label: `شارژ دورهٔ جاری (${periodLabelInReport(anchor, db.periods)})`,
                amount: cur,
                emergency: anchor.type === 'special'
            });
        }
        if (payDet.pastMonthlyDisplayDebt > 0.01) {
            lines.push({ label: 'مانده بدهی ماهانهٔ پیشین', amount: payDet.pastMonthlyDisplayDebt });
        }
        if (payDet.pastCreditRemaining > 0.01) {
            lines.push({ label: 'بستانکاری واحد (پس از کسر خودکار)', amount: payDet.pastCreditRemaining, credit: true });
        }
        if (payDet.creditAppliedTotal > 0.01) {
            lines.push({
                label: 'کسر خودکار از بستانکاری در این دوره',
                amount: payDet.creditAppliedTotal,
                credit: true,
                sub: true
            });
        }
        if (payDet.openSpecUnpaidAfterCredit > 0.01) {
            lines.push({
                label: 'هزینه اضطراری دورهٔ باز (پیش‌بینی‌نشده)',
                amount: payDet.openSpecUnpaidAfterCredit,
                emergency: true
            });
        }

        collectLedgerExplainLines(u).forEach(l => lines.push(l));
        getPriorStartedPeriods(anchor.id).forEach(p => {
            const unpaid = getUnpaidPeriodCharge(p, uId);
            if (unpaid < 0.01) return;
            if (p.isClosed && isChargeTransferredToLedger(u, p)) return;
            const kind = p.type === 'special' ? 'اضطراری' : 'ماهانه';
            lines.push({
                label: `شارژ پرداخت‌نشده (${kind}): ${periodLabelInReport(p, db.periods)}`,
                amount: unpaid,
                sub: true,
                emergency: p.type === 'special'
            });
        });
        return lines;
    }

    const d = getPastDebts(uId, '__none__');
    const pm = Math.max(0, d.pastMonthly);
    const ps = Math.max(0, d.pastSpecial);
    if (pm > 0.01) lines.push({ label: 'بدهی ماهانهٔ پیشین (مجموع)', amount: pm });
    if (ps > 0.01) lines.push({ label: 'بدهی اضطراری پیشین (مجموع)', amount: ps, emergency: true });

    const openSpecOnly = getOpenSpecialChargeInfo(uId);
    if (openSpecOnly.unpaid > 0.01) {
        lines.push({
            label: 'هزینه اضطراری دورهٔ باز (پیش‌بینی‌نشده)',
            amount: openSpecOnly.unpaid,
            emergency: true
        });
    }

    collectLedgerExplainLines(u).forEach(l => lines.push(l));
    getPriorStartedPeriods('__none__').forEach(p => {
        const unpaid = getUnpaidPeriodCharge(p, uId);
        if (unpaid < 0.01) return;
        if (p.isClosed && isChargeTransferredToLedger(u, p)) return;
        const kind = p.type === 'special' ? 'اضطراری' : 'ماهانه';
        lines.push({
            label: `شارژ پرداخت‌نشده (${kind}): ${periodLabelInReport(p, db.periods)}`,
            amount: unpaid,
            sub: true,
            emergency: p.type === 'special'
        });
    });
    return lines;
}

/** رند به بالا به مضرب ۵۰٬۰۰۰ — برای هر مبلغ مثبت (از جمله فقط شارژ ثابت) */
function applyRoundUpCharge(total, expenses) {
    if (!expenses || expenses.roundUp === false || total <= 0) return total;
    return Math.ceil(total / CHARGE_ROUND_STEP) * CHARGE_ROUND_STEP;
}

/** مازاد رند را در جزئیات نشان می‌دهد (اولویت: شارژ ثابت) تا جمع ستون‌ها = مبلغ نهایی */
function applyRoundUpToChargeParts(parts, expenses) {
    const out = { ...parts };
    if (!expenses || expenses.roundUp === false) {
        const sum = (out.fixed || 0) + (out.water || 0) + (out.gas || 0) + (out.elec || 0) + (out.incidental || 0);
        return { total: sum, details: out };
    }

    const unroundedSum = (out.fixed || 0) + (out.water || 0) + (out.gas || 0) + (out.elec || 0) + (out.incidental || 0);
    if (unroundedSum <= 0) return { total: 0, details: out };

    const total = applyRoundUpCharge(unroundedSum, expenses);
    const diff = total - unroundedSum;

    if (diff > 0) {
        out.fixed = (out.fixed || 0) + diff;
    }
    return { total, details: out };
}

function syncPeriodSnapshots(p) {
    if (p.isClosed) return;
    p.charges.forEach(c => {
        const u = findUnit(c.unitId);
        if (u) c.snapshot = { occupants: u.occupants || 0, hasPackage: !!u.hasPackage };
    });
}

function applyPeriodChargeLogic(p) {
    if (p.isClosed) return;

    if (p.type === 'special') {
        const total = p.expenses.specialTotal || 0;
        const totalOcc = p.charges.reduce((sum, c) => sum + (c.snapshot.occupants || 0), 0);
        const spMode = p.expenses.specialMode || 'all';

        p.charges.forEach(c => {
            let occ = c.snapshot.occupants || 0;
            let share = 0;

            if (spMode === 'custom') {
                const isIncluded = (p.expenses.customUnits || []).some(uid => sameId(uid, c.unitId));
                if (!isIncluded) { share = 0; }
                else {
                    const customCount = (p.expenses.customUnits || []).length;
                    share = customCount > 0 ? total / customCount : 0;
                }
            } else if (spMode === 'active' && totalOcc > 0) {
                if (occ > 0) {
                    const activeCount = p.charges.filter(x => (x.snapshot.occupants || 0) > 0).length;
                    share = activeCount > 0 ? total / activeCount : 0;
                }
            } else {
                // 'all' — equal between all units
                const allCount = p.charges.length;
                share = allCount > 0 ? total / allCount : 0;
            }

            const rounded = applyRoundUpToChargeParts({ fixed: share }, p.expenses);
            const amt = rounded.total;

            const prevAmt = Number(c.amount) || 0;
            const wasPaid = (c.paidAmount || 0) >= prevAmt - 0.01 && prevAmt > 0.01;
            c.amount = amt;
            c.details = { specialShare: rounded.total };
            if (wasPaid && amt > 0.01) c.paidAmount = amt;
            else if ((c.paidAmount || 0) > amt) c.paidAmount = amt;
        });
        return;
    }

    // Monthly Period Logic
    const e = p.expenses;
    const totalOcc = p.charges.reduce((sum, c) => sum + (c.snapshot.occupants || 0), 0);
    const exemptEmpty = !!e.exemptEmptyUnits;

    let utilityPayerOcc = 0;
    let nonPackageCount = 0;
    let utilityPayerCount = 0;
    let totalUnitsCount = p.charges.length;

    p.charges.forEach(c => {
        let occ = c.snapshot.occupants || 0;
        const utilityPayer = !exemptEmpty || occ > 0;
        if (occ > 0) utilityPayerOcc += occ;
        if (utilityPayer && !c.snapshot.hasPackage) nonPackageCount++;
        if (utilityPayer) utilityPayerCount++;
    });

    let wp = utilityPayerOcc > 0 ? (e.water || 0) / utilityPayerOcc : 0;
    let gp = nonPackageCount > 0 ? (e.gas || 0) / nonPackageCount : 0;
    let ep = utilityPayerCount > 0 ? (e.electricity || 0) / utilityPayerCount : 0;
    let ip = totalUnitsCount > 0 ? (e.incidental || 0) / totalUnitsCount : 0;

    const fix = e.fixed || 0;

    p.charges.forEach(c => {
        c.snapshot = c.snapshot || { occupants: 0, hasPackage: false };
        let occ = c.snapshot.occupants || 0;
        const utilityPayer = !exemptEmpty || occ > 0;

        let bW = occ > 0 ? occ * wp : 0;
        let bG = utilityPayer && !c.snapshot.hasPackage ? gp : 0;
        let bE = utilityPayer ? ep : 0;
        let bI = ip;

        const rounded = applyRoundUpToChargeParts(
            { fixed: fix, water: bW, gas: bG, elec: bE, incidental: bI },
            e
        );
        const total = rounded.total;

        const prevAmt = Number(c.amount) || 0;
        const wasPaid = (c.paidAmount || 0) >= prevAmt - 0.01 && prevAmt > 0.01;
        c.amount = total;
        c.details = rounded.details;
        if (wasPaid && total > 0.01) c.paidAmount = total;
        else if ((c.paidAmount || 0) > total) c.paidAmount = total;
    });
}

function calculateLogic(p) {
    if (p.isClosed || !p.isStarted) return;
    applyPeriodChargeLogic(p);
    syncAutoCreditApplication(p);
}

function commitExpenseChange() {
    if (!activePeriodId) return;
    const p = findPeriod(activePeriodId);
    if (!p || p.isClosed) return;

    if (p.type === 'special') {
        const rawT = toEnDigit(document.getElementById('f-sp-total')?.value || '0');
        p.expenses.specialTotal = parse(rawT);
        p.expenses.specialMode = document.getElementById('f-sp-mode')?.value || 'all';
        const rEl = document.getElementById('f-round');
        p.expenses.roundUp = rEl ? rEl.checked : false;
    } else {
        const rawF = toEnDigit(document.getElementById('f-fix')?.value || '0');
        const rawW = toEnDigit(document.getElementById('f-wat')?.value || '0');
        const rawG = toEnDigit(document.getElementById('f-gas')?.value || '0');
        const rawE = toEnDigit(document.getElementById('f-ele')?.value || '0');
        const rawI = toEnDigit(document.getElementById('f-inc')?.value || '0');
        p.expenses.fixed = parse(rawF);
        p.expenses.water = parse(rawW);
        p.expenses.gas = parse(rawG);
        p.expenses.electricity = parse(rawE);
        p.expenses.incidental = parse(rawI);
        p.expenses.incDesc = document.getElementById('f-inc-desc')?.value.trim() || '';
        const rEl = document.getElementById('f-round');
        p.expenses.roundUp = rEl ? rEl.checked : false;
        const exEl = document.getElementById('f-exempt-empty');
        p.expenses.exemptEmptyUnits = exEl ? exEl.checked : true;
    }
}

function calculateActivePeriod() {
    if (!activePeriodId) return;
    const p = findPeriod(activePeriodId);
    if (!p || p.isClosed) return;

    commitExpenseChange();

    if (p.isStarted) {
        calculateLogic(p);
        renderPeriodTable(p);
        return;
    }

    syncPeriodSnapshots(p);
    applyPeriodChargeLogic(p);

    const tableWrap = document.getElementById('period-table-wrapper');
    const previewHint = document.getElementById('period-preview-hint');
    if (tableWrap) tableWrap.classList.remove('hidden');
    if (previewHint) previewHint.classList.remove('hidden');
    renderPeriodTable(p, true);
}
