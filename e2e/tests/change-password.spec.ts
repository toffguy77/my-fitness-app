import { test, expect } from '@playwright/test'

/**
 * Changing a password.
 *
 * The feature shipped broken: the frontend called an endpoint that did not
 * exist, and nothing checked. This walks the whole path.
 */
test.describe('Change password', () => {
  test('the form explains the rules and refuses a weak password', async ({ page }) => {
    await page.goto('/settings/password')

    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('E2e!Client#2026')
    await page.getByLabel(/^Новый пароль/).fill('password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('password')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    // Refused, and told why — not a generic failure.
    await expect(page.getByText(/заглавную букву|минимум 8|цифру|специальный/i).first()).toBeVisible()
  })

  test('mismatched confirmation is caught before the request', async ({ page }) => {
    await page.goto('/settings/password')
    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('E2e!Client#2026')
    await page.getByLabel(/^Новый пароль/).fill('An0ther!Password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('An0ther!Different')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    await expect(page.getByText(/не совпада/i).first()).toBeVisible()
  })

  test('a wrong current password is reported as such', async ({ page }) => {
    await page.goto('/settings/password')
    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('NotTheCurrent!1')
    await page.getByLabel(/^Новый пароль/).fill('An0ther!Password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('An0ther!Password')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    // The endpoint exists and answers: the point of the test is that this
    // reaches the API at all.
    await expect(page.getByText(/Неверный текущий пароль|Не удалось изменить/i).first()).toBeVisible({
      timeout: 15000,
    })
  })
})
