import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'

test.describe('Steps Logging', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()
  })

  test('steps progress section is visible', async () => {
    await expect(dashboard.stepsProgress).toBeVisible()

    const label = await dashboard.stepsProgress.getAttribute('aria-label')
    expect(label).toMatch(/Прогресс шагов:/)
  })

  test('open steps input and log value', async ({ page }) => {
    await dashboard.addStepsButton.first().click()

    // Input should appear
    await expect(dashboard.stepsInput).toBeVisible({ timeout: 3000 })

    await dashboard.stepsInput.fill('10000')
    await page.getByRole('button', { name: /Сохранить/i }).click()

    // Input should disappear after save
    await expect(dashboard.stepsInput).toBeHidden({ timeout: 5000 })

    // Verify success toast
    await expect(page.getByText('Шаги сохранены')).toBeVisible({ timeout: 5000 })
  })
})
