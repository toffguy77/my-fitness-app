import { test, expect } from '../fixtures/session'

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
    await expect(page.getByTestId('nav-item-menu')).toBeVisible()
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

  // Клиент открывает «Меню»: пункт активен и ведёт на /menu.
  test('navigate to menu', async ({ page }) => {
    const menuItem = page.getByTestId('nav-item-menu')
    await expect(menuItem).toBeEnabled()
    await expect(menuItem).toHaveAccessibleName('Меню')
    await menuItem.click()
    await expect(page).toHaveURL(/\/menu/, { timeout: 10000 })
    await expect(page.getByTestId('nav-item-menu')).toHaveAttribute('aria-current', 'page')
  })

  // Заглушки «Тренировка» больше нет.
  test('workout stub is gone', async ({ page }) => {
    await expect(page.getByTestId('footer-navigation')).toBeVisible()
    await expect(page.getByTestId('nav-item-workout')).toHaveCount(0)
    await expect(page.getByTestId('footer-navigation').getByText('Тренировка')).toHaveCount(0)
  })

  test('navigate to food tracker and back to dashboard', async ({ page }) => {
    await page.getByTestId('nav-item-food-tracker').click()
    await expect(page).toHaveURL(/\/food-tracker/, { timeout: 10000 })

    await page.getByTestId('nav-item-dashboard').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })
})
