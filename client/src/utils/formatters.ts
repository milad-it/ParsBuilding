/**
 * High-Performance Persian/Arabic Digit Conversion & Currency Formatters
 */
export const toEnDigit = (s: string | number | null | undefined): string => {
  if (s == null) return '';
  return String(s)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
};

export const toFaDigit = (s: string | number | null | undefined): string => {
  if (s == null) return '';
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

export function formatToman(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount) || amount === 0) return '۰';
  const isNegative = amount < 0;
  const absStr = Math.abs(Math.round(amount)).toLocaleString('en-US').replace(/,/g, '٬');
  const faDigits = toFaDigit(absStr);
  return isNegative ? `-${faDigits}` : faDigits;
}

export function parsePersianNumber(str: string | number | null | undefined): number {
  if (typeof str === 'number') return isNaN(str) ? 0 : str;
  if (!str) return 0;
  const en = toEnDigit(String(str)).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(en);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Persian Number to Words Converter
 */
export function num2persian(num: number | string): string {
  const n = parsePersianNumber(num);
  if (n === 0) return 'صفر تومان';

  let str = Math.abs(Math.round(n)).toString();
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const dahha = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const base = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  function getPart(val: number): string {
    let res = '';
    const s = Math.floor(val / 100);
    val = val % 100;
    const d = Math.floor(val / 10);
    const y = val % 10;

    if (s > 0) res += sadgan[s] + ' و ';
    if (d === 1) {
      res += dahha[y] + ' و ';
    } else {
      if (d > 1) res += dahgan[d] + ' و ';
      if (y > 0) res += yekan[y] + ' و ';
    }
    return res.slice(0, -3);
  }

  let out = '';
  let b = 0;
  while (str.length > 0) {
    const partStr = str.length > 3 ? str.substring(str.length - 3, str.length) : str;
    str = str.substring(0, str.length - 3);
    const partNum = parseInt(partStr, 10);
    if (partNum > 0) {
      const p = getPart(partNum);
      out = p + (base[b] ? ' ' + base[b] : '') + (out ? ' و ' + out : '');
    }
    b++;
  }

  const prefix = n < 0 ? 'منفی ' : '';
  return prefix + out + ' تومان';
}
