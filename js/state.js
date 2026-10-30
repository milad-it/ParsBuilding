// --- Global State Management ---

let db = { units: [], periods: [], initialFund: 0 };
let undoStack = [];
let redoStack = [];
let activePeriodId = null;
let activeUnitId = null;
let unitModalEditMode = false;
let unitEditSnapshot = null;
/** پس از بازگشت از جزئیات شارژ، دوباره گزارش همان واحد باز شود */
let returnToUnitReportAfterPeriod = false;
let newPeriodMode = 'monthly';
let titleClickCount = 0;
let titleClickTimeout = null;

function saveDB(pushHistory = true) {
    const newStateStr = JSON.stringify(db);
    if (pushHistory) {
        const prevStateStr = localStorage.getItem('app_db_pars_v6');
        if (prevStateStr && (undoStack.length === 0 || undoStack[undoStack.length - 1] !== prevStateStr)) {
            undoStack.push(prevStateStr);
            if (undoStack.length > 50) undoStack.shift();
            redoStack = [];
        }
    }
    try { localStorage.setItem('app_db_pars_v6', newStateStr); } catch (e) { }
    if (typeof idbSet === 'function') {
        idbSet('app_db_pars_v6', JSON.parse(newStateStr)).catch(() => {});
    }
    updateUndoRedoButtons();
    updateGlobalReports();
}

function hasDraftPeriod() {
    return db.periods.some(p => !p.isClosed && !p.isStarted);
}

function updateNewPeriodButton() {
    const btn = document.getElementById('btn-new-period');
    if (!btn) return;
    const blocked = hasDraftPeriod();
    btn.disabled = blocked;
    btn.classList.toggle('opacity-50', blocked);
    btn.classList.toggle('pointer-events-none', blocked);
    btn.classList.toggle('cursor-not-allowed', blocked);
    if (blocked) btn.title = 'ابتدا دوره در حال تنظیم را شروع یا حذف کنید';
    else btn.removeAttribute('title');
}

function openInitFundModal() {
    const inp = document.getElementById('inp-init-fund');
    inp.value = db.initialFund ? fmt(db.initialFund) : '';
    updateWords(inp, 'init-fund-w');
    document.getElementById('modal-init-fund').classList.remove('hidden');
}

function closeInitFundModal() {
    document.getElementById('modal-init-fund').classList.add('hidden');
}

function confirmInitFund() {
    saveDB(true);
    db.initialFund = parse(document.getElementById('inp-init-fund').value);
    saveDB(false);
    closeInitFundModal();
    updateGlobalReports();
    showToast('موجودی اولیه صندوق ذخیره شد', 'success');
}

function handleTitleClick() {
    titleClickCount++;
    clearTimeout(titleClickTimeout);
    titleClickTimeout = setTimeout(() => { titleClickCount = 0; }, 3000);

    if (titleClickCount === 5) {
        const actions = document.getElementById('header-actions');
        if (actions.classList.contains('invisible')) {
            actions.classList.remove('invisible');
            showToast('دکمه‌های بازگشت عملیات فعال شدند', 'success');
        } else {
            actions.classList.add('invisible');
            showToast('دکمه‌های بازگشت عملیات مخفی شدند', 'info');
        }
        titleClickCount = 0;
    }
}

function syncHeaderLayout() {
    const actions = document.getElementById('header-actions');
    const spacer = document.getElementById('header-spacer');
    const title = document.getElementById('header-title');
    const redoVisible = redoStack.length > 0;
    if (actions && spacer) spacer.style.width = actions.offsetWidth + 'px';
    if (title) {
        title.classList.toggle('translate-x-3', redoVisible);
        title.classList.toggle('sm:translate-x-5', redoVisible);
    }
}

function updateUndoRedoButtons() {
    const bU = document.getElementById('btn-undo');
    const bR = document.getElementById('btn-redo');
    if (!bU || !bR) return;
    if (undoStack.length > 0) {
        bU.classList.remove('opacity-40', 'pointer-events-none');
        bU.classList.add('bg-indigo-600', 'text-white');
        bU.classList.remove('bg-slate-800');
    } else {
        bU.classList.add('opacity-40', 'pointer-events-none');
        bU.classList.remove('bg-indigo-600', 'text-white');
        bU.classList.add('bg-slate-800');
    }

    if (redoStack.length > 0) {
        bR.classList.remove('hidden', 'opacity-40', 'pointer-events-none');
        bR.classList.add('bg-indigo-600', 'text-white');
        bR.classList.remove('bg-slate-800');
    } else {
        bR.classList.add('hidden', 'opacity-40', 'pointer-events-none');
        bR.classList.add('bg-indigo-600', 'text-white');
        bR.classList.remove('bg-slate-800');
    }
    requestAnimationFrame(syncHeaderLayout);
}

function undo() {
    if (undoStack.length > 0) {
        const currentStateStr = localStorage.getItem('app_db_pars_v6');
        redoStack.push(currentStateStr);
        const prevStateStr = undoStack.pop();
        db = JSON.parse(prevStateStr);
        localStorage.setItem('app_db_pars_v6', prevStateStr);
        updateUndoRedoButtons();
        refreshUI();
        showToast('عملیات به عقب برگردانده شد', 'info');
    }
}

function redo() {
    if (redoStack.length > 0) {
        const currentStateStr = localStorage.getItem('app_db_pars_v6');
        undoStack.push(currentStateStr);
        const nextStateStr = redoStack.pop();
        db = JSON.parse(nextStateStr);
        localStorage.setItem('app_db_pars_v6', nextStateStr);
        updateUndoRedoButtons();
        refreshUI();
        showToast('عملیات تکرار شد', 'info');
    }
}

function refreshUI() {
    renderUnits();
    renderPeriods();
    if (activePeriodId) {
        let p = findPeriod(activePeriodId);
        if (p) {
            renderPeriodSetup(p);
            renderPeriodTable(p);
        } else {
            closeModal('period-detail');
        }
    } else if (activeUnitId) {
        if (!document.getElementById('modal-report-unit').classList.contains('hidden')) {
            showUnitReportOnly(activeUnitId);
        } else if (!document.getElementById('modal-unit').classList.contains('hidden')) {
            const u = findUnit(activeUnitId);
            if (u) fillUnitFormFromUnit(u);
        }
    }
    updateGlobalReports();
}

function downloadBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `ParsBuilding_Backup_${new Date().getTime()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function importBackup(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
        try {
            saveDB(true);
            db = JSON.parse(ev.target.result);
            saveDB(false);
            refreshUI();
            customAlert('success', 'موفق', 'اطلاعات با موفقیت جایگزین شد.');
        }
        catch (err) {
            customAlert('error', 'خطا', 'فایل نامعتبر است.');
        }
    };
    r.readAsText(f);
}

// --- UI Alert & Confirm Dialogs ---
function customAlert(type, title, message) {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    let iconHtml = '';
    let iconBox = document.getElementById('alert-icon');
    if (type === 'success') {
        iconBox.className = 'w-20 h-20 bg-emerald-50 text-emerald-500 border-4 border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6';
        iconHtml = `<svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
    } else {
        iconBox.className = 'w-20 h-20 bg-rose-50 text-rose-500 border-4 border-rose-100 rounded-full flex items-center justify-center mx-auto mb-6';
        iconHtml = `<svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    }
    iconBox.innerHTML = iconHtml;
    document.getElementById('modal-alert').classList.remove('hidden');
}

function closeAlert() {
    document.getElementById('modal-alert').classList.add('hidden');
}

let confirmAction = null;
let confirmCancelAction = null;
const CONFIRM_STYLES = {
    rose: {
        btn: 'flex-1 text-white font-black py-4 rounded-2xl bg-rose-600 active:bg-rose-700 text-xl shadow-lg shadow-rose-200',
        icon: 'w-20 h-20 bg-rose-50 text-rose-600 border-4 border-rose-100 rounded-full flex items-center justify-center mx-auto mb-6'
    },
    indigo: {
        btn: 'flex-1 text-white font-black py-4 rounded-2xl bg-indigo-600 active:bg-indigo-700 text-xl shadow-lg shadow-indigo-200',
        icon: 'w-20 h-20 bg-indigo-50 text-indigo-600 border-4 border-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6'
    }
};

function customConfirm(title, message, btnText, btnColor, onConfirm, cancelText, onCancel) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = message;
    const styles = CONFIRM_STYLES[btnColor] || CONFIRM_STYLES.indigo;
    let btn = document.getElementById('confirm-yes');
    btn.innerText = btnText;
    btn.className = styles.btn;
    document.getElementById('confirm-icon-box').className = styles.icon;
    document.getElementById('confirm-no').innerText = cancelText || 'لغو';

    confirmAction = onConfirm;
    confirmCancelAction = onCancel || null;
    document.getElementById('modal-confirm').classList.remove('hidden');
}

function executeConfirm() {
    const action = confirmAction;
    confirmAction = null;
    confirmCancelAction = null;
    document.getElementById('modal-confirm').classList.add('hidden');
    if (action) action();
}

function closeConfirm(invokeCancel) {
    const cancelCb = confirmCancelAction;
    confirmAction = null;
    confirmCancelAction = null;
    document.getElementById('modal-confirm').classList.add('hidden');
    if (invokeCancel === true && cancelCb) cancelCb();
}
