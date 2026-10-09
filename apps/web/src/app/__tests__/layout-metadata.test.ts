import { metadata } from '../layout'

describe('root layout metadata', () => {
    // Права в Яндекс Вебмастере подтверждены записью DNS. Второй способ рядом
    // ничего не добавляет, а мета-тег с чужим кодом после смены владельца
    // кабинета стал бы ложным.
    it('does not carry a Webmaster verification tag', () => {
        expect(metadata.verification?.yandex).toBeUndefined()
        expect(metadata.verification?.other?.['yandex-verification']).toBeUndefined()
    })

    // То, что назовёт layout, наследует каждая страница без своего значения:
    // общий canonical на главную делал /legal/terms, /legal/privacy и 404
    // копиями главной в глазах Яндекса.
    it('names no address a page would inherit', () => {
        expect(metadata.alternates?.canonical).toBeUndefined()
        expect((metadata.openGraph as { url?: unknown } | undefined)?.url).toBeUndefined()
    })

    // Унаследованный index, follow стоял на странице 404 рядом с noindex,
    // который ставит Next: два противоречащих тега на одной странице.
    it('leaves robots to the pages', () => {
        expect(metadata.robots).toBeUndefined()
    })

    // /og-image.png не существовало: страницы, наследовавшие этот блок,
    // отдавали в превью ссылку на 404.
    it('shares the picture app/opengraph-image.tsx draws', () => {
        expect(metadata.openGraph?.images).toEqual([
            expect.objectContaining({ url: '/opengraph-image', width: 1200, height: 630 }),
        ])
    })
})
