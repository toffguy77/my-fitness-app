/**
 * Тема интерфейса: по умолчанию — как в системе, явный выбор — атрибутом
 * `data-theme` на <html> (tokens.css переключает роли по нему).
 *
 * Выбор пока не сохраняется: настройка темы в профиле — отдельная задача,
 * здесь только механизм, которым она будет пользоваться.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

export function applyThemePreference(theme: ThemePreference, root: HTMLElement = document.documentElement): void {
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
}
