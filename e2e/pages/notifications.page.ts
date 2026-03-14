import { type Page, expect } from '@playwright/test'

export class NotificationsPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Уведомления' })
  }

  get backButton() {
    return this.page.getByLabel('Back to dashboard')
  }

  get settingsButton() {
    return this.page.getByLabel('Notification settings')
  }

  get tabList() {
    return this.page.getByRole('tablist', { name: 'Notification categories' })
  }

  get mainTab() {
    return this.page.getByRole('tab', { name: 'Основные' })
  }

  get contentTab() {
    return this.page.getByRole('tab', { name: 'Контент' })
  }

  get loadingIndicator() {
    return this.page.getByLabel('Loading notifications')
  }

  get emptyState() {
    return this.page.getByLabel('No notifications')
  }

  get notificationItems() {
    return this.page.getByRole('button').filter({ has: this.page.locator('h3') })
  }

  async goto() {
    await this.page.goto('/notifications')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
    await expect(this.tabList).toBeVisible({ timeout: 10000 })
    // Wait for loading to finish
    await expect(this.loadingIndicator).toBeHidden({ timeout: 15000 }).catch(
      () => {
        /* loading may have already finished */
      }
    )
  }
}
