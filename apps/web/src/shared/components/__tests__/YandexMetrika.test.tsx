import { render, screen } from '@testing-library/react'

import { YandexMetrika } from '../YandexMetrika'
import { COOKIE_CHOICE_KEY } from '../CookieConsent'

// next/script грузит через собственный загрузчик; обычный тег оставляет
// видимым то, что счётчику сказано, а это здесь и проверяется.
jest.mock('next/script', () => ({
    __esModule: true,
    default: ({ id, children }: { id: string; children: string }) => (
        <script data-testid={id}>{children}</script>
    ),
}))

const counterScript = () => screen.queryByTestId('yandex-metrika')

describe('Состав сбора счётчика', () => {
    beforeEach(() => {
        localStorage.clear()
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    // Опция webvisor включает разом запись сессий, карту скроллинга и
    // аналитику форм. Уходят все три — из-за первой: запись сохраняет ввод в
    // поля, а в гостевом мастере вводятся пол, дата рождения, рост, вес и цель.
    it('не просит записывать сессии', () => {
        render(<YandexMetrika />)

        expect(counterScript()?.textContent).toContain('webvisor: false')
        expect(counterScript()?.textContent).not.toMatch(/webvisor:\s*true/)
    })

    it('оставляет опции, которые ввод не записывают', () => {
        render(<YandexMetrika />)
        const script = counterScript()?.textContent ?? ''

        expect(script).toContain('clickmap: true')
        expect(script).toContain('trackLinks: true')
        expect(script).toContain('accurateTrackBounce: true')
    })

    // Пиксель ставил cookie без JavaScript, то есть в обход любого согласия —
    // механически, а не по недосмотру.
    it('не содержит пикселя, работающего без JavaScript', () => {
        const { container } = render(<YandexMetrika />)

        expect(container.querySelector('noscript')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
    })

    // Защита, которую этот файл не вводит, но ломать её он тоже не должен.
    it('по-прежнему молчит без согласия', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')

        render(<YandexMetrika />)

        expect(counterScript()).not.toBeInTheDocument()
    })
})
