import { test, expect } from '@playwright/test'
import { SettingsSocialPage } from '../pages/settings.page'

test.describe('Settings Social Accounts', () => {
  let social: SettingsSocialPage

  test.beforeEach(async ({ page }) => {
    social = new SettingsSocialPage(page)
    await social.goto()
    await social.expectLoaded()
  })

  test('telegram and instagram inputs are visible', async () => {
    await expect(social.telegramInput).toBeVisible()
    await expect(social.instagramInput).toBeVisible()
  })

  test('save button is visible', async () => {
    await expect(social.saveButton).toBeVisible()
  })

  test('inputs have correct placeholders', async () => {
    await expect(social.telegramInput).toHaveAttribute(
      'placeholder',
      '@username'
    )
    await expect(social.instagramInput).toHaveAttribute(
      'placeholder',
      '@profile'
    )
  })
})
