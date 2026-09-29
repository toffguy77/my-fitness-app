/**
 * Чек-лист первой недели.
 *
 * Главное здесь — что чек-лист молчит, когда сказать нечего. Непроставленная
 * отметка утверждает, что человек чего-то не сделал; на упавшем запросе такое
 * утверждение — ложь того же рода, что закреплена в errorCauses.test.tsx.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { FirstWeekChecklist } from '../FirstWeekChecklist'
import type { OnboardingState } from '../../types'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

const allFour: OnboardingState = {
    active: true,
    steps: [
        { key: 'profile', done: true },
        { key: 'first_meal', done: false },
        { key: 'plate_photo', done: false },
        { key: 'curator_hello', done: false },
    ],
    curator: null,
    // Пункт знакомства с куратором приходит только тому, у кого есть право на
    // работу с ним: сервер решает состав, и здесь набор такой же, как у
    // оплатившего.
    curator_access: { allowed: true, expired: false },
}

describe('FirstWeekChecklist', () => {
    it('показывает пункты и счётчик выполненных', () => {
        render(<FirstWeekChecklist state={allFour} />)

        expect(screen.getByText('Первая неделя')).toBeInTheDocument()
        expect(screen.getByTestId('first-week-progress')).toHaveTextContent('1 из 4')
        expect(screen.getAllByRole('listitem')).toHaveLength(4)
    })

    // Состав приходит с сервера: при выключенной способности распознавания пункта
    // про фото в ответе нет, и показывать его нечем.
    it('рисует только присланные пункты', () => {
        render(
            <FirstWeekChecklist
                state={{
                    ...allFour,
                    steps: allFour.steps.filter((step) => step.key !== 'plate_photo'),
                }}
            />
        )

        expect(screen.getAllByRole('listitem')).toHaveLength(3)
        expect(screen.queryByText('Сфотографировать тарелку')).not.toBeInTheDocument()
        expect(screen.getByTestId('first-week-progress')).toHaveTextContent('1 из 3')
    })

    // Пункт, который нельзя выполнить по ссылке из него самого, хуже
    // отсутствующего: распознавание живёт внутри окна записи еды.
    it('каждый пункт ведёт туда, где он выполняется', () => {
        render(<FirstWeekChecklist state={allFour} />)

        const links = screen.getAllByRole('link').map((el) => el.getAttribute('href'))
        expect(links).toEqual([
            '/settings/body',
            '/food-tracker',
            '/food-tracker?add=photo',
            '/chat',
        ])
    })

    // Цвет галочки не единственный признак выполнения: тот, кто не различает
    // цвета, должен прочитать состояние текстом.
    it('отмечает выполненное не только цветом', () => {
        render(<FirstWeekChecklist state={allFour} />)

        expect(screen.getAllByText('Готово')).toHaveLength(1)
    })

    describe('молчит, когда сказать нечего', () => {
        it('нет ответа — нет чек-листа', () => {
            const { container } = render(<FirstWeekChecklist state={null} />)

            expect(container).toBeEmptyDOMElement()
        })

        it('и ни одной непроставленной отметки при этом не показано', () => {
            render(<FirstWeekChecklist state={null} />)

            expect(screen.queryByText('Заполнить профиль')).not.toBeInTheDocument()
            expect(screen.queryByText('Первая неделя')).not.toBeInTheDocument()
        })

        it('срок вышел или всё сделано — сервер сказал active: false', () => {
            const { container } = render(
                <FirstWeekChecklist state={{ ...allFour, active: false }} />
            )

            expect(container).toBeEmptyDOMElement()
        })
    })
})
