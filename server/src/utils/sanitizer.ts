/**
 * ParsBuilding Security Sanitizer Utilities
 * Provides XSS prevention and prototype pollution neutralization
 * while strictly preserving Persian RTL Unicode characters, ZWNJ, and numerals.
 */

/**
 * Escapes HTML control characters while strictly preserving Persian Unicode text and ZWNJ.
 */
export function sanitizeXss(input: string): string {
  if (!input || typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Strips HTML tags while leaving inner text intact.
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input.replace(/<\/?[^>]+(>|$)/g, '');
}

/**
 * Deep object prototype pollution sanitizer.
 * Removes '__proto__', 'constructor', and 'prototype' keys recursively.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizePrototype<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizePrototype) as unknown as T;
  }

  const clean = Object.create(null);
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue; // Drop dangerous prototype pollution keys
    }
    clean[key] = sanitizePrototype(value);
  }

  return clean as T;
}
