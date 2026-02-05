import '@testing-library/jest-dom'
import 'whatwg-fetch'

// Suppress React act() warnings and expected test errors
const originalError = console.error;
beforeAll(() => {
    console.error = (...args) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: An update to') ||
                args[0].includes('An update to') ||
                args[0].includes('The current testing environment is not configured to support act')) &&
            (args[0].includes('was not wrapped in act') ||
                args[0].includes('not configured to support act'))
        ) {
            return;
        }

        // Suppress expected JSON parsing errors in tests
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Failed to parse user data:') ||
                args[0].includes('Failed to load cached notifications:') ||
                args[0].includes('Polling failed:'))
        ) {
            return;
        }

        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Polyfill for BroadcastChannel (required by MSW)
if (typeof global.BroadcastChannel === 'undefined') {
    global.BroadcastChannel = class BroadcastChannel {
        constructor(name) {
            this.name = name;
        }
        postMessage() { }
        close() { }
        addEventListener() { }
        removeEventListener() { }
    };
}

// Mock react-window for tests
jest.mock('react-window', () => require('./__mocks__/react-window'));

// MSW temporarily disabled due to Jest compatibility issues with ESM modules
// Tests will use fetch mocking instead
// import { server } from './__mocks__/server'

// beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
// afterEach(() => server.resetHandlers())
// afterAll(() => server.close())
