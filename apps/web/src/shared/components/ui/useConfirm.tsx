'use client'

/**
 * Вызов подтверждения из обработчика.
 *
 *     const { confirm, dialog } = useConfirm()
 *     ...
 *     onClick={() => confirm({ title, description, confirmLabel, onConfirm: () => remove(id) })}
 *     ...
 *     return <>{...}{dialog}</>
 *
 * Хук возвращает и вызов, и элемент, а не прячет диалог в провайдере: диалог
 * остаётся в дереве вызвавшего экрана, и тесту экрана нечего подменять.
 */

import { useCallback, useState } from 'react'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

export type ConfirmRequest = Pick<
    ConfirmDialogProps,
    'title' | 'description' | 'confirmLabel' | 'tone' | 'onConfirm'
>

export function useConfirm() {
    const [request, setRequest] = useState<ConfirmRequest | null>(null)
    const [isPending, setIsPending] = useState(false)

    const confirm = useCallback((next: ConfirmRequest) => {
        setRequest(next)
    }, [])

    const close = useCallback(() => {
        setRequest(null)
        setIsPending(false)
    }, [])

    const handleConfirm = useCallback(async () => {
        if (!request || isPending) return
        setIsPending(true)
        try {
            await request.onConfirm()
            close()
        } catch (error) {
            // Отказ показывает вызывающий экран — своим способом, тем же, что и
            // для остальных своих действий: у всех четырёх обработка уже есть,
            // и до этого места отказ не доходит. Если же не обработал никто,
            // ошибка не глохнет здесь, а уходит наверх отклонённым обещанием —
            // его перехватывает общий обработчик и отправляет на сервер.
            close()
            throw error
        }
    }, [request, isPending, close])

    const dialog = request ? (
        <ConfirmDialog
            title={request.title}
            description={request.description}
            confirmLabel={request.confirmLabel}
            tone={request.tone}
            isPending={isPending}
            onConfirm={handleConfirm}
            onCancel={close}
        />
    ) : null

    return { confirm, dialog, isPending }
}
