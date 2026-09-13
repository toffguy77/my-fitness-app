import type { APIResponse, BrowserContext } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Точки загрузки, настоящими файлами.
 *
 * До этого набор не трогал загрузки вовсе — их проверяли руками и по одному
 * разу. А там, где проверяют раз, ломается тихо: белый список типов, детектор
 * содержимого, ключ в хранилище и само хранилище — четыре места, каждое из
 * которых уже подводило. Бакет выгрузки данных, например, не существовал
 * вовсе, и об этом узнал ежечасный опрос, а не человек.
 *
 * Проверяются три вещи на каждой точке: годный файл принимается, файл с
 * несовпадающим содержимым отклоняется (заголовок Content-Type присылает
 * клиент и он может соврать — тип определяется по байтам), и снимок с iPhone
 * получает внятный отказ вместо «неподдерживаемый тип файла».
 */

test.use({ role: undefined })

/** Настоящий PNG 1×1: детектор смотрит на байты, а не на имя файла. */
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
)

/** HTML, названный картинкой. Ровно так в хранилище попадал исполняемый файл. */
const DISGUISED = Buffer.from('<!doctype html><script>alert(1)</script>', 'utf8')

/**
 * Начало ISO-BMFF с брендом heic — так выглядит снимок с iPhone. Go этот
 * формат не распознаёт, и без особой обработки человек получал
 * «неподдерживаемый тип файла» про фотографию, сделанную минуту назад.
 */
const HEIC = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypheic', 'ascii'),
    Buffer.alloc(512),
])

interface Point {
    name: string
    /** Строка либо функция: путь чата содержит идентификатор беседы. */
    path: string | ((context: BrowserContext, baseURL: string, token: string) => Promise<string>)
    field: string
    role: 'client' | 'curator'
    /** Некоторые точки требуют дополнительных полей формы. */
    extra?: Record<string, string>
}

/**
 * Возможность выключена?
 *
 * Загрузки держатся на хранилище, распознавание еды — на ключе модели. Ни того
 * ни другого может не быть: в CI нет учётных данных S3 вовсе. Это не поломка, и
 * обещание продукта здесь — отвечать одинаково и машиночитаемо, а не падать.
 * Проверяем именно обещание, а на остальных утверждениях честно
 * останавливаемся: без хранилища успешную загрузку проверить нечем.
 */
async function declinedAsUnavailable(response: APIResponse, where: string): Promise<boolean> {
    if (response.status() !== 503) return false

    const body = await response.json()
    expect(body?.code, `503 без машиночитаемого кода: ${JSON.stringify(body)}`).toBe(
        'feature_unavailable',
    )
    test.info().annotations.push({ type: 'возможность выключена', description: where })
    return true
}

/** Первая беседа этого человека: сеятель заводит её вместе с аккаунтами. */
async function firstConversation(
    context: BrowserContext,
    baseURL: string,
    token: string,
): Promise<string> {
    const response = await context.request.get(`${baseURL}/api/v1/conversations`, {
        headers: asUser(token),
    })
    expect(response.ok(), `список бесед не отдался: ${await response.text()}`).toBeTruthy()
    const body = await response.json()
    const list = body?.data?.conversations ?? body?.data ?? []
    expect(Array.isArray(list) && list.length > 0, 'у клиента нет ни одной беседы').toBeTruthy()
    return String(list[0].id)
}

const POINTS: Point[] = [
    { name: 'аватар профиля', path: '/api/v1/users/avatar', field: 'avatar', role: 'client' },
    {
        name: 'фото прогресса',
        path: '/api/v1/dashboard/photo-upload',
        field: 'photo',
        role: 'client',
        extra: { week_identifier: '2026-W02' },
    },
    {
        name: 'вложение в чат',
        path: async (context, baseURL, token) =>
            `/api/v1/conversations/${await firstConversation(context, baseURL, token)}/upload`,
        field: 'file',
        role: 'client',
    },
    {
        name: 'обложка статьи',
        path: '/api/v1/content/articles/cover',
        field: 'file',
        role: 'curator',
    },
    {
        name: 'медиа статьи',
        // Требует существующей статьи: заводим свою, чужую трогать нечем.
        path: async (context, baseURL, token) => {
            const created = await context.request.post(`${baseURL}/api/v1/content/articles`, {
                headers: { ...asUser(token), 'content-type': 'application/json' },
                data: {
                    title: 'Проверка загрузки медиа',
                    body: 'Служебная статья набора проверок.',
                    category: 'nutrition',
                    audience_scope: 'all',
                },
            })
            if (created.status() === 503) {
                // Тело статьи хранится в S3: нет хранилища — нет и статьи.
                // Пропускаем, а не выдумываем идентификатор.
                test.skip(true, 'создание статей недоступно: хранилище не настроено')
            }
            expect(created.ok(), `статью не создать: ${await created.text()}`).toBeTruthy()
            const body = await created.json()
            const id = body?.data?.id ?? body?.id
            expect(id, 'создание статьи не вернуло идентификатор').toBeTruthy()
            return `/api/v1/content/articles/${id}/media`
        },
        field: 'file',
        role: 'curator',
    },
    {
        name: 'распознавание еды',
        path: '/api/v1/food-tracker/recognize',
        field: 'photo',
        role: 'client',
    },
]

/** Путь точки: у чата он зависит от беседы, у остальных постоянен. */
async function pathOf(
    point: Point,
    context: BrowserContext,
    baseURL: string,
    token: string,
): Promise<string> {
    return typeof point.path === 'string' ? point.path : point.path(context, baseURL, token)
}

for (const point of POINTS) {
    test.describe(`Загрузка: ${point.name}`, () => {
        test('принимает настоящий PNG', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)
            const path = await pathOf(point, context, baseURL!, token)

            const response = await context.request.post(path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'снимок.png', mimeType: 'image/png', buffer: PNG },
                    ...(point.extra ?? {}),
                },
            })

            if (await declinedAsUnavailable(response, point.name)) return

            expect(response.status(), await response.text()).toBeLessThan(400)
        })

        // Заголовок Content-Type присылает клиент, и он может соврать. Тип
        // определяется по байтам — иначе HTML лёг бы в бакет, который
        // раздаётся наружу, под видом картинки.
        test('отклоняет HTML, названный картинкой', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)
            const path = await pathOf(point, context, baseURL!, token)

            const response = await context.request.post(path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'картинка.png', mimeType: 'image/png', buffer: DISGUISED },
                    ...(point.extra ?? {}),
                },
            })

            if (await declinedAsUnavailable(response, point.name)) return

            expect(response.status()).toBeGreaterThanOrEqual(400)
            expect(response.status()).toBeLessThan(500)
        })

        // Отказ обязан объяснять, что делать: «неподдерживаемый тип файла» про
        // фотографию, снятую минуту назад, не помогает никому.
        test('объясняет отказ для снимка с iPhone', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)
            const path = await pathOf(point, context, baseURL!, token)

            const response = await context.request.post(path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC },
                    ...(point.extra ?? {}),
                },
            })

            if (await declinedAsUnavailable(response, point.name)) return

            expect(response.status()).toBeGreaterThanOrEqual(400)
            expect(response.status()).toBeLessThan(500)

            const body = await response.text()
            expect(body).toContain('HEIC')
            expect(body).toMatch(/галере|JPEG|совместим/i)
        })
    })
}
