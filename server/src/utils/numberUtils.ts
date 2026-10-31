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
    // Persian digits: ۰ (1776) to ۹ (1785)
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 1776))
    // Arabic digits: ٠ (1632) to ٩ (1641)
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 1632));
}

/**
 * Parses floating-point numbers preserving decimal parts for unit area and fractional rates.
 * Fixes Bug #2 by converting Persian/Arabic decimal separators (٫, /) to standard period (.)
 * and stripping out thousand separators while preserving the decimal fraction.
 */
export function parseDecimal(val: string | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let s = toEnDigit(val).trim();
  // Standardize common Persian/Arabic decimal separators:
  // \u066B is the Arabic decimal separator '٫'
  // '/' is also frequently used in Persian accounting as decimal mark
  s = s.replace(/[\u066B/]/g, '.');

  // Remove commas (thousand separators) and any other character except digits, period, minus
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
