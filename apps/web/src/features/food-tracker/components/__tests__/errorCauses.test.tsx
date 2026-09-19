/**
 * Дневник питания: причина отказа доезжает до человека.
 *
 * Здесь та же ложь, что была на разделе прогресса, только про еду: упавший
 * поиск показывал «Ничего не найдено» — то есть утверждал, что такого продукта
 * в базе нет. Человек после этого заводит продукт руками, хотя он там есть.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'
import { SearchTab } from '../SearchTab'
import { ChatTab } from '../ChatTab'

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

describe('Поиск продуктов', () => {
    // «Ничего не найдено» — утверждение о базе продуктов. Говорить его на
    // упавший запрос значит отправить человека заводить руками то, что есть.
    it('не выдаёт упавший запрос за отсутствие продукта', async () => {
        const onSearch = jest.fn().mockRejectedValue(refusal(503, 'feature_unavailable'))

        render(<SearchTab onSelectFood={jest.fn()} onSearch={onSearch} />)
        await userEvent.type(screen.getByRole('textbox', { name: /поиск/i }), 'яблоко')

        await waitFor(
            () => expect(screen.getByText('Возможность отключена в этой среде')).toBeInTheDocument(),
            { timeout: 2000 }
        )
        expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument()
    })

    it('по-прежнему говорит «ничего не найдено», когда действительно ничего нет', async () => {
        const onSearch = jest.fn().mockResolvedValue([])

        render(<SearchTab onSelectFood={jest.fn()} onSearch={onSearch} />)
        await userEvent.type(screen.getByRole('textbox', { name: /поиск/i }), 'несуществующий продукт')

        await waitFor(() => expect(screen.getByText('Ничего не найдено')).toBeInTheDocument(), {
            timeout: 2000,
        })
    })
})

describe('Переписка в дневнике', () => {
    it('показывает причину, по которой сообщение не ушло', async () => {
        const onSendMessage = jest.fn().mockRejectedValue(refusal(429, 'rate_limited'))

        render(<ChatTab onSelectFood={jest.fn()} onSendMessage={onSendMessage} />)
        await userEvent.type(screen.getByRole('textbox', { name: /сообщение/i }), 'Съел яблоко')
        await userEvent.click(screen.getByRole('button', { name: /отправить/i }))

        expect(await screen.findByText('Слишком много запросов. Подождите немного.')).toBeInTheDocument()
    })
})
