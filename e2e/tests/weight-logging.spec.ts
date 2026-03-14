import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'

test.describe('Weight Logging', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()
  })

  test('open weight input and cancel', async () => {
    await dashboard.addWeightButton.click()
    await expect(dashboard.weightInput).toBeVisible({ timeout: 3000 })
    await expect(dashboard.saveWeightButton).toBeVisible()

    // Cancel
    await dashboard.cancelWeightButton.click()
    await expect(dashboard.weightInput).toBeHidden()
  })

  test('log weight value', async ({ page }) => {
    await dashboard.addWeightButton.click()
    await expect(dashboard.weightInput).toBeVisible({ timeout: 3000 })
    await dashboard.weightInput.fill('75.5')
    await dashboard.saveWeightButton.click()

    // After save, editing should close and weight should be displayed
    await expect(dashboard.weightInput).toBeHidden({ timeout: 10000 })

    // Weight value should now be visible
    await expect(page.getByText('75.5')).toBeVisible({ timeout: 5000 })
  })
})
