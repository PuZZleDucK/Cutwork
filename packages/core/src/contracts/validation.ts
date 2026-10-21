/** Validate product-managed identifiers; this is not agent filesystem confinement. */
export function identifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a nonempty path-safe identifier`);
  }
  return value;
}

export function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
  return value;
}

export function decimalSeed(value: string, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a resolved nonnegative decimal integer, not random/-1`);
  }
  return BigInt(value);
}
