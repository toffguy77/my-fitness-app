/**
 * Тесты преобразования ответа сервера в форму вкладки.
 *
 * Два образца. Первый — настоящий ответ dev для человека с 47 записями о еде,
 * снятый вызовом сервиса напрямую: он пуст, потому что справочник нутриентов не
 * заполнен ни в одной среде. Второй составлен руками — это единственный способ
 * увидеть непустой ответ до того, как справочник наполнят (отдельное изменение
 * `nutrient-catalogue`), и про него здесь сказано прямо, что он придуман.
 *
 * Чтобы придуманный образец не разошёлся с сервером незаметно, отдельный тест
 * сверяет его состав полей с json-тегами Go-структур.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
    toRecommendationsData,
    toNutrientDetail,
    type ServerRecommendationsResponse,
    type ServerNutrientDetail,
} from '../recommendationsApi'

// Настоящий ответ dev, 2026-09-26. Справочник пуст — категории есть, строк нет.
const REAL_EMPTY_RESPONSE: ServerRecommendationsResponse = {
    daily: { fiber: [], lipids: [], minerals: [], plant: [], vitamins: [] },
    weekly: null,
    custom: null,
}

// Образец составлен вручную: непустого ответа сервера не существует, пока
// справочник не заполнен. Состав полей сверяется с Go-структурами тестом ниже.
const MADE_UP_RESPONSE: ServerRecommendationsResponse = {
    daily: {
        vitamins: [
            {
                id: '11111111-1111-1111-1111-111111111111',
                name: 'Витамин C',
                category: 'vitamins',
                daily_target: 90,
                unit: 'mg',
                is_weekly: false,
                current_intake: 45,
                percentage: 50,
                is_tracked: true,
            },
            {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Витамин D',
                category: 'vitamins',
                daily_target: 15,
                unit: 'mcg',
                is_weekly: false,
                current_intake: 0,
                percentage: 0,
                is_tracked: false,
            },
        ],
        minerals: [
            {
                id: '33333333-3333-3333-3333-333333333333',
                name: 'Железо',
                category: 'minerals',
                daily_target: 18,
                unit: 'mg',
                is_weekly: false,
                current_intake: 9,
                percentage: 50,
                is_tracked: true,
            },
        ],
        fiber: [],
        lipids: [],
        plant: [],
    },
    weekly: [
        {
            id: '44444444-4444-4444-4444-444444444444',
            name: 'Омега-3',
            category: 'lipids',
            daily_target: 1600,
            unit: 'mg',
            is_weekly: true,
            current_intake: 400,
            percentage: 25,
            is_tracked: true,
        },
    ],
    custom: [
        {
            id: '55555555-5555-5555-5555-555555555555',
            user_id: 7,
            name: 'Коллаген',
            daily_target: 5,
            unit: 'g',
            created_at: '2026-09-20T10:00:00Z',
        },
    ],
}

describe('Преобразование ответа сервера в форму вкладки', () => {
    it('разворачивает группировку по категориям в плоский список', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        expect(data.nutrients.map((n) => n.name)).toEqual(
            expect.arrayContaining(['Витамин C', 'Витамин D', 'Железо', 'Омега-3'])
        )
        expect(data.nutrients).toHaveLength(4)
    })

    it('переводит имена полей в те, что принимает вкладка', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)
        const vitaminC = data.nutrients.find((n) => n.name === 'Витамин C')

        expect(vitaminC).toEqual({
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Витамин C',
            category: 'vitamins',
            dailyTarget: 90,
            unit: 'mg',
            isWeekly: false,
            isCustom: false,
        })
    })

    it('помечает недельные нутриенты', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        const weekly = data.nutrients.filter((n) => n.isWeekly)
        expect(weekly.map((n) => n.name)).toEqual(['Омега-3'])
    })

    it('собирает потребление в карту по идентификатору', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        expect(data.currentIntakes).toEqual({
            '11111111-1111-1111-1111-111111111111': 45,
            '22222222-2222-2222-2222-222222222222': 0,
            '33333333-3333-3333-3333-333333333333': 9,
            '44444444-4444-4444-4444-444444444444': 400,
        })
    })

    // Выключенный нутриент остаётся в списке — иначе экран настроек не смог бы
    // показать, что человек его выключил.
    it('оставляет выключенные нутриенты в списке, но не в отслеживаемых', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        expect(data.nutrients.map((n) => n.name)).toContain('Витамин D')
        expect(data.trackedIds).not.toContain('22222222-2222-2222-2222-222222222222')
        expect(data.trackedIds).toContain('11111111-1111-1111-1111-111111111111')
    })

    // Сервер не считает потребление для своих рекомендаций. Ноль здесь нарисовал
    // бы «0 из 5 г» — это выглядело бы как измерение.
    it('не подставляет ноль своим рекомендациям', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)
        const custom = data.customRecommendations[0]

        expect(custom).toEqual({
            id: '55555555-5555-5555-5555-555555555555',
            name: 'Коллаген',
            dailyTarget: 5,
            unit: 'g',
        })
        expect('currentIntake' in custom).toBe(false)
    })

    // Настоящий ответ сегодня именно такой, и падать на нём нельзя.
    it('переживает настоящий пустой ответ dev', () => {
        const data = toRecommendationsData(REAL_EMPTY_RESPONSE)

        expect(data.nutrients).toEqual([])
        expect(data.trackedIds).toEqual([])
        expect(data.customRecommendations).toEqual([])
        expect(data.currentIntakes).toEqual({})
    })

    it('переживает ответ без единого раздела', () => {
        const data = toRecommendationsData({ daily: null, weekly: null, custom: null })

        expect(data.nutrients).toEqual([])
    })
})

describe('Преобразование подробностей по нутриенту', () => {
    const full: ServerNutrientDetail = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Витамин C',
        unit: 'mg',
        daily_target: 90,
        current_intake: 45,
        description: 'Водорастворимый витамин',
        benefits: 'Иммунитет',
        effects: 'Недостаток даёт утомляемость',
        min_recommendation: 60,
        optimal_recommendation: 120,
        sources: [{ food_name: 'Шиповник', amount: 50, unit: 'g', contribution: 30 }],
    }

    it('переводит имена полей и продукты рациона', () => {
        expect(toNutrientDetail(full)).toEqual({
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Витамин C',
            unit: 'mg',
            dailyTarget: 90,
            currentIntake: 45,
            description: 'Водорастворимый витамин',
            benefits: 'Иммунитет',
            effects: 'Недостаток даёт утомляемость',
            minRecommendation: 60,
            optimalRecommendation: 120,
            sourcesInDiet: [
                { foodName: 'Шиповник', amount: 50, unit: 'g', contribution: 30 },
            ],
        })
    })

    // Незаполненный справочник не должен превращаться в «минимум 0 мг».
    it('оставляет незаполненные поля отсутствующими, а не нулём', () => {
        const detail = toNutrientDetail({
            id: full.id,
            name: full.name,
            unit: full.unit,
            daily_target: 90,
            current_intake: 0,
            description: null,
            benefits: null,
            effects: null,
            min_recommendation: null,
            optimal_recommendation: null,
            sources: null,
        })

        expect(detail.description).toBeUndefined()
        expect(detail.minRecommendation).toBeUndefined()
        expect(detail.optimalRecommendation).toBeUndefined()
        expect(detail.sourcesInDiet).toEqual([])
    })
})

// ============================================================================
// Сторож расхождения с сервером
// ============================================================================

/**
 * Имена json-полей структуры из Go-источника.
 *
 * Читается сам файл, а не его копия: образец выше придуман, и разойтись с
 * сервером он может тихо — ровно так и живут расхождения между половинами,
 * которые нигде не встречаются.
 */
function jsonFields(goSource: string, typeName: string): string[] {
    const start = goSource.indexOf(`type ${typeName} struct {`)
    if (start === -1) throw new Error(`структура ${typeName} не найдена в types.go`)
    const end = goSource.indexOf('\n}', start)
    const body = goSource.slice(start, end)

    return [...body.matchAll(/json:"([^",]+)/g)]
        .map((m) => m[1])
        .filter((name) => name !== '-')
}

describe('Образец не расходится с ответом сервера', () => {
    const goTypes = readFileSync(
        join(process.cwd(), '..', 'api', 'internal', 'modules', 'food-tracker', 'types.go'),
        'utf8'
    )

    it('нутриент несёт все поля, которые отдаёт сервер', () => {
        const expected = [
            ...jsonFields(goTypes, 'NutrientRecommendation'),
            ...jsonFields(goTypes, 'NutrientRecommendationWithProgress'),
        ]
        // Необязательные поля справочника (omitempty) в пустом справочнике не
        // приходят вовсе, поэтому образец их не несёт.
        const optional = [
            'description',
            'benefits',
            'effects',
            'min_recommendation',
            'optimal_recommendation',
        ]
        const sample = Object.keys(MADE_UP_RESPONSE.daily!.vitamins![0])

        for (const field of expected) {
            if (optional.includes(field)) continue
            expect(sample).toContain(field)
        }
    })

    it('своя рекомендация несёт все поля, которые отдаёт сервер', () => {
        const expected = jsonFields(goTypes, 'UserCustomRecommendation')
        const sample = Object.keys(MADE_UP_RESPONSE.custom![0])

        for (const field of expected) {
            expect(sample).toContain(field)
        }
    })

    it('подробности несут все поля, которые отдаёт сервер', () => {
        const expected = jsonFields(goTypes, 'NutrientDetailResponse')
        const sample = Object.keys(full())

        for (const field of expected) {
            expect(sample).toContain(field)
        }
    })

    function full(): ServerNutrientDetail {
        return {
            id: 'x',
            name: 'x',
            unit: 'mg',
            daily_target: 1,
            current_intake: 0,
            sources: [],
        }
    }
})
