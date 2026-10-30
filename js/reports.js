// --- Reports, Deposits, Debtors, Chart & Missing Helper Functions ---

// ============================================================
// refreshUnitsAndReports — used after tick changes / manual ops
// ============================================================
function refreshUnitsAndReports() {
    renderUnits();
    updateGlobalReports();
}

// ============================================================
// updatePeriodDetailBackButton — label «بازگشت» / «بازگشت به گزارش واحد»
// ============================================================
function updatePeriodDetailBackButton() {
    const lbl = document.getElementById('btn-period-detail-back-label');
    if (!lbl) return;
    lbl.innerText = returnToUnitReportAfterPeriod ? 'بازگشت به گزارش واحد' : 'بازگشت';
}

// ============================================================
// openPeriodFromUnitReport — open period detail from unit-report card
// ============================================================
function openPeriodFromUnitReport(periodId) {
    const pid = String(periodId);
    const p = findPeriod(pid);
    if (!p) return;
    const uid = activeUnitId;
    pushNav({ type: 'period', periodId: pid, fromUnitReport: true, unitId: uid });
    openPeriodDetailUI(pid, { fromUnitReport: true });
}

// ============================================================
// simpleStoryBalanceLabel — format running balance label
// ============================================================
function simpleStoryBalanceLabel(balance) {
    if (Math.abs(balance) < 0.1) return 'تسویه';
    if (balance > 0) return `بدهکار ${fmt(balance)}`;
    return `بستانکار ${fmt(Math.abs(balance))}`;
}

// ============================================================
// updateUnitReportBalanceHeader — top summary in unit report modal
// ============================================================
function updateUnitReportBalanceHeader(u) {
    const totalDebt = getUnitTotalDebt(u.id);
    const el = document.getElementById('report-unit-balance');
    if (!el) return;
    const cls = Math.abs(totalDebt) < 0.1 ? 'text-emerald-600' : (totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600');
    el.className = `text-3xl font-black ${cls}`;
    el.dir = 'ltr';
    el.innerText = simpleStoryBalanceLabel(totalDebt);

    const detailBox = document.getElementById('report-unit-debt-detail');
    if (detailBox) {
        const lines = collectUnitDebtDetailLines(u.id);
        if (!lines.length) {
            detailBox.innerHTML = '';
        } else {
            let html = '<div class="mt-3 space-y-1">';
            lines.forEach(l => {
                const color = l.credit ? 'text-emerald-600' : (l.emergency ? 'text-orange-600' : 'text-rose-600');
                const sub = l.sub ? 'text-xs pl-2 border-r-2 border-slate-200 mr-2' : 'text-sm';
                html += `<div class="flex justify-between ${sub} font-bold">
                    <span class="text-slate-700">${l.label}</span>
                    <span class="${color}" dir="ltr">${l.credit ? '-' : ''}${fmt(l.amount)}</span>
                </div>`;
            });
            html += '</div>';
            detailBox.innerHTML = html;
        }
    }
}

// ============================================================
// collectSimpleUnitStory — build financial event list for unit report
// ============================================================
function collectSimpleUnitStory(unitId) {
    const u = findUnit(unitId);
    if (!u) return [];
    const events = [];

    // Manual / Ledger transactions (including system-generated charge transfers)
    (u.transactions || []).forEach(t => {
        if (shouldHideTickMirrorLedger(u, t)) return;
        const kind = getTxKind(t);
        const source = txSourceFromTransaction(t);
        const pidStr = getTransactionPeriodId(t);
        const p = pidStr ? findPeriod(pidStr) : null;
        const isEmergency = p ? p.type === 'special' : false;
        let category = 'neutral';
        if (t.type === 'debt') category = 'debt';
        else if (t.type === 'payment') category = 'deposit';
        else if (t.type === 'forgive') category = 'forgive';

        // Simplify system text labels
        let text = stripPeriodLedgerTag(t.desc || '—');
        if (kind === TX_KIND.CHARGE_TRANSFER && p) {
            text = `شارژ ${p.name} پرداخت نشد — به بدهی اضافه شد`;
        } else if (kind === TX_KIND.PAST_MONTHLY_PAY && p) {
            text = `تسویه بدهی پیشین — ${p.name}`;
        } else if (kind === TX_KIND.PAST_SPECIAL_PAY && p) {
            text = `تسویه هزینه اضطراری پیشین — ${p.name}`;
        } else if (kind === TX_KIND.OVERPAY_CREDIT && p) {
            text = `اضافه پرداخت در ${p.name} — بستانکار`;
        } else if (kind === TX_KIND.CREDIT_APPLY && p) {
            text = `استفاده از بستانکاری در ${p.name}`;
        }

        events.push({
            date: t.date || '—',
            text,
            amount: Number(t.amount) || 0,
            category,
            isEmergency,
            periodName: p ? p.name : null,
            periodId: pidStr,
            source,
            hint: null,
            timeKey: t.id,
            pSort: p ? periodOrderKey(p.id) : 0,
            sub: 0
        });
    });

    // Period charge events (only for open/active periods — closed ones are in transactions)
    db.periods.filter(p => p.isStarted).forEach(p => {
        const c = getUnitChargeInPeriod(unitId, p);
        if (!c) return;
        const row = getChargeRow(p, c);
        const amt = Number(row.amount) || 0;
        if (amt < 0.01) return;
        const paid = Number(row.paidAmount) || 0;
        const isEmergency = p.type === 'special';
        const dateStr = p.startedAt || '—';

        // Charge assignment
        events.push({
            date: dateStr,
            text: `شارژ ${p.name}: ${fmt(amt)}`,
            amount: amt,
            category: 'debt',
            isEmergency,
            periodName: p.name,
            periodId: String(p.id),
            source: TX_SOURCE.SYSTEM,
            hint: null,
            timeKey: null,
            pSort: periodOrderKey(p.id),
            sub: 0.1
        });

        // Charge payment (ticked in period table)
        if (paid > 0.01) {
            events.push({
                date: row.payDate || dateStr,
                text: `پرداخت شارژ ${p.name}`,
                amount: paid,
                category: 'deposit',
                isEmergency,
                periodName: p.name,
                periodId: String(p.id),
                source: TX_SOURCE.PERIOD_TICK,
                hint: null,
                timeKey: null,
                pSort: periodOrderKey(p.id),
                sub: 0.2
            });
        }

        // Past-monthly debt payment (ticked in period table)
        const tickM = Number(row.paidPastMonthly) || 0;
        if (tickM > 0.01) {
            events.push({
                date: row.payDate || dateStr,
                text: `پرداخت بدهی قدیمی — ${p.name}`,
                amount: tickM,
                category: 'deposit',
                isEmergency: false,
                periodName: p.name,
                periodId: String(p.id),
                source: TX_SOURCE.PERIOD_TICK,
                hint: null,
                timeKey: null,
                pSort: periodOrderKey(p.id),
                sub: 0.3
            });
        }

        // Past-special debt payment (ticked in period table)
        const tickS = Number(row.paidPastSpecial) || 0;
        if (tickS > 0.01) {
            events.push({
                date: row.payDate || dateStr,
                text: `پرداخت هزینه اضطراری قدیمی — ${p.name}`,
                amount: tickS,
                category: 'deposit',
                isEmergency: true,
                periodName: p.name,
                periodId: String(p.id),
                source: TX_SOURCE.PERIOD_TICK,
                hint: null,
                timeKey: null,
                pSort: periodOrderKey(p.id),
                sub: 0.4
            });
        }

        // For CLOSED periods: skip — the charge transfer entry is already in u.transactions
        // (added by finalizePeriodClose). Showing it again would cause duplication.
    });

    return events;
}

// ============================================================
// attachSimpleStoryBalances — add running balanceAfter to events
// ============================================================
function attachSimpleStoryBalances(events, unitId) {
    events.sort((a, b) => compareFinancialEvents(a, b, false));
    let balance = 0;
    events.forEach(e => {
        if (e.category === 'debt') balance += e.amount;
        else if (e.category === 'deposit' || e.category === 'forgive') balance -= e.amount;
        e.balanceAfter = balance;
    });
}

// ============================================================
// renderSimpleUnitStoryCard — HTML card for one event in unit report
// ============================================================
function renderSimpleUnitStoryCard(line) {
    const colorMap = {
        debt: 'border-rose-200 bg-rose-50/40',
        deposit: 'border-emerald-200 bg-emerald-50/40',
        forgive: 'border-slate-200 bg-slate-50/40',
        neutral: 'border-slate-200 bg-white'
    };
    const amtColor = txEffectColorForEvent(line);
    const border = colorMap[line.category] || colorMap.neutral;
    const periodLink = line.periodId ? ` data-period-link="${line.periodId}" tabindex="0" role="button"` : '';
    const periodBadge = line.periodName
        ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">${line.periodName}</span>`
        : '';
    const emergencyBadge = line.isEmergency
        ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 border border-orange-200">اضطراری</span>'
        : '';
    const hintText = line.hint ? `<div class="text-[10px] font-bold text-slate-400 mt-0.5">${line.hint}</div>` : '';
    const balText = line.balanceAfter !== undefined ? simpleStoryBalanceLabel(line.balanceAfter) : '';
    const balColor = line.balanceAfter !== undefined
        ? (Math.abs(line.balanceAfter) < 0.1 ? 'text-emerald-600' : (line.balanceAfter > 0 ? 'text-rose-600' : 'text-emerald-600'))
        : 'text-slate-400';

    return `<div class="p-3 rounded-xl border-2 ${border} mb-2 transition-all ${periodLink ? 'cursor-pointer active:scale-[0.98]' : ''}"${periodLink}>
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="font-bold text-sm text-slate-800 leading-relaxed">${line.text}</div>
                ${hintText}
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span class="text-[10px] font-bold text-slate-400">${line.date}</span>
                    ${periodBadge}${emergencyBadge}
                </div>
            </div>
            <div class="text-left shrink-0">
                <div class="font-black text-lg ${amtColor}" dir="ltr">${line.category === 'neutral' ? '—' : fmt(line.amount)}</div>
                <div class="text-[10px] font-bold ${balColor} mt-0.5" dir="ltr">${balText}</div>
            </div>
        </div>
    </div>`;
}

// ============================================================
// finalizePeriodClose — lock and close a period
// ============================================================
function finalizePeriodClose(p) {
    if (!p || !p.isStarted) return;
    p.isClosed = true;
    p.closedAt = getPersianDateTime();
    p.frozenExpenses = JSON.parse(JSON.stringify(p.expenses));

    p.charges.forEach(c => {
        const u = findUnit(c.unitId);
        if (!u) return;
        const debts = getPastDebts(u.id, p.id);

        // Lock debts snapshot
        c.lockedDebts = { pastMonthly: debts.pastMonthly, pastSpecial: debts.pastSpecial };

        // Freeze charge row
        c.frozen = {
            amount: c.amount,
            paidAmount: c.paidAmount || 0,
            paidPastMonthly: c.paidPastMonthly || 0,
            paidPastSpecial: c.paidPastSpecial || 0,
            payDate: c.payDate || null,
            snapshot: c.snapshot ? JSON.parse(JSON.stringify(c.snapshot)) : null,
            details: c.details ? JSON.parse(JSON.stringify(c.details)) : null,
            autoCreditApplied: c.autoCreditApplied || 0,
            autoCreditAppliedSpecial: c.autoCreditAppliedSpecial || 0
        };

        // Transfer unpaid charge to ledger
        const unpaid = Math.max(0, (c.amount || 0) - (c.frozen.paidAmount || 0));
        if (unpaid > 0.01) {
            const desc = `انتقال مانده شارژ از دوره ${p.name}${periodLedgerTag(p.id)}`;
            pushLedgerEntry(u, getPersianDateTime(), 'debt', unpaid, desc, {
                txKind: TX_KIND.CHARGE_TRANSFER,
                periodId: p.id
            });
        }

        // Overpay credit
        const overpay = Math.max(0, (c.frozen.paidAmount || 0) - (c.amount || 0));
        if (overpay > 0.01) {
            const desc = `بستانکاری شارژ از دوره ${p.name}${periodLedgerTag(p.id)}`;
            pushLedgerEntry(u, getPersianDateTime(), 'payment', overpay, desc, {
                txKind: TX_KIND.OVERPAY_CREDIT,
                periodId: p.id
            });
        }

        // Past monthly settlement
        const tickM = c.frozen.paidPastMonthly || 0;
        if (tickM > 0.01) {
            pushLedgerEntry(u, getPersianDateTime(), 'payment', tickM,
                pastMonthlyPaymentDesc(p.name, p.id), {
                txKind: TX_KIND.PAST_MONTHLY_PAY,
                periodId: p.id
            });
        }

        // Past special settlement
        const tickS = c.frozen.paidPastSpecial || 0;
        if (tickS > 0.01) {
            pushLedgerEntry(u, getPersianDateTime(), 'payment', tickS,
                pastSpecialPaymentDesc(p.name, p.id), {
                txKind: TX_KIND.PAST_SPECIAL_PAY,
                periodId: p.id
            });
        }

        // Credit-apply entries
        const autoC = c.autoCreditApplied || 0;
        if (autoC > 0.01) {
            const desc = `استفاده از بستانکاری در فاکتور ${p.name}${periodLedgerTag(p.id)}`;
            pushLedgerEntry(u, getPersianDateTime(), 'payment', autoC, desc, {
                txKind: TX_KIND.CREDIT_APPLY,
                periodId: p.id
            });
        }
    });
}

// ============================================================
// askDebtorsReportType — prompt summary vs detailed
// ============================================================
function askDebtorsReportType() {
    customConfirm(
        'نوع گزارش بدهکاران',
        'گزارش خلاصه فقط جمع بدهی هر واحد را نمایش می‌دهد. گزارش مفصل ریز جزئیات دوره‌ها و بدهی‌های پیشین را شامل می‌شود.',
        'خلاصه',
        'indigo',
        () => printDebtorsReport('summary'),
        'مفصل',
        () => printDebtorsReport('detailed')
    );
}

function printDebtorsReport(mode) {
    const allDebts = calculateAllDebts();
    const debtUnits = db.units.filter(u => (allDebts[u.id] || 0) > 0.01);

    if (!debtUnits.length) {
        customAlert('success', 'بدون بدهکار', 'در حال حاضر هیچ واحدی بدهکار نیست!');
        return;
    }

    let html = '';

    if (mode === 'detailed') {
        html = buildDebtorsDetailedHtml(debtUnits, allDebts);
    } else {
        html = buildDebtorsSummaryHtml(debtUnits, allDebts);
    }

    openReportView('گزارش بدهکاران', html, 'debtors-' + mode);
}

function buildDebtorsSummaryHtml(debtUnits, allDebts) {
    const dateStr = getPersianDateTime();
    const total = debtUnits.reduce((s, u) => s + (allDebts[u.id] || 0), 0);
    const density = debtUnits.length <= 10 ? '' : (debtUnits.length <= 16 ? 'density-sm' : (debtUnits.length <= 22 ? 'density-md' : 'density-compact'));

    let html = `<div class="debtors-report-summary ${density}">
    <h2 class="debtors-title">گزارش بدهکاران ساختمان پارس</h2>
    <p class="debtors-meta text-center text-sm text-slate-600 font-bold mb-4">تاریخ تهیه: ${dateStr}</p>
    <table class="debtors-table w-full border-collapse border-2 border-black text-center font-bold mb-4">
    <thead class="bg-slate-200"><tr>
        <th class="border-2 border-black p-2">واحد</th>
        <th class="border-2 border-black p-2">مبلغ بدهی</th>
    </tr></thead><tbody>`;

    debtUnits.forEach((u, i) => {
        const cls = i % 2 === 1 ? 'bg-slate-50' : '';
        html += `<tr class="${cls}">
            <td class="border-2 border-black p-2">${unitCellLabelHtml(u.id, u.name)}</td>
            <td class="border-2 border-black p-2 text-rose-600 font-black" dir="ltr">${fmt(allDebts[u.id])}</td>
        </tr>`;
    });

    html += `</tbody><tfoot class="bg-slate-800"><tr>
        <td class="border-2 border-black p-2 text-white font-black">مجموع</td>
        <td class="border-2 border-black p-2 text-rose-400 font-black" dir="ltr">${fmt(total)}</td>
    </tr></tfoot></table></div>`;

    return html;
}

function buildDebtorsDetailedHtml(debtUnits, allDebts) {
    const dateStr = getPersianDateTime();
    let html = `<div class="debtors-report-detailed">
    <h2 class="text-3xl font-black text-center border-b-4 border-black pb-3 mb-4">گزارش بدهکاران — جزئیات</h2>
    <p class="text-center text-sm text-slate-600 font-bold mb-6">ساختمان پارس — تاریخ: ${dateStr}</p>`;

    debtUnits.forEach(u => {
        const totalDebt = allDebts[u.id] || 0;

        // Use the same story collector as the unit report page — clean and deduplicated
        let events = collectSimpleUnitStory(u.id);
        attachSimpleStoryBalances(events, u.id);
        events.sort((a, b) => compareFinancialEvents(a, b, true));

        // Only keep meaningful debt/deposit/forgive events
        const rows = events.filter(e => e.category === 'debt' || e.category === 'deposit' || e.category === 'forgive');

        html += `<div class="mb-5 p-4 border-2 border-slate-300 rounded-xl">
        <h3 class="font-black text-lg mb-3 border-b pb-2">
            ${unitDisplayLabel(u)} — بدهی: <span class="text-rose-600" dir="ltr">${fmt(totalDebt)}</span>
        </h3>`;

        if (!rows.length) {
            html += '<p class="text-slate-400 text-sm text-center py-2">سابقه‌ای یافت نشد</p>';
        } else {
            html += '<table class="w-full border-collapse text-sm font-bold">';
            rows.forEach(r => {
                const isDebt = r.category === 'debt';
                const color = r.isEmergency
                    ? (isDebt ? 'text-orange-700' : 'text-orange-600')
                    : (isDebt ? 'text-rose-600' : 'text-emerald-600');
                const sign = isDebt ? '+' : '−';
                html += `<tr>
                    <td class="p-1.5 text-right text-slate-700">${r.text}</td>
                    <td class="p-1.5 text-left ${color} font-black" dir="ltr">${sign}${fmt(r.amount)}</td>
                </tr>`;
            });
            html += '</table>';
        }

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ============================================================
// printChartReport — fund chart / bar chart report
// ============================================================
function printChartReport() {
    const { income, expense, totalF } = computeFundTotals();
    const dateStr = getPersianDateTime();
    const initFund = db.initialFund || 0;

    // Period breakdown
    const started = getStartedPeriodsSorted();
    let html = `<div class="chart-report">
    <h2 class="text-3xl font-black text-center border-b-4 border-black pb-3 mb-2">نمودار صندوق ساختمان پارس</h2>
    <p class="text-center text-sm text-slate-600 font-bold mb-4">تاریخ تهیه: ${dateStr}</p>

    <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="p-3 border-2 border-slate-300 rounded-xl text-center">
            <div class="text-sm font-bold text-slate-500">موجودی اولیه</div>
            <div class="text-xl font-black text-slate-800" dir="ltr">${fmt(initFund)}</div>
        </div>
        <div class="p-3 border-2 border-emerald-300 rounded-xl text-center">
            <div class="text-sm font-bold text-emerald-600">کل دریافتی</div>
            <div class="text-xl font-black text-emerald-700" dir="ltr">${fmt(income)}</div>
        </div>
        <div class="p-3 border-2 border-rose-300 rounded-xl text-center">
            <div class="text-sm font-bold text-rose-600">کل مخارج</div>
            <div class="text-xl font-black text-rose-700" dir="ltr">${fmt(expense)}</div>
        </div>
        <div class="p-3 border-2 border-indigo-300 rounded-xl text-center">
            <div class="text-sm font-bold text-indigo-600">موجودی فعلی</div>
            <div class="text-xl font-black ${totalF >= 0 ? 'text-emerald-700' : 'text-rose-700'}" dir="ltr">${fmt(totalF)}</div>
        </div>
    </div>`;

    if (started.length) {
        html += `<table class="w-full border-collapse border-2 border-black text-center text-sm font-bold mb-4">
        <thead class="bg-slate-200"><tr>
            <th class="border-2 border-black p-2">دوره</th>
            <th class="border-2 border-black p-2">شارژ کل</th>
            <th class="border-2 border-black p-2">دریافتی</th>
            <th class="border-2 border-black p-2">مخارج</th>
        </tr></thead><tbody>`;

        started.forEach((p, i) => {
            const tC = p.charges.reduce((s, c) => {
                const row = getChargeRow(p, c);
                return s + (Number(row.amount) || 0);
            }, 0);
            const tI = getPeriodTickIncome(p);
            const tE = getPeriodExpenses(p);
            html += `<tr class="${i % 2 === 1 ? 'bg-slate-50' : ''}">
                <td class="border-2 border-black p-2">${p.name}</td>
                <td class="border-2 border-black p-2" dir="ltr">${fmt(tC)}</td>
                <td class="border-2 border-black p-2 text-emerald-600" dir="ltr">${fmt(tI)}</td>
                <td class="border-2 border-black p-2 text-rose-600" dir="ltr">${fmt(tE)}</td>
            </tr>`;
        });

        html += '</tbody></table>';
    }

    html += '</div>';
    openReportView('نمودار صندوق', html, 'chart');
}

// ============================================================
// Deposits Report Functions
// ============================================================
function openDepositsReportModal() {
    pushNav({ type: 'deposits-report' });
    onDepReportRangeChange();
    document.getElementById('modal-deposits-report').classList.remove('hidden');
}

function onDepReportRangeChange() {
    const checkedRadio = document.querySelector('input[name="dep-report-range"]:checked');
    const val = checkedRadio ? checkedRadio.value : 'all';
    const customInput = document.getElementById('dep-report-custom-n');
    if (customInput) {
        customInput.disabled = val !== 'custom';
        if (val === 'custom') customInput.focus();
    }
}

function getDepReportPeriodCount() {
    const checkedRadio = document.querySelector('input[name="dep-report-range"]:checked');
    const val = checkedRadio ? checkedRadio.value : 'all';
    if (val === 'all') return Infinity;
    if (val === 'custom') {
        const n = parse(document.getElementById('dep-report-custom-n')?.value || '0');
        return n > 0 ? n : Infinity;
    }
    return parseInt(val, 10) || Infinity;
}

function generateDepositsReport() {
    const maxPeriods = getDepReportPeriodCount();
    const started = getStartedPeriodsSorted();
    const periodsInRange = maxPeriods >= started.length
        ? started
        : started.slice(started.length - maxPeriods);

    const dateStr = getPersianDateTime();
    const rangeLabel = maxPeriods === Infinity
        ? 'تمام دوره‌ها'
        : `${toFaDigit(maxPeriods)} دورهٔ اخیر`;

    let html = `<div class="deposits-report">
    <h2 class="text-3xl font-black text-center border-b-4 border-black pb-3 mb-2">گزارش واریزی‌ها و سوابق بدهی</h2>
    <p class="text-center text-sm text-slate-600 font-bold mb-1">ساختمان پارس</p>
    <p class="text-center text-xs text-slate-500 font-bold mb-4">تاریخ: ${dateStr} — بازه: ${rangeLabel}</p>`;

    db.units.forEach(u => {
        const totalDebt = getUnitTotalDebt(u.id);
        const balLabel = simpleStoryBalanceLabel(totalDebt);
        const balCls = Math.abs(totalDebt) < 0.1 ? 'text-emerald-700' : (totalDebt > 0 ? 'text-rose-700' : 'text-emerald-700');

        html += `<div class="mb-4 border-2 border-slate-300 rounded-xl p-3">
        <div class="flex justify-between items-center mb-2 border-b pb-2">
            <span class="font-black text-base">${unitDisplayLabel(u)}</span>
            <span class="font-black ${balCls}" dir="ltr">${balLabel}</span>
        </div>`;

        // Period charges in range
        let hasRows = false;
        html += `<table class="w-full border-collapse text-xs font-bold">
        <thead class="bg-emerald-100"><tr>
            <th class="border border-black p-1">دوره</th>
            <th class="border border-black p-1">شارژ</th>
            <th class="border border-black p-1">پرداختی</th>
            <th class="border border-black p-1">بدهی پیشین</th>
            <th class="border border-black p-1">منبع</th>
        </tr></thead><tbody>`;

        periodsInRange.forEach(p => {
            const c = getUnitChargeInPeriod(u.id, p);
            if (!c) return;
            const row = getChargeRow(p, c);
            const amt = Number(row.amount) || 0;
            if (amt < 0.01) return;
            hasRows = true;
            const paid = Number(row.paidAmount) || 0;
            const tickM = Number(row.paidPastMonthly) || 0;
            const tickS = Number(row.paidPastSpecial) || 0;
            const pastTotal = tickM + tickS;
            const sourceLabel = paid > 0.01 ? 'تیک دوره' : '—';

            html += `<tr>
                <td class="border border-black p-1">${p.name}</td>
                <td class="border border-black p-1" dir="ltr">${fmt(amt)}</td>
                <td class="border border-black p-1 ${paid >= amt - 0.01 ? 'text-emerald-600' : 'text-rose-600'}" dir="ltr">${fmt(paid)}</td>
                <td class="border border-black p-1" dir="ltr">${pastTotal > 0.01 ? fmt(pastTotal) : '—'}</td>
                <td class="border border-black p-1 text-slate-500">${sourceLabel}</td>
            </tr>`;
        });

        // Manual transactions (always shown regardless of range)
        const manualTxs = (u.transactions || []).filter(t =>
            !isAutoPeriodLedgerEntry(t) && !isPeriodTickMirrorLedgerEntry(t)
        );
        manualTxs.forEach(t => {
            hasRows = true;
            const cat = t.type === 'payment' ? 'واریز دستی' : (t.type === 'debt' ? 'بدهی دستی' : 'بخشودگی');
            const color = t.type === 'payment' ? 'text-emerald-600' : (t.type === 'debt' ? 'text-rose-600' : 'text-slate-600');
            html += `<tr class="bg-amber-50/50">
                <td class="border border-black p-1 text-slate-500">${t.date || '—'}</td>
                <td class="border border-black p-1" colspan="2">${stripPeriodLedgerTag(t.desc || '—')}</td>
                <td class="border border-black p-1 ${color} font-black" dir="ltr">${fmt(t.amount)}</td>
                <td class="border border-black p-1 text-amber-700 text-[9px]">${cat}</td>
            </tr>`;
        });

        if (!hasRows) html += '<tr><td class="border border-black p-1 text-slate-400" colspan="5">بدون سابقه</td></tr>';
        html += '</tbody></table></div>';
    });

    html += '</div>';

    closeModal('deposits-report');
    openReportView('گزارش واریزی‌ها', html, 'deposits');
}
