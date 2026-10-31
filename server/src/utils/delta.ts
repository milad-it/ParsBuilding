/**
 * Deep Delta Engine and Sensitive Field Redaction Utility
 */

export const SENSITIVE_FIELDS = new Set([
  'passwordHash',
  'tokenHash',
  'secret',
  'cookieSecret',
  'rawAiOutput',
  'updatedAt' // volatile timestamp omitted from logical diff
]);

export interface DeltaComputation<T = Record<string, any>> {
  beforeDelta: Partial<T> | null;
  afterDelta: Partial<T> | null;
  diff: Record<string, { from: any; to: any }> | null;
}

export function sanitizePayload<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = val;
    }
  }
  return sanitized as Partial<T>;
}

export function computeDelta<T extends Record<string, any>>(
  before: T | null | undefined,
  after: T | null | undefined
): DeltaComputation<T> {
  // Scenario A: Creation (No previous state)
  if (!before && after) {
    const sanitizedAfter = sanitizePayload(after);
    return { beforeDelta: null, afterDelta: sanitizedAfter, diff: null };
  }

  // Scenario B: Deletion (No post-mutation state)
  if (before && !after) {
    const sanitizedBefore = sanitizePayload(before);
    return { beforeDelta: sanitizedBefore, afterDelta: null, diff: null };
  }

  // Scenario C: Modification (Before and After present)
  if (before && after) {
    const diff: Record<string, { from: any; to: any }> = {};
    const beforeDelta: Record<string, any> = {};
    const afterDelta: Record<string, any> = {};

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      if (SENSITIVE_FIELDS.has(key)) continue;

      const valBefore = before[key];
      const valAfter = after[key];

      // Deep / JSON comparison
      const isDifferent = typeof valBefore === 'object' && valBefore !== null
        ? JSON.stringify(valBefore) !== JSON.stringify(valAfter)
        : valBefore !== valAfter;

      if (isDifferent) {
        diff[key] = { from: valBefore, to: valAfter };
        beforeDelta[key] = valBefore;
        afterDelta[key] = valAfter;
      }
    }

    return {
      beforeDelta: Object.keys(beforeDelta).length > 0 ? (beforeDelta as Partial<T>) : null,
      afterDelta: Object.keys(afterDelta).length > 0 ? (afterDelta as Partial<T>) : null,
      diff: Object.keys(diff).length > 0 ? diff : null
    };
  }

  return { beforeDelta: null, afterDelta: null, diff: null };
}
