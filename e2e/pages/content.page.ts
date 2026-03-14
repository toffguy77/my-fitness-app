import { type Page, expect } from '@playwright/test'

export class ContentFeedPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Статьи' })
  }

  get loadMoreButton() {
    return this.page.getByRole('button', { name: 'Загрузить ещё' })
  }

  get emptyState() {
    return this.page.getByText('Пока нет контента')
  }

  categoryButton(name: string) {
    return this.page.getByRole('button', { name, exact: true })
  }

  get articleCards() {
    return this.page.locator('h3')
  }

  async goto() {
    await this.page.goto('/content')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }
}

export class CuratorContentPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Мой контент' })
  }

  get createArticleButton() {
    return this.page.getByRole('link', { name: 'Создать статью' })
  }

  get emptyState() {
    return this.page.getByText('Статей пока нет')
  }

  // Status tabs
  get allTab() {
    return this.page.getByRole('button', { name: 'Все', exact: true })
  }

  get draftsTab() {
    return this.page.getByRole('button', { name: 'Черновики' })
  }

  get scheduledTab() {
    return this.page.getByRole('button', { name: 'Запланированные' })
  }

  get publishedTab() {
    return this.page.getByRole('button', { name: 'Опубликованные' })
  }

  async goto() {
    await this.page.goto('/curator/content')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }
}
