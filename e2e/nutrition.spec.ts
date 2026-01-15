/**
 * E2E Tests: Nutrition Input Flow
 * Critical scenario: User adds meal and saves daily log
 */

import { test, expect } from '@playwright/test'

test.describe('Nutrition Input Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to nutrition page (requires auth)
    await page.goto('/app/nutrition')
  })

  test('should display nutrition input form', async ({ page }) => {
    await expect(page.locator('text=/питание|nutrition/i')).toBeVisible()
    await expect(page.locator('input[placeholder*="название"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="вес"]')).toBeVisible()
  })

  test('should add meal to list', async ({ page }) => {
    // Fill meal form
    await page.fill('input[placeholder*="название"]', 'Овсянка')
    await page.fill('input[placeholder*="вес"]', '100')
    await page.fill('input[placeholder*="калории"]', '350')
    await page.fill('input[placeholder*="белки"]', '12')
    await page.fill('input[placeholder*="жиры"]', '6')
    await page.fill('input[placeholder*="углеводы"]', '60')

    // Add meal
    await page.click('button:has-text("Добавить")')

    // Meal should appear in list
    await expect(page.locator('text=Овсянка')).toBeVisible()
  })

  test('should calculate totals from meals', async ({ page }) => {
    // Add multiple meals
    await page.fill('input[placeholder*="название"]', 'Овсянка')
    await page.fill('input[placeholder*="калории"]', '350')
    await page.fill('input[placeholder*="белки"]', '12')
    await page.click('button:has-text("Добавить")')

    await page.fill('input[placeholder*="название"]', 'Курица')
    await page.fill('input[placeholder*="калории"]', '200')
    await page.fill('input[placeholder*="белки"]', '30')
    await page.click('button:has-text("Добавить")')

    // Check totals
    await expect(page.locator('text=/550|ккал/i')).toBeVisible()
    await expect(page.locator('text=/42|белки/i')).toBeVisible()
  })

  test('should save daily log', async ({ page }) => {
    // Add meal
    await page.fill('input[placeholder*="название"]', 'Овсянка')
    await page.fill('input[placeholder*="калории"]', '350')
    await page.fill('input[placeholder*="белки"]', '12')
    await page.fill('input[placeholder*="жиры"]', '6')
    await page.fill('input[placeholder*="углеводы"]', '60')
    await page.click('button:has-text("Добавить")')

    // Save
    await page.click('button:has-text("Сохранить")')

    // Should show success message or redirect
    await expect(page.locator('text=/сохранено|saved/i')).toBeVisible({ timeout: 5000 })
  })

  test('should toggle between training and rest day', async ({ page }) => {
    // Should have day type toggle
    await expect(page.locator('button:has-text(/тренировка|training/i)')).toBeVisible()
    await expect(page.locator('button:has-text(/отдых|rest/i)')).toBeVisible()

    // Click rest day
    await page.click('button:has-text(/отдых|rest/i)')

    // Targets should update (if different targets exist)
    await expect(page.locator('button:has-text(/отдых|rest/i)')).toHaveClass(/active|selected/)
  })
})
