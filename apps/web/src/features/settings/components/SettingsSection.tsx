import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

/**
 * Группа на экране настроек: метка секции, пояснение и содержимое.
 *
 * Метка — `type-overline`, как «Оформление» на экране профиля: настройки
 * читаются списком групп, а не стопкой заголовков.
 */
export function SettingsSection({
    title,
    titleId,
    description,
    children,
    className,
}: {
    title: ReactNode
    titleId?: string
    description?: ReactNode
    children: ReactNode
    className?: string
}) {
    return (
        <section className={cn('flex flex-col gap-3', className)} aria-labelledby={titleId}>
            <div className="flex flex-col gap-1">
                <h2 id={titleId} className="type-overline text-fg-subtle">{title}</h2>
                {description && <p className="text-sm text-fg-muted">{description}</p>}
            </div>
            {children}
        </section>
    )
}

/** Группа строк — одной карточкой, разделители между строками, без тени. */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('overflow-hidden rounded-card border border-line bg-surface divide-y divide-line', className)}>
            {children}
        </div>
    )
}

/** Строка группы: не ниже 56 px, подпись слева, управление справа. */
export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('flex min-h-14 items-center justify-between gap-4 px-4 py-2', className)}>
            {children}
        </div>
    )
}
