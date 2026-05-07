import { notFound } from 'next/navigation';

/**
 * DEV-ONLY login picker. Refuses to render in production via `notFound()`,
 * AND defers loading the client chunk via dynamic `import()` so the build-time
 * dead-code-eliminator drops the demo credentials from the production bundle
 * (Webpack inlines `process.env.NODE_ENV` at build time — the early `notFound()`
 * makes the import branch statically unreachable in a prod build).
 */
export const dynamic = 'force-dynamic';

export default async function DevLoginPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const { DevLoginClient } = await import('./client');
  return <DevLoginClient />;
}
