import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, parseDecimal } from '../../src/oracle.ts';

describe('Feature 4: Bug Fix - Arabic Digit 8 Typo Resolution', () => {
  it('T1.4.1: should map Arabic digit eight ٨ strictly to 8 (fixing legacy index 8 bug)', () => {
    const raw = '٨';
    const normalized = normalizeDigits(raw);
    assert.equal(normalized, '8');
    assert.notEqual(normalized, '7');
  });

  it('T1.4.2: should parse entire Arabic numeral string with digit 8 correctly', () => {
    // ٨۵۴۳۲ = 85432
    const input = '٨۵۴۳۲';
    const normalized = normalizeDigits(input);
    assert.equal(normalized, '85432');
    assert.equal(parseDecimal(input), 85432);
  });

  it('T1.4.3: should correctly process mixed Persian and Arabic digits containing ٨ and ۸', () => {
    // Persian 8 is '۸', Arabic 8 is '٨'
    const mixed = 'واحد ۸ و متراژ ٨۵';
    const normalized = normalizeDigits(mixed);
    assert.equal(normalized, 'واحد 8 و متراژ 85');
  });

  it('T1.4.4: should calculate currency amounts containing Arabic 8 without calculation deviation', () => {
    // ٨۰۰۰۰۰۰ Rials = 8,000,000
    const rawRials = '٨۰۰۰۰۰۰';
    const parsedAmount = parseDecimal(rawRials);
    assert.equal(parsedAmount, 8_000_000);

    const doubled = parsedAmount * 2;
    assert.equal(doubled, 16_000_000);
  });

  it('T1.4.5: should correctly normalize telephone numbers containing Arabic digit 8', () => {
    const phone = '۰۹۱۲٨۷۶۵۴۳۲';
    const normalized = normalizeDigits(phone);
    assert.equal(normalized, '09128765432');
    assert.equal(normalized.length, 11);
    assert.equal(normalized[4], '8');
  });
});
