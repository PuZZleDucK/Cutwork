export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); this.name = 'ApiError'; }
}
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', fetcher: Fetcher = globalThis.fetch): Promise<T> {
  const response = await fetcher(path, {
    method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type': 'application/json'}) },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(30_000),
  });
  let value: unknown;
  try { value = await response.json(); } catch { throw new ApiError('The studio returned an unreadable response. Your inputs are still here.', response.status, 'INVALID_RESPONSE'); }
  if (!response.ok) {
    const error = value as {error?: string; code?: string};
    throw new ApiError(typeof error?.error === 'string' ? error.error : `Studio request failed (${response.status}).`, response.status, error?.code ?? 'REQUEST_FAILED');
  }
  return value as T;
}
