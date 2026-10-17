import { test, expect } from '../fixtures/session'

// Apple Здоровье в веб-настройках (healthkit-sync): подключается только в
// приложении на iPhone, веб показывает пояснение и состояние по признаку
// apple_health_enabled, который ставит приложение. Переключателя нет.
test.describe('Settings Apple Health', () => {
  // Признак общий для учётки: возвращаем его в исходное состояние.
  test.afterEach(async ({ page }) => {
    await page.request.put('/api/v1/users/settings', { data: { apple_health_enabled: false } })
  })

  test('explains that Health is connected from the iPhone app', async ({ page }) => {
    await page.goto('/settings/apple-health')

    await expect(page.getByRole('heading', { name: 'Apple Здоровье' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Подключается в приложении на iPhone/)).toBeVisible()
    await expect(page.getByText(/импорт не перезаписывает/)).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(0)
  })

  test('shows the state the app has set', async ({ page }) => {
    const off = await page.request.put('/api/v1/users/settings', { data: { apple_health_enabled: false } })
    expect(off.ok()).toBeTruthy()
    await page.goto('/settings/apple-health')
    await expect(page.getByTestId('apple-health-state')).toHaveText('Не подключено', { timeout: 10000 })

    // Так флаг ставит приложение после системного запроса.
    const on = await page.request.put('/api/v1/users/settings', { data: { apple_health_enabled: true } })
    expect(on.ok()).toBeTruthy()
    await page.reload()
    await expect(page.getByTestId('apple-health-state')).toHaveText('Подключено на iPhone', { timeout: 10000 })
  })

  test('back navigation works', async ({ page }) => {
    await page.goto('/settings/apple-health')
    await expect(page.getByRole('heading', { name: 'Apple Здоровье' })).toBeVisible({ timeout: 10000 })
    const backButton = page
      .getByRole('link', { name: /назад/i })
      .or(page.getByLabel(/назад/i))
    const hasBack = await backButton.isVisible().catch(() => false)
    if (hasBack) {
      await backButton.click()
      await expect(page).toHaveURL(/\/profile|\/settings/, { timeout: 10000 })
    }
  })
})
