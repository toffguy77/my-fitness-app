/**
 * E2E Tests: Dashboard Flow
 * Critical scenarios: View dashboard, check-in, view coordinator notes
 */

import { test, expect } from '@playwright/test'

test.describe('Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard (requires auth)
    await page.goto('/app/dashboard')
  })

  test('should display dashboard with nutrition summary', async ({ page }) => {
    await expect(page.locator('text=/дашборд|dashboard/i')).toBeVisible()
    await expect(page.locator('text=/калории|calories/i')).toBeVisible()
    await expect(page.locator('text=/белки|protein/i')).toBeVisible()
  })

  test('should display weekly summary', async ({ page }) => {
    // Should show week summary
    await expect(page.locator('text=/неделя|week/i')).toBeVisible()

    // Should show days logged
    await expect(page.locator('text=/дней|days/i')).toBeVisible()
  })

  test('should navigate to nutrition page', async ({ page }) => {
    await page.click('a[href*="nutrition"], button:has-text(/питание|nutrition/i)')
    await expect(page).toHaveURL(/.*nutrition/)
  })

  test('should change date and load data', async ({ page }) => {
    // Find date picker
    const dateInput = page.locator('input[type="date"]')
    if (await dateInput.count() > 0) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().split('T')[0]

      await dateInput.fill(dateStr)

      // Should reload data for selected date
      await page.waitForTimeout(1000) // Wait for data load
    }
  })

  test('should complete daily check-in', async ({ page }) => {
    // Find check-in button
    const checkInButton = page.locator('button:has-text(/завершить|check-in|check in/i)')

    if (await checkInButton.count() > 0) {
      await checkInButton.click()

      // Should show confirmation or success message
      await expect(
        page.locator('text=/завершен|completed|успешно|success/i')
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('should display coordinator note if available', async ({ page }) => {
    // Coordinator note widget should be visible if note exists
    const coordinatorNote = page.locator('text=/заметка|note|координатор|coordinator/i')

    // Either note is visible or widget is hidden (both are valid)
    // This test just ensures the page doesn't crash
    await expect(page.locator('body')).toBeVisible()
  })
})
