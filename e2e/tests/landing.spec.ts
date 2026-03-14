import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any auth state for public page testing
    await page.context().clearCookies()
    await page.goto('/')
  })

  test('hero section with heading and CTA', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Трекер питания и фитнеса' })
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Начать бесплатно' })).toBeVisible()
  })

  test('features section is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Всё для контроля питания' })
    ).toBeVisible({ timeout: 15000 })

    // Check feature cards
    await expect(page.getByText('Поиск продуктов')).toBeVisible()
    await expect(page.getByText('Сканер штрих-кодов')).toBeVisible()
    await expect(page.getByText('Дневник питания')).toBeVisible()
  })

  test('how it works section is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Как это работает' })
    ).toBeVisible({ timeout: 15000 })
  })

  test('footer has navigation links', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Статьи' })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole('link', { name: 'Оферта' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Конфиденциальность' })
    ).toBeVisible()
  })

  test('login link navigates to auth', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible({
      timeout: 15000,
    })
    await page.getByRole('link', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })
  })
})
