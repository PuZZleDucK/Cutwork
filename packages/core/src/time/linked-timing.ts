import type { StudioSong } from '../contracts/studio.ts';
import { decimal, type Rational } from './decimal.ts';
import { beatAtTime, timeAtBeat } from './studio-timing.ts';

export type TimingUnit = 'frames' | 'beats' | 'seconds';
export type TimingValue = { unit: TimingUnit; value: string } | {
  /** Exact seconds from a click/canonical state; not a fourth editable UI unit. */
  unit: 'rational'; value: { numerator: string; denominator: string };
};
export interface ClipTimingIntent { start: TimingValue; end: TimingValue }
export type TimingSong = Pick<StudioSong, 'sampleRate' | 'sampleCount' | 'analysis'>;
export interface LinkedTimingDisplay { frames: string; seconds: string; beats: string | null }
export interface ResolvedTiming {
  valid: true;
  startSeconds: Rational;
  endSeconds: Rational;
  durationSeconds: Rational;
  startFrame: number;
  endFrame: number;
  startContainingFrame: number;
  endContainingFrame: number;
  realisedStartSeconds: Rational;
  realisedEndSeconds: Rational;
  display: { start: LinkedTimingDisplay; end: LinkedTimingDisplay };
}
export interface InvalidTiming { valid: false; field: 'start' | 'end' | 'range'; error: string }
export type TimingResolution = ResolvedTiming | InvalidTiming;

const absolute = (n: bigint) => n < 0n ? -n : n;
function rational(numerator: bigint, denominator = 1n): Rational {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || denominator === 0n) throw new Error('Invalid exact time');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  let a = absolute(numerator), b = denominator;
  while (b) [a, b] = [b, a % b];
  return { numerator: numerator / a, denominator: denominator / a };
}
const normal = (value: Rational) => rational(value.numerator, value.denominator);
const compare = (a: Rational, b: Rational) => a.numerator * b.denominator - b.numerator * a.denominator;
const subtract = (a: Rational, b: Rational) => rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
const floor = (r: Rational) => r.numerator >= 0n ? r.numerator / r.denominator : -((-r.numerator + r.denominator - 1n) / r.denominator);
const ceil = (r: Rational) => -floor({ numerator: -r.numerator, denominator: r.denominator });
const framePosition = (r: Rational) => rational(r.numerator * 24n, r.denominator);
function safe(n: bigint): number {
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Time is outside the supported frame range');
  return Number(n);
}
function invalid(field: InvalidTiming['field'], error: unknown): InvalidTiming {
  return { valid: false, field, error: error instanceof Error ? error.message : 'Invalid timing value' };
}

/** Finite derived decimals are exact, however long. Only repeating displays truncate. */
function display(r: Rational): string {
  const value = normal(r);
  let factor = value.denominator;
  while (factor % 2n === 0n) factor /= 2n;
  while (factor % 5n === 0n) factor /= 5n;
  const repeating = factor !== 1n;
  const n = absolute(value.numerator), whole = n / value.denominator;
  let rest = n % value.denominator, digits = '';
  while (rest && (!repeating || digits.length < 12)) {
    rest *= 10n;
    digits += String(rest / value.denominator);
    rest %= value.denominator;
  }
  return `${rest ? '≈ ' : ''}${value.numerator < 0n ? '-' : ''}${whole}${digits ? '.' + digits : ''}`;
}
function linked(song: TimingSong, seconds: Rational, label: number, typed?: TimingValue): LinkedTimingDisplay {
  let beats: string | null = null;
  try { beats = display(beatAtTime(song, seconds)); } catch { /* Missing analysis must not disable frame/second entry. */ }
  const result: LinkedTimingDisplay = { frames: String(label), seconds: display(seconds), beats };
  if (typed && typed.unit !== 'rational') result[typed.unit] = typed.value;
  return result;
}
function parse(song: TimingSong, input: TimingValue): Rational {
  if (!input) throw new Error('A timing value is required');
  if (input.unit === 'rational') {
    if (!input.value || typeof input.value.numerator !== 'string' || typeof input.value.denominator !== 'string' || !/^(0|[1-9]\d*)$/.test(input.value.numerator) || !/^[1-9]\d*$/.test(input.value.denominator)) throw new Error('Exact seconds require a nonnegative integer numerator and positive integer denominator');
    return rational(BigInt(input.value.numerator), BigInt(input.value.denominator));
  }
  if (typeof input.value !== 'string') throw new Error('A timing value is required');
  if (input.unit === 'frames') {
    if (!/^\d+$/.test(input.value)) throw new Error('Containing timeline frames must be positive integers');
    const label = BigInt(input.value);
    if (label < 1n) throw new Error('Containing timeline frames start at one');
    safe(label);
    return rational(label - 1n, 24n);
  }
  if (input.unit === 'seconds') return normal(decimal(input.value));
  if (input.unit === 'beats') {
    const negative = input.value.startsWith('-');
    const unsigned = /^[+-]/.test(input.value) ? input.value.slice(1) : input.value;
    const beat = decimal(unsigned);
    return normal(timeAtBeat(song, rational(negative ? -beat.numerator : beat.numerator, beat.denominator)));
  }
  throw new Error('Unknown timing unit');
}

/** Resolve one edited endpoint without reparsing or requantizing its untouched peer. */
export function parseTimingValue(song: TimingSong, input: TimingValue): Rational {
  const seconds = parse(song, input);
  if (seconds.numerator < 0n) throw new Error('Timeline time cannot be negative');
  safe(floor(framePosition(seconds)) + 1n);
  return seconds;
}

/** Link one valid endpoint even while the overall draft interval is inverted. */
export function displayTimingValue(song: TimingSong, input: TimingValue): LinkedTimingDisplay {
  const seconds = parseTimingValue(song, input);
  return linked(song, seconds, safe(floor(framePosition(seconds)) + 1n), input);
}

/** Requested beat/second duration, with the separately rounded generated frame count. */
export function displayTimingDuration(song: TimingSong, timing: TimingResolution): LinkedTimingDisplay | null {
  if (!timing.valid) return null;
  let beats: string | null = null;
  try { beats = display(subtract(beatAtTime(song, timing.endSeconds), beatAtTime(song, timing.startSeconds))); }
  catch { /* An unavailable beat map does not invalidate seconds or generated frames. */ }
  return { frames: String(timing.endFrame - timing.startFrame), seconds: display(timing.durationSeconds), beats };
}

/** JSON-safe exact seconds; use for clicked boundaries without decimal round trips. */
export function timingValueFromSeconds(value: Rational): TimingValue {
  const seconds = normal(value);
  if (seconds.numerator < 0n) throw new Error('Timeline time cannot be negative');
  safe(floor(framePosition(seconds)) + 1n);
  return { unit: 'rational', value: { numerator: String(seconds.numerator), denominator: String(seconds.denominator) } };
}

/** Canonical click/rational state stays exact; never feed approximate display text back here. */
export function resolveTimingSeconds(song: TimingSong, start: Rational, end: Rational): TimingResolution {
  let startSeconds: Rational, endSeconds: Rational;
  let startFrame: number, endFrame: number, startContainingFrame: number, endContainingFrame: number;
  try {
    startSeconds = normal(start);
    if (startSeconds.numerator < 0n) throw new Error('Start time cannot be negative');
    const position = framePosition(startSeconds);
    startFrame = safe(floor(position));
    startContainingFrame = safe(floor(position) + 1n);
  } catch (error) { return invalid('start', error); }
  try {
    endSeconds = normal(end);
    if (endSeconds.numerator < 0n) throw new Error('End time cannot be negative');
    const position = framePosition(endSeconds);
    endFrame = safe(ceil(position));
    endContainingFrame = safe(floor(position) + 1n);
  } catch (error) { return invalid('end', error); }
  if (compare(startSeconds, endSeconds) >= 0n) return invalid('range', new Error('End time must be after start time'));
  return {
    valid: true, startSeconds, endSeconds, durationSeconds: subtract(endSeconds, startSeconds),
    startFrame, endFrame, startContainingFrame, endContainingFrame,
    realisedStartSeconds: rational(BigInt(startFrame), 24n), realisedEndSeconds: rational(BigInt(endFrame), 24n),
    display: { start: linked(song, startSeconds, startContainingFrame), end: linked(song, endSeconds, endContainingFrame) },
  };
}

/** Parse the edited unit only. The other fields are display projections, not new intent. */
export function resolveTiming(song: TimingSong, intent: ClipTimingIntent): TimingResolution {
  let start: Rational, end: Rational;
  try { start = parseTimingValue(song, intent?.start); } catch (error) { return invalid('start', error); }
  try { end = parseTimingValue(song, intent?.end); } catch (error) { return invalid('end', error); }
  const result = resolveTimingSeconds(song, start, end);
  if (result.valid) result.display = {
    start: linked(song, result.startSeconds, result.startContainingFrame, intent.start),
    end: linked(song, result.endSeconds, result.endContainingFrame, intent.end),
  };
  return result;
}

/** Both values are containing timeline labels; end is NOT an inclusive source trim. */
export function timingFromFrames(startFrame: number, endFrame: number): ClipTimingIntent {
  if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) || startFrame < 0 || endFrame <= startFrame) throw new Error('Invalid frame interval');
  return { start: { unit: 'frames', value: String(safe(BigInt(startFrame) + 1n)) }, end: { unit: 'frames', value: String(safe(BigInt(endFrame) + 1n)) } };
}

export interface LaneInterval { id: string; startFrame: number; endFrame: number }
/** Interval-graph greedy colouring: compact, deterministic, and optimal row count. */
export function layoutIntervalLanes<T extends LaneInterval>(input: readonly T[]): { laneCount: number; items: (T & { lane: number })[] } {
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) throw new Error('Timeline interval identities must be nonempty and unique');
    seen.add(item.id);
    if (!Number.isSafeInteger(item.startFrame) || !Number.isSafeInteger(item.endFrame) || item.startFrame < 0 || item.endFrame <= item.startFrame) throw new Error('Invalid timeline interval');
  }
  const sorted = [...input].sort((a,b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ends: number[] = [];
  const items = sorted.map(item => {
    let lane = ends.findIndex(end => end <= item.startFrame);
    if (lane === -1) lane = ends.length;
    ends[lane] = item.endFrame;
    return { ...item, lane };
  });
  return { laneCount: ends.length, items };
}

export type BeatBoundarySelection = InvalidTiming | {
  valid: true; target: 'start' | 'end'; boundarySeconds: Rational; timing: ResolvedTiming;
};

/**
 * Select among measured beat anchors and exact song boundaries. Beyond the song,
 * extrapolate integer beat anchors using the last observed interval. Exact ties
 * choose the earlier boundary. Returned rational state is authoritative: song end
 * need not have a finite decimal spelling in seconds or beats.
 */
export function selectBeatBoundary(song: TimingSong, intent: ClipTimingIntent | ResolvedTiming, clickedSeconds: Rational, target: 'start' | 'end' = 'end'): BeatBoundarySelection {
  if (target !== 'start' && target !== 'end') return invalid('range', new Error('Unknown timing selection target'));
  const unchanged = target === 'start' ? 'end' : 'start';
  let unchangedSeconds: Rational, unchangedDisplay: LinkedTimingDisplay;
  if ('valid' in intent) {
    const existing = resolveTimingSeconds(song, intent.startSeconds, intent.endSeconds);
    if (!existing.valid) return existing;
    unchangedSeconds = unchanged === 'start' ? existing.startSeconds : existing.endSeconds;
    unchangedDisplay = { ...intent.display[unchanged] };
  } else {
    // A click replaces the selected endpoint, including incomplete text or a
    // previously inverted range. Only its untouched peer must already be valid.
    try {
      unchangedSeconds = parseTimingValue(song, intent[unchanged]);
      unchangedDisplay = linked(song, unchangedSeconds, safe(floor(framePosition(unchangedSeconds)) + 1n), intent[unchanged]);
    } catch (error) { return invalid(unchanged, error); }
  }
  try {
    const clicked = normal(clickedSeconds);
    if (clicked.numerator < 0n) throw new Error('Clicked time cannot be negative');
    safe(ceil(framePosition(clicked)));
    if (!Number.isSafeInteger(song.sampleRate) || song.sampleRate <= 0 || !/^\d+$/.test(song.sampleCount) || BigInt(song.sampleCount) <= 0n) throw new Error('A known positive song duration is required');
    const end = rational(BigInt(song.sampleCount), BigInt(song.sampleRate));
    const candidates = [rational(0n), end];
    try {
      const clickedBeat = beatAtTime(song, clicked); // Also validates the complete anchor map.
      for (const sample of song.analysis.sampleIndices) {
        const time = rational(BigInt(sample), BigInt(song.sampleRate));
        if (compare(time, end) <= 0n) candidates.push(time);
      }
      if (compare(clicked, end) > 0n) {
        for (const beat of [floor(clickedBeat), ceil(clickedBeat)]) {
          const time = normal(timeAtBeat(song, rational(beat)));
          if (compare(time, end) >= 0n) candidates.push(time);
        }
      }
    } catch { /* With no beat map, only zero and exact song end are available. */ }
    let selected = candidates[0]!;
    for (const candidate of candidates.slice(1)) {
      const delta = subtract(candidate, clicked), previous = subtract(selected, clicked);
      const distance = compare(rational(absolute(delta.numerator), delta.denominator), rational(absolute(previous.numerator), previous.denominator));
      if (distance < 0n || distance === 0n && compare(candidate, selected) < 0n) selected = candidate;
    }
    const timing = resolveTimingSeconds(song, target === 'start' ? selected : unchangedSeconds, target === 'end' ? selected : unchangedSeconds);
    if (!timing.valid) return timing;
    // Keep the untouched field's original textual spelling where available.
    timing.display[unchanged] = unchangedDisplay;
    return { valid: true, target, boundarySeconds: { ...selected }, timing };
  } catch (error) { return invalid(target, error); }
}
