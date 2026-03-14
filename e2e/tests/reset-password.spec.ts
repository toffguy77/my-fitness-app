import { test, expect } from '@playwright/test'

test.describe('Reset Password', () => {
  test('page without token shows invalid link', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(
      page.getByRole('heading', { name: 'Неверная ссылка' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('invalid token shows error', async ({ page }) => {
    await page.goto('/reset-password?token=invalid-token-123')
    await expect(
      page.getByRole('heading', { name: 'Неверная ссылка' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('invalid link page has request new link button', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(
      page.getByRole('heading', { name: 'Неверная ссылка' })
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('link', { name: 'Запросить новую ссылку' })
    ).toBeVisible()
  })

  test('request new link navigates to forgot-password', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(
      page.getByRole('heading', { name: 'Неверная ссылка' })
    ).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: 'Запросить новую ссылку' }).click()
    await expect(page).toHaveURL(/\/forgot-password/, { timeout: 10000 })
  })

  test('back to login from invalid token page', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(
      page.getByRole('heading', { name: 'Неверная ссылка' })
    ).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: /Вернуться к входу/ }).click()
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })
  })
})
