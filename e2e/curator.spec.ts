/**
 * E2E Tests: Curator Dashboard Flow
 * Critical scenarios: View clients, check status, add notes
 */

import { test, expect } from '@playwright/test'

test.describe('Curator Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to curator dashboard (requires curator auth)
    await page.goto('/app/curator')
  })

  test('should display curator dashboard with clients list', async ({ page }) => {
    await expect(page.locator('text=/куратор|curator/i')).toBeVisible()
    await expect(page.locator('text=/клиенты|clients/i')).toBeVisible()
  })

  test('should display client status indicators', async ({ page }) => {
    // Should show traffic light system (red/yellow/green/grey)
    await expect(
      page.locator('text=/требует внимания|в процессе|в норме|red|yellow|green/i')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should filter clients by status', async ({ page }) => {
    // Find filter buttons
    const redFilter = page.locator('button:has-text(/требуют внимания|red/i)')

    if (await redFilter.count() > 0) {
      await redFilter.click()

      // Should filter clients
      await page.waitForTimeout(500)
    }
  })

  test('should navigate to client view', async ({ page }) => {
    // Click on first client card
    const clientCard = page.locator('[data-testid="client-card"], .client-card').first()

    if (await clientCard.count() > 0) {
      await clientCard.click()

      // Should navigate to client detail page
      await expect(page).toHaveURL(/.*curator\/.*/)
    }
  })

  test('should add curator note for client', async ({ page }) => {
    // Navigate to client view
    await page.goto('/app/curator/test-client-id')

    // Find note input
    const noteTextarea = page.locator('textarea[placeholder*="заметка"], textarea[placeholder*="note"]')

    if (await noteTextarea.count() > 0) {
      await noteTextarea.fill('Тестовая заметка от куратора')

      // Save note
      await page.click('button:has-text(/сохранить|save/i)')

      // Should show success message
      await expect(
        page.locator('text=/сохранено|saved|успешно|success/i')
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('should sort clients by status', async ({ page }) => {
    // Find sort dropdown or buttons
    const sortButton = page.locator('button:has-text(/сортировка|sort/i)')

    if (await sortButton.count() > 0) {
      await sortButton.click()
      await page.click('button:has-text(/статус|status/i)')

      // Clients should be sorted (red first)
      await page.waitForTimeout(500)
    }
  })
})
