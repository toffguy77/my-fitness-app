/**
 * Серверный компонент: вызывается напрямую как асинхронная функция, а не
 * через `render` — у него нет собственных хуков, только `await searchParams`
 * и выбор, что вернуть. `MagicLinkConsume` подменяется, потому что у него
 * своя сеть и роутер; `MagicLinkFailure` — нет, реальная разметка отказа и
 * есть то, что здесь проверяется.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import MagicLinkConsumePage from '../page'

jest.mock('@/features/auth/components/MagicLinkConsume', () => ({
    MagicLinkConsume: ({ token }: { token: string }) => <div data-testid="consume">{token}</div>,
}))

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

describe('MagicLinkConsumePage', () => {
    it('передаёт токен из адреса в MagicLinkConsume', async () => {
        const element = await MagicLinkConsumePage({
            searchParams: Promise.resolve({ token: 'abc' }),
        })
        render(element)

        expect(screen.getByTestId('consume')).toHaveTextContent('abc')
    })

    // Отказ ещё до обращения к серверу: в адресе вовсе нет токена — ссылка
    // обрезана или собрана вручную. Раньше эта ветка не была покрыта тестом.
    it('объясняет отказ и предлагает путь ко входу, если в адресе нет токена', async () => {
        const element = await MagicLinkConsumePage({
            searchParams: Promise.resolve({}),
        })
        render(element)

        expect(screen.getByRole('alert')).toHaveTextContent(/запросите новую/i)
        const link = screen.getByRole('link', { name: /вход/i })
        expect(link).toHaveAttribute('href', '/auth')
    })
})
