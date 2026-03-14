import { test, expect } from '@playwright/test'
import { FoodTrackerPage } from '../pages/food-tracker.page'

test.describe('Food Tracker - Client', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
  })

  test('all meal slots are visible', async () => {
    await foodTracker.expectMealSlotsVisible()
  })

  test('KBZHU summary shows all macro labels', async () => {
    await foodTracker.expectKBZHULabels()
  })

  test('water tracker is visible', async () => {
    await expect(foodTracker.waterTracker).toBeVisible()
    await expect(foodTracker.addWaterButton).toBeVisible()
  })

  test('FAB add food button is visible', async () => {
    await expect(foodTracker.fabAddFood).toBeVisible()
  })

  test('each meal slot has an add button', async () => {
    for (const name of ['Завтрак', 'Обед', 'Ужин', 'Перекус']) {
      await expect(foodTracker.addToMealButton(name)).toBeVisible()
    }
  })
})
