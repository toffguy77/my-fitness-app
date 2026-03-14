import { test, expect } from '@playwright/test'
import { FoodTrackerPage } from '../pages/food-tracker.page'

test.describe('Food Entry', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
  })

  test('open food modal from meal slot', async () => {
    await foodTracker.openAddFoodForMeal('Завтрак')
    await expect(foodTracker.foodModal).toBeVisible()
    await expect(foodTracker.searchInput).toBeVisible()

    // Close modal
    await foodTracker.closeModalButton.click()
    await expect(foodTracker.foodModal).toBeHidden()
  })

  test('search for food product', async () => {
    await foodTracker.openAddFoodForMeal('Завтрак')
    await foodTracker.searchFood('Яблоко')

    // Should have at least one result
    const options = foodTracker.foodList.getByRole('option')
    await expect(options.first()).toBeVisible({ timeout: 5000 })
  })

  test('full food entry flow: search, select, save', async ({ page }) => {
    await foodTracker.openAddFoodForMeal('Завтрак')
    await foodTracker.searchFood('Яблоко')

    // Select first result
    await foodTracker.selectFirstResult()

    // Should be on portion selection — click the submit button inside modal
    const modal = foodTracker.foodModal
    await modal.getByRole('button', { name: /Добавить/ }).click()

    // Wait for modal to close after save
    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    // Verify the food entry appeared in the breakfast slot
    const breakfastSlot = foodTracker.mealSlot('Завтрак')
    await expect(breakfastSlot.getByText(/[Яя]блок/).first()).toBeVisible({ timeout: 5000 })
  })

  test('open food modal from FAB button', async () => {
    await foodTracker.fabAddFood.click()
    await expect(foodTracker.foodModal).toBeVisible({ timeout: 5000 })
    await expect(foodTracker.searchInput).toBeVisible()
  })
})
