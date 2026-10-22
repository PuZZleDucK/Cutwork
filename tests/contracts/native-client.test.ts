import { expect, test, vi } from 'vitest';
import { submitAndWait } from '../../scripts/native-call.ts';
import type { CallInput } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const input: CallInput = { id: 'call', attemptId: 'attempt', projectId: 'project', tool: 'h3', request: { seed: '18446744073709551615' } };
const reply = (state: string, status = 200) => new Response(JSON.stringify({ id: 'call', state }), { status, headers: { 'content-type': 'application/json' } });
test('cooperative client submits once, preserves exact seeds and observes existing job until terminal', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply('queued', 202)).mockResolvedValueOnce(reply('running')).mockResolvedValueOnce(reply('succeeded'));
  const result = await submitAndWait('http://127.0.0.1:9122', input, { fetcher, pollMs: 1, timeoutMs: 1000 });
  expect(result.state).toBe('succeeded');
  expect(fetcher.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1);
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(input);
});
test('lost submission response/conflict does not automatically resubmit expensive work', async () => {
  for (const error of [new Error('response lost'), null]) {
    const fetcher = error ? vi.fn<typeof fetch>().mockRejectedValue(error) : vi.fn<typeof fetch>().mockResolvedValue(reply('conflict', 409));
    await expect(submitAndWait('http://127.0.0.1:9122', input, { fetcher, pollMs: 1, timeoutMs: 1000 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
test.each(['failed', 'cancelled', 'reconciling'])('returns %s without inventing success or retrying', async state => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(state, 202));
  expect((await submitAndWait('http://127.0.0.1:9122', input, { fetcher })).state).toBe(state);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('a caller cancellation requests durable attempt cancellation rather than signalling arbitrary PIDs', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    if (options?.method === 'POST' && options.body) { controller.abort(); return reply('queued', 202); }
    return new Response(JSON.stringify({ cancelRequested: true }), { status: 202 });
  });
  await expect(submitAndWait('http://127.0.0.1:9122', input, { fetcher, signal: controller.signal })).rejects.toThrow(/Cancellation requested/);
  expect(fetcher.mock.calls[1]![0]).toBe('http://127.0.0.1:9122/api/attempts/attempt/cancel');
});

test('abort during an accepted POST with lost response still requests cancellation exactly once', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    if (options?.body) { controller.abort(); throw new Error('accepted but response lost'); }
    return new Response(JSON.stringify({ cancelRequested: true }), { status: 202 });
  });
  await expect(submitAndWait('http://127.0.0.1:9122', input, { fetcher, signal: controller.signal })).rejects.toThrow(/Cancellation requested/);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![0]).toBe('http://127.0.0.1:9122/api/attempts/attempt/cancel');
  expect(fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(false);
});

test('an unreachable cancellation endpoint reports uncertainty, not a stopped native job', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    if (options?.body) controller.abort();
    throw new Error('connection lost');
  });
  await expect(submitAndWait('http://127.0.0.1:9122', input, { fetcher, signal: controller.signal })).rejects.toThrow(/Cancellation could not be confirmed/);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('overall tracking deadline bounds a late initial response without resubmitting or claiming native stop', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(reply('succeeded')), 500)));
    const pending = submitAndWait('http://127.0.0.1:9122', input, { fetcher, timeoutMs: 25 });
    const rejected = expect(pending).rejects.toThrow(/Tracking wait timed out/);
    await vi.advanceTimersByTimeAsync(25); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
