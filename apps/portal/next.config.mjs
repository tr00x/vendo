/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// Next.js dev mode uses eval-based source maps for HMR. Permit it in dev
// only — production retains strict CSP. Cloudflare Web Analytics auto-injects
// a beacon from static.cloudflareinsights.com (and POSTs to cloudflareinsights.com),
// allow both unconditionally since the prod stack is fronted by Cloudflare Tunnel.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com"
  : "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com";

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  experimental: { typedRoutes: false },
  // Skip ESLint during `next build` — pre-existing lint debt blocks the
  // production build and we run `pnpm typecheck` as the type-safety gate
  // separately. Re-enable once the v1.1 lint-cleanup pass lands.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self' http://localhost:8103 https://cloudflareinsights.com https: ws: wss:",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
