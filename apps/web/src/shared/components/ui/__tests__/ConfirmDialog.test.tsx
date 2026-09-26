/**
 * Тесты диалога подтверждения.
 *
 * Сценарии из specs/destructive-action-confirmation: что показано, куда встаёт
 * фокус, что происходит с Escape, подложкой и вторым нажатием.
 */

import React, { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../ConfirmDialog'
import { useConfirm } from '../useConfirm'
import { ru } from '@/shared/i18n/dictionaries/ru'

const props = {
    title: 'Удалить статью',
    description: 'Статья и её история будут удалены без возможности восстановления.',
    confirmLabel: 'Удалить',
}

describe('ConfirmDialog', () => {
    it('показывает заголовок, последствия и подпись, называющую действие', () => {
        render(<ConfirmDialog {...props} onConfirm={jest.fn()} onCancel={jest.fn()} />)

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAccessibleName('Удалить статью')
        expect(dialog).toHaveAccessibleDescription(props.description)
        expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument()
    })

    it('ставит фокус на отказ, чтобы случайный Enter не выполнил действие', async () => {
        const onConfirm = jest.fn()
        const user = userEvent.setup()
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={jest.fn()} />)

        const cancel = screen.getByRole('button', { name: ru.common.cancel })
        expect(cancel).toHaveFocus()

        await user.keyboard('{Enter}')
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('не выпускает фокус за пределы диалога', async () => {
        const user = userEvent.setup()
        render(<ConfirmDialog {...props} onConfirm={jest.fn()} onCancel={jest.fn()} />)

        const cancel = screen.getByRole('button', { name: ru.common.cancel })
        const confirm = screen.getByRole('button', { name: 'Удалить' })

        await user.tab()
        expect(confirm).toHaveFocus()
        await user.tab()
        expect(cancel).toHaveFocus()
    })

    it('закрывается по Escape, не выполняя действия', async () => {
        const onCancel = jest.fn()
        const onConfirm = jest.fn()
        const user = userEvent.setup()
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />)

        await user.keyboard('{Escape}')

        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('закрывается по клику на подложку, не выполняя действия', async () => {
        const onCancel = jest.fn()
        const onConfirm = jest.fn()
        const user = userEvent.setup()
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />)

        await user.click(screen.getByRole('dialog'))

        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('пока действие выполняется, не закрывается и не принимает повторное нажатие', async () => {
        const onCancel = jest.fn()
        const onConfirm = jest.fn()
        const user = userEvent.setup()
        render(
            <ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} isPending />
        )

        await user.keyboard('{Escape}')
        await user.click(screen.getByRole('dialog'))
        await user.click(screen.getByRole('button', { name: ru.common.inProgress }))

        expect(onCancel).not.toHaveBeenCalled()
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('подписи берутся из словаря, а не у операционной системы', () => {
        render(<ConfirmDialog {...props} onConfirm={jest.fn()} onCancel={jest.fn()} />)

        expect(screen.getByRole('button', { name: ru.common.cancel })).toBeInTheDocument()
    })
})

describe('useConfirm', () => {
    function Screen({ action }: { action: () => void | Promise<void> }) {
        const { confirm, dialog } = useConfirm()
        return (
            <>
                <button
                    type="button"
                    onClick={() =>
                        confirm({ ...props, onConfirm: action })
                    }
                >
                    Открыть
                </button>
                {dialog}
            </>
        )
    }

    it('показывает диалог по вызову и выполняет действие один раз', async () => {
        const action = jest.fn()
        const user = userEvent.setup()
        render(<Screen action={action} />)

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Открыть' }))
        await user.click(screen.getByRole('button', { name: 'Удалить' }))

        expect(action).toHaveBeenCalledTimes(1)
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })

    it('второе нажатие подтверждения не отправляет второй запрос', async () => {
        let release: () => void = () => {}
        const action = jest.fn(() => new Promise<void>((resolve) => { release = resolve }))
        const user = userEvent.setup()
        render(<Screen action={action} />)

        await user.click(screen.getByRole('button', { name: 'Открыть' }))
        await user.click(screen.getByRole('button', { name: 'Удалить' }))

        // Пока запрос идёт, диалог открыт и показывает выполнение.
        const pending = await screen.findByRole('button', { name: ru.common.inProgress })
        expect(pending).toBeDisabled()
        await user.click(pending)

        expect(action).toHaveBeenCalledTimes(1)

        release()
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })

    it('возвращает фокус тому, кто диалог вызвал', async () => {
        const user = userEvent.setup()
        render(<Screen action={jest.fn()} />)

        const opener = screen.getByRole('button', { name: 'Открыть' })
        await user.click(opener)
        await user.keyboard('{Escape}')

        await waitFor(() => {
            expect(opener).toHaveFocus()
        })
    })

    it('отказ действия закрывает диалог, а причину показывает вызывающий экран', async () => {
        const user = userEvent.setup()

        function FailingScreen() {
            const { confirm, dialog } = useConfirm()
            const [error, setError] = useState<string | null>(null)
            return (
                <>
                    <button
                        type="button"
                        onClick={() =>
                            confirm({
                                ...props,
                                onConfirm: async () => {
                                    try {
                                        throw new Error('Не удалось удалить')
                                    } catch (err) {
                                        setError((err as Error).message)
                                    }
                                },
                            })
                        }
                    >
                        Открыть
                    </button>
                    {error && <p role="alert">{error}</p>}
                    {dialog}
                </>
            )
        }

        render(<FailingScreen />)
        await user.click(screen.getByRole('button', { name: 'Открыть' }))
        await user.click(screen.getByRole('button', { name: 'Удалить' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить')
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })
})
