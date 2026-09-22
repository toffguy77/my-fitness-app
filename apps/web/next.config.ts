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
    optimizePackageImports: ['lucide-react', 'react-window', 'zustand'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
    // Pin to specific buckets — prevents the Next.js image proxy from being
    // used as an open proxy for arbitrary Yandex Cloud buckets.
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.yandexcloud.net', pathname: '/curator-content/**' },
      { protocol: 'https', hostname: 'storage.yandexcloud.net', pathname: '/profiles-photos/**' },
      { protocol: 'https', hostname: 'storage.yandexcloud.net', pathname: '/weekly-progress-photos/**' },
      { protocol: 'https', hostname: 'storage.yandexcloud.net', pathname: '/food-photos/**' },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Метка «это приложение BURCEV».
  //
  // Прокси разработки (scripts/dev-proxy.mjs) требует её от цели перед тем,
  // как начать проксировать. Без метки он не отличал наш фронтенд от чужого,
  // слушающего тот же порт: если `npm run start` не смог занять порт и умер,
  // прокси продолжал отдавать браузеру приложение из другого каталога —
  // молча, без единой ошибки, страницы просто были не те.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'x-burcev-web', value: appVersion }],
      },
    ];
  },
  async rewrites() {
    const apiBackend = process.env.INTERNAL_API_URL || 'http://api:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBackend}/api/:path*`,
      },
    ];
  },
  // Leads and support moved from /admin to /curator: the pages are gone, not
  // aliased — no route here answers the old address. This redirect carries
  // no body and decides nothing about access; it exists only so a stale
  // bookmark, a lingering escalation notification, or muscle memory lands
  // somewhere real instead of a bare 404. The one and only role check stays
  // where it has always lived, in apps/web/src/app/curator/layout.tsx — a
  // super-admin who is denied there is denied after the redirect exactly as
  // before it.
  //
  // Deliberately not the same move as a second API path to the same data:
  // that duplication is what loses a role check somewhere along the way.
  // scripts/check-api-contract.mjs governs API paths and does not see this —
  // it is an interface-only redirect, not a second door into the backend.
  async redirects() {
    return [
      { source: '/admin/leads', destination: '/curator/leads', permanent: true },
      { source: '/admin/support', destination: '/curator/support', permanent: true },
    ];
  },
};

let nextConfig: NextConfig;
if (!isTest) {
  // Enable bundle analyzer when ANALYZE=true
  if (process.env.ANALYZE === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withBundleAnalyzer = require('@next/bundle-analyzer')({
      enabled: true,
    });
    nextConfig = withBundleAnalyzer(baseConfig);
  } else {
    nextConfig = baseConfig;
  }
} else {
  nextConfig = baseConfig;
}

export default nextConfig;
