// Version configuration
// This file exports the app version
// For client components, use NEXT_PUBLIC_APP_VERSION environment variable
// This file is used for server-side components

// Read version from package.json at build time
// Note: This won't work in client components, use NEXT_PUBLIC_APP_VERSION instead
let APP_VERSION = '0.0.0'

if (typeof window === 'undefined') {
  // Server-side: can import package.json
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const packageJson = require('../../package.json')
    APP_VERSION = packageJson.version
  } catch {
    // Fallback if package.json is not available
    APP_VERSION = process.env.APP_VERSION || '0.0.0'
  }
} else {
  // Client-side: use environment variable
  APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
}

export { APP_VERSION }
