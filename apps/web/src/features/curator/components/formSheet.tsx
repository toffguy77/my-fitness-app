'use client'

import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/shared/components/ui/Button'
import { t } from '@/shared/i18n'

/**
 * Поле, подпись и шторка формы куратора — те же решения, что у `Input` и
 * `ConfirmDialog` дизайн-системы, для `select`, `textarea` и полей даты,
 * которых в общем наборе нет.
 *
 * Поле — 48 px и текст 16 px: на телефоне iOS не увеличивает страницу при
 * фокусе. Многострочное поле — та же рамка и шрифт без фиксированной высоты.
 */
export const FIELD_CLASS =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 ' +
    'disabled:cursor-not-allowed disabled:opacity-50'

export const TEXTAREA_CLASS =
    'w-full rounded-field border border-line bg-surface px-4 py-3 text-base text-fg ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

export const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-fg-muted'

/** Ошибка формы — под полями, ролью `danger-fg`. */
export const FORM_ERROR_CLASS = 'text-sm text-danger-fg'

interface FormSheetProps {
    title: string
    onClose: () => void
    children: ReactNode
}

/**
 * Шторка снизу на телефоне и окно по центру на десктопе: `bg-scrim` под ней,
 * `rounded-t-sheet`/`sm:rounded-sheet`, тень `overlay` — она лежит над экраном.
 * Закрытие — первая кнопка в разметке.
 */
export function FormSheet({ title, onClose, children }: FormSheetProps) {
    const titleId = useId()

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-sheet bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-overlay sm:max-w-lg sm:rounded-sheet">
                <div className="mb-5 flex items-center justify-between gap-3">
                    <h2 id={titleId} className="type-title-2 text-fg">
                        {title}
                    </h2>
                    <IconButton variant="ghost" aria-label={t('common.close')} onClick={onClose} className="-mr-2">
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>
                {children}
            </div>
        </div>
    )
}

/** Спиннер загрузки раздела. */
export function SectionSpinner() {
    return (
        <div className="flex items-center justify-center py-12" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
        </div>
    )
}
