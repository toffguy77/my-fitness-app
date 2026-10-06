/**
 * /kalkulyator-kbzhu — the page that answers the search "калькулятор КБЖУ".
 */

import { render, screen, within } from '@testing-library/react'
import CalculatorPage, { metadata } from '../kalkulyator-kbzhu/page'

jest.mock('@/features/onboarding/components/KbzhuCalculator', () => ({
    KbzhuCalculator: () => <div data-testid="calculator">калькулятор</div>,
}))

function words(text: string): number {
    return text.split(/\s+/).filter((w) => /[0-9A-Za-zА-Яа-яЁё]/.test(w)).length
}

function faqLd(container: HTMLElement) {
    return Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => JSON.parse(s.innerHTML))
        .find((b) => b['@type'] === 'FAQPage')
}

describe('the calculator page', () => {
    it('is titled for the search it answers and holds the calculator', () => {
        render(<CalculatorPage />)

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Калькулятор КБЖУ/)
        expect(screen.getByTestId('calculator')).toBeInTheDocument()
    })

    it('explains the calculation in 300 to 400 words', () => {
        render(<CalculatorPage />)

        const count = words(screen.getByTestId('calculator-explained').textContent ?? '')
        expect(count).toBeGreaterThanOrEqual(300)
        expect(count).toBeLessThanOrEqual(400)
    })

    // Текст обязан описывать формулу, которой считает сервис, а не формулу
    // вообще: числа взяты из apps/api/internal/modules/nutrition-calc.
    it('names the numbers the service actually uses', () => {
        render(<CalculatorPage />)

        const text = screen.getByTestId('calculator-explained').textContent ?? ''
        expect(text).toMatch(/Миффлина/)
        for (const coefficient of ['1,2', '1,375', '1,55', '1,725']) {
            expect(text).toContain(coefficient)
        }
        expect(text).toMatch(/15\s?%/)
        expect(text).toMatch(/1,8 г/)
        expect(text).toMatch(/1,6 г/)
        expect(text).toMatch(/2 г/)
        expect(text).toMatch(/25\s?%/)
    })

    it('answers questions, and marks up exactly the questions it shows', () => {
        const { container } = render(<CalculatorPage />)

        const faq = screen.getByTestId('calculator-faq')
        const shown = within(faq)
            .getAllByRole('group')
            .map((d) => d.querySelector('summary')?.textContent?.trim())
        const ld = faqLd(container)

        expect(shown.length).toBeGreaterThanOrEqual(4)
        expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(shown)
        for (const q of ld.mainEntity) {
            expect(q['@type']).toBe('Question')
            expect(faq.textContent).toContain(q.acceptedAnswer.text)
        }
    })

    it('leads on to the pricing', () => {
        render(<CalculatorPage />)

        expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/pricing')).toBe(true)
    })

    it('is open to search under its own address', () => {
        expect(metadata.alternates?.canonical).toBe('https://burcev.team/kalkulyator-kbzhu')
        expect(metadata.robots).toBeUndefined()
        expect(String(metadata.title)).toMatch(/Калькулятор КБЖУ/)
    })
})
