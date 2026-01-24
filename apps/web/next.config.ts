import type { NextConfig } from "next";

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./package.json');
const appVersion = packageJson.version;

const baseConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  turbopack: {},
  experimental: {
    optimizePackageImports: [],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

let nextConfig: NextConfig;
if (!isTest) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
  });
  nextConfig = withPWA(baseConfig);
} else {
  nextConfig = baseConfig;
}

export default nextConfig;
