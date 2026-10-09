/**
 * Тема интерфейса.
 *
 * По умолчанию — как в системе (`prefers-color-scheme`). Явный выбор хранится
 * в cookie `theme` на этом устройстве и ставится атрибутом `data-theme` на
 * <html>; tokens.css переключает роли по нему.
 *
 * Cookie, а не localStorage: сервер читает её в корневом layout и отдаёт
 * страницу уже с нужным атрибутом. Выбор из localStorage применился бы только
 * после загрузки скрипта — каждая страница сначала мигала бы системной темой.
 *
 * Выбор живёт на устройстве, а не в профиле: так ведут себя iOS и Android, и
 * человек с тёмным телефоном и светлым ноутбуком хочет разного.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_COOKIE = 'theme'
const ONE_YEAR = 60 * 60 * 24 * 365
const CHANGE_EVENT = 'burcev:theme-change'

/** Значение cookie → выбор. Всё незнакомое — «как в системе». */
export function parseThemePreference(value: string | undefined | null): ThemePreference {
    return value === 'light' || value === 'dark' ? value : 'system'
}

export function applyThemePreference(theme: ThemePreference, root: HTMLElement = document.documentElement): void {
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
}

/** Текущий выбор на этом устройстве. */
export function readThemePreference(cookie: string = typeof document === 'undefined' ? '' : document.cookie): ThemePreference {
    const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${THEME_COOKIE}=`))
    return parseThemePreference(match?.slice(THEME_COOKIE.length + 1))
}

/** Запомнить выбор, применить его и сообщить подписчикам. */
export function saveThemePreference(theme: ThemePreference): void {
    document.cookie = theme === 'system'
        ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    applyThemePreference(theme)
    window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Подписка для useSyncExternalStore. */
export function subscribeThemePreference(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
}
