/**
 * Каркас экранов входа и восстановления доступа.
 *
 * Тёплая бумага (`bg-canvas`), узкая колонка (`max-w-md`), знак сверху и
 * заголовок засечками — экран спокойный, и на нём одно главное действие.
 * Карточки нет у самого каркаса: где форма просит рамку, её рисует экран
 * (`AuthPanel`), а сообщения вроде «письмо отправлено» лежат прямо на бумаге.
 *
 * Без хуков и браузерных API — годится и в серверном, и в клиентском дереве.
 */

import type { ReactNode } from 'react'
import { Logo } from '@/shared/components/ui'
import { cn } from '@/shared/utils/cn'

export interface AuthShellProps {
    children: ReactNode
    /** Заголовок экрана — h1 засечками. Без него экран сам ставит свой. */
    title?: ReactNode
    /** Пояснение под заголовком. */
    description?: ReactNode
    /** Знак над заголовком. На коротких служебных экранах (загрузка) не нужен. */
    logo?: boolean
    /** Колонка по центру высоты экрана — для коротких экранов-сообщений. */
    centered?: boolean
    /** Значок состояния над заголовком (успех, ошибка). */
    icon?: ReactNode
    className?: string
    'data-testid'?: string
    'aria-busy'?: boolean
}

export function AuthShell({
    children,
    title,
    description,
    logo = true,
    centered = false,
    icon,
    className,
    'data-testid': testId,
    'aria-busy': ariaBusy,
}: AuthShellProps) {
    return (
        <main
            className={cn(
                'flex min-h-screen flex-col bg-canvas px-screen-x py-10 sm:py-16',
                centered && 'justify-center',
            )}
            aria-busy={ariaBusy}
        >
            <div className={cn('mx-auto w-full max-w-md', className)} data-testid={testId}>
                {logo && (
                    <div className="mb-8 flex justify-center">
                        <Logo width={132} height={40} className="text-fg" />
                    </div>
                )}
                {icon && <div className="mb-5 flex justify-center">{icon}</div>}
                {(title || description) && (
                    <div className="mb-8 text-center">
                        {title && <h1 className="type-title-1 text-fg">{title}</h1>}
                        {description && (
                            <p className="mt-3 type-body text-fg-muted">{description}</p>
                        )}
                    </div>
                )}
                {children}
            </div>
        </main>
    )
}

/** Поверхность формы на экране входа: бумага на бумаге, линия без тени. */
export function AuthPanel({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-card border border-line bg-surface p-6 sm:p-8', className)}>
            {children}
        </div>
    )
}

/** Круглый значок состояния: успех или отказ — `-soft` подложка, `-fg` знак. */
export function AuthStatusIcon({
    tone,
    children,
}: {
    tone: 'success' | 'danger' | 'info'
    children: ReactNode
}) {
    return (
        <span
            className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full',
                tone === 'success' && 'bg-success-soft text-success-fg',
                tone === 'danger' && 'bg-danger-soft text-danger-fg',
                tone === 'info' && 'bg-info-soft text-info-fg',
            )}
            aria-hidden="true"
        >
            {children}
        </span>
    )
}

/** Классы поля ввода, когда `Input` не подходит (своя разметка подписи). */
export const FIELD =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'
