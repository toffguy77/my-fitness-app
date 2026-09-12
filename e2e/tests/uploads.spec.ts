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
    path: string
    field: string
    role: 'client' | 'curator'
    /** Некоторые точки требуют дополнительных полей формы. */
    extra?: Record<string, string>
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
]

for (const point of POINTS) {
    test.describe(`Загрузка: ${point.name}`, () => {
        test('принимает настоящий PNG', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)

            const response = await context.request.post(point.path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'снимок.png', mimeType: 'image/png', buffer: PNG },
                    ...(point.extra ?? {}),
                },
            })

            expect(response.status(), await response.text()).toBeLessThan(400)
        })

        // Заголовок Content-Type присылает клиент, и он может соврать. Тип
        // определяется по байтам — иначе HTML лёг бы в бакет, который
        // раздаётся наружу, под видом картинки.
        test('отклоняет HTML, названный картинкой', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)

            const response = await context.request.post(point.path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'картинка.png', mimeType: 'image/png', buffer: DISGUISED },
                    ...(point.extra ?? {}),
                },
            })

            expect(response.status()).toBeGreaterThanOrEqual(400)
            expect(response.status()).toBeLessThan(500)
        })

        // Отказ обязан объяснять, что делать: «неподдерживаемый тип файла» про
        // фотографию, снятую минуту назад, не помогает никому.
        test('объясняет отказ для снимка с iPhone', async ({ context, baseURL }) => {
            const token = await signIn(context, baseURL!, point.role)

            const response = await context.request.post(point.path, {
                headers: asUser(token),
                multipart: {
                    [point.field]: { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC },
                    ...(point.extra ?? {}),
                },
            })

            expect(response.status()).toBeGreaterThanOrEqual(400)
            expect(response.status()).toBeLessThan(500)

            const body = await response.text()
            expect(body).toContain('HEIC')
            expect(body).toMatch(/галере|JPEG|совместим/i)
        })
    })
}
