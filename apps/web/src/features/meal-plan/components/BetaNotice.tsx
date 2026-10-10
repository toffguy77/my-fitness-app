import Link from 'next/link'
import { t } from '@/shared/i18n'

/**
 * Заметка о бете вверху «Меню».
 *
 * Раздел открыт всем бесплатно, пока его проверяют живые клиенты; позже он
 * уйдёт за подписку. Сказать об этом здесь честнее, чем однажды молча закрыть
 * доступ, — и это приглашение сообщить, что не так.
 */
export function BetaNotice() {
    return (
        <aside
            aria-labelledby="menu-beta-title"
            className="flex flex-col gap-1 rounded-tile border border-line bg-subtle px-4 py-3"
        >
            <p id="menu-beta-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="rounded-full bg-primary px-2 text-[11px] leading-5 text-on-primary">
                    {t('dashboard.navigation.betaTag')}
                </span>
                {t('mealPlan.menu.betaTitle')}
            </p>
            <p className="text-sm text-fg-muted">{t('mealPlan.menu.betaText')}</p>
            <Link href="/chat" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                {t('mealPlan.menu.betaChatLink')}
            </Link>
        </aside>
    )
}
