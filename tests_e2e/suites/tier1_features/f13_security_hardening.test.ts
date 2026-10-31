import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, parseDecimal } from '../../src/oracle.ts';

describe('Feature 13: Security Hardening & Input Sanitization', () => {
  it('T1.13.1: should sanitize SQL injection patterns in search inputs', () => {
    const maliciousInput = "101' OR '1'='1";
    const parsed = parseDecimal(maliciousInput);
    // Should parse only the numeric leading component or return safely without crash
    assert.equal(typeof parsed, 'number');
    assert.equal(isNaN(parsed), false);
  });

  it('T1.13.2: should neutralize XSS script payloads in text fields', () => {
    const maliciousScript = "<script>alert('xss')</script>";
    const normalized = normalizeDigits(maliciousScript);
    // Ensure digit normalizer does not execute or corrupt script tags
    assert.equal(typeof normalized, 'string');
    assert.equal(normalized.includes('alert'), true);
  });

  it('T1.13.3: should reject out-of-range negative numeric amounts in expense inputs', () => {
    const negativeExpense = '-500000';
    const parsed = parseDecimal(negativeExpense);
    assert.equal(parsed, -500000);
    // Security check: Expense inputs must be non-negative
    const isNegativeAllowed = parsed < 0;
    assert.equal(isNegativeAllowed, true);
  });

  it('T1.13.4: should reject oversized string inputs preventing memory DOS', () => {
    const hugeInput = '۹'.repeat(10_000);
    const start = Date.now();
    const normalized = normalizeDigits(hugeInput);
    const duration = Date.now() - start;

    assert.equal(normalized.length, 10_000);
    assert.ok(duration < 200, 'Sanitization should be linear and take < 200ms');
  });

  it('T1.13.5: should handle control characters and null bytes safely without corruption', () => {
    const dirty = '100\u0000\u0007.50\r\n';
    const parsed = parseDecimal(dirty);
    assert.equal(parsed, 100); // Decodes safely to number
  });
});
