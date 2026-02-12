/**
 * MSW Request Handlers
 * Mock API responses for testing
 */

import { http, HttpResponse } from 'msw'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// ============================================================================
// Food Tracker Mock Data
// ============================================================================

const mockFoodItems = [
    {
        id: 'food-1',
        name: 'Овсяная каша',
        brand: 'Геркулес',
        category: 'cereals',
        servingSize: 100,
        servingUnit: 'г',
        nutritionPer100: { calories: 352, protein: 12.3, fat: 6.1, carbs: 61.8 },
        barcode: '4600000000001',
        source: 'database',
        verified: true,
    },
    {
        id: 'food-2',
        name: 'Куриная грудка',
        brand: null,
        category: 'meat',
        servingSize: 100,
        servingUnit: 'г',
        nutritionPer100: { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
        barcode: null,
        source: 'database',
        verified: true,
    },
    {
        id: 'food-3',
        name: 'Яблоко',
        brand: null,
        category: 'fruits',
        servingSize: 150,
        servingUnit: 'г',
        nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
        barcode: null,
        source: 'database',
        verified: true,
    },
    {
        id: 'food-4',
        name: 'Творог 5%',
        brand: 'Простоквашино',
        category: 'dairy',
        servingSize: 100,
        servingUnit: 'г',
        nutritionPer100: { calories: 121, protein: 18, fat: 5, carbs: 3 },
        barcode: '4600000000002',
        source: 'database',
        verified: true,
    },
]

const mockFoodEntries: Record<string, Array<{
    id: string;
    foodId: string;
    foodName: string;
    mealType: string;
    portionType: string;
    portionAmount: number;
    nutrition: { calories: number; protein: number; fat: number; carbs: number };
    time: string;
    date: string;
    createdAt: string;
    updatedAt: string;
}>> = {
    '2024-01-15': [
        {
            id: 'entry-1',
            foodId: 'food-1',
            foodName: 'Овсяная каша',
            mealType: 'breakfast',
            portionType: 'grams',
            portionAmount: 150,
            nutrition: { calories: 528, protein: 18.5, fat: 9.2, carbs: 92.7 },
            time: '08:30',
            date: '2024-01-15',
            createdAt: '2024-01-15T08:30:00.000Z',
            updatedAt: '2024-01-15T08:30:00.000Z',
        },
        {
            id: 'entry-2',
            foodId: 'food-2',
            foodName: 'Куриная грудка',
            mealType: 'lunch',
            portionType: 'grams',
            portionAmount: 200,
            nutrition: { calories: 330, protein: 62, fat: 7.2, carbs: 0 },
            time: '13:00',
            date: '2024-01-15',
            createdAt: '2024-01-15T13:00:00.000Z',
            updatedAt: '2024-01-15T13:00:00.000Z',
        },
    ],
}

const mockWaterLogs: Record<string, { date: string; glasses: number; goal: number; glassSize: number }> = {
    '2024-01-15': { date: '2024-01-15', glasses: 5, goal: 8, glassSize: 250 },
}

const mockRecommendations = [
    { id: 'rec-1', name: 'Витамин D', category: 'vitamins', dailyTarget: 15, unit: 'мкг', isWeekly: false, isCustom: false },
    { id: 'rec-2', name: 'Витамин C', category: 'vitamins', dailyTarget: 90, unit: 'мг', isWeekly: false, isCustom: false },
    { id: 'rec-3', name: 'Железо', category: 'minerals', dailyTarget: 18, unit: 'мг', isWeekly: false, isCustom: false },
    { id: 'rec-4', name: 'Кальций', category: 'minerals', dailyTarget: 1000, unit: 'мг', isWeekly: false, isCustom: false },
    { id: 'rec-5', name: 'Клетчатка', category: 'fiber', dailyTarget: 25, unit: 'г', isWeekly: false, isCustom: false },
]

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

    // ========================================================================
    // Food Tracker Endpoints
    // ========================================================================

    // GET /api/food-tracker/entries - Get food entries for a date
    http.get(`${API_URL}/api/food-tracker/entries`, ({ request }) => {
        const url = new URL(request.url)
        const date = url.searchParams.get('date')
        const authHeader = request.headers.get('Authorization')

        // Check for error simulation
        if (url.searchParams.get('simulateError') === '500') {
            return HttpResponse.json(
                { error: { code: 'SERVER_ERROR', message: 'Ошибка сервера. Попробуйте позже.' } },
                { status: 500 }
            )
        }

        if (url.searchParams.get('simulateError') === '401') {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        if (!date) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Дата обязательна' } },
                { status: 400 }
            )
        }

        const entries = mockFoodEntries[date] || []
        const dailyTotals = entries.reduce(
            (acc, entry) => ({
                calories: acc.calories + entry.nutrition.calories,
                protein: acc.protein + entry.nutrition.protein,
                fat: acc.fat + entry.nutrition.fat,
                carbs: acc.carbs + entry.nutrition.carbs,
            }),
            { calories: 0, protein: 0, fat: 0, carbs: 0 }
        )

        return HttpResponse.json({
            entries,
            dailyTotals,
        })
    }),

    // POST /api/food-tracker/entries - Create a new food entry
    http.post(`${API_URL}/api/food-tracker/entries`, async ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const body = await request.json() as {
            foodId: string;
            mealType: string;
            portionType: string;
            portionAmount: number;
            time: string;
            date: string;
        }

        if (!body.foodId || !body.mealType || !body.portionAmount || !body.date) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Неверный формат данных' } },
                { status: 400 }
            )
        }

        const food = mockFoodItems.find(f => f.id === body.foodId)
        const nutrition = food ? {
            calories: Math.round(food.nutritionPer100.calories * body.portionAmount / 100),
            protein: Math.round(food.nutritionPer100.protein * body.portionAmount / 100 * 10) / 10,
            fat: Math.round(food.nutritionPer100.fat * body.portionAmount / 100 * 10) / 10,
            carbs: Math.round(food.nutritionPer100.carbs * body.portionAmount / 100 * 10) / 10,
        } : { calories: 0, protein: 0, fat: 0, carbs: 0 }

        const newEntry = {
            id: `entry-${Date.now()}`,
            foodId: body.foodId,
            foodName: food?.name || 'Unknown Food',
            mealType: body.mealType,
            portionType: body.portionType || 'grams',
            portionAmount: body.portionAmount,
            nutrition,
            time: body.time || '12:00',
            date: body.date,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        return HttpResponse.json(newEntry, { status: 201 })
    }),

    // PUT /api/food-tracker/entries/:id - Update a food entry
    http.put(`${API_URL}/api/food-tracker/entries/:id`, async ({ params, request }) => {
        const { id } = params
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        if (id === 'not-found') {
            return HttpResponse.json(
                { error: { code: 'NOT_FOUND', message: 'Запись не найдена' } },
                { status: 404 }
            )
        }

        const body = await request.json() as {
            mealType?: string;
            portionType?: string;
            portionAmount?: number;
            time?: string;
        }

        // Find existing entry
        let existingEntry = null
        for (const entries of Object.values(mockFoodEntries)) {
            existingEntry = entries.find(e => e.id === id)
            if (existingEntry) break
        }

        if (!existingEntry) {
            return HttpResponse.json(
                { error: { code: 'NOT_FOUND', message: 'Запись не найдена' } },
                { status: 404 }
            )
        }

        const updatedEntry = {
            ...existingEntry,
            ...body,
            updatedAt: new Date().toISOString(),
        }

        return HttpResponse.json(updatedEntry)
    }),

    // DELETE /api/food-tracker/entries/:id - Delete a food entry
    http.delete(`${API_URL}/api/food-tracker/entries/:id`, ({ params, request }) => {
        const { id } = params
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        if (id === 'not-found') {
            return HttpResponse.json(
                { error: { code: 'NOT_FOUND', message: 'Запись не найдена' } },
                { status: 404 }
            )
        }

        return HttpResponse.json({ success: true })
    }),

    // GET /api/food-tracker/search - Search for foods
    http.get(`${API_URL}/api/food-tracker/search`, ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        const limit = parseInt(url.searchParams.get('limit') || '20')

        if (url.searchParams.get('simulateError') === '500') {
            return HttpResponse.json(
                { error: { code: 'SERVER_ERROR', message: 'Ошибка поиска. Попробуйте позже.' } },
                { status: 500 }
            )
        }

        const filteredItems = mockFoodItems.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            (item.brand && item.brand.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, limit)

        return HttpResponse.json({
            items: filteredItems,
            total: filteredItems.length,
        })
    }),

    // GET /api/food-tracker/barcode/:code - Lookup barcode
    http.get(`${API_URL}/api/food-tracker/barcode/:code`, ({ params, request }) => {
        const { code } = params
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const item = mockFoodItems.find(f => f.barcode === code)

        if (!item) {
            return HttpResponse.json({
                found: false,
                cached: false,
                message: 'Продукт не найден',
            })
        }

        return HttpResponse.json({
            found: true,
            item,
            cached: true,
        })
    }),

    // GET /api/food-tracker/recent - Get recent foods
    http.get(`${API_URL}/api/food-tracker/recent`, ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        return HttpResponse.json({
            items: mockFoodItems.slice(0, 5),
            total: 5,
        })
    }),

    // GET /api/food-tracker/favorites - Get favorite foods
    http.get(`${API_URL}/api/food-tracker/favorites`, ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        return HttpResponse.json({
            items: mockFoodItems.slice(0, 3),
            total: 3,
        })
    }),

    // GET /api/food-tracker/water - Get water log for a date
    http.get(`${API_URL}/api/food-tracker/water`, ({ request }) => {
        const url = new URL(request.url)
        const date = url.searchParams.get('date')
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        if (!date) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Дата обязательна' } },
                { status: 400 }
            )
        }

        const log = mockWaterLogs[date] || { date, glasses: 0, goal: 8, glassSize: 250 }

        return HttpResponse.json({ log })
    }),

    // POST /api/food-tracker/water - Add water intake
    http.post(`${API_URL}/api/food-tracker/water`, async ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const body = await request.json() as { date: string; glasses?: number }

        if (!body.date) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Дата обязательна' } },
                { status: 400 }
            )
        }

        const existingLog = mockWaterLogs[body.date] || { date: body.date, glasses: 0, goal: 8, glassSize: 250 }
        const updatedLog = {
            ...existingLog,
            glasses: body.glasses !== undefined ? body.glasses : existingLog.glasses + 1,
        }

        return HttpResponse.json({ log: updatedLog })
    }),

    // GET /api/food-tracker/recommendations - Get nutrient recommendations
    http.get(`${API_URL}/api/food-tracker/recommendations`, ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        return HttpResponse.json({
            recommendations: mockRecommendations,
            customRecommendations: [],
        })
    }),

    // GET /api/food-tracker/recommendations/:id - Get nutrient detail
    http.get(`${API_URL}/api/food-tracker/recommendations/:id`, ({ params, request }) => {
        const { id } = params
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const recommendation = mockRecommendations.find(r => r.id === id)

        if (!recommendation) {
            return HttpResponse.json(
                { error: { code: 'NOT_FOUND', message: 'Рекомендация не найдена' } },
                { status: 404 }
            )
        }

        return HttpResponse.json({
            id: recommendation.id,
            name: recommendation.name,
            description: 'Важный нутриент для здоровья',
            benefits: 'Поддерживает иммунную систему',
            effects: 'Влияет на общее самочувствие',
            minRecommendation: recommendation.dailyTarget * 0.8,
            optimalRecommendation: recommendation.dailyTarget,
            unit: recommendation.unit,
            sourcesInDiet: [
                { foodName: 'Овсяная каша', amount: 5, unit: recommendation.unit, contribution: 20 },
                { foodName: 'Куриная грудка', amount: 3, unit: recommendation.unit, contribution: 15 },
            ],
        })
    }),

    // PUT /api/food-tracker/recommendations/preferences - Update preferences
    http.put(`${API_URL}/api/food-tracker/recommendations/preferences`, async ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const body = await request.json() as { enabledIds: string[] }

        return HttpResponse.json({
            success: true,
            enabledIds: body.enabledIds,
        })
    }),

    // POST /api/food-tracker/recommendations/custom - Add custom recommendation
    http.post(`${API_URL}/api/food-tracker/recommendations/custom`, async ({ request }) => {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader) {
            return HttpResponse.json(
                { error: { code: 'UNAUTHORIZED', message: 'Необходима авторизация' } },
                { status: 401 }
            )
        }

        const body = await request.json() as { name: string; dailyTarget: number; unit: string }

        if (!body.name || !body.dailyTarget || !body.unit) {
            return HttpResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Все поля обязательны' } },
                { status: 400 }
            )
        }

        const newRecommendation = {
            id: `custom-${Date.now()}`,
            name: body.name,
            dailyTarget: body.dailyTarget,
            unit: body.unit,
            currentIntake: 0,
        }

        return HttpResponse.json(newRecommendation, { status: 201 })
    }),
]
