import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, parseDecimal } from '../../src/oracle.ts';

describe('Tier 2 Boundaries: Arabic & Persian Numeral Stress', () => {
  it('T2.3.1: should normalize full keyboard numeral series (0-9) in both Persian and Arabic', () => {
    const persianAll = '۰۱۲۳۴۵۶۷۸۹';
    const arabicAll  = '٠١٢٣٤٥٦٧٨٩';

    assert.equal(normalizeDigits(persianAll), '0123456789');
    assert.equal(normalizeDigits(arabicAll), '0123456789');
  });

  it('T2.3.2: should parse currency amounts with zero-width non-joiner (ZWNJ \u200C)', () => {
    const inputWithZwnj = '۱۲\u200C۵۰۰\u200C۰۰۰'; // Persian 12,500,000 with ZWNJ
    const parsed = parseDecimal(inputWithZwnj);
    assert.equal(parsed, 12_500_000);
  });

  it('T2.3.3: should correctly parse Arabic 8 and Persian 8 side by side: ٨۸8', () => {
    // ٨ (Arabic 8), ۸ (Persian 8), 8 (Latin 8)
    const tripleEight = '٨۸8';
    assert.equal(normalizeDigits(tripleEight), '888');
    assert.equal(parseDecimal(tripleEight), 888);
  });

  it('T2.3.4: should extract numbers from rich Persian labels such as "مبلغ: ۴۵,۰۰۰ ریال"', () => {
    const rawText = 'مبلغ: ۴۵,۰۰۰ ریال';
    const normalized = normalizeDigits(rawText);
    assert.equal(normalized, 'مبلغ: 45,000 ریال');
  });

  it('T2.3.5: should parse fractional numbers with Persian slash separator and Arabic numerals', () => {
    // ١٢٥/٥ = 125.5
    const arabicFraction = '١٢٥/٥';
    assert.equal(parseDecimal(arabicFraction), 125.5);
  });
});
