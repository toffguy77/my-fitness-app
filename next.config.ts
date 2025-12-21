import type { NextConfig } from "next";

// Disable PWA in test environment to avoid Babel plugin issues
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

const baseConfig: NextConfig = {
  reactCompiler: true,
  // Enable standalone output for Docker
  output: 'standalone',
  // Turbopack configuration (empty config to silence webpack warning from next-pwa)
  turbopack: {},
  // Исправление проблемы со шрифтами в Turbopack
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

// Only apply PWA plugin if not in test environment
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
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 24 часа
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'image-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
          },
        },
      },
      {
        urlPattern: /\.(?:js|css)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 дней
          },
        },
      },
    ],
  });
  nextConfig = withPWA(baseConfig);
} else {
  nextConfig = baseConfig;
}

export default nextConfig;
