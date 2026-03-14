import { test, expect } from '@playwright/test'
import { NotificationsPage } from '../pages/notifications.page'

test.describe('Notifications', () => {
  let notifications: NotificationsPage

  test.beforeEach(async ({ page }) => {
    notifications = new NotificationsPage(page)
    await notifications.goto()
    await notifications.expectLoaded()
  })

  test('page header with back and settings buttons', async () => {
    await expect(notifications.heading).toBeVisible()
    await expect(notifications.backButton).toBeVisible()
    await expect(notifications.settingsButton).toBeVisible()
  })

  test('tabs for main and content categories', async () => {
    await expect(notifications.mainTab).toBeVisible()
    await expect(notifications.contentTab).toBeVisible()

    // Main tab should be active by default
    await expect(notifications.mainTab).toHaveAttribute('aria-selected', 'true')
  })

  test('switch to content tab', async () => {
    await notifications.contentTab.click()
    await expect(notifications.contentTab).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(notifications.mainTab).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  test('back button navigates to dashboard', async ({ page }) => {
    await notifications.backButton.click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })

  test('settings button navigates to notification settings', async ({
    page,
  }) => {
    await notifications.settingsButton.click()
    await expect(page).toHaveURL(/\/settings\/notifications/, {
      timeout: 10000,
    })
  })

  test('notification list or empty state is shown', async ({ page }) => {
    // After loading, either notification items or empty state should appear
    // Notification items are buttons with h3 headings inside the tabpanel
    const tabpanel = page.getByRole('tabpanel')
    const firstNotification = tabpanel.getByRole('button').first()
    const emptyState = page.getByLabel('No notifications')

    await expect(firstNotification.or(emptyState)).toBeVisible({
      timeout: 15000,
    })
  })
})
