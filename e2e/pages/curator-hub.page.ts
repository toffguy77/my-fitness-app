import { type Page, expect } from '@playwright/test'

export class CuratorHubPage {
  constructor(private page: Page) {}

  get layout() {
    return this.page.getByTestId('curator-layout')
  }

  get mainContent() {
    return this.page.getByTestId('curator-main-content')
  }

  get attentionSection() {
    return this.page.getByText('Требуют внимания').first()
  }

  get clientListSection() {
    return this.page.getByText('Все клиенты').first()
  }

  async goto() {
    await this.page.goto('/curator')
  }

  async expectLoaded() {
    await expect(this.layout).toBeVisible({ timeout: 15000 })
    // Wait for data to load (spinner disappears)
    await expect(this.page.locator('.animate-spin').first()).toBeHidden({ timeout: 10000 }).catch(() => {
      // Spinner may already be gone
    })
  }

  async clickFirstClient() {
    const clientCards = this.mainContent.locator('.rounded-xl.bg-white.shadow-sm')
    const first = clientCards.first()
    await first.click()
  }
}
