// --- DOM Rendering & UI Component Functions ---

function renderUnits() {
    const list = document.getElementById('units-list');
    if (!list) return;
    list.innerHTML = '';
    let unitDebts = calculateAllDebts();

    db.units.forEach(u => {
        let debtVal = unitDebts[u.id];
        let statusBadge = u.occupants > 0 ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md text-[10px] font-bold">${u.occupants} نفر</span>` : `<span class="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md text-[10px] font-bold">خالی</span>`;
        if (u.hasPackage && u.occupants > 0) statusBadge += ` <span class="bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded-md text-[9px] font-bold">پکیج</span>`;

        let debtLabel = Math.abs(debtVal) < 0.01 ? 'تسویه' : (debtVal < 0 ? 'بستانکار (طلب)' : 'بدهی');

        list.innerHTML += `
        <div onclick="openUnitModal(${u.id})" class="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition-all mb-1">
            <div class="flex items-center gap-4 min-w-0 flex-1">
                <div class="w-12 h-12 shrink-0 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center font-black text-2xl border">${u.id}</div>
                <div class="min-w-0 flex-1">
                    <div class="unit-list-title font-bold text-slate-800 text-lg sm:text-xl" dir="rtl">واحد ${u.id} <span class="text-slate-500 font-normal">(${u.name || '---'})</span></div>
                    <div class="flex gap-1 mt-1">${statusBadge}</div>
                </div>
            </div>
            <div class="text-left">
                <div class="text-[10px] font-bold mb-0.5 ${Math.abs(debtVal) < 0.01 ? 'text-emerald-600' : (debtVal < 0 ? 'text-emerald-600' : 'text-slate-400')}">${debtLabel}</div>
                <div dir="ltr" class="font-black text-lg sm:text-xl ${debtVal > 0.01 ? 'text-rose-500' : (debtVal < -0.01 ? 'text-emerald-500' : 'text-slate-300')}">${Math.abs(debtVal) < 0.01 ? '۰' : fmt(Math.abs(debtVal))}</div>
            </div>
        </div>
    `;
    });
}

function captureUnitEditSnapshot(u) {
    return {
        name: u.name || '',
        occupants: u.occupants || 0,
        occType: u.occType || 'owner',
        ownerName: u.ownerName || '',
        ownerPhone: cleanContactField(u.ownerPhone),
        tenantPhone: cleanContactField(u.tenantPhone),
        hasPackage: !!u.hasPackage
    };
}

function applyUnitEditSnapshot(snap) {
    const u = findUnit(activeUnitId);
    if (!u || !snap) return;
    u.name = snap.name;
    u.occupants = snap.occupants;
    u.occType = snap.occType;
    u.ownerName = snap.ownerName;
    u.ownerPhone = snap.ownerPhone;
    u.tenantPhone = snap.tenantPhone;
    u.hasPackage = snap.hasPackage;
    fillUnitFormFromUnit(u);
    saveDB(false);
    renderUnits();
}

function fillUnitFormFromUnit(u) {
    normalizeUnitContactFields(u);
    setFormInputValue('inp-unit-name', u.name);
    document.getElementById('txt-unit-occupants').innerText = u.occupants || 0;
    const rO = document.querySelector('input[name="occType"][value="owner"]');
    const rT = document.querySelector('input[name="occType"][value="tenant"]');
    if (u.occType === 'tenant') rT.checked = true;
    else rO.checked = true;
    setFormInputValue('inp-owner-name', u.ownerName);
    setFormInputValue('inp-owner-phone', u.ownerPhone);
    setFormInputValue('inp-tenant-phone', u.tenantPhone);
    document.getElementById('inp-unit-package').checked = !!u.hasPackage;
    document.getElementById('manual-amt').value = '';
    document.getElementById('manual-desc').value = '';
    document.getElementById('manual-amt-words').innerText = '';
    syncNames();
    updateOccupantsWarning(u);
}

function updateOccupantsWarning(u) {
    const openPeriods = db.periods.filter(p => !p.isClosed && p.type === 'monthly' && p.isStarted);
    const warnBox = document.getElementById('occ-warning-box');
    if (openPeriods.length > 0) {
        const snapshotOcc = getUnitChargeInPeriod(u.id, openPeriods[0])?.snapshot?.occupants ?? u.occupants;
        document.getElementById('occ-old-val').innerText = snapshotOcc;
        document.getElementById('occ-new-val').innerText = u.occupants;
        if (u.occupants !== snapshotOcc) warnBox.classList.remove('hidden');
        else warnBox.classList.add('hidden');
    } else {
        warnBox.classList.add('hidden');
    }
}

function setUnitFieldLocked(el, locked) {
    if (!el) return;
    if (el.tagName === 'BUTTON') {
        el.disabled = locked;
        el.classList.toggle('opacity-40', locked);
        el.classList.toggle('pointer-events-none', locked);
        return;
    }
    if (el.type === 'checkbox' || el.type === 'radio') {
        el.disabled = locked;
        return;
    }
    el.readOnly = locked;
    el.classList.toggle('bg-slate-100', locked);
    el.classList.toggle('text-slate-600', locked);
    el.classList.toggle('cursor-not-allowed', locked);
    if (!locked && el.id !== 'inp-tenant-name') {
        el.classList.remove('bg-slate-100', 'text-slate-600', 'cursor-not-allowed');
    }
}

function updateRadioStyles() {
    const occTenantEl = document.querySelector('input[name="occType"][value="tenant"]');
    if (!occTenantEl) return;
    const isTenant = occTenantEl.checked;
    const lblOwner = document.getElementById('lbl-radio-owner');
    const lblTenant = document.getElementById('lbl-radio-tenant');

    if (isTenant) {
        lblTenant.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
        lblTenant.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');

        lblOwner.classList.remove('border-indigo-500', 'bg-indigo-50', 'text-indigo-800');
        lblOwner.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    } else {
        lblOwner.classList.add('border-indigo-500', 'bg-indigo-50', 'text-indigo-800');
        lblOwner.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');

        lblTenant.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
        lblTenant.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    }
}

function handleOccTypeChange() {
    if (!unitModalEditMode) return;
    const isTenant = document.querySelector('input[name="occType"][value="tenant"]').checked;
    const residentName = document.getElementById('inp-unit-name').value.trim();
    const u = findUnit(activeUnitId);

    if (isTenant) {
        document.getElementById('inp-owner-name').value = (u && u.ownerName && u.ownerName !== u.name) ? u.ownerName : '';
    } else {
        document.getElementById('inp-owner-name').value = residentName;
    }
    syncNames();
    instantUnitUpdate();
}

function syncNames() {
    const residentName = document.getElementById('inp-unit-name').value.trim();
    const occTenantEl = document.querySelector('input[name="occType"][value="tenant"]');
    const isTenant = occTenantEl ? occTenantEl.checked : false;

    const ownerNameInp = document.getElementById('inp-owner-name');
    const tenantNameInp = document.getElementById('inp-tenant-name');
    const tenantBox = document.getElementById('tenant-info-box');

    const headingOwner = document.getElementById('heading-owner');
    const headingTenant = document.getElementById('heading-tenant');

    if (!ownerNameInp || !tenantNameInp) return;

    updateRadioStyles();

    if (!isTenant) {
        ownerNameInp.value = residentName;
        ownerNameInp.readOnly = true;
        ownerNameInp.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
        ownerNameInp.classList.remove('bg-white', 'text-slate-800');

        headingOwner.innerText = 'مشخصات مالک (ساکن فعلی)';
        tenantBox.classList.add('hidden');
    } else {
        ownerNameInp.readOnly = false;
        ownerNameInp.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
        ownerNameInp.classList.add('bg-white', 'text-slate-800');

        headingOwner.innerText = 'مشخصات مالک';

        tenantNameInp.value = residentName;
        headingTenant.innerText = 'مشخصات مستأجر (ساکن فعلی)';
        tenantBox.classList.remove('hidden');
    }
    updateCallLinks();
}

function updateCallLinks() {
    const oPhone = document.getElementById('inp-owner-phone').value.trim();
    const btnCallO = document.getElementById('btn-call-owner');
    if (oPhone.length >= 8) {
        btnCallO.href = `tel:${oPhone}`;
        btnCallO.classList.remove('opacity-50', 'pointer-events-none', 'bg-emerald-100', 'text-emerald-600', 'border-emerald-200');
        btnCallO.classList.add('bg-emerald-500', 'text-white', 'border-emerald-600');
    } else {
        btnCallO.href = '#';
        btnCallO.classList.add('opacity-50', 'pointer-events-none', 'bg-emerald-100', 'text-emerald-600', 'border-emerald-200');
        btnCallO.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-600');
    }

    const tPhone = document.getElementById('inp-tenant-phone').value.trim();
    const btnCallT = document.getElementById('btn-call-tenant');
    if (tPhone.length >= 8) {
        btnCallT.href = `tel:${tPhone}`;
        btnCallT.classList.remove('opacity-50', 'pointer-events-none', 'bg-emerald-100', 'text-emerald-600', 'border-emerald-200');
        btnCallT.classList.add('bg-emerald-500', 'text-white', 'border-emerald-600');
    } else {
        btnCallT.href = '#';
        btnCallT.classList.add('opacity-50', 'pointer-events-none', 'bg-emerald-100', 'text-emerald-600', 'border-emerald-200');
        btnCallT.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-600');
    }
}

function setUnitModalEditMode(editing) {
    unitModalEditMode = editing;
    const fieldIds = ['inp-unit-name', 'inp-owner-name', 'inp-owner-phone', 'inp-tenant-phone', 'inp-unit-package', 'manual-amt', 'manual-desc', 'btn-occ-minus', 'btn-occ-plus'];
    fieldIds.forEach(id => setUnitFieldLocked(document.getElementById(id), !editing));
    document.querySelectorAll('input[name="occType"]').forEach(r => setUnitFieldLocked(r, !editing));
    ['lbl-radio-owner', 'lbl-radio-tenant'].forEach(id => {
        const lbl = document.getElementById(id);
        if (lbl) {
            lbl.classList.toggle('pointer-events-none', !editing);
            lbl.classList.toggle('opacity-60', !editing);
        }
    });
    document.querySelectorAll('#unit-manual-section button').forEach(btn => setUnitFieldLocked(btn, !editing));
    const manualBox = document.getElementById('unit-manual-section');
    if (manualBox) manualBox.classList.toggle('opacity-75', !editing);
    document.getElementById('unit-view-hint').classList.toggle('hidden', editing);
    document.getElementById('btn-unit-edit').classList.toggle('hidden', editing);
    const finishBtn = document.getElementById('btn-unit-finish-edit');
    if (finishBtn) finishBtn.classList.toggle('hidden', !editing);
    const cancelBtn = document.getElementById('btn-unit-cancel-edit');
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !editing);
    if (editing) syncNames();
    else {
        const tenantNameInp = document.getElementById('inp-tenant-name');
        if (tenantNameInp) setUnitFieldLocked(tenantNameInp, true);
        const ownerNameInp = document.getElementById('inp-owner-name');
        if (ownerNameInp) setUnitFieldLocked(ownerNameInp, true);
    }
}

function startUnitEdit() {
    const u = findUnit(activeUnitId);
    if (!u) return;
    unitEditSnapshot = captureUnitEditSnapshot(u);
    setUnitModalEditMode(true);
}

function finishUnitEdit() {
    if (!unitModalEditMode) return;
    instantUnitUpdate();
    unitEditSnapshot = null;
    setUnitModalEditMode(false);
    saveDB(true);
}

function cancelUnitEdit() {
    applyUnitEditSnapshot(unitEditSnapshot);
    unitEditSnapshot = null;
    setUnitModalEditMode(false);
}

function showUnitModalOnly(id) {
    activeUnitId = id;
    const u = findUnit(id);
    if (!u) return;
    document.getElementById('unit-title').innerText = `تنظیمات واحد ${id}`;
    fillUnitFormFromUnit(u);
    unitEditSnapshot = null;
    setUnitModalEditMode(false);
    document.getElementById('modal-unit').classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-unit-content').classList.add('open'), 10);
}

function openUnitModal(id) {
    pushNav({ type: 'unit', unitId: id });
    showUnitModalOnly(id);
}

function stepOccupants(val) {
    if (!unitModalEditMode) return;
    const el = document.getElementById('txt-unit-occupants');
    el.innerText = Math.max(0, parseInt(el.innerText, 10) + val);
    instantUnitUpdate();
}

function instantUnitUpdate() {
    if (!unitModalEditMode) return;
    let u = findUnit(activeUnitId);
    u.name = document.getElementById('inp-unit-name').value.trim();
    u.occupants = parseInt(document.getElementById('txt-unit-occupants').innerText);

    u.occType = document.querySelector('input[name="occType"]:checked').value;

    if (u.occType === 'owner') {
        u.ownerName = u.name;
    } else {
        u.ownerName = document.getElementById('inp-owner-name').value.trim();
    }

    u.ownerPhone = cleanContactField(document.getElementById('inp-owner-phone').value);
    u.tenantPhone = u.occType === 'tenant'
        ? cleanContactField(document.getElementById('inp-tenant-phone').value)
        : '';
    u.hasPackage = document.getElementById('inp-unit-package').checked;

    syncNames();

    updateOccupantsWarning(u);
    saveDB(false);
    renderUnits();
}

function addManualTransaction(type) {
    if (!unitModalEditMode) {
        return customAlert('info', 'فقط مشاهده', 'برای ثبت عملیات مالی، ابتدا دکمهٔ «ویرایش» را بزنید.');
    }
    let amtStr = document.getElementById('manual-amt').value;
    let desc = document.getElementById('manual-desc').value.trim();
    let amt = parse(amtStr);

    if (amt <= 0) return customAlert('error', 'خطا', 'لطفاً مبلغ معتبر وارد کنید.');

    if (type === 'forgive') desc = 'حذف/بخشودگی دستی بدون پرداخت';
    else if (!desc) return customAlert('error', 'خطا', 'لطفاً شرح عملیات را وارد کنید.');

    saveDB(true);
    let u = findUnit(activeUnitId);
    if (!u.transactions) u.transactions = [];

    if (type === 'payment') {
        const applied = allocateManualPaymentToOpenPeriods(activeUnitId, amt);
        if (applied.charge > 0.01) {
            pushManualLedgerEntry(u, 'payment', applied.charge, desc + ' (شارژ دوره)');
        }
        if (applied.pastM > 0.01) {
            pushManualLedgerEntry(u, 'payment', applied.pastM, desc + ' (بدهی پیشین)');
        }
        if (applied.pastS > 0.01) {
            pushManualLedgerEntry(u, 'payment', applied.pastS, desc + ' (بدهی اضطراری)');
        }
        const overflow = manualPaymentOverflow(applied, amt);
        if (overflow > 0.01) {
            pushManualLedgerEntry(u, 'payment', overflow, desc + ' (مازاد پرداخت)');
        }
        setPeriodManualLockForUnit(activeUnitId, true);
    } else {
        pushManualLedgerEntry(u, type, amt, desc);
    }

    document.getElementById('manual-amt').value = '';
    document.getElementById('manual-desc').value = '';
    document.getElementById('manual-amt-words').innerText = '';

    saveDB(false);
    capPastTicksOnUnit(activeUnitId);
    saveDB(false);
    refreshUnitsAndReports();
    refreshActivePeriodTable();
    customAlert('success', 'عملیات موفق', 'عملیات مالی با موفقیت ثبت شد.');
}

function renderUnitReportBody() {
    const u = findUnit(activeUnitId);
    if (!u) return;
    document.getElementById('report-unit-name').innerText = `گزارش واحد ${u.id}${unitNameInParens(u.name)}`;
    const tbody = document.getElementById('report-unit-body');
    tbody.innerHTML = '';
    let lines = collectSimpleUnitStory(u.id);
    attachSimpleStoryBalances(lines, u.id);
    lines.sort((a, b) => compareFinancialEvents(a, b, true));
    if (!lines.length) {
        tbody.innerHTML = `<div class="p-8 text-center text-lg font-bold text-slate-400">هیچ سابقه‌ای یافت نشد.</div>`;
    } else {
        lines.forEach(line => { tbody.innerHTML += renderSimpleUnitStoryCard(line); });
        if (!tbody._periodLinkBound) {
            tbody._periodLinkBound = true;
            tbody.addEventListener('click', (ev) => {
                const card = ev.target.closest('[data-period-link]');
                if (!card) return;
                openPeriodFromUnitReport(card.getAttribute('data-period-link'));
            });
            tbody.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Enter' && ev.key !== ' ') return;
                const card = ev.target.closest('[data-period-link]');
                if (!card) return;
                ev.preventDefault();
                openPeriodFromUnitReport(card.getAttribute('data-period-link'));
            });
        }
    }
    updateUnitReportBalanceHeader(u);
}

function showUnitReportOnly(id) {
    activeUnitId = id;
    renderUnitReportBody();
    document.getElementById('modal-report-unit').classList.remove('hidden');
}

function showUnitReport() {
    if (!activeUnitId) return;
    document.getElementById('modal-unit').classList.add('hidden');
    document.getElementById('modal-unit-content').classList.remove('open');
    pushNav({ type: 'report-unit', unitId: activeUnitId });
    showUnitReportOnly(activeUnitId);
}

// --- Share & Messaging Integration ---
function generateUnitShareText(unitId) {
    const u = findUnit(unitId);
    if (!u) return '';
    const totalDebt = getUnitTotalDebt(u.id);
    const lines = collectUnitDebtDetailLines(u.id);
    const dateStr = typeof getPersianDateTime === 'function' ? getPersianDateTime().split('،')[0].trim() : '';
    const occupantName = u.name ? ` (${u.name})` : '';

    let statusLine = '';
    if (Math.abs(totalDebt) < 0.1) {
        statusLine = '✅ وضعیت حساب: تسویه کامل (۰ تومان)';
    } else if (totalDebt > 0) {
        statusLine = `🔴 مبلغ بدهی قابل پرداخت: ${fmt(totalDebt)} تومان`;
    } else {
        statusLine = `🟢 وضعیت حساب: ${fmt(Math.abs(totalDebt))} تومان (بستانکار)`;
    }

    let detailLines = '';
    if (lines && lines.length > 0) {
        detailLines = '\n\n📋 ریز اقلام:\n' + lines.map(l => {
            const tag = l.credit ? ' [بستانکاری]' : '';
            return `▫️ ${l.label}: ${fmt(l.amount)} تومان${tag}`;
        }).join('\n');
    }

    return `🏢 مجتمع مسکونی پارس\n📄 صورت‌حساب مالی واحد ${u.id}${occupantName}\n📅 تاریخ: ${dateStr}\n\n${statusLine}${detailLines}\n\nلطفاً نسبت به تسویه حساب و ارسال فیش واریزی به مدیریت ساختمان اقدام فرمایید.\nبا احترام — مدیریت ساختمان پارس`;
}

function openShareUnitModal() {
    const u = findUnit(activeUnitId);
    if (!u) return;
    const text = generateUnitShareText(u.id);
    const textarea = document.getElementById('txt-share-content');
    if (textarea) textarea.value = text;

    const recipientSpan = document.getElementById('share-unit-recipient');
    if (recipientSpan) {
        const phone = u.occType === 'tenant' ? (u.tenantPhone || u.ownerPhone) : (u.ownerPhone || u.tenantPhone);
        recipientSpan.innerText = `واحد ${u.id}${u.name ? ' (' + u.name + ')' : ''}${phone ? ' — ' + phone : ''}`;
    }

    const modal = document.getElementById('modal-share-unit');
    if (modal) modal.classList.remove('hidden');
}

function closeShareUnitModal() {
    const modal = document.getElementById('modal-share-unit');
    if (modal) modal.classList.add('hidden');
}

function copyShareText() {
    const textarea = document.getElementById('txt-share-content');
    const text = textarea ? textarea.value : '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('متن صورت‌حساب کپی شد', 'success');
        }).catch(() => {
            fallbackCopyText(text);
        });
    } else {
        fallbackCopyText(text);
    }
}

function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('متن صورت‌حساب کپی شد', 'success');
    } catch (e) {
        showToast('خطا در کپی متن', 'danger');
    }
    document.body.removeChild(ta);
}

function executeNativeShare() {
    const textarea = document.getElementById('txt-share-content');
    const text = textarea ? textarea.value : '';
    if (!text) return;
    if (navigator.share) {
        navigator.share({
            title: 'صورت‌حساب ساختمان پارس',
            text: text
        }).catch(() => {});
    } else {
        copyShareText();
    }
}

function shareViaMessenger(type) {
    const u = findUnit(activeUnitId);
    const textarea = document.getElementById('txt-share-content');
    const text = textarea ? textarea.value : '';
    const phone = u ? (u.occType === 'tenant' ? (u.tenantPhone || u.ownerPhone) : (u.ownerPhone || u.tenantPhone)) : '';
    const encoded = encodeURIComponent(text);

    let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('09')) cleanPhone = '98' + cleanPhone.substring(1);

    if (type === 'sms') {
        const smsUrl = phone ? `sms:${phone}?body=${encoded}` : `sms:?body=${encoded}`;
        window.open(smsUrl, '_blank');
    } else if (type === 'whatsapp') {
        const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
        window.open(waUrl, '_blank');
    } else if (type === 'eitaa') {
        window.open(`https://eitaa.com/share/url?text=${encoded}`, '_blank');
    } else if (type === 'bale') {
        window.open(`https://ble.ir/share/url?text=${encoded}`, '_blank');
    }
}

// --- Periods ---
function renderPeriods() {
    const list = document.getElementById('periods-list'); list.innerHTML = '';
    if (db.periods.length === 0) { list.innerHTML = `<div class="text-center text-slate-400 text-xl py-10 font-bold">دوره‌ای ثبت نشده است.</div>`; return; }

    [...db.periods].reverse().forEach(p => {
        let tC = p.charges.reduce((s, c) => s + c.amount, 0);
        let tP = getPeriodTickIncome(p);
        let icon = p.type === 'special' ? '<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-[10px] mr-2">پیش‌بینی نشده</span>' : '';

        let badgeHTML = '';
        if (p.isClosed) badgeHTML = '<span class="text-base px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-300">بایگانی 🔒</span>';
        else if (p.isStarted) badgeHTML = '<span class="text-base px-2.5 py-1 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">فعال 🟢</span>';
        else badgeHTML = '<span class="text-base px-2.5 py-1 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-200">تنظیم ⚪</span>';

        list.innerHTML += `
        <div onclick="openPeriodDetail('${p.id}')" class="bg-white p-5 rounded-[24px] border-2 border-slate-100 shadow-sm flex justify-between items-center cursor-pointer active:scale-95 transition-all mb-3 relative overflow-hidden zebra-row">
            <div class="border-r-4 ${p.isClosed ? 'border-slate-300' : (tP >= tC && tC > 0 ? 'border-emerald-400' : 'border-indigo-400')} pr-4 relative z-10 w-full flex justify-between items-center">
                <div>
                    <div class="font-black text-slate-800 text-xl flex items-center mb-1">${p.name} ${icon}</div>
                    <div class="text-base font-bold mt-2 flex gap-4">
                        <span class="text-rose-600">شارژ کل: ${fmt(tC)}</span>
                        <span class="text-emerald-600">دریافتی: ${fmt(tP)}</span>
                    </div>
                </div>
                <div>
                    ${badgeHTML}
                </div>
            </div>
        </div>`;
    });
    updateNewPeriodButton();
}

function openNewPeriodModal() {
    if (hasDraftPeriod()) {
        const draft = db.periods.find(p => !p.isClosed && !p.isStarted);
        customAlert('error', 'امکان ایجاد دوره جدید نیست', `دوره «${draft?.name || 'در حال تنظیم'}» هنوز تکمیل نشده. ابتدا «شروع دوره» را بزنید یا آن را حذف کنید.`);
        return;
    }
    const PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

    // Find the last monthly period to suggest the NEXT month
    const lastMonthly = [...db.periods]
        .filter(p => p.type === 'monthly' && p.isStarted)
        .sort((a, b) => comparePeriodOrder(b.id, a.id))[0];

    let yr = getCurrentShamsiYear();
    let mn = 'فروردین';

    if (lastMonthly) {
        // Parse "ماه سال" format from last period name
        const parts = (lastMonthly.name || '').trim().split(' ');
        const lastName = parts[0];
        const lastYear = parts[1] ? String(parts[1]) : yr;
        const monthIdx = PERSIAN_MONTHS.indexOf(lastName);
        if (monthIdx >= 0) {
            if (monthIdx === 11) {
                mn = PERSIAN_MONTHS[0];
                yr = String(parseInt(lastYear, 10) + 1);
            } else {
                mn = PERSIAN_MONTHS[monthIdx + 1];
                yr = lastYear;
            }
        } else {
            // fallback to current calendar
            try { mn = new Intl.DateTimeFormat('fa-IR', { month: 'long' }).format(new Date()); } catch (e) { }
        }
    } else {
        try { mn = new Intl.DateTimeFormat('fa-IR', { month: 'long' }).format(new Date()); } catch (e) { }
    }

    document.getElementById('np-year').value = yr;
    document.getElementById('np-sp-year').value = getCurrentShamsiYear();

    let sel = document.getElementById('np-month');
    if (sel) for (let i = 0; i < sel.options.length; i++) if (sel.options[i].value === mn) { sel.selectedIndex = i; break; }

    let selSp = document.getElementById('np-sp-month');
    let curMn = 'فروردین';
    try { curMn = new Intl.DateTimeFormat('fa-IR', { month: 'long' }).format(new Date()); } catch (e) { }
    if (selSp) for (let i = 0; i < selSp.options.length; i++) if (selSp.options[i].value === curMn) { selSp.selectedIndex = i; break; }

    setNewPeriodMode('monthly');
    document.getElementById('np-special-title').value = '';

    const openSpecials = db.periods.filter(p => p.type === 'special' && !p.isClosed && p.isStarted);
    if (openSpecials.length > 0) {
        customConfirm('بستن موارد پیش‌بینی نشده', `تعداد ${openSpecials.length} هزینه پیش‌بینی نشده باز وجود دارد. آیا مایلید بسته شوند و مانده آنها به عنوان بدهی قبلی به حساب ساکنین منتقل شود؟`, 'بله، بستن موارد باز', 'indigo', () => {
            saveDB(true);
            openSpecials.forEach(latest => finalizePeriodClose(latest));
            saveDB(false);
            doOpenNewPeriod();
        });
    } else {
        doOpenNewPeriod();
    }
}

function doOpenNewPeriod() {
    pushNav({ type: 'new-period' });
    document.getElementById('modal-new-period').classList.remove('hidden');
}

function setNewPeriodMode(mode) {
    newPeriodMode = mode;
    document.getElementById('tab-btn-monthly').className = `flex-1 py-3 rounded-xl font-bold text-lg transition-all ${mode === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`;
    document.getElementById('tab-btn-special').className = `flex-1 py-3 rounded-xl font-bold text-lg transition-all ${mode === 'special' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`;
    document.getElementById('form-new-monthly').classList.toggle('hidden', mode !== 'monthly');
    document.getElementById('form-new-special').classList.toggle('hidden', mode !== 'special');
}

function createNewPeriod() {
    if (newPeriodMode === 'monthly') {
        const openMonthlies = db.periods.filter(p => p.type === 'monthly' && !p.isClosed && p.isStarted);
        if (openMonthlies.length) {
            customConfirm('بستن دوره قبل', 'یک دوره ماهانه فعال از قبل وجود دارد. شارژ پرداخت‌نشده به بدهی واحد منتقل می‌شود. ادامه می‌دهید؟', 'بستن قبلی و ایجاد جدید', 'indigo', () => {
                saveDB(true);
                openMonthlies.forEach(p => {
                    try { calculateLogic(p); } catch (e) { }
                    finalizePeriodClose(p);
                });
                saveDB(false);
                proceedCreatePeriod();
            });
            return;
        }
    }
    proceedCreatePeriod();
}

function proceedCreatePeriod() {
    let name = '';
    if (newPeriodMode === 'monthly') {
        let m = document.getElementById('np-month').value; let y = document.getElementById('np-year').value;
        if (!y) { customAlert("error", "خطا", "لطفا سال را وارد کنید."); return; }
        name = `${m} ${y}`;
    } else {
        let t = document.getElementById('np-special-title').value.trim();
        let m = document.getElementById('np-sp-month').value; let y = document.getElementById('np-sp-year').value;
        if (!t || !y) { customAlert("error", "خطا", "لطفا عنوان هزینه و سال را کامل وارد کنید."); return; }
        name = `${t} (${m} ${y})`;
    }

    saveDB(true);
    let np = {
        id: String(Date.now()), type: newPeriodMode, name: name, isClosed: false, isStarted: false,
        expenses: { inputMode: 'rate', fixed: 0, water: 0, gas: 0, electricity: 0, incidental: 0, incDesc: '', specialTotal: 0, specialMode: 'all', customUnits: [], roundUp: false, exemptEmptyUnits: true },
        charges: []
    };
    db.units.forEach(u => {
        np.charges.push({
            unitId: u.id, snapshot: { occupants: u.occupants, hasPackage: u.hasPackage },
            amount: 0, paidAmount: 0, paidPastMonthly: 0, paidPastSpecial: 0,
            details: { fixed: 0, water: 0, gas: 0, elec: 0, incidental: 0 }
        });
    });
    db.periods.push(np);
    getOpenStartedPeriods().forEach(op => {
        if (String(op.id) === String(np.id)) return;
        op.charges.forEach(ch => {
            ch.paidPastMonthly = 0;
            ch.paidPastSpecial = 0;
        });
    });
    saveDB(false);
    renderPeriods();

    document.getElementById('modal-new-period').classList.add('hidden');
    replaceNavTop({ type: 'period', periodId: String(np.id), fromUnitReport: false });
    openPeriodDetailUI(np.id, { fromUnitReport: false });
}

function openPeriodDetail(id, opts) {
    const fromUnit = !!opts?.fromUnitReport;
    if (!fromUnit) {
        pushNav({ type: 'period', periodId: String(id), fromUnitReport: false });
    }
    openPeriodDetailUI(id, { fromUnitReport: fromUnit });
}

function openPeriodDetailUI(id, opts) {
    if (!opts?.fromUnitReport) returnToUnitReportAfterPeriod = false;
    else returnToUnitReportAfterPeriod = true;
    activePeriodId = String(id);
    const p = findPeriod(activePeriodId);
    if (!p) return;
    updatePeriodDetailBackButton();
    document.getElementById('modal-period-detail').classList.remove('hidden');
    try {
        renderPeriodSetup(p);
    } catch (err) {
        console.error(err);
        customAlert('error', 'خطا', 'نمایش جزئیات دوره با مشکل مواجه شد. صفحه را رفرش کنید.');
    }
}

function renderPeriodSetup(p) {
    document.getElementById('period-detail-title').innerText = p.name;

    const badge = document.getElementById('period-status-badge');
    if (p.isClosed) { badge.innerText = 'بسته شده 🔒'; badge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-300 shrink-0'; }
    else if (p.isStarted) { badge.innerText = 'دوره فعال است 🟢'; badge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0'; }
    else { badge.innerText = 'در حال تنظیم ⚪'; badge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-200 shrink-0'; }

    const setupBox = document.getElementById('period-setup-form');
    const lockInfo = document.getElementById('period-locked-summary');
    const tableWrap = document.getElementById('period-table-wrapper');
    const actionsBox = document.getElementById('period-actions');

    const previewHint = document.getElementById('period-preview-hint');
    if (previewHint) previewHint.classList.add('hidden');

    if (p.isStarted) {
        setupBox.classList.add('hidden');
        lockInfo.classList.remove('hidden');
        tableWrap.classList.remove('hidden');
        if (!p.isClosed) actionsBox.classList.remove('hidden');
        else actionsBox.classList.add('hidden');

        const lockTitleText = document.getElementById('period-locked-title-text');
        const lockTitleWrap = document.getElementById('period-locked-title');
        if (lockTitleText) {
            lockTitleText.textContent = p.isClosed
                ? 'دوره قفل شده است'
                : 'شارژ با مبالغ زیر نوشته شده است:';
        }
        if (lockTitleWrap) {
            lockTitleWrap.className = p.isClosed
                ? 'text-lg font-bold text-slate-300 flex items-center gap-2'
                : 'text-lg font-bold text-emerald-400 flex items-center gap-2';
        }

        const sg = document.getElementById('locked-summary-grid');
        if (p.type === 'monthly') {
            sg.innerHTML = `
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">شارژ ثابت:</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.fixed)}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">آب (نفر):</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.water)}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">گاز (واحد):</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.gas)}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">برق (واحد):</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.electricity)}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">جانبی:</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.incidental)} ${p.expenses.incDesc ? '(' + p.expenses.incDesc + ')' : ''}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 text-emerald-300 whitespace-nowrap flex-grow">
                <span class="shrink-0">واحد خالی:</span>
                <span class="shrink-0">${p.expenses.exemptEmptyUnits !== false ? 'معاف از آب/گاز/برق' : 'سهم‌دار در قبوض'}</span>
            </div>
        `;
        } else {
            sg.innerHTML = `
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">مبلغ کل:</span>
                <span class="font-black text-white shrink-0" dir="ltr">${fmt(p.expenses.specialTotal)}</span>
            </div>
            <div class="bg-slate-700/80 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold border border-slate-600/50 whitespace-nowrap flex-grow">
                <span class="text-slate-300 shrink-0">حالت:</span>
                <span class="font-black text-white shrink-0">${p.expenses.specialMode === 'all' ? 'مساوی بین همه' : 'مساوی بین ساکن‌دار'}</span>
            </div>
        `;
        }

    } else {
        setupBox.classList.remove('hidden');
        lockInfo.classList.add('hidden');
        tableWrap.classList.add('hidden');
        actionsBox.classList.add('hidden');

        if (p.type === 'monthly') {
            document.getElementById('setup-monthly-fields').classList.remove('hidden');
            document.getElementById('setup-special-fields').classList.add('hidden');
            document.getElementById('f-input-mode').classList.remove('hidden');

            document.getElementById('f-input-mode').value = p.expenses.inputMode || 'rate';
            document.getElementById('f-fix').value = p.expenses.fixed ? fmt(p.expenses.fixed) : '';
            document.getElementById('f-wat').value = p.expenses.water ? fmt(p.expenses.water) : '';
            document.getElementById('f-gas').value = p.expenses.gas ? fmt(p.expenses.gas) : '';
            document.getElementById('f-ele').value = p.expenses.electricity ? fmt(p.expenses.electricity) : '';
            document.getElementById('f-inc').value = p.expenses.incidental ? fmt(p.expenses.incidental) : '';
            document.getElementById('f-inc-desc').value = p.expenses.incDesc || '';
            document.getElementById('f-round').checked = p.expenses.roundUp === true;
            document.getElementById('f-exempt-empty').checked = p.expenses.exemptEmptyUnits !== false;
            document.getElementById('f-exempt-empty-wrap').classList.remove('hidden');

            ['f-fix', 'f-wat', 'f-gas', 'f-ele', 'f-inc'].forEach(id => updateWords(document.getElementById(id), id + '-w'));
        } else {
            document.getElementById('setup-monthly-fields').classList.add('hidden');
            document.getElementById('setup-special-fields').classList.remove('hidden');
            document.getElementById('f-input-mode').classList.add('hidden');
            document.getElementById('f-exempt-empty-wrap').classList.add('hidden');

            document.getElementById('f-sp-total').value = p.expenses.specialTotal ? fmt(p.expenses.specialTotal) : '';
            updateWords(document.getElementById('f-sp-total'), 'f-sp-w');
            document.getElementById('f-sp-mode').value = p.expenses.specialMode || 'all';
            toggleSpCustomView(p);
        }
    }

    document.querySelectorAll('.monthly-col').forEach(el => el.classList.toggle('print-show', p.type !== 'special'));

    if (p.isStarted) {
        calculateLogic(p);
        renderPeriodTable(p);
    } else {
        calculateActivePeriod();
    }
}

function toggleSpCustomView(p) {
    if (!p) p = findPeriod(activePeriodId);
    let mode = document.getElementById('f-sp-mode').value;
    if (mode === 'custom') {
        document.getElementById('f-sp-custom-units').classList.remove('hidden');
        let grid = document.getElementById('custom-units-grid');
        grid.innerHTML = '';
        db.units.forEach(u => {
            let isChecked = p.expenses.customUnits?.some(uid => sameId(uid, u.id));
            grid.innerHTML += `
            <label class="flex items-center gap-2 text-base font-bold cursor-pointer text-slate-700 bg-white p-2 border rounded-xl transition hover:border-amber-400">
                <input type="checkbox" onchange="toggleSpCustomUnit(${u.id}, this.checked)" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded text-amber-500 accent-amber-500" ${p.isStarted ? 'disabled' : ''}>
                واحد ${u.id}
            </label>
        `;
        });
    } else {
        document.getElementById('f-sp-custom-units').classList.add('hidden');
    }
}

function toggleSpCustomUnit(uId, checked) {
    const p = findPeriod(activePeriodId);
    if (p.isStarted) return;
    p.expenses.customUnits = p.expenses.customUnits || [];
    if (checked && !p.expenses.customUnits.some(id => sameId(id, uId))) p.expenses.customUnits.push(uId);
    else if (!checked) p.expenses.customUnits = p.expenses.customUnits.filter(id => !sameId(id, uId));
    calculateActivePeriod();
}

function startPeriod() {
    const p = findPeriod(activePeriodId);
    if (!p) return;

    saveDB(true);
    commitExpenseChange();
    p.isStarted = true;
    if (!p.startedAt) p.startedAt = getPersianDateTime();
    calculateLogic(p);
    db.units.forEach(u => {
        sanitizeManualPeriodState(u);
        capPastTicksOnUnit(u.id);
    });
    syncAutoCreditApplication(p);
    saveDB(false);
    renderPeriodSetup(p);
    updateNewPeriodButton();
}

function closeCurrentPeriod() {
    customConfirm('اتمام و بایگانی دوره', 'با بستن دوره، مقادیر تسویه نشده به عنوان بدهی دائم به حساب واحدها منتقل می‌شود و دیگر در این فرم قابل تغییر نیست. تایید می‌کنید؟', 'بستن قطعی دوره', 'indigo', () => {
        saveDB(true);
        const p = findPeriod(activePeriodId);
        if (!p || !p.isStarted) {
            customAlert('error', 'خطا', 'ابتدا دوره را با «شروع دوره» فعال کنید.');
            return;
        }
        try { calculateLogic(p); } catch (e) { }
        finalizePeriodClose(p);
        saveDB(false);
        renderPeriodSetup(p);
        refreshUnitsAndReports();
        updateNewPeriodButton();
    });
}

function refreshActivePeriodTable() {
    if (!activePeriodId) return;
    const p = findPeriod(activePeriodId);
    if (p && p.isStarted && !p.isClosed) renderPeriodTable(p);
}

function syncPaidPastMonthly(uId, checked, anchorPId) {
    const anchor = findPeriod(anchorPId);
    if (!anchor || anchor.type !== 'monthly') return;
    const debts = getPastDebts(uId, anchor.id);
    const val = checked ? getPastDebtTickAmount(debts) : 0;
    getOpenStartedPeriods().forEach(p => {
        if (p.type !== 'monthly') return;
        const c = getUnitChargeInPeriod(uId, p);
        if (!c) return;
        c.paidPastMonthly = val;
    });
}

function syncPaidPastSpecial(uId, checked, anchorPId) {
    const anchor = findPeriod(anchorPId);
    if (!anchor) return;
    const debts = getDebts(uId, anchor.id);
    const val = checked ? getPastSpecialTickAmount(debts) : 0;
    const payDate = checked ? getPersianDateTime() : null;
    getOpenStartedPeriods().forEach(p => {
        const c = getUnitChargeInPeriod(uId, p);
        if (!c) return;
        if (p.type === 'monthly') {
            c.paidPastSpecial = val;
        } else if (p.type === 'special') {
            if (checked && Math.abs(val) >= 0.01) {
                c.paidAmount = c.amount;
                c.payDate = payDate;
            } else if (!checked) {
                c.paidAmount = 0;
                c.payDate = null;
            }
        }
    });
}

function toggleCurrentChargePay(pId, uId, checked) {
    if (!guardPeriodTickEdit(pId, uId)) return;
    saveDB(true);
    const p = findPeriod(pId);
    if (!p || p.isClosed) return;
    const c = getUnitChargeInPeriod(uId, p);
    if (!c) return;
    const amt = Number(c.amount) || 0;
    c.paidAmount = checked && amt > 0.01 ? amt : 0;
    c.payDate = checked ? getPersianDateTime() : null;
    saveDB(false);
    capPastTicksOnUnit(uId);
    saveDB(false);
    refreshActivePeriodTable();
    refreshUnitsAndReports();
}

function payPastMonthly(currentPId, uId, checked) {
    if (!guardPeriodTickEdit(currentPId, uId)) return;
    saveDB(true);
    const p = findPeriod(currentPId);
    if (!p || p.isClosed) return;
    if (checked && getPastDebtTickAmount(getPastDebts(uId, p.id)) < 0.01) {
        refreshActivePeriodTable();
        return;
    }
    syncPaidPastMonthly(uId, checked, p.id);
    capPastTicksOnUnit(uId);
    saveDB(false);
    refreshActivePeriodTable();
    refreshUnitsAndReports();
}

function payPastSpecial(currentPId, uId, checked) {
    if (!guardPeriodTickEdit(currentPId, uId)) return;
    saveDB(true);
    const p = findPeriod(currentPId);
    if (!p || p.isClosed) return;
    if (checked && getPastSpecialTickAmount(getDebts(uId, p.id)) < 0.01) {
        refreshActivePeriodTable();
        return;
    }
    syncPaidPastSpecial(uId, checked, p.id);
    capPastTicksOnUnit(uId);
    saveDB(false);
    refreshActivePeriodTable();
    refreshUnitsAndReports();
}

function renderPeriodTableHeadFoot(p) {
    const isMonthly = p.type === 'monthly';
    const isSpecialPeriod = p.type === 'special';
    const showSpecialCol = isMonthly && hasConcurrentOpenSpecial(p.id);
    const showPastMonthlyCol = !isSpecialPeriod;
    const chargeTitle = isSpecialPeriod ? 'مبلغ اضطراری' : 'شارژ این دوره';
    const chargeHeadClass = isSpecialPeriod ? 'text-orange-600' : 'text-indigo-700';

    let head = `<th class="p-3 unit-sticky-col sticky-col font-black text-slate-700 text-center">واحد</th>`;
    if (isMonthly) {
        head += `
        <th class="monthly-col pt-col-oc p-3 text-center print-show w-12 text-slate-500">نفر</th>
        <th class="monthly-col pt-col-fix p-3 text-center print-show text-slate-500">ثابت</th>
        <th class="monthly-col pt-col-wat p-3 text-center print-show text-slate-500">آب</th>
        <th class="monthly-col pt-col-gas p-3 text-center print-show text-slate-500">گاز</th>
        <th class="monthly-col pt-col-elec p-3 text-center print-show text-slate-500">برق</th>
        <th class="monthly-col pt-col-inc p-3 text-center print-show text-slate-500">جانبی</th>`;
    }
    head += `<th class="pt-col-charge p-3 text-center min-w-[100px] font-bold ${chargeHeadClass}" id="th-current-charge">${chargeTitle}</th>`;
    if (showSpecialCol) {
        head += `<th class="pt-col-special p-3 text-center min-w-[100px] border-r border-orange-200 font-bold text-orange-600 bg-orange-50/60">هزینه اضطراری (دورهٔ باز)</th>`;
    }
    if (showPastMonthlyCol) {
        head += `<th class="pt-col-past p-3 text-center min-w-[100px] border-r border-slate-200 font-bold text-rose-600">بدهی پیشین</th>`;
    }
    head += `<th class="p-3 text-center min-w-[100px] font-black text-slate-800 bg-slate-100">قابل پرداخت</th>`;
    document.getElementById('period-table-head').innerHTML = `<tr>${head}</tr>`;

    let foot = `<td class="p-4 text-center sticky-col bg-slate-900 border-none">مجموع</td>`;
    if (isMonthly) {
        foot += `
        <td class="monthly-col pt-col-oc print-show text-center" id="pt-oc"></td>
        <td class="monthly-col pt-col-fix print-show text-center" id="pt-fix"></td>
        <td class="monthly-col pt-col-wat print-show text-center" id="pt-wat"></td>
        <td class="monthly-col pt-col-gas print-show text-center" id="pt-gas"></td>
        <td class="monthly-col pt-col-elec print-show text-center" id="pt-elec"></td>
        <td class="monthly-col pt-col-inc print-show text-center" id="pt-inc"></td>`;
    }
    foot += `<td class="pt-col-charge p-4 text-center border-r border-slate-700 font-black text-emerald-400 bg-slate-900" id="pt-foot-charge" dir="ltr">0</td>`;
    if (showSpecialCol) {
        foot += `<td class="pt-col-special p-4 text-center border-r border-orange-700/50 font-black text-orange-400 bg-slate-900" id="pt-total-special" dir="ltr">0</td>`;
    }
    if (showPastMonthlyCol) {
        foot += `<td class="pt-col-past p-4 text-center border-r border-slate-700 font-black text-rose-400 bg-slate-900" id="pt-total-debt" dir="ltr">0</td>`;
    }
    foot += `<td class="p-4 text-center text-orange-400 bg-slate-950 font-black" id="pt-total-payable" dir="ltr">0</td>`;
    document.getElementById('period-table-foot').innerHTML = `<tr>${foot}</tr>`;

    return { showSpecialCol, isMonthly, isSpecialPeriod, showPastMonthlyCol };
}

function renderPeriodTable(p, isPreview = false) {
    const preview = isPreview || (!p.isStarted && !p.isClosed);
    const readOnly = preview || p.isClosed;
    const body = document.getElementById('period-table-body');
    if (!body) return;
    body.innerHTML = '';

    let tPaidCharge = 0, tUnpaidPastDebt = 0, tOpenSpecialUnpaid = 0, tPayable = 0;
    let tOcc = 0, tFix = 0, tWat = 0, tGas = 0, tElec = 0, tInc = 0;

    const { showSpecialCol, isMonthly, isSpecialPeriod, showPastMonthlyCol } = renderPeriodTableHeadFoot(p);
    const chargeBg = isSpecialPeriod ? 'bg-orange-50/50' : 'bg-indigo-50/30';
    const chargeText = isSpecialPeriod ? 'text-orange-700' : 'text-indigo-700';
    const chargePaidText = isSpecialPeriod ? 'line-through text-orange-600 font-bold' : 'line-through text-emerald-600 font-bold';
    const chargeAccent = isSpecialPeriod ? 'accent-orange-500' : 'accent-emerald-500';
    const specText = 'font-black text-orange-600';
    const specPaidText = 'line-through text-orange-600 font-bold';

    p.charges.forEach(c => {
        const u = findUnit(c.unitId);
        if (!u) return;
        const row = getChargeRow(p, c);

        let debts;
        if (p.isClosed && c.lockedDebts) {
            debts = { pastMonthly: c.lockedDebts.pastMonthly, pastSpecial: c.lockedDebts.pastSpecial };
        } else {
            debts = getDebts(u.id, p.id);
        }

        const payDet = getUnitPayableDetail(u.id, p);
        const openSpec = showSpecialCol ? getOpenSpecialChargeInfo(u.id) : { gross: 0, unpaid: 0, paid: false };
        const uTotalPayable = payDet.payable;

        tPaidCharge += (row.paidAmount || 0) + (payDet.creditAppliedToCharge || 0);
        if (showPastMonthlyCol) {
            tUnpaidPastDebt += payDet.pastMonthlyDisplayDebt;
            if (payDet.pastCreditRemaining > 0.01) tUnpaidPastDebt -= payDet.pastCreditRemaining;
        }
        if (showSpecialCol) tOpenSpecialUnpaid += payDet.openSpecUnpaidAfterCredit || openSpec.unpaid;
        tPayable += uTotalPayable;
        tOcc += (row.snapshot?.occupants || 0);

        if (isMonthly && row.details) {
            tFix += (row.details.fixed || 0);
            tWat += (row.details.water || 0);
            tGas += (row.details.gas || 0);
            tElec += (row.details.elec || 0);
            tInc += (row.details.incidental || 0);
        }

        const autoChargeCredit = payDet.creditAppliedToCharge || 0;
        const isCurrentPaid = ((row.paidAmount || 0) + autoChargeCredit) >= row.amount && row.amount > 0;
        const tickLocked = !readOnly && isPeriodRowManualLocked(p, c.unitId);
        const creditHintBtn = payDet.showCreditHint
            ? (readOnly || preview
                ? `<button type="button" class="credit-hint-btn" onclick="event.stopPropagation();showCreditAppliedHint(${c.unitId},'${p.id}')" title="توضیح کسر بستانکاری">؟</button>`
                : `<button type="button" class="credit-hint-btn" onclick="event.stopPropagation();showCreditAppliedHint(${c.unitId},'${p.id}')" title="توضیح کسر بستانکاری">؟</button>`)
            : '';
        const tr = document.createElement('tr');
        tr.className = 'zebra-row border-b border-slate-200 transition-colors';

        const chargeCell = readOnly
            ? `<span class="${isCurrentPaid && !preview ? chargePaidText : `font-black ${chargeText}`}">${fmt(row.amount)}</span>`
            : (row.amount < 0.01
                ? `<span class="text-slate-300">0</span>`
                : tickLocked
                    ? `<label class="flex items-center gap-2 w-full justify-center cursor-not-allowed opacity-90" onclick="showPeriodManualLockAlert(); return false;">
            <input type="checkbox" disabled ${isCurrentPaid ? 'checked' : ''} class="w-5 h-5 rounded ${chargeAccent} opacity-60">
            <span class="text-lg ${isCurrentPaid ? chargePaidText : `font-black ${chargeText}`}">${fmt(row.amount)}</span>
           </label>`
                    : `<label class="flex items-center gap-2 cursor-pointer w-full justify-center">
            <input type="checkbox" onchange="toggleCurrentChargePay('${p.id}', ${c.unitId}, this.checked)" ${isCurrentPaid ? 'checked' : ''} class="w-5 h-5 rounded ${chargeAccent}">
            <span class="text-lg ${isCurrentPaid ? chargePaidText : `font-black ${chargeText}`}">${fmt(row.amount)}</span>
           </label>`);

        const pastUi = getPastDebtCellUi(debts, row, payDet);
        const pastMonthlyPaid = pastUi.tickChecked;
        const pastDebtStruck = pastUi.tickStruck;
        const pastDebtAmt = pastUi.displayAmt;
        const pastCreditAmt = pastUi.creditAmt;
        const hasPastMonthly = !pastUi.empty;
        const hasPastCredit = pastUi.hasCredit;
        const pastTickFn = pastUi.tickHandler === 'special'
            ? `payPastSpecial('${p.id}', ${c.unitId}, this.checked)`
            : `payPastMonthly('${p.id}', ${c.unitId}, this.checked)`;

        const specPaid = openSpec.paid && (payDet.openSpecUnpaidAfterCredit || 0) < 0.01;
        const specAmt = openSpec.gross;
        const specialCell = !showSpecialCol ? '' : (readOnly
            ? `<span class="${specPaid ? specPaidText : (specAmt > 0.01 ? 'font-bold text-orange-600' : 'text-slate-300')}">${fmt(specAmt)}</span>`
            : (specAmt < 0.01 ? `<span class="text-slate-300">0</span>`
                : tickLocked
                    ? `<label class="flex items-center gap-2 w-full justify-center cursor-not-allowed opacity-90" onclick="showPeriodManualLockAlert(); return false;">
            <input type="checkbox" disabled ${specPaid ? 'checked' : ''} class="w-5 h-5 rounded accent-orange-500 opacity-60">
            <span class="text-lg ${specPaid ? specPaidText : specText}">${fmt(specAmt)}</span>
           </label>`
                    : `<label class="flex items-center gap-2 cursor-pointer w-full justify-center">
            <input type="checkbox" onchange="payOpenSpecialCharges(${c.unitId}, this.checked)" ${specPaid ? 'checked' : ''} class="w-5 h-5 rounded accent-orange-500">
            <span class="text-lg ${specPaid ? specPaidText : specText}">${fmt(specAmt)}</span>
           </label>`));

        let pastMonthlyCell;
        if (!hasPastMonthly && !hasPastCredit) {
            pastMonthlyCell = `<span class="text-slate-300">0</span>`;
        } else if (pastUi.creditOnly) {
            pastMonthlyCell = `<span class="text-lg font-black text-emerald-600" dir="ltr">-${fmt(pastCreditAmt)}</span>`;
        } else if (readOnly) {
            let pastRead = '';
            if (!pastUi.creditOnly) pastRead += `<span class="${pastDebtStruck ? 'text-slate-400 line-through' : 'font-bold text-rose-600'}">${fmt(pastDebtAmt)}</span>`;
            if (hasPastCredit && !pastUi.creditOnly) pastRead += `<span class="font-bold text-emerald-600" dir="ltr">${pastDebtAmt > 0.01 ? ' / ' : ''}-${fmt(pastCreditAmt)}</span>`;
            pastMonthlyCell = pastRead || `<span class="text-lg font-black text-emerald-600" dir="ltr">-${fmt(pastCreditAmt)}</span>`;
        } else if (hasPastCredit && !hasPastMonthly) {
            pastMonthlyCell = `<span class="text-lg font-black text-emerald-600" dir="ltr">-${fmt(pastCreditAmt)}</span>`;
        } else if (tickLocked) {
            pastMonthlyCell = `<label class="flex items-center gap-2 w-full justify-center cursor-not-allowed opacity-90" onclick="showPeriodManualLockAlert(); return false;">
            <input type="checkbox" disabled ${pastMonthlyPaid ? 'checked' : ''} class="w-5 h-5 rounded accent-rose-500 opacity-60">
            <span class="text-lg ${pastDebtStruck ? 'line-through text-slate-400' : 'font-black text-rose-600'}">${fmt(pastDebtAmt)}</span>
           </label>${hasPastCredit ? `<span class="text-sm font-bold text-emerald-600 block mt-0.5" dir="ltr">-${fmt(pastCreditAmt)}</span>` : ''}`;
        } else {
            pastMonthlyCell = `<label class="flex items-center gap-2 cursor-pointer w-full justify-center">
            <input type="checkbox" onchange="${pastTickFn}" ${pastMonthlyPaid ? 'checked' : ''} class="w-5 h-5 rounded accent-rose-500">
            <span class="text-lg ${pastDebtStruck ? 'line-through text-slate-400' : 'font-black text-rose-600'}">${fmt(pastDebtAmt)}</span>
           </label>${hasPastCredit ? `<span class="text-sm font-bold text-emerald-600 block mt-0.5" dir="ltr">-${fmt(pastCreditAmt)}</span>` : ''}`;
        }

        const monthlyCells = isMonthly ? `
        <td class="monthly-col pt-col-oc p-3 text-center print-show">${row.snapshot?.occupants || 0}</td>
        <td class="monthly-col pt-col-fix p-3 text-center print-show">${fmt(row.details?.fixed || 0)}</td>
        <td class="monthly-col pt-col-wat p-3 text-center print-show">${fmt(row.details?.water || 0)}</td>
        <td class="monthly-col pt-col-gas p-3 text-center print-show">${fmt(row.details?.gas || 0)}</td>
        <td class="monthly-col pt-col-elec p-3 text-center print-show">${fmt(row.details?.elec || 0)}</td>
        <td class="monthly-col pt-col-inc p-3 text-center print-show">${fmt(row.details?.incidental || 0)}</td>
    ` : '';

        const specialColTd = showSpecialCol
            ? `<td class="pt-col-special p-3 text-center border-r border-orange-200 align-middle bg-orange-50/40 special-col" dir="ltr">${specialCell}</td>`
            : '';
        const pastMonthlyTd = showPastMonthlyCol
            ? `<td class="pt-col-past p-3 text-center border-r border-slate-200 align-middle bg-rose-50/30" dir="ltr">${pastMonthlyCell}</td>`
            : '';

        tr.innerHTML = `
        <td class="p-3 text-center font-bold text-slate-600 unit-sticky-col sticky-col bg-inherit text-base sm:text-lg">${unitCellLabelHtml(c.unitId, u.name)}</td>
        ${monthlyCells}
        <td class="pt-col-charge p-3 text-center align-middle ${chargeBg}" dir="ltr">${chargeCell}</td>
        ${specialColTd}
        ${pastMonthlyTd}
        <td class="p-3 text-center font-black align-middle bg-slate-100 print:bg-white text-xl ${uTotalPayable > 0 ? 'text-slate-900' : (uTotalPayable < 0 ? 'text-emerald-600' : 'text-slate-300')}" dir="ltr"><span class="inline-flex items-center justify-center gap-1.5 flex-wrap">${fmt(uTotalPayable)}${creditHintBtn}</span></td>
    `;
        body.appendChild(tr);
    });

    if (isMonthly) {
        document.getElementById('pt-oc').innerText = tOcc;
        document.getElementById('pt-fix').innerText = fmt(tFix);
        document.getElementById('pt-wat').innerText = fmt(tWat);
        document.getElementById('pt-gas').innerText = fmt(tGas);
        document.getElementById('pt-elec').innerText = fmt(tElec);
        document.getElementById('pt-inc').innerText = fmt(tInc);
    }

    const ptCharge = document.getElementById('pt-foot-charge');
    if (ptCharge) ptCharge.innerText = fmt(tPaidCharge);

    const ptDebt = document.getElementById('pt-total-debt');
    if (ptDebt) {
        ptDebt.innerText = fmt(tUnpaidPastDebt);
        ptDebt.className = `p-4 text-center border-r border-slate-700 font-black bg-slate-900 ${tUnpaidPastDebt > 0 ? 'text-rose-400' : (tUnpaidPastDebt < 0 ? 'text-emerald-400' : 'text-slate-400')}`;
    }

    const ptSpec = document.getElementById('pt-total-special');
    if (ptSpec) {
        ptSpec.innerText = fmt(tOpenSpecialUnpaid);
        ptSpec.className = `p-4 text-center border-r border-orange-700/50 font-black bg-slate-900 ${tOpenSpecialUnpaid > 0 ? 'text-orange-400' : 'text-slate-400'}`;
    }

    const ptPayable = document.getElementById('pt-total-payable');
    if (ptPayable) ptPayable.innerText = fmt(tPayable);
}

function requestDeletePeriod() {
    const p = findPeriod(activePeriodId);
    const hasPayment = p.charges.some(c => (c.paidAmount || 0) > 0 || (c.paidPastMonthly || 0) > 0 || (c.paidPastSpecial || 0) > 0);

    if (hasPayment) {
        customAlert('error', 'خطا در حذف', 'برای حفظ تراز صندوق و گزارش‌ها، اول باید تیک پرداختی‌های این دوره برداشته شوند و بعد دوره حذف شود.');
        return;
    }

    customConfirm('حذف دوره از سیستم', 'تمام اطلاعات این دوره حذف خواهد شد. ادامه می‌دهید؟', 'بله، حذف کن', 'rose', () => {
        saveDB(true);
        db.periods = db.periods.filter(x => String(x.id) !== String(activePeriodId));
        saveDB(false);
        closeModal('period-detail'); renderPeriods();
    });
}

function updateGlobalReports() {
    const { income, expense, totalF } = computeFundTotals();
    const elInc = document.getElementById('total-income');
    const elExp = document.getElementById('total-expense');
    const elFund = document.getElementById('total-fund');
    if (elInc) elInc.innerText = fmt(income);
    if (elExp) elExp.innerText = fmt(expense);
    if (elFund) elFund.innerText = fmt(totalF);

    const debtors = document.getElementById('global-debtors');
    if (!debtors) return;
    debtors.innerHTML = '';
    let debts = calculateAllDebts();
    let hasDebt = false;
    Object.entries(debts).forEach(([id, val]) => {
        if (val > 0) {
            hasDebt = true;
            const u = findUnit(id);
            debtors.innerHTML += `<div class="bg-white p-5 rounded-2xl border-2 border-rose-100 flex justify-between items-center gap-3"><span class="unit-list-title text-lg font-bold text-slate-700 min-w-0 flex-1" dir="rtl">واحد ${id} <span class="text-slate-400 font-normal">(${u?.name || '؟'})</span></span><span class="font-black text-rose-500 text-2xl shrink-0" dir="ltr">${fmt(val)}</span></div>`;
        }
    });
    if (!hasDebt) debtors.innerHTML = `<div class="text-lg font-bold bg-emerald-50 text-emerald-600 p-6 rounded-2xl text-center border border-emerald-200">همه حساب‌ها پاک است.</div>`;
}

// --- Standalone Notice Printing ---
let noticePrintIncludePast = false;

function noticeFooterAmount(footId) {
    const el = document.getElementById(footId);
    if (!el) return 0;
    return parse(el.innerText || '0');
}

function getNoticePrintColumnDefs(p) {
    const isMonthly = p.type === 'monthly';
    const isSpecial = p.type === 'special';
    const showSpecialCol = isMonthly && hasConcurrentOpenSpecial(p.id);
    const defs = [{ id: 'unit', label: 'واحد', foot: 'مجموع', colClass: 'nps-col-unit' }];

    if (isMonthly) {
        [
            { id: 'fix', label: 'ثابت', footId: 'pt-fix' },
            { id: 'wat', label: 'آب', footId: 'pt-wat' },
            { id: 'gas', label: 'گاز', footId: 'pt-gas' },
            { id: 'elec', label: 'برق', footId: 'pt-elec' },
            { id: 'inc', label: 'جانبی', footId: 'pt-inc' }
        ].forEach(col => {
            if (noticeFooterAmount(col.footId) >= 0.01) {
                defs.push({ id: col.id, label: col.label, footId: col.footId, colClass: 'nps-col-bill' });
            }
        });
    }

    if (showSpecialCol && noticeFooterAmount('pt-total-special') >= 0.01) {
        defs.push({
            id: 'special',
            label: 'هزینه اضطراری',
            footId: 'pt-total-special',
            colClass: 'nps-col-special'
        });
    }

    if (!isSpecial && noticePrintIncludePast) {
        defs.push({
            id: 'past',
            label: 'بدهی پیشین',
            footId: 'pt-total-debt',
            colClass: 'nps-col-past'
        });
    }

    defs.push({
        id: 'payable',
        label: 'قابل پرداخت',
        footId: 'pt-total-payable',
        colClass: 'nps-col-payable'
    });

    return defs;
}

function getNoticePrintPayable(payDet, showSpecialCol, isMonthly) {
    if (noticePrintIncludePast) return payDet.payable;
    let payable = Math.max(0, payDet.unpaidChargeBeforeCredit - (payDet.creditAppliedToCharge || 0));
    if (showSpecialCol && isMonthly) payable += (payDet.openSpecUnpaidAfterCredit || 0);
    return payable;
}

function formatNoticePastPrint(payDet) {
    if (payDet.pastMonthlyDisplayDebt > 0.01 && payDet.pastCreditRemaining > 0.01) {
        return fmt(payDet.pastMonthlyDisplayDebt) + ' / -' + fmt(payDet.pastCreditRemaining);
    }
    if (payDet.pastCreditRemaining > 0.01) return '-' + fmt(payDet.pastCreditRemaining);
    if (payDet.pastMonthlyDisplayDebt > 0.01) return fmt(payDet.pastMonthlyDisplayDebt);
    return '0';
}

function getNoticePastNumeric(payDet) {
    let n = payDet.pastMonthlyDisplayDebt || 0;
    if (payDet.pastCreditRemaining > 0.01) n -= payDet.pastCreditRemaining;
    return n;
}

function getNoticePrintRowCellValues(p, c, u, showSpecialCol, isSpecialPeriod) {
    const row = getChargeRow(p, c);
    const payDet = getUnitPayableDetail(u.id, p);
    const openSpec = showSpecialCol ? getOpenSpecialChargeInfo(u.id) : { gross: 0, unpaid: 0 };
    const payableNum = getNoticePrintPayable(payDet, showSpecialCol, p.type === 'monthly');

    const vals = {
        unit: unitCellLabelHtml(c.unitId, u.name),
        charge: toFaDigit(fmt(row.amount)),
        special: toFaDigit(fmt(openSpec.gross)),
        payable: toFaDigit(fmt(payableNum))
    };
    const nums = {
        charge: Number(row.amount) || 0,
        special: showSpecialCol ? (Number(openSpec.gross) || 0) : 0,
        payable: payableNum,
        past: 0
    };
    if (noticePrintIncludePast) {
        vals.past = toFaDigit(formatNoticePastPrint(payDet));
        nums.past = getNoticePastNumeric(payDet);
    }
    if (p.type === 'monthly' && row.details) {
        vals.fix = toFaDigit(fmt(row.details.fixed || 0));
        vals.wat = toFaDigit(fmt(row.details.water || 0));
        vals.gas = toFaDigit(fmt(row.details.gas || 0));
        vals.elec = toFaDigit(fmt(row.details.elec || 0));
        vals.inc = toFaDigit(fmt(row.details.incidental || 0));
        nums.fix = row.details.fixed || 0;
        nums.wat = row.details.water || 0;
        nums.gas = row.details.gas || 0;
        nums.elec = row.details.elec || 0;
        nums.inc = row.details.incidental || 0;
    }
    return { vals, nums };
}



function noticePrintCellClass(def, colIndex, colCount) {
    let cls = def.colClass || '';
    if (colIndex === colCount - 1) cls += (cls ? ' ' : '') + 'nps-edge-left';
    return cls;
}

function buildNoticePrintTableHtml(p, hasIncNote) {
    const isSpecialPeriod = p.type === 'special';
    const showSpecialCol = p.type === 'monthly' && hasConcurrentOpenSpecial(p.id);
    const defs = getNoticePrintColumnDefs(p);
    const density = defs.length <= 5 ? 'nps-cols-few' : (defs.length <= 7 ? 'nps-cols-med' : 'nps-cols-many');
    const colCount = defs.length;

    let rowCount = 0;
    p.charges.forEach(c => { if (findUnit(c.unitId)) rowCount++; });

    let html = `<div class="nps-table-outer"><table class="nps-table ${density}"><thead><tr>`;
    defs.forEach((d, i) => {
        html += `<th class="${noticePrintCellClass(d, i, colCount)}">${d.label}</th>`;
    });
    html += '</tr></thead><tbody>';

    const footTotals = {};
    let rowIdx = 0;
    p.charges.forEach(c => {
        const u = findUnit(c.unitId);
        if (!u) return;
        const { vals, nums } = getNoticePrintRowCellValues(p, c, u, showSpecialCol, isSpecialPeriod);
        const zebra = rowIdx % 2 === 1 ? 'nps-row-even' : 'nps-row-odd';
        html += `<tr class="${zebra}">`;
        defs.forEach((d, i) => {
            const raw = vals[d.id] != null ? vals[d.id] : '۰';
            const cls = noticePrintCellClass(d, i, colCount);
            if (d.id === 'unit') html += `<td class="${cls}">${raw}</td>`;
            else html += `<td class="${cls}">${raw}</td>`;
            if (d.id !== 'unit' && nums[d.id] != null) {
                footTotals[d.id] = (footTotals[d.id] || 0) + nums[d.id];
            }
        });
        html += '</tr>';
        rowIdx++;
    });

    html += '</tbody><tfoot><tr>';
    defs.forEach((d, i) => {
        const cls = noticePrintCellClass(d, i, colCount);
        if (d.id === 'unit') {
            html += `<td class="${cls}">${d.foot}</td>`;
        } else if (footTotals[d.id] != null) {
            html += `<td class="${cls}">${toFaDigit(fmt(footTotals[d.id]))}</td>`;
        } else {
            html += `<td class="${cls}">۰</td>`;
        }
    });
    html += '</tr></tfoot></table></div>';
    return html;
}

const NOTICE_PRINT_DOC_STYLES = `
@import url('css/fonts/vazirmatn.css');

@page { size: A4 portrait; margin: 6mm 8mm; }
html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
body {
    font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; padding: 3mm 4mm;
    color: #0f172a; background: #fff; box-sizing: border-box;
    display: flex; flex-direction: column;
}
.nps-print-layout { width: 100%; max-width: 100%; display: flex; flex-direction: column; flex: 1; height: 100%; }
.nps-title {
    font-size: 19pt; font-weight: 900; text-align: center; color: #0f172a;
    border-bottom: 3px solid #0f172a; padding-bottom: 5px; margin: 0 0 6px;
    flex-shrink: 0;
}
.nps-sub { font-size: 11.5pt; font-weight: 700; text-align: center; margin: 0 0 8px; color: #334155; flex-shrink: 0; }
.nps-note {
    font-size: 9.5pt; font-weight: 700; text-align: right;
    border: 1px solid #94a3b8; padding: 5px 8px; margin: 0 0 6px; background: #f1f5f9 !important;
    border-radius: 4px; flex-shrink: 0;
}
.nps-table-outer {
    width: 100%; margin: 0; border: 2px solid #0f172a; box-sizing: border-box;
    page-break-inside: avoid; break-inside: avoid-page;
    flex: 1; display: flex; flex-direction: column;
}
table.nps-table {
    width: 100%; height: 100%; table-layout: fixed; margin: 0;
    border-collapse: separate; border-spacing: 0;
}
table.nps-table th, table.nps-table td {
    border: 1px solid #475569; padding: 5px 3px; text-align: center;
    font-size: 10.5pt; font-weight: 700; vertical-align: middle;
    word-wrap: break-word; line-height: 1.25;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
table.nps-table th:first-child, table.nps-table td:first-child { border-right: 2px solid #0f172a; }
table.nps-table th.nps-edge-left, table.nps-table td.nps-edge-left { border-left: 2px solid #0f172a; }
table.nps-table.nps-fill tbody td {
    padding-top: var(--nps-py, 5px); padding-bottom: var(--nps-py, 5px);
}
table.nps-cols-few th, table.nps-cols-few td { font-size: 11.5pt; padding: 6px 4px; }
table.nps-cols-med th, table.nps-cols-med td { font-size: 10.5pt; padding: 5px 3px; }
table.nps-cols-many th, table.nps-cols-many td { font-size: 9.5pt; padding: 4px 2px; line-height: 1.2; }
table.nps-table thead th {
    background-color: #cbd5e1 !important; color: #0f172a !important;
    border-bottom: 2px solid #0f172a; font-size: 10.5pt; font-weight: 900;
}
table.nps-table tbody tr.nps-row-even td { background-color: #f1f5f9 !important; }
table.nps-table tbody tr.nps-row-odd td { background-color: #ffffff !important; }
table.nps-table tfoot td {
    background-color: #0f172a !important; color: #f8fafc !important;
    border-top: 2px solid #0f172a; font-weight: 900; font-size: 11pt;
}
table.nps-cols-few .nps-col-unit { width: 18%; }
table.nps-cols-few .nps-col-bill { width: 11%; }
table.nps-cols-few .nps-col-charge { width: 14%; }
table.nps-cols-few .nps-col-payable { width: 14%; }
table.nps-cols-med .nps-col-unit { width: 15%; }
.unit-cell-label { white-space: normal; line-height: 1.15; }
`;

function getNoticeUnpaidPastTotal(p) {
    let total = 0;
    p.charges.forEach(c => {
        if (!findUnit(c.unitId)) return;
        total += getNoticePastNumeric(getUnitPayableDetail(c.unitId, p));
    });
    return total;
}

function populateNoticePrintSheet(p) {
    const sheet = document.getElementById('notice-print-sheet');
    if (!sheet) return false;

    const periodExpenses = (p.isClosed && p.frozenExpenses) ? p.frozenExpenses : p.expenses;
    const incNote = (p.type === 'monthly' && periodExpenses.incDesc && (periodExpenses.incidental || 0) > 0.01)
        ? `<p class="nps-note">توضیح هزینه جانبی: ${toFaDigit(periodExpenses.incDesc)}</p>`
        : '';

    const hasIncNote = !!incNote;
    sheet.innerHTML = `
    <div class="nps-print-layout">
        <h1 class="nps-title">اطلاعیه شارژ ساختمان پارس</h1>
        <p class="nps-sub">دوره: <strong>${toFaDigit(p.name)}</strong></p>
        ${incNote}
        ${buildNoticePrintTableHtml(p, hasIncNote)}
    </div>`;
    return true;
}

function showNoticePrintPreview(p) {
    if (!populateNoticePrintSheet(p)) {
        customAlert('error', 'چاپ', 'جدول دوره برای چاپ آماده نیست.');
        return;
    }
    document.getElementById('notice-print-modal').classList.remove('hidden');
}

function askNoticePrintPastDebtThenPreview() {
    const p = findPeriod(activePeriodId);
    if (!p) return;

    const hasPastCol = p.type !== 'special';
    const pastTotal = hasPastCol ? getNoticeUnpaidPastTotal(p) : 0;
    if (!hasPastCol || pastTotal < 0.01) {
        noticePrintIncludePast = false;
        showNoticePrintPreview(p);
        return;
    }

    customConfirm(
        'چاپ اطلاعیه',
        `آیا ستون «بدهی پیشین» (جمع ${fmt(pastTotal)} تومان) در چاپ اطلاعیه نمایش داده شود؟`,
        'بله، نمایش داده شود',
        'indigo',
        () => {
            noticePrintIncludePast = true;
            showNoticePrintPreview(p);
        },
        'نه، حذف شود',
        () => {
            noticePrintIncludePast = false;
            showNoticePrintPreview(p);
        }
    );
}

function closeNoticePrintPreview() {
    document.getElementById('notice-print-modal').classList.add('hidden');
    document.getElementById('notice-print-sheet').innerHTML = '';
    document.body.classList.remove('print-notice-sheet');
}

function bindPrintDialogEndOn(targetWin, onEnd) {
    let ended = false;
    let enteredPrint = false;
    const finish = () => {
        if (ended) return;
        ended = true;
        setTimeout(onEnd, 1500);
    };
    const mql = targetWin.matchMedia('print');
    const onChange = (e) => {
        if (e.matches) enteredPrint = true;
        else if (enteredPrint) finish();
    };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
    targetWin.addEventListener('afterprint', () => {
        if (enteredPrint) finish();
    }, { once: true });
}

const REPORT_PRINT_DOC_STYLES = `
@page { size: A4 portrait; margin: 10mm; }
html, body {
    margin: 0; padding: 0; width: 100%;
    font-family: Tahoma, Arial, sans-serif; color: #0f172a; background: #fff;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
}
body { padding: 4mm 5mm; box-sizing: border-box; }
h2, h3, h4 { margin: 0 0 8px; font-weight: 900; }
p { margin: 0 0 6px; font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
th, td { border: 1px solid #000 !important; padding: 3px 5px !important; text-align: center; font-weight: 700; color: #000 !important; vertical-align: middle; }
thead th { background: #e2e8f0 !important; }
tfoot td { background: #1e293b !important; color: #fff !important; font-weight: 900; }
.text-rose-600, .text-rose-700, .text-rose-400, .text-rose-300, .text-rose-500 { color: #e11d48 !important; }
.text-emerald-600, .text-emerald-700, .text-emerald-800, .text-emerald-500, .text-emerald-300 { color: #059669 !important; }
.text-orange-600, .text-orange-700, .text-orange-800 { color: #ea580c !important; }
.text-slate-500, .text-slate-600, .text-slate-800 { color: #475569 !important; }
.text-indigo-700 { color: #4338ca !important; }
.bg-orange-50, tr.bg-orange-50 td { background: #fff7ed !important; }
.bg-emerald-50 { background: #ecfdf5 !important; }
.bg-emerald-100, thead.bg-emerald-100 th { background: #d1fae5 !important; }
.bg-indigo-100, thead.bg-indigo-100 th { background: #e0e7ff !important; }
.bg-slate-200, thead.bg-slate-200 th { background: #e2e8f0 !important; }
.bg-slate-50 { background: #f8fafc !important; }
.bg-emerald-800, tfoot.bg-emerald-800 td { background: #065f46 !important; color: #fff !important; }
.bg-slate-800, tfoot.bg-slate-800 td { background: #1e293b !important; color: #fff !important; }
.unit-report-print h2 { font-size: 15pt !important; margin-bottom: 8px !important; border-bottom: 3px solid #000; padding-bottom: 6px; }
.unit-report-print table { font-size: 9pt !important; }
.debtors-report-summary .debtors-title { font-size: 15pt !important; text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
.debtors-report-summary .debtors-meta { font-size: 9pt !important; }
.debtors-report-summary .debtors-table { font-size: 10pt !important; }
.debtors-report-summary.density-sm .debtors-table { font-size: 9pt !important; }
.debtors-report-summary.density-md .debtors-table { font-size: 8pt !important; }
.debtors-report-summary.density-compact .debtors-table { font-size: 7pt !important; }
.debtors-report-detailed h2 { font-size: 15pt !important; }
.debtors-report-detailed table { font-size: 10pt !important; }
.grid { display: grid; gap: 8px; }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
`;

function buildStandalonePrintHtml(title, bodyHtml, styles) {
    return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${styles}</style></head><body>${bodyHtml}</body></html>`;
}

function printStandaloneDocument(docHtml, afterPrint, frameTitle) {
    const onDone = typeof afterPrint === 'function' ? afterPrint : () => { };

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', frameTitle || 'print-frame');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483646;opacity:0.01;pointer-events:none';
    document.body.appendChild(iframe);
    const iwin = iframe.contentWindow;
    iwin.document.open();
    iwin.document.write(docHtml);
    iwin.document.close();

    let printed = false;
    const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
            iwin.focus();
            iwin.print();
        } catch (e) {
            customAlert('error', 'چاپ', 'چاپ ممکن نشد.');
        }
    };
    bindPrintDialogEndOn(iwin, () => {
        setTimeout(() => {
            try { iframe.remove(); } catch (e) { }
            onDone();
        }, 500);
    });
    setTimeout(triggerPrint, 500);
    return true;
}

function printNoticeStandaloneDocument(sheetInnerHtml) {
    const docHtml = buildStandalonePrintHtml('اطلاعیه شارژ', sheetInnerHtml, NOTICE_PRINT_DOC_STYLES);
    return printStandaloneDocument(docHtml, () => closeNoticePrintPreview(), 'notice-print-frame');
}

function executeNoticePrint() {
    const sheet = document.getElementById('notice-print-sheet');
    if (!sheet || !sheet.innerHTML.trim()) return;
    if (!printNoticeStandaloneDocument(sheet.innerHTML)) {
        customAlert('error', 'چاپ', 'پاپ‌آپ مسدود است. اجازهٔ باز شدن پنجره/تب جدید را در مرورگر فعال کنید.');
    }
}

function executeReportViewPrint() {
    const content = document.getElementById('report-view-content');
    if (!content || !content.innerHTML.trim()) return;
    const title = document.getElementById('report-view-title').innerText || 'گزارش';
    const docHtml = buildStandalonePrintHtml(title, content.innerHTML, REPORT_PRINT_DOC_STYLES);
    if (!printStandaloneDocument(docHtml, null, 'report-print-frame')) {
        document.body.classList.add('print-report-view');
        const cleanup = () => document.body.classList.remove('print-report-view');
        bindPrintDialogEndOn(window, cleanup);
        window.print();
    }
}

function printPage(mode) {
    if (mode === 'notice') {
        askNoticePrintPastDebtThenPreview();
        return;
    }
    document.body.classList.remove('print-notice-sheet');
    window.print();
}

function updatePeriodPrintHeader(p) {
    const el = document.getElementById('period-print-header');
    if (!el) return;
    const periodExpenses = (p.isClosed && p.frozenExpenses) ? p.frozenExpenses : p.expenses;
    const incNote = (p.type === 'monthly' && periodExpenses.incDesc && (periodExpenses.incidental || 0) > 0.01)
        ? `<p class="period-print-note">توضیح هزینه جانبی: ${periodExpenses.incDesc}</p>`
        : '';
    el.innerHTML = `
    <h1 class="period-print-title">اطلاعیه شارژ ساختمان پارس</h1>
    <p class="period-print-sub">دوره: <strong>${p.name}</strong></p>
    ${incNote}`;
}

function openReportView(title, html, reportKind) {
    document.getElementById('report-view-title').innerText = title;
    document.getElementById('report-view-content').innerHTML = html;
    pushNav({ type: 'report-view', reportKind: reportKind || 'general' });
    document.getElementById('modal-report-view').classList.remove('hidden');
}

function restoreReportViewContent(entry) {
    const kind = entry?.reportKind || '';
    if (String(kind).startsWith('unit-')) {
        const uid = String(kind).slice(5);
        activeUnitId = uid;
        const u = findUnit(uid);
        const title = u ? `گزارش واحد ${u.id}${unitNameInParens(u.name)}` : 'گزارش واحد';
        document.getElementById('report-view-title').innerText = title;
        document.getElementById('report-view-content').innerHTML = buildUnitReportPrintHtml(uid);
        return;
    }
    activeUnitId = null;
}

function buildUnitReportPrintHtml(unitId) {
    const u = findUnit(unitId);
    if (!u) return '<p class="text-center font-bold text-slate-500 p-8">واحد یافت نشد.</p>';
    let lines = collectSimpleUnitStory(unitId);
    attachSimpleStoryBalances(lines, unitId);
    lines.sort((a, b) => compareFinancialEvents(a, b, true));
    const runningDebt = getUnitTotalDebt(unitId);
    const balanceSummary = simpleStoryBalanceLabel(runningDebt);
    const balanceCls = Math.abs(runningDebt) < 0.1 ? 'text-emerald-700'
        : (runningDebt < 0 ? 'text-emerald-700' : 'text-rose-700');
    let html = `<div class="unit-report-print">
    <h2 class="text-3xl sm:text-4xl font-black text-center mb-4 border-b-4 border-slate-900 pb-4">گزارش مالی واحد ${u.id}${unitNameInParens(u.name)}</h2>
    <p class="text-center text-lg font-bold mb-1">ساختمان پارس</p>
    <p class="text-center text-base font-bold text-slate-600 mb-4">تاریخ تهیه: ${getPersianDateTime()}</p>
    <div class="text-center mb-6 p-4 border-2 border-slate-300 rounded-xl bg-slate-50">
        <div class="text-base font-bold text-slate-600">وضعیت الان</div>
        <div class="text-3xl font-black ${balanceCls}" dir="ltr">${balanceSummary}</div>
    </div>
    <p class="text-sm font-bold text-slate-500 mb-3 text-center">جدید به قدیم — هر ردیف یک اتفاق · نارنجی = هزینه اضطراری</p>
    <table class="w-full border-collapse border-2 border-black text-center text-xs sm:text-sm font-bold">
    <thead class="bg-slate-200"><tr>
        <th class="border-2 border-black p-2">تاریخ</th>
        <th class="border-2 border-black p-2">دوره</th>
        <th class="border-2 border-black p-2">شرح</th>
        <th class="border-2 border-black p-2">مبلغ</th>
        <th class="border-2 border-black p-2">بعد از این</th>
    </tr></thead><tbody>`;
    lines.forEach(line => {
        const rowCls = line.isEmergency ? 'zebra-row bg-orange-50' : 'zebra-row';
        const amt = line.category === 'neutral' ? '—' : fmt(line.amount);
        const balLine = line.balanceAfter !== undefined ? simpleStoryBalanceLabel(line.balanceAfter) : '—';
        const hint = line.hint ? `<div class="text-[10px] text-slate-500 font-bold">${line.hint}</div>` : '';
        html += `<tr class="${rowCls}">
        <td class="border-2 border-black p-2">${line.date || '—'}</td>
        <td class="border-2 border-black p-2">${line.periodName || '—'}</td>
        <td class="border-2 border-black p-2 text-right ${line.isEmergency ? 'text-orange-800' : ''}">${line.text}${hint}</td>
        <td class="border-2 border-black p-2 font-black" dir="ltr">${amt}</td>
        <td class="border-2 border-black p-2 text-right">${balLine}</td>
    </tr>`;
    });
    if (!lines.length) html += `<tr><td colspan="5" class="p-4 border-2 border-black">سابقه‌ای یافت نشد.</td></tr>`;
    html += `</tbody></table></div>`;
    return html;
}

function openUnitReportPrintView() {
    if (!activeUnitId) return;
    const u = findUnit(activeUnitId);
    if (!u) return;
    const title = `گزارش واحد ${u.id}${unitNameInParens(u.name)}`;
    document.getElementById('modal-report-unit').classList.add('hidden');
    document.getElementById('report-view-title').innerText = title;
    document.getElementById('report-view-content').innerHTML = buildUnitReportPrintHtml(activeUnitId);
    pushNav({ type: 'report-view', reportKind: 'unit-' + activeUnitId });
    document.getElementById('modal-report-view').classList.remove('hidden');
}

function closeModal(id) {
    try {
        if (!popNav()) closeAllViews();
    } catch (e) {
        console.error(e);
    }
}

function hideAllModalsOnly() {
    ['modal-unit', 'modal-report-unit', 'modal-new-period', 'modal-period-detail', 'modal-alert', 'modal-confirm', 'modal-init-fund', 'modal-deposits-report', 'modal-report-view', 'notice-print-modal', 'modal-settings', 'modal-share-unit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const unitContent = document.getElementById('modal-unit-content');
    if (unitContent) unitContent.classList.remove('open');
}

function closeAllViews() {
    hideAllModalsOnly();
    activeUnitId = null;
    activePeriodId = null;
    returnToUnitReportAfterPeriod = false;
    unitModalEditMode = false;
    unitEditSnapshot = null;
    initNavStack(getActiveTab());
    ensureExitTrapIfRoot();
}
