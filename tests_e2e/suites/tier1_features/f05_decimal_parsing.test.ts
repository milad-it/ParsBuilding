import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimal } from '../../src/oracle.ts';

describe('Feature 5: Bug Fix - Decimal Parsing for Fractional Inputs', () => {
  it('T1.5.1: should parse standard ASCII decimal point in unit areas', () => {
    assert.equal(parseDecimal('95.75'), 95.75);
    assert.equal(parseDecimal('120.5'), 120.5);
  });

  it('T1.5.2: should parse Persian momayyez (٫) as decimal separator', () => {
    assert.equal(parseDecimal('۱۰۵٫۵۰'), 105.5);
    assert.equal(parseDecimal('۸۴٫۲۵'), 84.25);
  });

  it('T1.5.3: should parse slash (/) separator commonly used in Persian financial forms', () => {
    assert.equal(parseDecimal('۱۵۰/۵'), 150.5);
    assert.equal(parseDecimal('75/8'), 75.8);
  });

  it('T1.5.4: should ignore Persian and Latin thousand-separator commas without corrupting decimals', () => {
    assert.equal(parseDecimal('1,250,000.50'), 1250000.5);
    assert.equal(parseDecimal('۱,۲۵۰,۰۰۰٫۷۵'), 1250000.75);
  });

  it('T1.5.5: should handle whitespace, null, undefined and empty values safely returning 0', () => {
    assert.equal(parseDecimal('   '), 0);
    assert.equal(parseDecimal(''), 0);
    assert.equal(parseDecimal(null), 0);
    assert.equal(parseDecimal(undefined), 0);
    assert.equal(parseDecimal('  ۸۵٫۴  '), 85.4);
  });
});
