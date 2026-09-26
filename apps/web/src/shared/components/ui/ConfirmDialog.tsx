'use client'

/**
 * Подтверждение необратимого действия.
 *
 * До этого четыре места спрашивали через `confirm()`. Системное окно не
 * переводится — подписи кнопок задаёт операционная система, — не отличает
 * «удалить» от «отменить» видом и закрывается до того, как ушёл запрос: второе
 * нажатие на «Удалить» отправляло второй запрос.
 *
 * Компонент рендерится там, где его вызвали (см. `useConfirm`), а не в общем
 * провайдере: диалог остаётся в дереве вызывающего экрана, и тест экрана просто
 * нажимает в нём кнопку.
 */

import { useCallback, useEffect, useId, useRef } from 'react'
import { Button } from './Button'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { t } from '@/shared/i18n'

export interface ConfirmDialogProps {
    /** Заголовок: что именно сейчас произойдёт. */
    title: string
    /** Последствия: что будет потеряно или изменено. */
    description: string
    /** Подпись кнопки подтверждения — называет действие, а не отвечает «да». */
    confirmLabel: string
    /** Разрушающее действие оформляется иначе, чем обычное. */
    tone?: 'danger' | 'default'
    /**
     * Пока обещание не разрешилось, диалог открыт, кнопка отключена и
     * показывает выполнение. Отклонение пробрасывается наружу — отказ
     * показывает вызывающий экран тем же способом, что и для остальных
     * своих действий.
     */
    onConfirm: () => void | Promise<void>
    onCancel: () => void
    /** Идёт ли сейчас подтверждённое действие. */
    isPending?: boolean
}

export function ConfirmDialog({
    title,
    description,
    confirmLabel,
    tone = 'danger',
    onConfirm,
    onCancel,
    isPending = false,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const titleId = useId()
    const descriptionId = useId()

    // Закрыть можно только пока ничего не выполняется: иначе диалог исчезнет, а
    // запрос останется идти.
    const cancelIfIdle = useCallback(() => {
        if (!isPending) onCancel()
    }, [isPending, onCancel])

    // Кем диалог был вызван — чтобы вернуть туда фокус при закрытии. Эффект
    // объявлен до ловушки фокуса: та уводит фокус внутрь диалога, и после неё
    // спрашивать было бы уже поздно.
    useEffect(() => {
        const invoker = document.activeElement
        return () => {
            if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus()
        }
    }, [])

    useFocusTrap(dialogRef as React.RefObject<HTMLElement>, true)

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') cancelIfIdle()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [cancelIfIdle])

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center"
            onClick={(event) => {
                if (event.target === event.currentTarget) cancelIfIdle()
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
        >
            <div
                ref={dialogRef}
                className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
            >
                <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                    {title}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm text-gray-600">
                    {description}
                </p>

                {/* Отказ стоит первым и в разметке: ловушка фокуса ставит фокус
                    на первый элемент, и случайный Enter отменяет действие. */}
                <div className="mt-6 flex gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={onCancel}
                        disabled={isPending}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        variant={tone === 'danger' ? 'danger' : 'primary'}
                        className="flex-1"
                        onClick={() => { void onConfirm() }}
                        isLoading={isPending}
                    >
                        {isPending ? t('common.inProgress') : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    )
}
