import { describe, it, expect } from 'vitest';
import {
  toEnDigit,
  toFaDigit,
  formatToman,
  parsePersianNumber,
  num2persian
} from '../src/utils/formatters';

describe('Persian Formatting Utilities', () => {
  it('correctly converts Persian and Arabic digits to English digits', () => {
    expect(toEnDigit('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toEnDigit('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    // Note: Arabic digit 8 was fixed from old typo in legacy code
    expect(toEnDigit('٨')).toBe('8');
  });

  it('correctly converts English digits to Persian digits', () => {
    expect(toFaDigit('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
    expect(toFaDigit(1403)).toBe('۱۴۰۳');
  });

  it('formats Tomans correctly with separators and Persian digits', () => {
    expect(formatToman(0)).toBe('۰');
    expect(formatToman(null)).toBe('۰');
    expect(formatToman(50000)).toBe('۵۰٬۰۰۰');
    expect(formatToman(1250000)).toBe('۱٬۲۵۰٬۰۰۰');
  });

  it('parses Persian number strings to numeric values', () => {
    expect(parsePersianNumber('۱۲۵۰۰')).toBe(12500);
    expect(parsePersianNumber('۵۰,۰۰۰')).toBe(50000);
    expect(parsePersianNumber(2500)).toBe(2500);
    expect(parsePersianNumber('')).toBe(0);
  });

  it('converts numbers to Persian words accurately', () => {
    expect(num2persian(0)).toBe('صفر تومان');
    expect(num2persian(50000)).toContain('پنجاه هزار');
    expect(num2persian(1250000)).toContain('یک میلیون و دویست و پنجاه هزار');
    expect(num2persian(100)).toContain('صد');
  });
});
