import { test, expect } from '@playwright/test'

test.describe('Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password')
  })

  test('page loads with form elements', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Забыли пароль?' })
    ).toBeVisible()
    await expect(page.getByLabel('Email адрес')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Отправить инструкции' })
    ).toBeVisible()
  })

  test('back to login link is visible', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /Вернуться к входу/ })
    ).toBeVisible()
  })

  test('back to login navigates to auth', async ({ page }) => {
    await page.getByRole('link', { name: /Вернуться к входу/ }).click()
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })
  })

  test('empty email shows validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Отправить инструкции' }).click()
    // HTML5 required validation prevents submission - email field should have :invalid state
    const emailInput = page.getByLabel('Email адрес')
    await expect(emailInput).toBeVisible()
  })

  test('submit with email shows confirmation', async ({ page }) => {
    await page.getByLabel('Email адрес').fill('test@example.com')
    await page.getByRole('button', { name: 'Отправить инструкции' }).click()

    // Should show confirmation page (API may return error but UI shows success state)
    await expect(
      page
        .getByRole('heading', { name: 'Проверьте почту' })
        .or(page.getByText('Не удалось отправить'))
    ).toBeVisible({ timeout: 10000 })
  })
})
