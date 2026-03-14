import { test, expect } from '@playwright/test'
import { FoodTrackerPage } from '../pages/food-tracker.page'

test.describe('Food Tracker Navigation & Tabs', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
  })

  test('date navigation buttons are visible', async ({ page }) => {
    await expect(page.getByLabel('Предыдущий день')).toBeVisible()
    await expect(page.getByLabel('Следующий день')).toBeVisible()
    await expect(page.getByLabel('Открыть календарь')).toBeVisible()
  })

  test('next day is disabled on today', async ({ page }) => {
    await expect(page.getByLabel('Следующий день')).toBeDisabled()
  })

  test('navigate to previous day and back', async ({ page }) => {
    const prevButton = page.getByLabel('Предыдущий день')
    const nextButton = page.getByLabel('Следующий день')

    // Go to previous day
    await prevButton.click()

    // Next day should now be enabled
    await expect(nextButton).toBeEnabled({ timeout: 5000 })

    // KBJU summary should still be visible (data loaded)
    await expect(foodTracker.kbzhuSummary).toBeVisible()

    // Navigate back to today
    await nextButton.click()

    // Next day should be disabled again (back to today)
    await expect(nextButton).toBeDisabled({ timeout: 5000 })
  })

  test('tabs are visible with Рацион selected', async ({ page }) => {
    const tablist = page.getByRole('tablist', {
      name: 'Разделы дневника питания',
    })
    await expect(tablist).toBeVisible()

    const dietTab = page.getByRole('tab', { name: 'Рацион' })
    await expect(dietTab).toHaveAttribute('aria-selected', 'true')
  })

  test('switch to Рекомендации tab', async ({ page }) => {
    const recsTab = page.getByRole('tab', { name: 'Рекомендации' })
    await recsTab.click()

    // Рекомендации tab should be selected
    await expect(recsTab).toHaveAttribute('aria-selected', 'true')

    // Рацион tab should be deselected
    const dietTab = page.getByRole('tab', { name: 'Рацион' })
    await expect(dietTab).toHaveAttribute('aria-selected', 'false')

    // Recommendations tab panel should be visible
    await expect(
      page.getByRole('tabpanel', { name: 'Рекомендации' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('switch back to Рацион tab shows meal slots', async ({ page }) => {
    // Go to recommendations
    await page.getByRole('tab', { name: 'Рекомендации' }).click()
    await expect(
      page.getByRole('tabpanel', { name: 'Рекомендации' })
    ).toBeVisible({ timeout: 5000 })

    // Switch back
    await page.getByRole('tab', { name: 'Рацион' }).click()

    // Meal slots should be visible again
    await foodTracker.expectMealSlotsVisible()
  })
})
