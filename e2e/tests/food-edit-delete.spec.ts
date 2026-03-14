import { test, expect } from '@playwright/test'
import { FoodTrackerPage } from '../pages/food-tracker.page'

test.describe('Food Entry Edit & Delete', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
  })

  test('add food entry then delete it', async ({ page }) => {
    // First, add a food entry to have something to delete
    await foodTracker.openAddFoodForMeal('Завтрак')
    await foodTracker.searchFood('Яблоко')
    await foodTracker.selectFirstResult()

    const modal = foodTracker.foodModal
    await modal.getByRole('button', { name: /Добавить/ }).click()
    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    // Verify entry appeared in the breakfast slot
    const breakfastSlot = foodTracker.mealSlot('Завтрак')
    const entryText = breakfastSlot.getByText(/[Яя]блок/).first()
    await expect(entryText).toBeVisible({ timeout: 5000 })

    // Food entry items are div[role="button"] — hover to reveal delete button
    const entryItem = breakfastSlot.getByLabel(/[Яя]блок/).first()
    await entryItem.hover()

    // Action buttons use opacity transition — force click since they exist but may be opacity-0
    const deleteButton = breakfastSlot.getByLabel(/Удалить/).first()
    await deleteButton.click({ force: true })

    // Should show success toast
    await expect(page.getByText('Запись удалена')).toBeVisible({
      timeout: 5000,
    })
  })

  test('edit food entry portion', async ({ page }) => {
    // Add a food entry first
    await foodTracker.openAddFoodForMeal('Обед')
    await foodTracker.searchFood('Яблоко')
    await foodTracker.selectFirstResult()

    const modal = foodTracker.foodModal
    await modal.getByRole('button', { name: /Добавить/ }).click()
    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    // Verify entry appeared
    const lunchSlot = foodTracker.mealSlot('Обед')
    await expect(lunchSlot.getByText(/[Яя]блок/).first()).toBeVisible({
      timeout: 5000,
    })

    // Hover over the entry item to reveal edit button
    const entryItem = lunchSlot.getByLabel(/[Яя]блок/).first()
    await entryItem.hover()

    // Action buttons use opacity transition — force click
    const editButton = lunchSlot.getByLabel(/Редактировать/).first()
    await editButton.click({ force: true })

    // Modal should open in edit mode with portion selector
    await expect(foodTracker.foodModal).toBeVisible({ timeout: 5000 })

    // Change portion amount
    const portionInput = page.locator('#portion-input')
    await expect(portionInput).toBeVisible({ timeout: 5000 })
    await portionInput.fill('200')

    // Save the edit
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Сохранить', exact: true })
      .click()

    // Modal should close
    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    // Should show success toast
    await expect(page.getByText('Запись обновлена')).toBeVisible({
      timeout: 5000,
    })

    // Clean up: hover and delete the entry
    const cleanupEntry = lunchSlot.getByLabel(/[Яя]блок/).first()
    await cleanupEntry.hover()
    const deleteButton = lunchSlot.getByLabel(/Удалить/).first()
    await deleteButton.click({ force: true })
    await expect(page.getByText('Запись удалена')).toBeVisible({
      timeout: 5000,
    })
  })
})
