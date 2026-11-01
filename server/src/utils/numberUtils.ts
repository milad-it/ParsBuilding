/**
 * ParsBuilding Number & Currency Utilities
 *
 * Provides deterministic conversion, parsing, and formatting for Persian,
 * Arabic, and English numeric representations.
 * Resolves Bug #1 (Arabic digit 8 typo) and Bug #2 (Decimal preservation).
 */

/**
 * Converts Persian and Arabic numerals to English ASCII digits ('0'-'9').
 * Fixes Bug #1 by computing relative offset from Unicode base point:
 * - Persian ۰-۹: \u06F0-\u06F9 (codes 1776 - 1785)
 * - Arabic ٠-٩: \u0660-\u0669 (codes 1632 - 1641) -> digit 8 (\u0668) is code 1640 (1640 - 1632 = 8).
 */
export function toEnDigit(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str)
    // Strip invisible formatting characters: LTR/RTL marks, ZWNJ, ZWJ, zero-width space, BOM
    .replace(/[\u200E\u200F\u200B\u200C\u200D\uFEFF]/g, '')
    // Persian digits: ۰ (1776) to ۹ (1785)
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 1776))
    // Arabic digits: ٠ (1632) to ٩ (1641)
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 1632));
}

/**
 * Parses floating-point numbers preserving decimal parts for unit area and fractional rates.
 * Correctly distinguishes thousands separators from decimal points:
 * - Multi-dot / multi-slash formats (e.g. '28.000.000', '28/000/000') are treated as thousands separators.
 * - Arabic decimal separator Momayyez ('٫') and single slash ('/') are converted to standard period ('.').
 */
export function parseDecimal(val: string | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let s = toEnDigit(val).trim();

  // Strip standard and Arabic thousands separators:
  // \u066C = Arabic thousands separator '٬'
  // \u060C = Arabic comma '،'
  // ',' = standard comma
  s = s.replace(/[\u066C\u060C,]/g, '');

  // If multiple dots or multiple slashes exist, they are thousands separators:
  const dotCount = (s.match(/\./g) || []).length;
  const slashCount = (s.match(/\//g) || []).length;
  if (dotCount > 1) s = s.replace(/\./g, '');
  if (slashCount > 1) s = s.replace(/\//g, '');

  // Standardize remaining decimal separator:
  // \u066B = Arabic decimal separator '٫'
  // '/' = common Persian accounting decimal separator
  s = s.replace(/[\u066B/]/g, '.');

  // Strip any remaining characters except digits, period, and minus sign
  s = s.replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses integer currency values (Rials / Tomans) rounded to the nearest integer.
 */
export function parseIntegerCurrency(val: string | number | null | undefined): number {
  const num = parseDecimal(val);
  return Math.round(num);
}

/**
 * Formats a numeric value with standard thousand separators.
 */
export function formatCurrency(amount: number, unit = 'تومان'): string {
  const formatted = Math.round(amount).toLocaleString('fa-IR');
  return unit ? `${formatted} ${unit}` : formatted;
}
