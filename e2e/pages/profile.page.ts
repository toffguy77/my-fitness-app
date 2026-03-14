import { type Page, expect } from '@playwright/test'

export class ProfilePage {
  constructor(public page: Page) {}

  get avatar() {
    return this.page.locator('img[alt*="Avatar"], img[alt*="avatar"]').first()
  }

  get userName() {
    return this.page.locator('text-xl, .text-xl').first()
  }

  get userEmail() {
    return this.page.locator('text-sm, .text-sm').first()
  }

  get settingsProfileLink() {
    return this.page.getByText('Настройки профиля')
  }

  get bodyGoalsLink() {
    return this.page.getByText('Тело и цели')
  }

  get socialAccountsLink() {
    return this.page.getByText('Аккаунты социальных сетей')
  }

  get appleHealthLink() {
    return this.page.getByText('Apple Health')
  }

  get notificationsLink() {
    return this.page.getByText('Уведомления')
  }

  get logoutButton() {
    return this.page.getByText('Выйти из аккаунта')
  }

  async goto() {
    await this.page.goto('/profile')
  }

  async expectLoaded() {
    await expect(this.settingsProfileLink).toBeVisible({ timeout: 15000 })
  }
}
