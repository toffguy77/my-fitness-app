import { test, expect } from '@playwright/test'

test.describe('Curator Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/curator')
    await expect(page.getByTestId('curator-layout')).toBeVisible({
      timeout: 15000,
    })
  })

  test('footer navigation is visible with all items', async ({ page }) => {
    const nav = page.getByTestId('curator-footer-navigation')
    await expect(nav).toBeVisible()

    await expect(page.getByTestId('nav-item-hub')).toBeVisible()
    await expect(page.getByTestId('nav-item-chats')).toBeVisible()
    await expect(page.getByTestId('nav-item-content')).toBeVisible()
  })

  test('hub item is active on curator page', async ({ page }) => {
    const hubItem = page.getByTestId('nav-item-hub')
    await expect(hubItem).toHaveAttribute('aria-current', 'page')
  })

  test('navigate to chats', async ({ page }) => {
    await page.getByTestId('nav-item-chats').click()
    await expect(page).toHaveURL(/\/curator\/chat/, { timeout: 10000 })
  })

  test('navigate to content', async ({ page }) => {
    await page.getByTestId('nav-item-content').click()
    await expect(page).toHaveURL(/\/curator\/content/, { timeout: 10000 })
  })

  test('navigate to chats and back to hub', async ({ page }) => {
    await page.getByTestId('nav-item-chats').click()
    await expect(page).toHaveURL(/\/curator\/chat/, { timeout: 10000 })

    await page.getByTestId('nav-item-hub').click()
    await expect(page).toHaveURL(/\/curator$/, { timeout: 10000 })
  })
})
