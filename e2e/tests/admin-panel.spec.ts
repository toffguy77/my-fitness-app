import { test, expect } from '@playwright/test'
import { AdminPanelPage } from '../pages/admin-panel.page'

test.describe('Admin Panel', () => {
  let adminPanel: AdminPanelPage

  test.beforeEach(async ({ page }) => {
    adminPanel = new AdminPanelPage(page)
    await adminPanel.goto()
    await adminPanel.expectLoaded()
  })

  test('admin heading is visible', async () => {
    await expect(adminPanel.heading).toBeVisible()
  })

  test('stats grid shows all three cards', async () => {
    await adminPanel.expectStatsVisible()
  })

  test('curator load section is visible', async () => {
    await expect(adminPanel.curatorLoadSection).toBeVisible()
  })
})
