import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'

test.describe('Dashboard - Client', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()
  })

  test('page loads with calendar navigator', async () => {
    await expect(dashboard.calendarNavigator).toBeVisible()
  })

  test('daily tracking blocks are visible', async () => {
    await expect(dashboard.calorieValue).toBeVisible()
    await expect(dashboard.addFoodButton.first()).toBeVisible()
    await expect(dashboard.addWaterButton).toBeVisible()
  })

  test('weight section is visible', async () => {
    await expect(dashboard.weightSection.first()).toBeVisible()
  })

  test('calendar navigation works', async ({ page }) => {
    // Navigate to previous week
    await dashboard.prevWeekButton.click()

    // Day buttons should still be visible
    await expect(dashboard.calendarNavigator).toBeVisible()

    // Navigate back to current week
    await dashboard.nextWeekButton.click()
    await expect(dashboard.calendarNavigator).toBeVisible()
  })

  test('clicking a day updates tracking data', async () => {
    // Click on a different day (index 0 = first day of the week)
    await dashboard.selectDay(0)

    // Calorie value should still be visible (may show different data)
    await expect(dashboard.calorieValue).toBeVisible()
  })
})
