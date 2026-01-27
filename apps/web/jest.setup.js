import '@testing-library/jest-dom'
import 'whatwg-fetch'

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

// MSW temporarily disabled due to Jest compatibility issues with ESM modules
// Tests will use fetch mocking instead
// import { server } from './__mocks__/server'

// beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
// afterEach(() => server.resetHandlers())
// afterAll(() => server.close())
