import type { NextConfig } from "next";

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./package.json');
const appVersion = packageJson.version;

const baseConfig: NextConfig = {
  reactCompiler: false, // Disabled: babel-plugin-react-compiler not installed
  output: 'standalone',
  turbopack: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-window', 'zustand'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  async rewrites() {
    const apiBackend = process.env.INTERNAL_API_URL || 'http://api:4000';
    return [
      {
        source: '/backend-api/:path*',
        destination: `${apiBackend}/api/:path*`,
      },
    ];
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
    runtimeCaching: [
      {
        urlPattern: /\/backend-api\/.*/i,
        handler: 'NetworkOnly',
      },
    ],
  });

  // Enable bundle analyzer when ANALYZE=true
  if (process.env.ANALYZE === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withBundleAnalyzer = require('@next/bundle-analyzer')({
      enabled: true,
    });
    nextConfig = withBundleAnalyzer(withPWA(baseConfig));
  } else {
    nextConfig = withPWA(baseConfig);
  }
} else {
  nextConfig = baseConfig;
}

export default nextConfig;
