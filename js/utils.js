// --- Helper & Utility Functions ---

const PHONE_INPUT_PLACEHOLDER = '09xxxxxxxxx';

/** جلوگیری از نمایش «undefined» در input (مقدار یا رشتهٔ ذخیره‌شده) */
function cleanContactField(val) {
    if (val == null || val === 'undefined' || val === 'null') return '';
    return String(val).trim();
}

function normalizeUnitContactFields(u) {
    if (!u) return;
    const legacyPhone = cleanContactField(u.phone);
    let ownerPhone = cleanContactField(u.ownerPhone);
    let tenantPhone = cleanContactField(u.tenantPhone);
    if (!ownerPhone && !tenantPhone && legacyPhone) {
        if (u.occType === 'tenant') tenantPhone = legacyPhone;
        else ownerPhone = legacyPhone;
    }
    u.ownerPhone = ownerPhone;
    u.tenantPhone = tenantPhone;
    u.name = cleanContactField(u.name);
    if (u.ownerName == null || u.ownerName === 'undefined') {
        u.ownerName = u.occType === 'owner' ? u.name : '';
    } else {
        u.ownerName = cleanContactField(u.ownerName);
    }
    if (u.phone !== undefined) delete u.phone;
}

function setFormInputValue(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = cleanContactField(val);
    if (el.id === 'inp-owner-phone' || el.id === 'inp-tenant-phone') {
        el.placeholder = PHONE_INPUT_PLACEHOLDER;
    }
}

function getPersianDateTime() {
    try { return new Date().toLocaleString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date().toLocaleString(); }
}

// --- Number to Words Persian ---
function Num2persian(num) {
    if (num === 0 || num === '0') return 'صفر';
    let str = num.toString().replace(/,/g, '');
    if (isNaN(str)) return '';
    const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const dahha = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const base = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

    function getPart(n) {
        let res = '';
        let s = Math.floor(n / 100); n = n % 100;
        let d = Math.floor(n / 10); let y = n % 10;
        if (s > 0) res += sadgan[s] + ' و ';
        if (d === 1) { res += dahha[y] + ' و '; }
        else {
            if (d > 1) res += dahgan[d] + ' و ';
            if (y > 0) res += yekan[y] + ' و ';
        }
        return res.slice(0, -3);
    }

    let out = ''; let b = 0;
    while (str.length > 0) {
        let partStr = str.length > 3 ? str.substring(str.length - 3, str.length) : str;
        str = str.substring(0, str.length - 3);
        let partNum = parseInt(partStr, 10);
        if (partNum > 0) {
            let p = getPart(partNum);
            out = p + (base[b] ? ' ' + base[b] : '') + (out ? ' و ' + out : '');
        }
        b++;
    }
    return out + ' تومان';
}

function updateWords(inputEl, displayId) {
    const val = parse(inputEl.value);
    const target = document.getElementById(displayId);
    if (target) {
        if (!val || val === 0) target.innerText = '';
        else target.innerText = Num2persian(val);
    }
}

function showToast(msg, type = 'info') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg z-50 transition-opacity duration-300 opacity-0 pointer-events-none';
        document.body.appendChild(t);
    }
    t.innerText = msg;
    if (type === 'success') t.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-2xl z-50 transition-opacity duration-300';
    else if (type === 'error') t.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-6 py-3 rounded-xl font-bold shadow-2xl z-50 transition-opacity duration-300';
    else t.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-xl font-bold shadow-2xl z-50 transition-opacity duration-300';

    t.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none'), 2500);
}

// --- Math & Format Utils ---
const toEnDigit = s => (s == null ? '' : String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const toFaDigit = s => (s == null ? '' : String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]));

function fmt(n) {
    if (n === null || n === undefined || isNaN(n) || n === 0) return '۰';
    return toFaDigit(Math.round(n).toLocaleString('fa-IR'));
}

const parse = (str) => {
    if (!str) return 0;
    // convert Persian/Arabic digits to English, then strip all non-digit chars except leading minus
    let val = toEnDigit(String(str)).replace(/[^0-9\-]/g, '');
    let parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
};

function formatMoneyInput(input) {
    let raw = toEnDigit(input.value);
    let isNeg = raw.startsWith('-');
    let val = raw.replace(/[^0-9]/g, '');
    input.value = val ? (isNeg ? '-' : '') + fmt(parseInt(val, 10)) : (isNeg ? '-' : '');
}

function getCurrentShamsiYear() {
    try {
        const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric' });
        return formatter.format(new Date()).replace(/[^0-9]/g, '').trim();
    } catch (e) {
        const today = new Date();
        return (today.getFullYear() - 621).toString();
    }
}

/** یکسان‌سازی شناسه: units.id و charges.unitId همیشه با String مقایسه شوند */
function sameId(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

/** پرانتز نام واحد فقط وقتی نام پر باشد (جلوگیری از «واحد ۴ ()» در RTL) */
function unitNameInParens(name) {
    const n = (name || '').trim();
    return n ? ` (${n})` : '';
}

function unitDisplayLabel(u) {
    if (!u) return '—';
    const n = (u.name || '').trim();
    return n ? `واحد ${u.id} (${n})` : `واحد ${u.id}`;
}

/** شماره + نام در یک خط (جدول دوره) */
function unitCellLabelHtml(unitId, name) {
    const n = (name || '').trim();
    const faId = toFaDigit(unitId);
    const namePart = n
        ? `<span class="unit-cell-name">(${n})</span>`
        : `<span class="unit-cell-name text-slate-400">(---)</span>`;
    return `<span class="unit-cell-label" dir="rtl"><span class="unit-cell-id">${faId}</span>${namePart}</span>`;
}

function findUnit(unitId) {
    if (!db || !db.units) return null;
    return db.units.find(u => sameId(u.id, unitId)) || null;
}

function findPeriod(periodId) {
    if (!db || !db.periods) return null;
    return db.periods.find(p => sameId(p.id, periodId)) || null;
}
