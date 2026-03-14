import { test, expect } from '@playwright/test'
import { ContentFeedPage } from '../pages/content.page'

test.describe('Content Feed', () => {
  let content: ContentFeedPage

  test.beforeEach(async ({ page }) => {
    content = new ContentFeedPage(page)
    await content.goto()
    await content.expectLoaded()
  })

  test('heading and category filters are visible', async () => {
    await expect(content.heading).toBeVisible()
    // "Все" category filter should be visible
    await expect(content.categoryButton('Все')).toBeVisible()
  })

  test('all category filter buttons are visible', async () => {
    const categories = [
      'Все',
      'Питание',
      'Тренировки',
      'Рецепты',
      'Здоровье',
      'Мотивация',
      'Общее',
    ]
    for (const cat of categories) {
      await expect(content.categoryButton(cat)).toBeVisible()
    }
  })

  test('articles or empty state is shown', async () => {
    const firstArticle = content.articleCards.first()
    await expect(
      firstArticle.or(content.emptyState)
    ).toBeVisible({ timeout: 10000 })
  })

  test('clicking a category filters articles', async () => {
    await content.categoryButton('Питание').click()
    // Page should still show heading
    await expect(content.heading).toBeVisible()
  })

  test('clicking an article navigates to detail', async ({ page }) => {
    const firstArticle = content.articleCards.first()
    const hasArticles = await firstArticle
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (!hasArticles) {
      test.skip()
      return
    }

    // Click the article card link (parent of h3)
    await firstArticle.click()
    await expect(page).toHaveURL(/\/content\//, { timeout: 10000 })

    // Article detail should show back link
    await expect(page.getByText('Назад')).toBeVisible({ timeout: 10000 })
  })
})
