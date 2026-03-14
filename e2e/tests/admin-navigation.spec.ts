import { test, expect } from '@playwright/test'

test.describe('Admin Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    await expect(
      page.getByRole('heading', { name: 'Панель администратора' })
    ).toBeVisible({ timeout: 15000 })
  })

  test('footer navigation is visible with all items', async ({ page }) => {
    const nav = page.getByTestId('admin-footer-navigation')
    await expect(nav).toBeVisible()

    await expect(page.getByTestId('nav-item-dashboard')).toBeVisible()
    await expect(page.getByTestId('nav-item-users')).toBeVisible()
    await expect(page.getByTestId('nav-item-content')).toBeVisible()
    await expect(page.getByTestId('nav-item-chats')).toBeVisible()
  })

  test('dashboard item is active on admin page', async ({ page }) => {
    const dashboardItem = page.getByTestId('nav-item-dashboard')
    await expect(dashboardItem).toHaveAttribute('aria-current', 'page')
  })

  test('navigate to users', async ({ page }) => {
    await page.getByTestId('nav-item-users').click()
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 10000 })
  })

  test('navigate to content', async ({ page }) => {
    await page.getByTestId('nav-item-content').click()
    await expect(page).toHaveURL(/\/admin\/content/, { timeout: 10000 })
  })

  test('navigate to chats', async ({ page }) => {
    await page.getByTestId('nav-item-chats').click()
    await expect(page).toHaveURL(/\/admin\/chats/, { timeout: 10000 })
  })

  test('navigate to users and back to dashboard', async ({ page }) => {
    await page.getByTestId('nav-item-users').click()
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 10000 })

    await page.getByTestId('nav-item-dashboard').click()
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
  })
})
