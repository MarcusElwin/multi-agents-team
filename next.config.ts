import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Security headers applied to every route. The CSP is intentionally pragmatic:
// Next.js injects inline bootstrap scripts and Tailwind injects inline <style>,
// so script-src/style-src allow 'unsafe-inline' rather than a nonce pipeline
// (a larger change tracked in SECURITY.md). connect-src is 'self' only — the
// browser never talks to model providers directly; all calls go through our
// same-origin /api/* routes, so no provider domains are needed here.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Without it, Next infers the
  // workspace root from the nearest lockfile and picks the parent
  // ~/Desktop/Code/pnpm-lock.yaml, emitting a "multiple lockfiles" warning.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
