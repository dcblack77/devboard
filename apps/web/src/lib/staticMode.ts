/**
 * Static (read-only) build: `VITE_STATIC=1 vite build` produces a site that answers every
 * `/api/*` GET from pre-exported JSON files under `./data/`, so it can be hosted on any static
 * file server (no backend, no session). Writes are refused and the user is a read-only viewer.
 */
/** Build-time env var (Vite `import.meta.env`), '' when absent (e.g. in tests). */
export function staticEnv(name: string): string {
  return (import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? '';
}

export const IS_STATIC: boolean = staticEnv('VITE_STATIC') === '1';

/** Canonical key of an API URL: path plus query params sorted by name (`/api/system?months=3&repo=all`). */
export function staticKey(url: string): string {
  const u = new URL(url, 'http://static.local');
  const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = params.map(([k, v]) => `${k}=${v}`).join('&');
  return u.pathname + (q ? `?${q}` : '');
}

/** Relative file that holds the response for a key (`data/system_months_3_repo_all.json`). */
export function staticFile(key: string): string {
  const name = key.replace(/^\/api\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `data/${name || 'root'}.json`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Replaces `window.fetch` so `/api/*` is served from the exported files. Other URLs pass through. */
export function installStaticApi(base: string = document.baseURI, realFetch: typeof fetch = window.fetch.bind(window)): void {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://static.local').pathname;
    if (!path.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (path === '/api/auth/me') return json(200, { role: 'viewer', authDisabled: true });
    if (method !== 'GET') return json(403, { message: 'Versión estática: solo lectura.' });
    const res = await realFetch(new URL(staticFile(staticKey(url)), base).href);
    return res.ok ? res : json(404, { message: 'Dato no incluido en la versión estática.' });
  };
}
