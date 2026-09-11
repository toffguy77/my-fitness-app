import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Условия, при которых браузер вообще предлагает установить приложение.
 *
 * Невыполненное условие ничего не ломает и ни на что не жалуется: кнопка
 * «Установить» просто не появляется, и понять почему — отдельная работа с
 * панелью разработчика. В манифесте была ровно одна иконка SVG и английское
 * название в продукте, который целиком по-русски, — то есть на домашнем экране
 * человек увидел бы «BURCEV - Fitness & Nutrition Tracker».
 */
const manifest = JSON.parse(
    readFileSync(join(__dirname, '../../../public/manifest.json'), 'utf8'),
) as {
    name?: string
    short_name?: string
    lang?: string
    start_url?: string
    display?: string
    icons?: { src: string; sizes: string; type: string; purpose?: string }[]
}

describe('Манифест приложения', () => {
    it('называет приложение так, как его называют люди', () => {
        expect(manifest.name).toBeTruthy()
        expect(manifest.short_name).toBeTruthy()
        // short_name умещается под иконкой на домашнем экране.
        expect(manifest.short_name!.length).toBeLessThanOrEqual(12)
        expect(manifest.lang).toBe('ru')
        expect(manifest.name).toMatch(/[А-Яа-яЁё]/)
    })

    it('открывается как приложение, а не как вкладка', () => {
        expect(manifest.start_url).toBe('/')
        expect(manifest.display).toBe('standalone')
    })

    // Chrome требует растровые иконки 192 и 512: одного SVG ему мало, и
    // предложения установить не будет.
    it('содержит растровые иконки 192 и 512', () => {
        const png = (manifest.icons ?? []).filter((i) => i.type === 'image/png')

        expect(png.some((i) => i.sizes === '192x192')).toBe(true)
        expect(png.some((i) => i.sizes === '512x512')).toBe(true)
    })

    // Android вписывает иконку в свою форму и срезает края. Без maskable он
    // обрежет логотип по углам.
    it('содержит иконку для обрезки под форму системы', () => {
        expect((manifest.icons ?? []).some((i) => i.purpose === 'maskable')).toBe(true)
    })
})
