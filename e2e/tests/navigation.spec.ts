import { test, expect } from '@playwright/test'

test.describe('Client Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-layout')).toBeVisible({
      timeout: 15000,
    })
  })

  test('footer navigation is visible with all items', async ({ page }) => {
    const nav = page.getByTestId('footer-navigation')
    await expect(nav).toBeVisible()

    await expect(page.getByTestId('nav-item-dashboard')).toBeVisible()
    await expect(page.getByTestId('nav-item-food-tracker')).toBeVisible()
    await expect(page.getByTestId('nav-item-workout')).toBeVisible()
    await expect(page.getByTestId('nav-item-chat')).toBeVisible()
    await expect(page.getByTestId('nav-item-content')).toBeVisible()
  })

  test('active state shows on current page', async ({ page }) => {
    const dashboardItem = page.getByTestId('nav-item-dashboard')
    await expect(dashboardItem).toHaveAttribute('aria-current', 'page')
  })

  test('navigate to food tracker', async ({ page }) => {
    await page.getByTestId('nav-item-food-tracker').click()
    await expect(page).toHaveURL(/\/food-tracker/, { timeout: 10000 })
  })

  test('navigate to chat', async ({ page }) => {
    await page.getByTestId('nav-item-chat').click()
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })
  })

  test('navigate to content', async ({ page }) => {
    await page.getByTestId('nav-item-content').click()
    await expect(page).toHaveURL(/\/content/, { timeout: 10000 })
  })

  test('workout button is disabled', async ({ page }) => {
    const workoutItem = page.getByTestId('nav-item-workout')
    await expect(workoutItem).toBeDisabled()
  })

  test('navigate to food tracker and back to dashboard', async ({ page }) => {
    await page.getByTestId('nav-item-food-tracker').click()
    await expect(page).toHaveURL(/\/food-tracker/, { timeout: 10000 })

    await page.getByTestId('nav-item-dashboard').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })
})
