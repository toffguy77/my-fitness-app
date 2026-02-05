/**
 * MSW Request Handlers
 * Mock API responses for testing
 */

import { http, HttpResponse } from 'msw'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export const handlers = [
    // Auth endpoints
    http.post(`${API_URL}/auth/login`, async ({ request }) => {
        const body = await request.json() as { email: string; password: string }

        if (body.email === 'test@example.com' && body.password === 'password') {
            return HttpResponse.json({
                status: 'success',
                data: {
                    user: {
                        id: '1',
                        email: 'test@example.com',
                        name: 'Test User',
                        role: 'client',
                    },
                    token: 'mock-jwt-token',
                },
            })
        }

        return HttpResponse.json(
            { status: 'error', message: 'Invalid credentials' },
            { status: 401 }
        )
    }),

    http.post(`${API_URL}/auth/register`, async ({ request }) => {
        const body = await request.json() as { email: string; password: string; name: string }

        return HttpResponse.json({
            status: 'success',
            data: {
                user: {
                    id: '2',
                    email: body.email,
                    name: body.name,
                    role: 'client',
                    createdAt: new Date().toISOString(),
                },
            },
        }, { status: 201 })
    }),

    http.get(`${API_URL}/auth/me`, () => {
        return HttpResponse.json({
            status: 'success',
            data: {
                user: {
                    id: '1',
                    email: 'test@example.com',
                    name: 'Test User',
                    role: 'client',
                },
            },
        })
    }),

    // Nutrition endpoints
    http.get(`${API_URL}/nutrition/entries`, () => {
        return HttpResponse.json({
            status: 'success',
            data: {
                entries: [
                    {
                        id: '1',
                        date: new Date().toISOString(),
                        meal: 'breakfast',
                        food: 'Oatmeal',
                        calories: 150,
                        protein: 5,
                        carbs: 27,
                        fat: 3,
                    },
                ],
            },
        })
    }),

    // Notification endpoints
    http.get(`${API_URL}/api/notifications`, ({ request }) => {
        const url = new URL(request.url)
        const category = url.searchParams.get('category')
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const offset = parseInt(url.searchParams.get('offset') || '0')

        // Check for error simulation
        if (url.searchParams.get('simulateError') === '500') {
            return HttpResponse.json(
                { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
                { status: 500 }
            )
        }

        if (url.searchParams.get('simulateError') === '401') {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
                { status: 401 }
            )
        }

        // Mock notifications data
        const mockNotifications = {
            main: [
                {
                    id: '1',
                    userId: '1',
                    category: 'main',
                    type: 'trainer_feedback',
                    title: 'New feedback from trainer',
                    content: 'Your trainer left feedback on your progress',
                    iconUrl: null,
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    readAt: null,
                },
                {
                    id: '2',
                    userId: '1',
                    category: 'main',
                    type: 'achievement',
                    title: 'Achievement unlocked!',
                    content: 'You completed 7 days in a row',
                    iconUrl: null,
                    createdAt: new Date(Date.now() - 7200000).toISOString(),
                    readAt: new Date(Date.now() - 3600000).toISOString(),
                },
                {
                    id: '3',
                    userId: '1',
                    category: 'main',
                    type: 'reminder',
                    title: 'Daily reminder',
                    content: 'Don\'t forget to log your meals today',
                    iconUrl: null,
                    createdAt: new Date(Date.now() - 86400000).toISOString(),
                    readAt: null,
                },
            ],
            content: [
                {
                    id: '4',
                    userId: '1',
                    category: 'content',
                    type: 'system_update',
                    title: 'System maintenance',
                    content: 'Scheduled maintenance on Sunday',
                    iconUrl: null,
                    createdAt: new Date(Date.now() - 1800000).toISOString(),
                    readAt: null,
                },
                {
                    id: '5',
                    userId: '1',
                    category: 'content',
                    type: 'new_feature',
                    title: 'New feature available',
                    content: 'Check out our new progress charts',
                    iconUrl: null,
                    createdAt: new Date(Date.now() - 172800000).toISOString(),
                    readAt: null,
                },
            ],
        }

        const categoryNotifications = mockNotifications[category as 'main' | 'content'] || []
        const paginatedNotifications = categoryNotifications.slice(offset, offset + limit)

        return HttpResponse.json({
            notifications: paginatedNotifications,
            total: categoryNotifications.length,
            has_more: offset + limit < categoryNotifications.length,
        })
    }),

    http.post(`${API_URL}/api/notifications/:id/read`, ({ params, request }) => {
        const { id } = params
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } },
                { status: 401 }
            )
        }

        if (id === 'not-found') {
            return HttpResponse.json(
                { error: { code: 'NOT_FOUND', message: 'Notification not found' } },
                { status: 404 }
            )
        }

        return HttpResponse.json({
            success: true,
            read_at: new Date().toISOString(),
        })
    }),

    http.get(`${API_URL}/api/notifications/unread-counts`, ({ request }) => {
        const url = new URL(request.url)

        if (url.searchParams.get('simulateError') === '401') {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
                { status: 401 }
            )
        }

        return HttpResponse.json({
            main: 2,
            content: 2,
        })
    }),

    http.post(`${API_URL}/api/notifications/mark-all-read`, async ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } },
                { status: 401 }
            )
        }

        const body = await request.json() as { category: string }

        if (!body.category || !['main', 'content'].includes(body.category)) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Invalid category' } },
                { status: 400 }
            )
        }

        return HttpResponse.json({
            success: true,
            marked_count: 2,
        })
    }),
]
