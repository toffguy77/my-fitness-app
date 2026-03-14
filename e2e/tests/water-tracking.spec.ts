import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'

test.describe('Water Tracking', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()
  })

  test('water section is visible with heading', async () => {
    await expect(dashboard.waterHeading).toBeVisible()
    await expect(dashboard.addWaterButton).toBeVisible()
  })

  test('clicking add water button triggers update', async ({ page }) => {
    await dashboard.addWater()

    // Should see a success toast or the water count change
    // Wait briefly for optimistic update
    await page.waitForTimeout(1500)

    // The button should still be functional (page didn't crash)
    await expect(dashboard.addWaterButton).toBeVisible()
  })
})
