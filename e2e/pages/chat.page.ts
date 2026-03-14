import { type Page, expect } from '@playwright/test'

export class ClientChatPage {
  constructor(public page: Page) {}

  get messageInput() {
    return this.page.getByPlaceholder('Сообщение...')
  }

  get sendButton() {
    return this.page.getByLabel('Отправить')
  }

  get attachButton() {
    return this.page.getByLabel('Прикрепить файл')
  }

  get noCuratorMessage() {
    return this.page.getByText('Куратор пока не назначен')
  }

  get participantHeading() {
    return this.page.locator('h2')
  }

  async goto() {
    await this.page.goto('/chat')
  }

  async expectLoaded() {
    // Wait for conversation to load: either participant name heading or "no curator"
    await expect(
      this.participantHeading.or(this.noCuratorMessage)
    ).toBeVisible({ timeout: 15000 })
  }
}

export class CuratorChatListPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Чаты' })
  }

  get conversationList() {
    return this.page.locator('ul')
  }

  get emptyState() {
    return this.page.getByText('Нет чатов')
  }

  get loadingState() {
    return this.page.getByText('Загрузка чатов...')
  }

  async goto() {
    await this.page.goto('/curator/chat')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
    // Wait for loading to finish
    await expect(this.loadingState).toBeHidden({ timeout: 10000 }).catch(() => {})
  }

  async clickFirstConversation() {
    const firstItem = this.conversationList.locator('button').first()
    await firstItem.click()
  }
}

export class CuratorChatDetailPage {
  constructor(public page: Page) {}

  get backButton() {
    return this.page.getByLabel('Назад к списку чатов')
  }

  get messageInput() {
    return this.page.getByPlaceholder('Сообщение...')
  }

  get sendButton() {
    return this.page.getByLabel('Отправить')
  }

  get attachButton() {
    return this.page.getByLabel('Прикрепить файл')
  }

  get emptyMessages() {
    return this.page.getByText('Нет сообщений')
  }

  async expectLoaded() {
    await expect(this.backButton).toBeVisible({ timeout: 15000 })
    // Wait for conversation data to load (h2 changes from "Загрузка..." to client name)
    const heading = this.page.locator('h2')
    await expect(heading).toBeVisible({ timeout: 10000 })
    await expect(heading).not.toHaveText('Загрузка...', { timeout: 10000 })
  }
}
