// Medplum SDK 3.x calls startPkce inside startLogin/startNewUser, which uses
// sessionStorage + window.btoa. In Node (Server Actions, route handlers)
// those globals don't exist. Polyfill once at module load — import this
// from any server-side module that creates a MedplumClient.
if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = {
    btoa: (s: string): string => Buffer.from(s, 'binary').toString('base64'),
    atob: (s: string): string => Buffer.from(s, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    TextDecoder,
    TextEncoder,
    location: { origin: process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3000' },
  };
}
if (typeof (globalThis as { sessionStorage?: unknown }).sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}
