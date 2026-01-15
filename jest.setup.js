// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      refresh: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      upsert: jest.fn(),
    })),
  })),
}))

// Mock window.crypto for UUID generation
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
  },
  writable: true,
  configurable: true,
})

// Mock global.crypto for Node.js environment
if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
    },
    writable: true,
    configurable: true,
  })
}

// Polyfill for Next.js Request/Response (needed for API route tests)
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init) {
      this.input = input
      this.init = init
    }
  }
}

if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body
      this.init = init
    }
    static json(data, init) {
      return new Response(JSON.stringify(data), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
    }
  }
}

// Polyfill for TextEncoder/TextDecoder (needed for jspdf)
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Mock logger with all methods
// Note: Logger tests will unmock this module using jest.unmock()
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    userFlow: jest.fn(),
    registration: jest.fn(),
    authentication: jest.fn(),
    userAction: jest.fn(),
    isDebugEnabled: jest.fn(() => false),
    isUserFlowLoggingEnabled: jest.fn(() => false),
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4,
  },
}))

// Silence noisy console errors in tests (act warnings, jsdom navigation)
const originalConsoleError = console.error
console.error = (...args) => {
  const msg = args?.[0]?.toString?.() || ''
  if (
    msg.includes('not wrapped in act(...)') ||
    msg.includes('Not implemented: navigation (except hash changes)') ||
    msg.includes('SubscriptionBanner: ошибка загрузки статуса') ||
    msg.includes('Profile: ошибка загрузки профиля') ||
    msg.includes('Profile: ошибка загрузки клиентов') ||
    msg.includes('Profile: ошибка проверки прав super_admin')
  ) {
    return
  }
  originalConsoleError(...args)
}
