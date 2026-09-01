import { test, expect } from '@playwright/test'

/**
 * What people see when something breaks.
 *
 * The app used to answer a wrong URL and a thrown widget with the framework's
 * own blank screen, which tells nobody anything and offers no way out.
 */
test.describe('Error screens', () => {
  test('a wrong URL explains itself and offers a way back', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')

    await expect(page.getByText(/Страница не найдена/i)).toBeVisible({ timeout: 15000 })
    // A way out, not just an apology.
    await expect(page.getByRole('link', { name: /На главную|Вернуться/i }).first()).toBeVisible()
  })

  test('a failed request leaves the page usable', async ({ page }) => {
    // Everything the landing page asks the API for fails.
    await page.route('**/api/v1/**', (route) => route.abort('failed'))

    await page.goto('/')

    // The page itself does not depend on the API, and must not disappear
    // because a widget on it could not load.
    await expect(
      page.getByRole('heading', { name: 'Трекер питания и фитнеса' })
    ).toBeVisible({ timeout: 15000 })
  })

  test('the onboarding survives an API that is not there', async ({ page }) => {
    await page.route('**/api/v1/public/nutrition/calculate', (route) => route.abort('failed'))

    await page.goto('/onboarding')
    await page.getByRole('button', { name: /Снизить вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Женский' }).click()
    await page.getByLabel('Дата рождения').fill('1990-05-01')
    await page.getByLabel('Рост, см').fill('170')
    await page.getByLabel('Вес, кг').fill('65')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: /Умеренная активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    // Told what happened, and still holding their answers.
    await expect(page.getByText(/Не удалось выполнить расчёт/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Показать мою норму' })).toBeEnabled()
  })
})
