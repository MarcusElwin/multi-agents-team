import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Without it, Next infers the
  // workspace root from the nearest lockfile and picks the parent
  // ~/Desktop/Code/pnpm-lock.yaml, emitting a "multiple lockfiles" warning.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
