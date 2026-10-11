/**
 * Какие ссылки сайта открывает iOS-приложение, а не браузер (Universal Links).
 *
 * Только ссылки из писем, по которым человек входит: вход по ссылке и сброс
 * пароля. `/auth/link` без `/consume` — подтверждение привязки внешнего
 * входа, оно живёт в браузерной сессии и приложению не принадлежит. Отписку
 * из писем тоже не забираем: она должна работать и без приложения.
 */
export const IOS_APP_ID = '3GWRDGA8B7.team.burcev.app'

export const APP_LINK_PATHS = ['/auth/link/consume', '/reset-password'] as const

export function appleAppSiteAssociation() {
    return {
        applinks: {
            details: [
                {
                    appIDs: [IOS_APP_ID],
                    components: APP_LINK_PATHS.map((path) => ({ '/': path, comment: path })),
                },
            ],
        },
        webcredentials: { apps: [IOS_APP_ID] },
    }
}
