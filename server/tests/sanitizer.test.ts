import { describe, it, expect } from 'vitest';
import { sanitizeXss, stripHtmlTags, sanitizePrototype } from '../src/utils/sanitizer';

describe('Security Sanitizer (XSS & Prototype Pollution)', () => {
  describe('XSS Sanitization with Persian Unicode Preservation', () => {
    it('should escape HTML tags and malicious payloads', () => {
      const malicious = '<script>alert("hacked")</script>';
      const sanitized = sanitizeXss(malicious);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
      expect(sanitized).toContain('&lt;&#x2F;script&gt;');
    });

    it('should strip inline event handlers and javascript URIs', () => {
      const payload1 = '<img src="x" onerror="alert(1)">';
      expect(sanitizeXss(payload1)).not.toContain('onerror=');

      const payload2 = '<a href="javascript:alert(1)">Click</a>';
      expect(sanitizeXss(payload2)).not.toContain('javascript:');
    });

    it('should strictly preserve Persian Unicode text, ZWNJ (\\u200C), and Persian digits', () => {
      const persianTextWithZwnj = 'پرداخت شارژ واحد شماره ۱۰۱ توسط آقای حسینی‌زاده با موفقیت انجام شد.';
      const sanitized = sanitizeXss(persianTextWithZwnj);

      expect(sanitized).toBe(persianTextWithZwnj);
      // Verify ZWNJ character is intact
      expect(sanitized.includes('\u200C')).toBe(true);
    });
  });

  describe('HTML Tag Stripping', () => {
    it('should strip HTML tags while preserving inner text', () => {
      const html = '<div class="notice"><b>اطلاعیه مهم:</b> لطفاً در جلسه مجمع حاضر شوید.</div>';
      const stripped = stripHtmlTags(html);

      expect(stripped).toBe('اطلاعیه مهم: لطفاً در جلسه مجمع حاضر شوید.');
    });
  });

  describe('Prototype Pollution Neutralization', () => {
    it('should eliminate dangerous __proto__, constructor, and prototype keys', () => {
      const maliciousJson = JSON.parse('{"validKey": "safe", "__proto__": {"polluted": true}, "nested": {"constructor": "bad", "prop": 123}}');
      const clean = sanitizePrototype(maliciousJson);

      expect(clean.validKey).toBe('safe');
      expect(clean.nested.prop).toBe(123);
      expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
      expect((clean as any).polluted).toBeUndefined();
      expect(clean.nested).not.toHaveProperty('constructor');
    });

    it('should handle arrays and primitives safely', () => {
      expect(sanitizePrototype('plain string')).toBe('plain string');
      expect(sanitizePrototype(12345)).toBe(12345);
      expect(sanitizePrototype([1, 2, { safe: true }])).toEqual([1, 2, { safe: true }]);
    });
  });
});
