/**
 * API Route Tests: Nutrition Targets Update
 * Tests nutrition targets update API endpoint
 */

// Mock NextRequest and NextResponse before importing
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextRequest: class NextRequest {
      constructor(public input: RequestInfo | URL, public init?: RequestInit) {
        // Mock RequestCookies
        this.cookies = {
          get: jest.fn(),
          set: jest.fn(),
          delete: jest.fn(),
          has: jest.fn(),
          getAll: jest.fn(),
        } as any
      }
      cookies: any
      json() {
        return Promise.resolve(this.init?.body ? JSON.parse(this.init.body as string) : {})
      }
      text() {
        return Promise.resolve(this.init?.body as string || '')
      }
    },
    NextResponse: class NextResponse {
      body: BodyInit | null
      init: ResponseInit | undefined
      status: number
      statusText: string
      headers: Headers
      cookies: any

      constructor(body?: BodyInit | null, init?: ResponseInit) {
        this.body = body || null
        this.init = init
        this.status = init?.status || 200
        this.statusText = init?.statusText || 'OK'
        this.headers = new Headers(init?.headers)
        // Mock ResponseCookies
        this.cookies = {
          set: jest.fn(),
          delete: jest.fn(),
        }
      }

      json() {
        return Promise.resolve(this.body ? JSON.parse(this.body as string) : {})
      }

      text() {
        return Promise.resolve(this.body as string || '')
      }

      static json(data: any, init?: ResponseInit) {
        const response = new NextResponse(JSON.stringify(data), {
          ...init,
          headers: { 'Content-Type': 'application/json', ...init?.headers }
        })
        return response
      }
    },
  }
})

import { POST } from '../route'
import { NextRequest } from 'next/server'

// Mock Supabase
const mockFrom = jest.fn()
const mockGetUser = jest.fn()

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
    },
  })),
  createServerClient: jest.fn(async () => ({
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock validation - export mock so we can control it in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateNutritionTargets = jest.fn((input: any) => ({
  valid: true,
  errors: [],
  warnings: [],
}))

jest.mock('@/utils/validation/nutrition', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validateNutritionTargets: (input: any) => mockValidateNutritionTargets(input),
}))

describe('Nutrition Targets Update API', () => {
  let profileCallCount: number

  beforeEach(() => {
    jest.clearAllMocks()
    profileCallCount = 0

    // Reset validation mock
    mockValidateNutritionTargets.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    })

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'curator-123' } },
      error: null,
    })

    // Setup chainable mock for Supabase queries
    // Setup mock to handle different table calls
    let profilesCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        profilesCallCount++
        // First call: curator profile query
        if (profilesCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'curator-123', role: 'curator', curator_id: null },
              error: null,
            }),
          }
        }
        // Second call: client profile query
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: '123e4567-e89b-12d3-a456-426614174001', curator_id: 'curator-123' },
            error: null,
          }),
        }
      }
      if (table === 'nutrition_targets') {
        // Create chainable mock for update({...}).eq('id', targetId).eq('user_id', clientId)
        // The update chain: update().eq().eq() where the last eq() returns the result
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'target-1', user_id: 'client-123' },
            error: null,
          }),
          update: jest.fn().mockImplementation(() => {
            // Create a new chain for each update call
            let eqCallCount = 0
            const chain = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq: jest.fn().mockImplementation(function (this: any) {
                eqCallCount++
                // After second eq call, return the result (this is the terminal operation)
                if (eqCallCount >= 2) {
                  return Promise.resolve({
                    data: [{ id: '123e4567-e89b-12d3-a456-426614174000' }],
                    error: null,
                  })
                }
                // Return chain for chaining
                return chain
              }),
            }
            return chain
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })
  })

  it('should update nutrition targets successfully', async () => {
    const requestBody = {
      targetId: '123e4567-e89b-12d3-a456-426614174000',
      calories: 2000,
      protein: 150,
      fats: 60,
      carbs: 200,
      clientId: '123e4567-e89b-12d3-a456-426614174001',
    }

    const request = new NextRequest('http://localhost/api/nutrition-targets/update', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('should return 401 for unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    const requestBody = {
      targetId: '123e4567-e89b-12d3-a456-426614174000',
      calories: 2000,
      protein: 150,
      fats: 60,
      carbs: 200,
      clientId: '123e4567-e89b-12d3-a456-426614174001',
    }

    const request = new NextRequest('http://localhost/api/nutrition-targets/update', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBeDefined()
  })

  it('should return 400 for invalid input', async () => {
    const requestBody = {
      targetId: '123e4567-e89b-12d3-a456-426614174000',
      calories: 100, // Too low (min 1000)
      protein: 150,
      fats: 60,
      carbs: 200,
      clientId: '123e4567-e89b-12d3-a456-426614174001',
    }

    const request = new NextRequest('http://localhost/api/nutrition-targets/update', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it('should return 500 on database error', async () => {
    // Reset mocks to ensure curator profile is returned
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'curator-123' } },
      error: null,
    })

    // Setup profiles mock to return coordinator profile
    let profilesCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        profilesCallCount++
        if (profilesCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'curator-123', role: 'curator', curator_id: null },
              error: null,
            }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: '123e4567-e89b-12d3-a456-426614174001', curator_id: 'curator-123' },
            error: null,
          }),
        }
      }
      if (table === 'nutrition_targets') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: '123e4567-e89b-12d3-a456-426614174000', user_id: '123e4567-e89b-12d3-a456-426614174001' },
            error: null,
          }),
          update: jest.fn().mockImplementation(() => {
            let eqCallCount = 0
            const chain = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq: jest.fn().mockImplementation(function (this: any) {
                eqCallCount++
                if (eqCallCount >= 2) {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'Database error' },
                  })
                }
                return chain
              }),
            }
            return chain
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    const requestBody = {
      targetId: '123e4567-e89b-12d3-a456-426614174000',
      calories: 2000,
      protein: 150,
      fats: 60,
      carbs: 200,
      clientId: '123e4567-e89b-12d3-a456-426614174001',
    }

    const request = new NextRequest('http://localhost/api/nutrition-targets/update', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBeDefined()
  })

  it('should handle missing request body', async () => {
    // Mock request.json() to throw error for empty body
    const request = new NextRequest('http://localhost/api/nutrition-targets/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Override json method to simulate empty body error
    request.json = jest.fn().mockRejectedValue(new Error('Unexpected end of JSON input'))

    const response = await POST(request)
    const data = await response.json()

    // Empty body will cause JSON parse error, which is caught and returns 500
    // This is expected behavior - the route catches all errors and returns 500
    expect(response.status).toBe(500)
    expect(data.error).toBeDefined()
  })
})
