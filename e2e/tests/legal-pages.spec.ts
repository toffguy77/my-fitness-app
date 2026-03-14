import { test, expect } from '@playwright/test'

test.describe('Legal Pages', () => {
  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/legal/privacy')
    await expect(
      page.getByRole('heading', { name: 'Политика конфиденциальности' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('privacy policy has key sections', async ({ page }) => {
    await page.goto('/legal/privacy')
    await expect(
      page.getByRole('heading', { name: 'Политика конфиденциальности' })
    ).toBeVisible({ timeout: 10000 })

    // Check key sections exist
    await expect(
      page.getByRole('heading', { name: '1. Общие положения' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '2. Какие данные мы собираем' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '8. Ваши права' })
    ).toBeVisible()
  })

  test('privacy policy has contact email', async ({ page }) => {
    await page.goto('/legal/privacy')
    await expect(page.getByText('privacy@burcev.team').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('terms of service page loads', async ({ page }) => {
    await page.goto('/legal/terms')
    await expect(
      page.getByRole('heading', { name: 'Договор публичной оферты' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('terms has key sections', async ({ page }) => {
    await page.goto('/legal/terms')
    await expect(
      page.getByRole('heading', { name: 'Договор публичной оферты' })
    ).toBeVisible({ timeout: 10000 })

    await expect(
      page.getByRole('heading', { name: '1. Общие положения' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '2. Предмет договора' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '7. Заключительные положения' })
    ).toBeVisible()
  })

  test('terms has company info', async ({ page }) => {
    await page.goto('/legal/terms')
    await expect(page.getByText('legal@burcev.team')).toBeVisible({
      timeout: 10000,
    })
  })
})
