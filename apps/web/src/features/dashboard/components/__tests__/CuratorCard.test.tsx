/**
 * Карточка куратора: три состояния, которые нельзя путать.
 *
 * Отдельно проверяется, что «куратор не назначен» и «ответ не получен» — разные
 * утверждения. Первое говорит о учётной записи человека, и произнести его на
 * упавшем запросе значит соврать ему ровно там, где карточка и заводилась ради
 * доверия.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CuratorCard } from '../CuratorCard'
import type { CuratorPresence } from '../../types'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

const curator: CuratorPresence = {
    conversation_id: 'conv-1',
    name: 'Анна Петрова',
    avatar_url: 'https://example.test/anna.jpg',
    unread_count: 2,
    last_message: {
        text: 'Посмотрела ваш дневник',
        created_at: '2026-09-27T10:00:00.000Z',
        from_curator: true,
    },
}

function renderCard(props: Partial<React.ComponentProps<typeof CuratorCard>> = {}) {
    return render(
        <CuratorCard
            curator={curator}
            isLoading={false}
            hasError={false}
            onRetry={jest.fn()}
            {...props}
        />
    )
}

describe('CuratorCard', () => {
    it('показывает имя, изображение, последнее сообщение и непрочитанные', () => {
        renderCard()

        expect(screen.getByText('Анна Петрова')).toBeInTheDocument()
        expect(screen.getByRole('img', { name: 'Анна Петрова' })).toHaveAttribute(
            'src',
            'https://example.test/anna.jpg'
        )
        expect(screen.getByText('Посмотрела ваш дневник')).toBeInTheDocument()
        expect(screen.getByLabelText('непрочитанных: 2')).toBeInTheDocument()
    })

    it('ведёт в переписку', () => {
        renderCard()

        expect(screen.getByLabelText('Открыть переписку с куратором')).toHaveAttribute('href', '/chat')
    })

    // Кто написал — обязательная пометка: без неё своё сообщение читается как
    // сообщение куратора.
    it('помечает собственное сообщение человека', () => {
        renderCard({
            curator: {
                ...curator,
                last_message: {
                    text: 'Спасибо!',
                    created_at: '2026-09-27T11:00:00.000Z',
                    from_curator: false,
                },
            },
        })

        expect(screen.getByText('Вы:')).toBeInTheDocument()
    })

    // Способность изображений профиля отключаема: тогда avatar_url приходит
    // пустым, и ссылка на несуществующую картинку дала бы битое изображение.
    it('без изображения показывает инициалы и не запрашивает картинку', () => {
        renderCard({ curator: { ...curator, avatar_url: undefined } })

        expect(screen.getByTestId('curator-initials')).toHaveTextContent('АП')
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('переписка без сообщений — это приглашение написать, а не отсутствие куратора', () => {
        renderCard({ curator: { ...curator, last_message: undefined, unread_count: 0 } })

        expect(screen.getByText('Анна Петрова')).toBeInTheDocument()
        expect(screen.getByText('Напишите первым')).toBeInTheDocument()
        expect(screen.queryByText('Куратор пока не назначен')).not.toBeInTheDocument()
    })

    it('говорит прямо, когда куратор не назначен', () => {
        renderCard({ curator: null })

        expect(screen.getByText('Куратор пока не назначен')).toBeInTheDocument()
        expect(screen.getByText('Напишите в поддержку — разберёмся')).toBeInTheDocument()
    })

    describe('ошибка запроса — не то же самое, что отсутствие куратора', () => {
        it('показывает ошибку с повтором', () => {
            renderCard({ curator: null, hasError: true })

            expect(screen.getByText('Не удалось загрузить куратора')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
        })

        it('и не утверждает, что куратора нет', () => {
            renderCard({ curator: null, hasError: true })

            expect(screen.queryByText('Куратор пока не назначен')).not.toBeInTheDocument()
        })

        it('повтор вызывает перезапрос', async () => {
            const onRetry = jest.fn()
            renderCard({ curator: null, hasError: true, onRetry })

            await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))

            expect(onRetry).toHaveBeenCalledTimes(1)
        })
    })

    it('пока ответа нет, ничего не утверждает', () => {
        renderCard({ curator: null, isLoading: true })

        expect(screen.queryByText('Куратор пока не назначен')).not.toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить куратора')).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toBeInTheDocument()
    })
})
