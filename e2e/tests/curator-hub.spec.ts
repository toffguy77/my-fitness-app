import { test, expect } from '@playwright/test'
import { CuratorHubPage } from '../pages/curator-hub.page'

test.describe('Curator Hub', () => {
  let curatorHub: CuratorHubPage

  test.beforeEach(async ({ page }) => {
    curatorHub = new CuratorHubPage(page)
    await curatorHub.goto()
    await curatorHub.expectLoaded()
  })

  test('curator layout is visible', async () => {
    await expect(curatorHub.layout).toBeVisible()
  })

  test('client list section is visible', async () => {
    await expect(curatorHub.clientListSection).toBeVisible()
  })

  test('attention section is visible', async () => {
    await expect(curatorHub.attentionSection).toBeVisible()
  })

  test('clicking a client navigates to client detail', async ({ page }) => {
    // This test may skip if no clients are assigned
    const clientCards = curatorHub.mainContent.locator('button, a').filter({ hasText: /.+/ })
    const count = await clientCards.count()

    if (count > 0) {
      await clientCards.first().click()
      await page.waitForURL('**/curator/clients/**', { timeout: 10000 })
      expect(page.url()).toContain('/curator/clients/')
    }
  })
})
