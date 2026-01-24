import '@testing-library/jest-dom'
import 'whatwg-fetch'

// MSW temporarily disabled due to Jest compatibility issues
// Will be re-enabled after resolving ESM/CJS conflicts
// import { server } from './__mocks__/server'

// beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// afterEach(() => server.resetHandlers())
// afterAll(() => server.close())
