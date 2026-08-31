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

  get clientCards() {
    return this.page.getByTestId('client-card')
  }

  /**
   * Opens the first client on the hub.
   *
   * Cards are buttons rather than links, and matching them by the text they
   * happen to show ("Калории", "Нет записей") tied the suite to one client's
   * data — none of those strings appear in the card at all. A test hook on the
   * card survives both.
   */
  async openFirstClient() {
    await this.clientCards.first().click()
    await expect(this.page).toHaveURL(/\/curator\/clients\//, { timeout: 10000 })
  }
}
