/**
 * Приглашение посчитать норму: что сказано и куда ведёт.
 *
 * Кнопка должна вести по адресу. Пол, дата рождения и рост заполняются в «Теле и
 * целях», вес — на главной, потому что в «Теле и целях» он показан только для
 * чтения. Кнопка, отправляющая за весом туда, где его не ввести, хуже её
 * отсутствия.
 */

import { render, screen } from '@testing-library/react'

import { CalculateTargetPrompt } from '../CalculateTargetPrompt'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}))

it('не хватает данных профиля — ведёт в «Тело и цели»', () => {
    render(<CalculateTargetPrompt missing={{ profile: true, weight: false }} />)

    expect(screen.getByText('Норма не посчитана')).toBeInTheDocument()
    expect(screen.getByText(/пол, дата рождения и рост/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Посчитать норму' })).toHaveAttribute(
        'href',
        '/settings/body',
    )
})

it('не хватает веса — ведёт туда, где вес записывается', () => {
    render(<CalculateTargetPrompt missing={{ profile: false, weight: true }} />)

    expect(screen.getByText(/хотя бы один замер веса/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Записать вес' })).toHaveAttribute('href', '/dashboard')
})

it('не хватает ни того, ни другого — названы оба условия', () => {
    render(<CalculateTargetPrompt missing={{ profile: true, weight: true }} />)

    const text = screen.getByText(/нужны пол, дата рождения, рост и хотя бы один замер веса/)
    expect(text).toBeInTheDocument()
    // Начинать с профиля: вес без роста и пола всё равно ничего не даст.
    expect(screen.getByRole('link', { name: 'Посчитать норму' })).toHaveAttribute(
        'href',
        '/settings/body',
    )
})

it('сервер не сказал, чего не хватает — приглашение всё равно честное', () => {
    render(<CalculateTargetPrompt missing={null} />)

    expect(screen.getByText('Норму пока посчитать не из чего.')).toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
})
