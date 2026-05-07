/**
 * MedplumClient v3.x calls startPkce() inside startNewUser, which writes to
 * sessionStorage. In Node this global doesn't exist. Install a tiny in-memory
 * polyfill before any Medplum auth call.
 *
 * This is server-side seed code only — never imported by the portal.
 */
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as Record<string, unknown>).window = {
    btoa: (s: string): string => Buffer.from(s, 'binary').toString('base64'),
    atob: (s: string): string => Buffer.from(s, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    TextDecoder,
    TextEncoder,
    location: { origin: 'http://localhost:8103' },
  };
}

if (typeof (globalThis as { sessionStorage?: unknown }).sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, v);
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
    clear: (): void => {
      store.clear();
    },
    key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
    get length(): number {
      return store.size;
    },
  };
}
