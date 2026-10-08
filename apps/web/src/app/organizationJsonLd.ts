import { t } from '@/shared/i18n'

/**
 * Organization для посадочной: из неё Яндекс собирает карточку организации.
 *
 * Отдельным модулем, а не в page.tsx: Next не пропускает из страницы
 * именованные экспорты, кроме своих, а тесту нужно вызвать это напрямую.
 *
 * Бот поддержки — тот же, что в SupportLink, и из той же переменной: без
 * бота в развёртывании нет и ссылки, а не ссылка в никуда.
 */
export function organizationJsonLd(botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT) {
    const bot = botUsername ? `https://t.me/${botUsername}` : undefined
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'BURCEV',
        url: 'https://burcev.team',
        // Растровый знак, а не logo.svg: SVG как логотип организации ни Яндекс,
        // ни Google не обещают разобрать.
        logo: 'https://burcev.team/icon-512.png',
        description: t('landing.meta.organizationDescription'),
        contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'support@burcev.team',
            availableLanguage: 'ru',
            ...(bot && { url: bot }),
        },
        ...(bot && { sameAs: [bot] }),
    }
}
