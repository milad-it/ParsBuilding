// --- Application Initialization & Router/Navigation ---

let navStack = [];
let navSyncing = false;
let exitPromptOpen = false;
let pendingExitNavigation = false;
let appExiting = false;
let exitBackCount = 0;
const MAX_EXIT_BACKS = 35;

function getActiveTab() {
    if (!document.getElementById('tab-units').classList.contains('hidden')) return 'units';
    if (!document.getElementById('tab-periods').classList.contains('hidden')) return 'periods';
    return 'reports';
}

function navEntriesEqual(a, b) {
    if (!a || !b) return false;
    return a.type === b.type && a.tab === b.tab && String(a.unitId) === String(b.unitId)
        && String(a.periodId) === String(b.periodId) && !!a.fromUnitReport === !!b.fromUnitReport
        && a.reportKind === b.reportKind;
}

function entryToHash(e) {
    if (!e) return '';
    switch (e.type) {
        case 'tab': return 'tab/' + e.tab;
        case 'unit': return 'unit/' + e.unitId;
        case 'report-unit': return 'unit/' + e.unitId + '/report';
        case 'period': return 'period/' + e.periodId + (e.fromUnitReport ? '/u' + e.unitId : '');
        case 'report-view': return 'reports/view' + (e.reportKind ? '/' + e.reportKind : '');
        case 'deposits-report': return 'reports/deposits-setup';
        case 'new-period': return 'periods/new';
        default: return '';
    }
}

function navHistoryUrl(entry) {
    const hash = entryToHash(entry);
    const base = location.pathname + location.search;
    return hash ? base + '#' + hash : base || ' ';
}

function updateLocationHash(replace) {
    const entry = navStack[navStack.length - 1];
    const url = navHistoryUrl(entry);
    const state = { navDepth: navStack.length, exitTrap: false };
    navSyncing = true;
    try {
        if (replace) history.replaceState(state, '', url);
        else history.pushState(state, '', url);
    } catch (e) { }
    navSyncing = false;
}

function ensureExitTrapIfRoot() {
    if (navStack.length > 1) return;
    if (history.state && history.state.exitTrap) return;
    const entry = navStack[navStack.length - 1];
    const url = navHistoryUrl(entry);
    navSyncing = true;
    try {
        history.pushState({ navDepth: navStack.length, exitTrap: true }, '', url);
    } catch (e) { }
    navSyncing = false;
}

function showExitScreen() {
    appExiting = false;
    pendingExitNavigation = false;
    exitBackCount = 0;
    const app = document.querySelector('.app-container');
    if (app) app.classList.add('hidden');
    document.getElementById('app-exit-screen').classList.remove('hidden');
}

function cancelExitScreen() {
    document.getElementById('app-exit-screen').classList.add('hidden');
    const app = document.querySelector('.app-container');
    if (app) app.classList.remove('hidden');
    appExiting = false;
    pendingExitNavigation = false;
    exitBackCount = 0;
    initNavStack(getActiveTab());
    applyTabOnly(getActiveTab());
}

function stepExitBack() {
    if (!appExiting) return;
    if (exitBackCount >= MAX_EXIT_BACKS) {
        showExitScreen();
        return;
    }
    exitBackCount++;
    try { history.back(); } catch (e) { showExitScreen(); }
}

function confirmLeaveApplication() {
    appExiting = true;
    pendingExitNavigation = true;
    exitPromptOpen = false;
    exitBackCount = 0;
    hideAllModalsOnly();
    activeUnitId = null;
    activePeriodId = null;
    returnToUnitReportAfterPeriod = false;
    navStack = [{ type: 'tab', tab: getActiveTab() }];
    navSyncing = true;
    try {
        history.replaceState({ appRoot: true }, '', location.pathname + location.search);
    } catch (e) { }
    navSyncing = false;
    try { window.close(); } catch (e) { }
    setTimeout(stepExitBack, 50);
}

function promptExitApplication() {
    if (exitPromptOpen) return;
    exitPromptOpen = true;
    customConfirm(
        'خروج از برنامه',
        'آیا از خروج مطمئن هستید؟',
        'بله، خروج',
        'rose',
        () => {
            exitPromptOpen = false;
            confirmLeaveApplication();
        },
        'ماندن',
        () => {
            exitPromptOpen = false;
            ensureExitTrapIfRoot();
        }
    );
}

function setAppHash(hash) {
    if (navSyncing) return;
    if (!hash) {
        navStack = [{ type: 'tab', tab: getActiveTab() }];
        updateLocationHash(true);
        return;
    }
    if (hash.startsWith('modal-unit')) {
        const m = hash.match(/unit[\/](\d+)/);
        pushNav({ type: 'unit', unitId: m ? m[1] : activeUnitId });
    }
}

function applyTabOnly(tab) {
    ['units', 'periods', 'reports'].forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        const nav = document.getElementById(`nav-${t}`);
        if (tabEl) tabEl.classList.toggle('hidden', t !== tab);
        if (nav) {
            if (t === tab) nav.classList.replace('text-slate-400', 'text-indigo-600');
            else nav.classList.replace('text-indigo-600', 'text-slate-400');
        }
    });
    if (tab === 'units') renderUnits();
    if (tab === 'periods') { renderPeriods(); updateNewPeriodButton(); }
    if (tab === 'reports') updateGlobalReports();
}

function ensureNavTabAnchor(tab) {
    const t = tab || getActiveTab();
    if (!navStack.length || navStack[0].type !== 'tab') {
        navStack.unshift({ type: 'tab', tab: t });
    }
}

function pushNav(entry) {
    entry.tab = entry.tab || getActiveTab();
    if (entry.type !== 'tab') ensureNavTabAnchor(entry.tab);
    const top = navStack[navStack.length - 1];
    if (top && navEntriesEqual(top, entry)) return;
    navStack.push(entry);
    updateLocationHash(false);
}

function replaceNavTop(entry) {
    entry.tab = entry.tab || getActiveTab();
    if (navStack.length) navStack[navStack.length - 1] = entry;
    else navStack.push(entry);
    updateLocationHash(true);
}

function restoreNavTop() {
    navSyncing = true;
    const e = navStack[navStack.length - 1];
    hideAllModalsOnly();
    unitModalEditMode = false;
    unitEditSnapshot = null;

    if (!e || e.type === 'tab') {
        activeUnitId = null;
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e ? e.tab : 'units');
    } else if (e.type === 'unit') {
        activeUnitId = e.unitId;
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e.tab);
        showUnitModalOnly(e.unitId);
    } else if (e.type === 'report-unit') {
        activeUnitId = e.unitId;
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e.tab);
        showUnitReportOnly(e.unitId);
    } else if (e.type === 'period') {
        activeUnitId = e.fromUnitReport ? e.unitId : null;
        returnToUnitReportAfterPeriod = !!e.fromUnitReport;
        applyTabOnly(e.tab);
        openPeriodDetailUI(e.periodId, { fromUnitReport: e.fromUnitReport });
    } else if (e.type === 'report-view') {
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e.tab);
        restoreReportViewContent(e);
        document.getElementById('modal-report-view').classList.remove('hidden');
    } else if (e.type === 'deposits-report') {
        activeUnitId = null;
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e.tab);
        onDepReportRangeChange();
        document.getElementById('modal-deposits-report').classList.remove('hidden');
    } else if (e.type === 'new-period') {
        activeUnitId = null;
        activePeriodId = null;
        returnToUnitReportAfterPeriod = false;
        applyTabOnly(e.tab);
        document.getElementById('modal-new-period').classList.remove('hidden');
    }
    navSyncing = false;
}

function popNav() {
    if (navStack.length > 1) {
        navStack.pop();
        restoreNavTop();
        updateLocationHash(true);
        ensureExitTrapIfRoot();
        return true;
    }
    return false;
}

function initNavStack(tab) {
    navStack = [{ type: 'tab', tab: tab || 'units' }];
    updateLocationHash(true);
    ensureExitTrapIfRoot();
}

function switchTab(tab) {
    hideAllModalsOnly();
    activeUnitId = null;
    activePeriodId = null;
    returnToUnitReportAfterPeriod = false;
    unitModalEditMode = false;
    unitEditSnapshot = null;
    initNavStack(tab);
    applyTabOnly(tab);
}

// Global Browser Navigation Listeners
window.addEventListener('beforeunload', function (e) {
    if (pendingExitNavigation || appExiting) return;
    const msg = 'آیا از خروج مطمئن هستید؟';
    e.preventDefault();
    e.returnValue = msg;
    return msg;
});

window.addEventListener('popstate', function (ev) {
    if (navSyncing) return;
    if (exitPromptOpen) return;

    if (appExiting) {
        const st = ev.state;
        if (st && (st.exitTrap || (typeof st.navDepth === 'number' && !st.appRoot))) {
            setTimeout(stepExitBack, 0);
            return;
        }
        if (st && st.appRoot) {
            setTimeout(stepExitBack, 0);
            return;
        }
        appExiting = false;
        pendingExitNavigation = false;
        exitBackCount = 0;
        return;
    }

    const st = ev.state;
    const depth = st && st.navDepth;

    if (typeof depth === 'number' && depth >= 1 && depth < navStack.length) {
        while (navStack.length > depth) navStack.pop();
        restoreNavTop();
        ensureExitTrapIfRoot();
        return;
    }

    if (navStack.length > 1) {
        navStack.pop();
        restoreNavTop();
        updateLocationHash(true);
        ensureExitTrapIfRoot();
        return;
    }

    if (st && st.exitTrap) {
        promptExitApplication();
        return;
    }

    promptExitApplication();
});

// App Initialization
function init() {
    const saved = localStorage.getItem('app_db_pars_v6');
    if (saved) {
        db = JSON.parse(saved);
    } else {
        // Migration
        const oldDb = localStorage.getItem('app_db_pars_final') || localStorage.getItem('app_db_pars_v5') || localStorage.getItem('app_db_pars');
        if (oldDb) { db = JSON.parse(oldDb); }
        else { for (let i = 1; i <= 20; i++) db.units.push({ id: i, name: '', occupants: 0, occType: 'owner', ownerPhone: '', tenantPhone: '', hasPackage: false, transactions: [] }); }
    }

    if (db.initialFund === undefined) db.initialFund = 0;

    db.units.forEach(u => {
        if (!u.transactions) u.transactions = [];
        if (u.isTenant !== undefined && !u.occType) {
            u.occType = u.isTenant ? 'tenant' : 'owner';
            u.ownerPhone = u.isTenant ? '' : (u.phone || '');
            u.tenantPhone = u.isTenant ? (u.phone || '') : '';
            delete u.isTenant;
            delete u.phone;
        }
        if (!u.occType) { u.occType = 'owner'; u.ownerPhone = ''; u.tenantPhone = ''; }
        normalizeUnitContactFields(u);
    });

    db.periods.filter(p => !p.isClosed && p.isStarted).forEach(p => {
        try { calculateLogic(p); } catch (e) { }
    });
    let migrated = false;
    db.units.forEach(u => {
        if (migrateLedgerTransactions(u)) migrated = true;
        let repaired = repairLedgerDuplicateManualPayments(u);
        if (repairLedgerStaleChargePayments(u)) repaired = true;
        if (repaired) delete u.settledManualPayments;
        sanitizeManualPeriodState(u);
        capPastTicksOnUnit(u.id);
    });

    localStorage.setItem('app_db_pars_v6', JSON.stringify(db));

    renderUnits();
    renderPeriods();
    updateGlobalReports();
    updateNewPeriodButton();
    updateUndoRedoButtons();
    initNavStack('units');
}

/** جلوگیری از رفرش صفحه با کشیدن به پایین (pull-to-refresh) */
(function preventPullToRefresh() {
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const y = e.touches[0].clientY;
        if (y <= touchStartY) return;
        let el = e.target;
        while (el && el !== document.documentElement) {
            const st = window.getComputedStyle(el);
            const scrollable = (st.overflowY === 'auto' || st.overflowY === 'scroll')
                && el.scrollHeight > el.clientHeight + 1;
            if (scrollable && el.scrollTop > 0) return;
            el = el.parentElement;
        }
        e.preventDefault();
    }, { passive: false });
})();

window.onload = init;

function openSettingsModal() {
    document.getElementById('modal-settings').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('modal-settings').classList.add('hidden');
}

function resetPeriodsData() {
    customConfirm(
        'حذف شارژها', 
        'آیا از حذف تمام شارژها و دوره‌های مالی اطمینان دارید؟', 
        'بله، حذف کن', 
        'rose', 
        () => {
            saveDB(true);
            db.periods = [];
            db.units.forEach(u => {
                if (u.transactions) {
                    u.transactions = u.transactions.filter(t => t.type !== 'debt' && t.type !== 'payment' && t.type !== 'forgive');
                }
            });
            saveDB(false);
            closeSettingsModal();
            showToast('دوره‌های مالی با موفقیت حذف شدند.', 'success');
            renderPeriods();
            updateGlobalReports();
        }
    );
}

function resetUnitsData() {
    customConfirm(
        'ریست واحدها', 
        'آیا از ریست اطلاعات واحدها و تراکنش‌های دستی اطمینان دارید؟', 
        'بله، ریست کن', 
        'rose', 
        () => {
            saveDB(true);
            db.units.forEach(u => {
                u.occupants = 0;
                u.name = '';
                u.ownerName = '';
                u.ownerPhone = '';
                u.tenantPhone = '';
                u.occType = 'owner';
                u.hasPackage = false;
                u.transactions = [];
            });
            saveDB(false);
            closeSettingsModal();
            showToast('اطلاعات واحدها با موفقیت ریست شد.', 'success');
            renderUnits();
            updateGlobalReports();
        }
    );
}

function resetFundData() {
    customConfirm(
        'ریست صندوق', 
        'آیا از صفر کردن موجودی اولیه صندوق اطمینان دارید؟', 
        'بله', 
        'rose', 
        () => {
            saveDB(true);
            db.initialFund = 0;
            saveDB(false);
            closeSettingsModal();
            showToast('موجودی اولیه صندوق صفر شد.', 'success');
            updateGlobalReports();
        }
    );
}

function resetAllApp() {
    customConfirm(
        'ریست کامل', 
        'هشدار جدی: آیا از پاک کردن کل اطلاعات برنامه مطمئن هستید؟ این عملیات قابل بازگشت نیست.', 
        'بله، همه را پاک کن', 
        'rose', 
        () => {
            saveDB(true);
            db.periods = [];
            db.units.forEach(u => {
                u.occupants = 0;
                u.name = '';
                u.ownerName = '';
                u.ownerPhone = '';
                u.tenantPhone = '';
                u.occType = 'owner';
                u.hasPackage = false;
                u.transactions = [];
            });
            db.initialFund = 0;
            saveDB(false);
            closeSettingsModal();
            showToast('کل اطلاعات برنامه با موفقیت پاک شد.', 'success');
            renderPeriods();
            renderUnits();
            updateGlobalReports();
        }
    );
}
