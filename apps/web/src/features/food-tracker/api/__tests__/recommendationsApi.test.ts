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
                unit: 'mg',
                is_weekly: false,
                is_tracked: true,
                source: 'МР 2.3.1.0253-21',
                source_version: '2021-07-22',
                daily_target: 90,
                current_intake: 45,
                percentage: 50,
                norm_needs_profile: false,
            },
            {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Витамин D',
                category: 'vitamins',
                unit: 'mcg',
                is_weekly: false,
                is_tracked: false,
                source: 'МР 2.3.1.0253-21',
                source_version: '2021-07-22',
                daily_target: 15,
                current_intake: null,
                percentage: null,
                norm_needs_profile: false,
            },
        ],
        minerals: [
            {
                id: '33333333-3333-3333-3333-333333333333',
                name: 'Железо',
                category: 'minerals',
                unit: 'mg',
                is_weekly: false,
                is_tracked: true,
                source: 'МР 2.3.1.0253-21',
                source_version: '2021-07-22',
                // Норму железа без пола выбрать нельзя: 10 мг или 18.
                daily_target: null,
                current_intake: null,
                percentage: null,
                norm_needs_profile: true,
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
            unit: 'mg',
            is_weekly: true,
            is_tracked: true,
            source: 'МР 2.3.1.0253-21',
            source_version: '2021-07-22',
            daily_target: 1600,
            current_intake: 400,
            percentage: 25,
            norm_needs_profile: false,
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
            unit: 'mg',
            isWeekly: false,
            isCustom: false,
            dailyTarget: 90,
            minValue: undefined,
            optimalValue: undefined,
            normSource: undefined,
            normNote: undefined,
            normNeedsProfile: false,
        })
    })

    it('помечает недельные нутриенты', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        const weekly = data.nutrients.filter((n) => n.isWeekly)
        expect(weekly.map((n) => n.name)).toEqual(['Омега-3'])
    })

    it('собирает потребление в карту по идентификатору', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        // Неизвестное потребление в карту не попадает: запись со значением 0
        // была бы неотличима от измеренного нуля.
        expect(data.currentIntakes).toEqual({
            '11111111-1111-1111-1111-111111111111': 45,
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

    // Норма железа зависит от пола, а его в профиле нет: подставить 10 или 18
    // значило бы выдать догадку за норму.
    it('не подставляет число вместо неразрешённой нормы', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)
        const iron = data.nutrients.find((n) => n.name === 'Железо')

        expect(iron).toBeDefined()
        expect(iron?.dailyTarget).toBeUndefined()
        expect(iron?.normNeedsProfile).toBe(true)
    })

    it('не подставляет ноль вместо неизвестного потребления', () => {
        const data = toRecommendationsData(MADE_UP_RESPONSE)

        expect('33333333-3333-3333-3333-333333333333' in data.currentIntakes).toBe(false)
        expect('22222222-2222-2222-2222-222222222222' in data.currentIntakes).toBe(false)
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
        min_value: 60,
        optimal_value: 120,
        norm_source: 'МР 2.3.1.0253-21 (2021-07-22)',
        norm_note: 'табл. 11, 16; физиологическая потребность',
        norm_needs_profile: false,
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
            normSource: 'МР 2.3.1.0253-21 (2021-07-22)',
            normNote: 'табл. 11, 16; физиологическая потребность',
            normNeedsProfile: false,
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
            min_value: null,
            optimal_value: null,
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
        // Поля с omitempty сервер не присылает, когда их нет: описание в
        // незаполненном справочнике, границы нормы у нутриента без вилки,
        // intake_source у нутриента, потребление которого не считается.
        const optional = [
            'description',
            'benefits',
            'effects',
            'min_value',
            'optimal_value',
            'norm_source',
            'norm_note',
            'intake_source',
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
        // omitempty: сервер не присылает их, когда нечего присылать.
        const optional = ['min_value', 'optimal_value', 'norm_source', 'norm_note']
        const sample = Object.keys(full())

        for (const field of expected) {
            if (optional.includes(field)) continue
            expect(sample).toContain(field)
        }
    })

    function full(): ServerNutrientDetail {
        return {
            id: 'x',
            name: 'x',
            unit: 'mg',
            source: 'МР 2.3.1.0253-21',
            source_version: '2021-07-22',
            daily_target: 1,
            current_intake: null,
            min_value: null,
            optimal_value: null,
            norm_source: null,
            norm_note: null,
            norm_needs_profile: false,
            sources: [],
        }
    }
})
