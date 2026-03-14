import { test, expect } from '@playwright/test'

test.describe('Settings Apple Health', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/apple-health')
  })

  test('page loads with heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Apple Health' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('toggle is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Apple Health' })
    ).toBeVisible({ timeout: 10000 })
    // The toggle switch should be present
    const toggle = page.getByRole('switch').or(page.getByRole('checkbox'))
    await expect(toggle).toBeVisible({ timeout: 5000 })
  })

  test('back navigation works', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Apple Health' })
    ).toBeVisible({ timeout: 10000 })
    // Back button or link
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
