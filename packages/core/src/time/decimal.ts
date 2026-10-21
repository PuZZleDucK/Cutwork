export interface Rational { numerator: bigint; denominator: bigint }

/** Parse nonnegative decimal intent without a floating-point round trip. */
export function decimal(value: string): Rational {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('Time must be a nonnegative decimal');
  const [whole = '', fraction = ''] = value.split('.');
  return { numerator: BigInt((whole || '0') + fraction), denominator: 10n ** BigInt(fraction.length) };
}
