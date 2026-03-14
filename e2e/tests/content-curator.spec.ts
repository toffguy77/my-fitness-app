import { test, expect } from '@playwright/test'
import { CuratorContentPage } from '../pages/content.page'

test.describe('Curator Content Management', () => {
  let content: CuratorContentPage

  test.beforeEach(async ({ page }) => {
    content = new CuratorContentPage(page)
    await content.goto()
    await content.expectLoaded()
  })

  test('heading and create button are visible', async () => {
    await expect(content.heading).toBeVisible()
    await expect(content.createArticleButton).toBeVisible()
  })

  test('status filter tabs are visible', async () => {
    await expect(content.allTab).toBeVisible()
    await expect(content.draftsTab).toBeVisible()
    await expect(content.scheduledTab).toBeVisible()
    await expect(content.publishedTab).toBeVisible()
  })

  test('switching status tabs works', async () => {
    await content.draftsTab.click()
    // Should filter to drafts
    await expect(content.heading).toBeVisible()

    await content.publishedTab.click()
    await expect(content.heading).toBeVisible()

    await content.allTab.click()
    await expect(content.heading).toBeVisible()
  })

  test('create article button navigates to editor', async ({ page }) => {
    await content.createArticleButton.click()
    await expect(page).toHaveURL(/\/curator\/content\/new/, { timeout: 10000 })
    await expect(
      page.getByRole('heading', { name: 'Новая статья' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('article editor has required form fields', async ({ page }) => {
    await content.createArticleButton.click()
    await expect(page).toHaveURL(/\/curator\/content\/new/, { timeout: 10000 })

    // Check key form fields
    await expect(page.locator('#article-title')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#article-category')).toBeVisible()
    await expect(page.locator('#article-excerpt')).toBeVisible()
  })
})
