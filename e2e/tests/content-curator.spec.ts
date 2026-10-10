import { test, expect, signIn, asUser } from '../fixtures/session'
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

/**
 * «Редактировать» прямо со страницы статьи.
 *
 * Раньше править статью можно было только из списка в кабинете, а на странице
 * статьи кнопки не было вовсе. Сохранение здесь не нажимается: тело статьи
 * лежит в S3, а у прогона хранилища нет. Возврат на статью после сохранения
 * проверяют тесты страниц редактора.
 */
test.describe('Editing from the article page', () => {
  let articleId = ''
  let slug = ''
  const title = `Правка со страницы ${Date.now()}`

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext()
    const token = await signIn(context, baseURL!, 'curator')
    const headers = { ...asUser(token), 'content-type': 'application/json' }

    const created = await context.request.post(`${baseURL}/api/v1/content/articles`, {
      headers,
      data: { title, excerpt: 'Анонс', category: 'nutrition', audience_scope: 'all' },
    })
    expect(created.ok(), `статью не создать: ${await created.text()}`).toBeTruthy()
    const body = await created.json()
    articleId = body.data.id
    slug = body.data.slug

    const published = await context.request.post(`${baseURL}/api/v1/content/articles/${articleId}/publish`, { headers })
    expect(published.ok(), `статью не опубликовать: ${await published.text()}`).toBeTruthy()
    await context.close()
  })

  test.afterAll(async ({ browser, baseURL }) => {
    if (!articleId) return
    const context = await browser.newContext()
    const token = await signIn(context, baseURL!, 'curator')
    await context.request.delete(`${baseURL}/api/v1/content/articles/${articleId}`, { headers: asUser(token) })
    await context.close()
  })

  test('opens the editor of this article, set to return to it', async ({ page }) => {
    await page.goto(`/content/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)

    await page.getByRole('link', { name: 'Редактировать' }).click()

    await expect(page).toHaveURL(
      new RegExp(`/curator/content/${articleId}/edit\\?from=${encodeURIComponent(`/content/${slug}`)}$`),
      { timeout: 10000 },
    )
    await expect(page.locator('#article-title')).toHaveValue(title, { timeout: 10000 })

    // Превью — та же страница статьи, что видит читатель.
    await page.getByRole('tab', { name: 'Превью' }).click()
    await expect(page.getByRole('tabpanel').getByRole('heading', { level: 1 })).toHaveText(title)
  })
})
