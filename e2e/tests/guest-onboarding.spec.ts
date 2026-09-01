import { test, expect } from '@playwright/test'

/**
 * The way in, for somebody who has no account.
 *
 * The registration form used to stand first, before the product had shown
 * anybody anything; this path is the change, so it is worth a test that walks
 * it end to end.
 */
test.describe('Guest onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/onboarding')
  })

  test('asks for a goal first, not for an email address', async ({ page }) => {
    await expect(page.getByText('Какая у вас цель?')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })

  test('produces a calculation without an account', async ({ page }) => {
    await page.getByRole('button', { name: /Снизить вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: 'Женский' }).click()
    await page.getByLabel('Дата рождения').fill('1990-05-01')
    await page.getByLabel('Рост, см').fill('170')
    await page.getByLabel('Вес, кг').fill('65')
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: /Умеренная активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    // Their own number, before anybody asked them for anything.
    await expect(page.getByTestId('guest-calories')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('guest-calories')).not.toBeEmpty()
    await expect(page.getByText(/стаканов по 250 мл/)).toBeVisible()
  })

  test('offers to save the result and asks for consent before storing it', async ({ page }) => {
    await page.getByRole('button', { name: /Удержать вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Мужской' }).click()
    await page.getByLabel('Дата рождения').fill('1985-01-01')
    await page.getByLabel('Рост, см').fill('180')
    await page.getByLabel('Вес, кг').fill('80')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: /Сидячий образ жизни/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    await page.getByRole('button', { name: 'Сохранить результат' }).click()

    await expect(page.getByLabel('Email')).toBeVisible()
    // Storing body measurements because somebody typed an address is not a
    // basis, so the button stays out of reach until they say so.
    await page.getByLabel('Email').fill('guest@burcev.test')
    await expect(page.getByRole('button', { name: 'Сохранить и продолжить' })).toBeDisabled()

    await page.getByRole('checkbox', { name: /обработку персональных данных/ }).check()
    await expect(page.getByRole('button', { name: 'Сохранить и продолжить' })).toBeEnabled()
  })

  test('leaves without saving anything', async ({ page }) => {
    await page.getByRole('button', { name: /Набрать массу/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Женский' }).click()
    await page.getByLabel('Дата рождения').fill('1995-06-15')
    await page.getByLabel('Рост, см').fill('165')
    await page.getByLabel('Вес, кг').fill('55')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: /Высокая активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()
    await page.getByRole('button', { name: 'Сохранить результат' }).click()

    await page.getByRole('button', { name: 'Продолжить без сохранения' }).click()

    await expect(page).toHaveURL(/\/auth/)
  })
})
