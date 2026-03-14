import { type Page, expect } from '@playwright/test'

export class AdminPanelPage {
  constructor(private page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Панель администратора' })
  }

  get usersCard() {
    return this.page.getByText('Пользователей', { exact: true })
  }

  get curatorsCard() {
    return this.page.getByText('Кураторов', { exact: true })
  }

  get clientsCard() {
    return this.page.getByText('Клиентов', { exact: true })
  }

  get curatorLoadSection() {
    return this.page.getByText('Нагрузка кураторов')
  }

  async goto() {
    await this.page.goto('/admin')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }

  async expectStatsVisible() {
    await expect(this.usersCard).toBeVisible()
    await expect(this.curatorsCard).toBeVisible()
    await expect(this.clientsCard).toBeVisible()
  }
}
