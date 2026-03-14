import { test, expect } from '@playwright/test'
import { ProfilePage } from '../pages/profile.page'

test.describe('Profile Page', () => {
  let profile: ProfilePage

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page)
    await profile.goto()
    await profile.expectLoaded()
  })

  test('displays all menu items', async () => {
    await expect(profile.settingsProfileLink).toBeVisible()
    await expect(profile.bodyGoalsLink).toBeVisible()
    await expect(profile.socialAccountsLink).toBeVisible()
    await expect(profile.appleHealthLink).toBeVisible()
    await expect(profile.notificationsLink).toBeVisible()
  })

  test('logout button is visible', async () => {
    await expect(profile.logoutButton).toBeVisible()
  })

  test('navigate to settings profile', async ({ page }) => {
    await profile.settingsProfileLink.click()
    await expect(page).toHaveURL(/\/settings\/profile/, { timeout: 10000 })
  })

  test('navigate to body and goals', async ({ page }) => {
    await profile.bodyGoalsLink.click()
    await expect(page).toHaveURL(/\/settings\/body/, { timeout: 10000 })
  })

  test('navigate to social accounts', async ({ page }) => {
    await profile.socialAccountsLink.click()
    await expect(page).toHaveURL(/\/settings\/social/, { timeout: 10000 })
  })

  test('navigate to notifications settings', async ({ page }) => {
    await profile.notificationsLink.click()
    await expect(page).toHaveURL(/\/settings\/notifications/, { timeout: 10000 })
  })

  test('logout redirects to auth page', async ({ page }) => {
    await profile.logoutButton.click()
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })
  })
})
