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
]
