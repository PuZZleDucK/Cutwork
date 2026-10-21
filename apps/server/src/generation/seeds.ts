import { randomBytes } from 'node:crypto';
import type { SeedMap } from '../../../../packages/core/src/contracts/generation.ts';
import { decimalSeed } from '../../../../packages/core/src/contracts/validation.ts';

type Domain = { min: string; max: string };
interface SeedInput {
  mode: 'fresh' | 'retry' | 'restart'; stages: string[]; previous: SeedMap;
  domains: Record<string, Domain>; draw?: () => string;
}

function randomInDomain(min: bigint, max: bigint): string {
  const span = max - min + 1n;
  const bits = span.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  let sample: bigint;
  do { sample = BigInt(`0x${randomBytes(bytes).toString('hex')}`) & mask; } while (sample >= span);
  return (min + sample).toString();
}

/** Numeric domains come from pinned native capabilities, not a universal JS number. */
export function seeds(input: SeedInput): SeedMap {
  const result: SeedMap = {};
  if (new Set(input.stages).size !== input.stages.length) throw new Error('Duplicate generation stage');
  if (!['fresh', 'retry', 'restart'].includes(input.mode)) throw new Error('Unknown seed operation');
  const used = new Set<string>();
  for (const stage of input.stages) {
    const domain = input.domains[stage];
    if (!domain) throw new Error(`Missing seed domain for ${stage}`);
    const min = decimalSeed(domain.min, `${stage} minimum`);
    const max = decimalSeed(domain.max, `${stage} maximum`);
    if (max < min) throw new Error(`Invalid seed domain for ${stage}`);
    const validate = (value: string): string => {
      const actual = decimalSeed(value, `${stage} seed`);
      if (actual < min || actual > max) throw new Error(`Seed outside ${stage} native domain`);
      return actual.toString();
    };
    if (input.mode !== 'fresh') {
      const previous = input.previous[stage];
      if (previous === undefined) throw new Error(`Cannot replay: missing recorded seed for ${stage}`);
      result[stage] = validate(previous);
      continue;
    }
    let chosen: string | undefined;
    // Bound a broken injected/random source rather than hang forever on collisions.
    for (let attempt = 0; attempt < 128; attempt++) {
      const next = validate(input.draw ? input.draw() : randomInDomain(min, max));
      if (!used.has(next) && !Object.values(input.previous).includes(next)) { chosen = next; break; }
    }
    if (chosen === undefined) throw new Error(`Unable to allocate a distinct seed for ${stage}`);
    result[stage] = chosen;
    used.add(chosen);
  }
  return result;
}
