/**
 * Global BigInt Serialization Polyfill for JSON.stringify
 * Resolves "TypeError: Do not know how to serialize a BigInt" across Fastify routes.
 */
(BigInt.prototype as any).toJSON = function (): string {
  return this.toString();
};

export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}
