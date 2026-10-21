import { access } from 'node:fs/promises';
import type { SliceOneDriver } from './slice1-contract.ts';

export async function loadContractDriver(): Promise<SliceOneDriver> {
  const url = new URL('./slice1-driver.ts', import.meta.url);
  try {
    await access(url);
  } catch {
    throw new Error(
      'TEST REVIEW ONLY: slice1-driver.ts is not implemented. ' +
      'Use test:list and typecheck to review the tests. ' +
      'A missing implementation is NOT a behavioural test failure or a passing slice.',
    );
  }
  const module = await import(/* @vite-ignore */ url.href);
  if (!module.driver) throw new Error('The implementation binding must export driver.');
  return module.driver as SliceOneDriver;
}
