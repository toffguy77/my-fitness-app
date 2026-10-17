/**
 * apple-app-site-association: какие адреса сайта открывает iOS-приложение
 * «Взвешено» (universal links) и для какого приложения сайт хранит пароли
 * (webcredentials).
 *
 * Идентификатор приложения собирается из переменных окружения контейнера
 * Next — APPLE_TEAM_ID и APPLE_BUNDLE_ID, тех же, что у API, — а не
 * зашивается в репозиторий: у dev и прода разные bundle id
 * (team.burcev.app.dev и team.burcev.app). Переменные серверные, без
 * NEXT_PUBLIC: файл собирается на запрос, в сборку они не попадают.
 *
 * Пути — design.md изменения ios-native-session:
 * - вход и восстановление: ссылка из письма, возврат входа через провайдера
 *   (/auth/native-complete), сброс пароля;
 * - экраны, на которые ведут письма и уведомления.
 * Исключения стоят первыми — Apple берёт первое совпавшее правило: /api/*
 * приложению не принадлежит вовсе, отписка из писем обязана работать в
 * браузере без входа.
 */

export interface AppLinkComponent {
    '/': string
    exclude?: true
    comment: string
}

export const APP_LINK_EXCLUSIONS = ['/api/*', '/unsubscribe*'] as const

export const APP_LINK_PATHS = [
    '/auth/link/consume*',
    '/auth/native-complete*',
    '/reset-password*',
    '/content/*',
    '/dashboard*',
    '/food-tracker*',
    '/chat*',
    '/notifications*',
    '/curator/*',
] as const

/** `<APPLE_TEAM_ID>.<APPLE_BUNDLE_ID>`, или null, если приложение не настроено. */
export function appID(env: { APPLE_TEAM_ID?: string; APPLE_BUNDLE_ID?: string }): string | null {
    const team = env.APPLE_TEAM_ID?.trim()
    const bundle = env.APPLE_BUNDLE_ID?.trim()
    if (!team || !bundle) return null
    return `${team}.${bundle}`
}

export function appleAppSiteAssociation(id: string) {
    const components: AppLinkComponent[] = [
        ...APP_LINK_EXCLUSIONS.map((path) => ({ '/': path, exclude: true as const, comment: `not the app: ${path}` })),
        ...APP_LINK_PATHS.map((path) => ({ '/': path, comment: path })),
    ]
    return {
        applinks: {
            details: [{ appIDs: [id], components }],
        },
        webcredentials: { apps: [id] },
    }
}
