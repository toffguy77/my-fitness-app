import { test, expect } from '@playwright/test'
import { SettingsNotificationsPage } from '../pages/settings.page'

test.describe('Settings Notifications', () => {
  let notifications: SettingsNotificationsPage

  test.beforeEach(async ({ page }) => {
    notifications = new SettingsNotificationsPage(page)
    await notifications.goto()
    await notifications.expectLoaded()
  })

  test('do not disturb toggle is visible', async () => {
    await expect(notifications.doNotDisturbLabel).toBeVisible()
    await expect(notifications.doNotDisturbSwitch).toBeVisible()
  })

  test('has category toggles', async () => {
    // Wait for switches to load (API call fetches preferences first)
    await expect(notifications.doNotDisturbSwitch).toBeVisible({
      timeout: 10000,
    })

    // Should have at least 2 switches: "do not disturb" + at least 1 category
    const count = await notifications.switches.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('toggling do not disturb disables category switches', async () => {
    const dndSwitch = notifications.doNotDisturbSwitch
    const initialState = await dndSwitch.getAttribute('aria-checked')

    if (initialState === 'false') {
      // Enable DND
      await dndSwitch.click()
      await expect(dndSwitch).toHaveAttribute('aria-checked', 'true')

      // Category switches should be disabled
      const categorySwitches = notifications.switches
      const count = await categorySwitches.count()
      for (let i = 1; i < count; i++) {
        await expect(categorySwitches.nth(i)).toBeDisabled()
      }

      // Restore: disable DND
      await dndSwitch.click()
      await expect(dndSwitch).toHaveAttribute('aria-checked', 'false')
    } else {
      // DND is already on — disable it first
      await dndSwitch.click()
      await expect(dndSwitch).toHaveAttribute('aria-checked', 'false')

      // Category switches should now be enabled
      const categorySwitches = notifications.switches
      const count = await categorySwitches.count()
      for (let i = 1; i < count; i++) {
        await expect(categorySwitches.nth(i)).toBeEnabled()
      }

      // Restore
      await dndSwitch.click()
      await expect(dndSwitch).toHaveAttribute('aria-checked', 'true')
    }
  })
})
