/**
 * Nutrient recommendations API
 *
 * Единственное место, где форма ответа сервера приводится к форме вкладки.
 * Расхождений между ними три: сервер группирует нутриенты по категориям, а
 * вкладка принимает плоский список; сервер пишет `snake_case`, вкладка —
 * `camelCase`; и у каждой стороны есть поля, которых нет у другой.
 *
 * Преобразование живёт здесь, а не в компоненте, потому что `RecommendationsTab`
 * на 321 строку протестирован тремя файлами тестов и работает — он просто не был
 * подключён. Переписывать его под форму сервера значило бы потерять проверенный
 * код ради формы, которая ничем не лучше.
 *
 * @module food-tracker/api/recommendationsApi
 */

import { apiClient } from '@/shared/utils/api-client'
import type {
    CustomRecommendation,
    CustomRecommendationUnit,
    NutrientCategoryType,
    NutrientDetail,
    NutrientFoodSource,
    NutrientRecommendation,
} from '../types'

const BASE = '/api/v1/food-tracker'

// ============================================================================
// Форма сервера
// ============================================================================

/**
 * Нутриент, как его отдаёт сервер (`NutrientRecommendationWithProgress`).
 *
 * `is_tracked` приходит по каждому нутриенту, включая выключенные: экран
 * настроек собирает из этого состояние переключателей.
 */
export interface ServerNutrient {
    id: string
    name: string
    category: NutrientCategoryType
    daily_target: number
    unit: string
    is_weekly: boolean
    current_intake: number
    percentage: number
    is_tracked: boolean
}

/** Своя рекомендация, как её отдаёт сервер. Потребления по ней сервер не считает. */
export interface ServerCustomRecommendation {
    id: string
    user_id: number
    name: string
    daily_target: number
    unit: string
    created_at: string
}

/**
 * Ответ `GET /api/v1/food-tracker/recommendations`.
 *
 * `weekly` и `custom` приходят `null`, когда пусты — это не догадка: настоящий
 * ответ для человека с 47 записями о еде на dev был
 * `{"daily":{"fiber":[],…},"weekly":null,"custom":null}`.
 */
export interface ServerRecommendationsResponse {
    daily: Partial<Record<NutrientCategoryType, ServerNutrient[] | null>> | null
    weekly: ServerNutrient[] | null
    custom: ServerCustomRecommendation[] | null
}

// ============================================================================
// Форма вкладки
// ============================================================================

/** То, что вкладка и экран настроек умеют принимать. */
export interface RecommendationsData {
    /** Все нутриенты справочника — и отслеживаемые, и выключенные. */
    nutrients: NutrientRecommendation[]
    /** Идентификаторы отслеживаемых: из них экран настроек берёт текущий выбор. */
    trackedIds: string[]
    /** Свои рекомендации. Потребление по ним неизвестно и не подставляется. */
    customRecommendations: CustomRecommendation[]
    /** Потребление по идентификатору нутриента. */
    currentIntakes: Record<string, number>
}

function toNutrient(server: ServerNutrient, isWeekly: boolean): NutrientRecommendation {
    return {
        id: server.id,
        name: server.name,
        category: server.category,
        dailyTarget: server.daily_target,
        unit: server.unit,
        isWeekly,
        isCustom: false,
    }
}

function toCustom(server: ServerCustomRecommendation): CustomRecommendation {
    return {
        id: server.id,
        name: server.name,
        dailyTarget: server.daily_target,
        // Значения совпадают с CustomRecommendationUnit ('g' | 'mg' | 'mcg' |
        // 'IU'); строки, оставшиеся от прежнего написания, `unitLabel` тоже
        // понимает, так что приведение касается только типа.
        unit: server.unit as CustomRecommendationUnit,
        // currentIntake не ставится намеренно: сервер считает потребление только
        // для нутриентов, сопоставимых с КБЖУ, и для своей рекомендации взять его
        // неоткуда. Ноль здесь нарисовал бы «0 из 500 мг» — человек решил бы, что
        // не добрал, хотя никто ничего не считал.
    }
}

/**
 * Разворачивает ответ сервера в состав пропсов вкладки.
 *
 * Экспортируется отдельно от запроса, чтобы проверяться на настоящем ответе, а
 * не через подменённый клиент.
 */
export function toRecommendationsData(
    response: ServerRecommendationsResponse
): RecommendationsData {
    const nutrients: NutrientRecommendation[] = []
    const trackedIds: string[] = []
    const currentIntakes: Record<string, number> = {}

    const collect = (list: ServerNutrient[] | null | undefined, isWeekly: boolean): void => {
        for (const item of list ?? []) {
            nutrients.push(toNutrient(item, isWeekly))
            if (item.is_tracked) trackedIds.push(item.id)
            currentIntakes[item.id] = item.current_intake
        }
    }

    for (const list of Object.values(response.daily ?? {})) {
        collect(list, false)
    }
    // is_weekly приходит и полем, но здесь оно берётся из того, в какой части
    // ответа нутриент лежит: вкладка делит список именно по этому признаку, и
    // расхождение между полем и разделом ответа оставило бы нутриент невидимым.
    collect(response.weekly, true)

    return {
        nutrients,
        trackedIds,
        customRecommendations: (response.custom ?? []).map(toCustom),
        currentIntakes,
    }
}

// ============================================================================
// Запросы
// ============================================================================

/** Забирает рекомендации и приводит их к форме вкладки. */
export async function fetchRecommendations(): Promise<RecommendationsData> {
    const response = await apiClient.get<ServerRecommendationsResponse>(
        `${BASE}/recommendations`
    )
    return toRecommendationsData(response)
}

/**
 * Сохраняет набор отслеживаемых нутриентов.
 *
 * Список полный, а не список изменений: всё, чего в нём нет, становится
 * невыключенным.
 */
export async function updateNutrientPreferences(nutrientIds: string[]): Promise<void> {
    await apiClient.put(`${BASE}/recommendations/preferences`, { nutrient_ids: nutrientIds })
}

/** Добавляет свою рекомендацию. */
export async function createCustomRecommendation(
    recommendation: Omit<CustomRecommendation, 'id' | 'currentIntake'>
): Promise<CustomRecommendation> {
    const created = await apiClient.post<ServerCustomRecommendation>(
        `${BASE}/recommendations/custom`,
        {
            name: recommendation.name,
            daily_target: recommendation.dailyTarget,
            unit: recommendation.unit,
        }
    )
    return toCustom(created)
}

/**
 * Нутриент с подробностями, как его отдаёт сервер (`NutrientDetailResponse`).
 *
 * Описание, польза, действие и границы нормы объявлены на сервере
 * необязательными и в незаполненном справочнике отсутствуют.
 */
export interface ServerNutrientDetail {
    id: string
    name: string
    unit: string
    daily_target: number
    current_intake: number
    description?: string | null
    benefits?: string | null
    effects?: string | null
    min_recommendation?: number | null
    optimal_recommendation?: number | null
    sources?: ServerFoodSource[] | null
}

/** Продукт рациона, давший часть потребления. */
export interface ServerFoodSource {
    food_name: string
    amount: number
    unit: string
    contribution: number
}

function toFoodSource(source: ServerFoodSource): NutrientFoodSource {
    return {
        foodName: source.food_name,
        amount: source.amount,
        unit: source.unit,
        contribution: source.contribution,
    }
}

/**
 * Приводит подробности к форме клиента.
 *
 * Пустое поле остаётся отсутствующим, а не превращается в пустую строку или
 * ноль: показывать «минимум 0 мг» там, где норма просто не заведена, значит
 * выдавать незаполненный справочник за измеренную границу.
 */
export function toNutrientDetail(server: ServerNutrientDetail): NutrientDetail {
    return {
        id: server.id,
        name: server.name,
        unit: server.unit,
        dailyTarget: server.daily_target,
        currentIntake: server.current_intake,
        description: server.description ?? undefined,
        benefits: server.benefits ?? undefined,
        effects: server.effects ?? undefined,
        minRecommendation: server.min_recommendation ?? undefined,
        optimalRecommendation: server.optimal_recommendation ?? undefined,
        sourcesInDiet: (server.sources ?? []).map(toFoodSource),
    }
}

/** Подробности по нутриенту: описание, польза, действие, продукты рациона. */
export async function fetchRecommendationDetail(nutrientId: string): Promise<NutrientDetail> {
    const response = await apiClient.get<ServerNutrientDetail>(
        `${BASE}/recommendations/${nutrientId}`
    )
    return toNutrientDetail(response)
}
