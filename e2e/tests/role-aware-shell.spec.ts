import { test, expect } from '../fixtures/session'

/**
 * Какая оболочка достаётся человеку и на каких экранах.
 *
 * Стоит вместо ручной проверки: пройти `/curator` → `/profile` →
 * `/settings/profile` и посмотреть, не сменилась ли навигация. Проверять это
 * руками — значит проверять один раз, а дефект был именно в том, что часть
 * экранов отстала от остальных и никто этого не заметил до обращения
 * пользователя.
 *
 * Роль куратор и администратор видели правильно ровно до перехода в профиль:
 * `/profile` читал её из `localStorage['user']` с запасным значением `'client'`,
 * а `/settings/*`, `/notifications`, `/content` и `/food-tracker` держали
 * клиентскую оболочку жёстко. Выглядело как понижение роли на ходу.
 */

const curatorScreens = [
    { path: '/profile', name: 'профиль' },
    { path: '/settings/profile', name: 'настройки профиля' },
    { path: '/settings/body', name: 'тело и цели' },
    { path: '/notifications', name: 'уведомления' },
]

test.describe('оболочка по роли', () => {
    for (const screen of curatorScreens) {
        test(`куратор на «${screen.name}» остаётся в кураторской оболочке`, async ({ page }) => {
            await page.goto(screen.path)

            await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })
            await expect(page.getByTestId('dashboard-layout')).toHaveCount(0)
        })
    }

    test('клиентская оболочка не мелькает по пути с главной куратора в профиль', async ({ page }) => {
        await page.goto('/curator')
        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })

        // Ровно тот переход, о котором сообщили: главная → профиль →
        // редактирование. Клиентская оболочка не должна появиться ни на одном
        // шаге, в том числе на кадр.
        await page.goto('/profile')
        await expect(page.getByTestId('curator-layout')).toBeVisible()
        await expect(page.getByTestId('dashboard-layout')).toHaveCount(0)

        await page.goto('/settings/profile')
        await expect(page.getByTestId('curator-layout')).toBeVisible()
        await expect(page.getByTestId('dashboard-layout')).toHaveCount(0)
    })

    test('пустое локальное хранилище не превращает куратора в клиента', async ({ page }) => {
        // Слепок профиля в localStorage — кэш первой отрисовки. Сессия живёт в
        // cookie и без слепка, и именно в этом состоянии куратор получал
        // клиентскую навигацию: роль бралась из пустого кэша.
        await page.goto('/profile')
        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })

        await page.evaluate(() => localStorage.clear())
        await page.reload()

        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })
        await expect(page.getByTestId('dashboard-layout')).toHaveCount(0)
    })

    test('слепок с чужой ролью не перебивает сессию', async ({ page }) => {
        await page.goto('/profile')
        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })

        await page.evaluate(() => {
            localStorage.setItem('user', JSON.stringify({ role: 'client', name: 'Не тот' }))
        })
        await page.reload()

        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })
        await expect(page.getByTestId('dashboard-layout')).toHaveCount(0)
    })
})
