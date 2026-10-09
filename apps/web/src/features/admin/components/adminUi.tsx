import { t } from '@/shared/i18n'

/**
 * Поле администратора для `select` и полей даты, которых нет в общем `Input`:
 * те же 48 px, радиус поля и текст 16 px.
 */
export const ADMIN_FIELD_CLASS =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

/** Строка списка-карточки: ≥ 56 px, наведение — вторичной заливкой. */
export const ADMIN_ROW_CLASS =
    'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle/60 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'

/** Спиннер загрузки раздела. */
export function AdminSpinner({ className = 'py-12' }: { className?: string }) {
    return (
        <div className={`flex items-center justify-center ${className}`} role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
        </div>
    )
}
