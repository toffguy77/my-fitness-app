import { test, expect } from '@playwright/test'
import {
  CuratorChatListPage,
  CuratorChatDetailPage,
} from '../pages/chat.page'

test.describe('Curator Chat List', () => {
  let chatList: CuratorChatListPage

  test.beforeEach(async ({ page }) => {
    chatList = new CuratorChatListPage(page)
    await chatList.goto()
    await chatList.expectLoaded()
  })

  test('chat list heading is visible', async () => {
    await expect(chatList.heading).toBeVisible()
  })

  test('conversation list or empty state is shown', async () => {
    const firstConversation = chatList.conversationList
      .locator('button')
      .first()
    await expect(
      firstConversation.or(chatList.emptyState)
    ).toBeVisible({ timeout: 10000 })
  })

  test('click conversation navigates to chat detail', async ({ page }) => {
    const firstConversation = chatList.conversationList
      .locator('button')
      .first()
    const hasConversations = await firstConversation
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (!hasConversations) {
      test.skip()
      return
    }

    await firstConversation.click()
    await expect(page).toHaveURL(/\/curator\/chat\/\d+/, { timeout: 10000 })
  })
})

test.describe('Curator Chat Detail', () => {
  let chatList: CuratorChatListPage
  let chatDetail: CuratorChatDetailPage

  test.beforeEach(async ({ page }) => {
    chatList = new CuratorChatListPage(page)
    chatDetail = new CuratorChatDetailPage(page)

    // Navigate to first conversation
    await chatList.goto()
    await chatList.expectLoaded()

    const firstConversation = chatList.conversationList
      .locator('button')
      .first()
    const hasConversations = await firstConversation
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (!hasConversations) {
      test.skip()
      return
    }

    await firstConversation.click()
    await chatDetail.expectLoaded()
  })

  test('chat detail has back button and input', async () => {
    await expect(chatDetail.backButton).toBeVisible()
    await expect(chatDetail.messageInput).toBeVisible()
    await expect(chatDetail.sendButton).toBeVisible()
    await expect(chatDetail.attachButton).toBeVisible()
  })

  test('client name is shown in header', async ({ page }) => {
    // Header should show client name (h2)
    const clientName = page.locator('h2')
    await expect(clientName).toBeVisible()
    await expect(clientName).not.toHaveText('Загрузка...')
  })

  test('back button returns to chat list', async ({ page }) => {
    await chatDetail.backButton.click()
    await expect(page).toHaveURL(/\/curator\/chat$/, { timeout: 10000 })
  })

  test('send a text message', async ({ page }) => {
    const message = `curator-e2e-${Date.now()}`
    await chatDetail.messageInput.fill(message)
    await chatDetail.sendButton.click()

    await expect(chatDetail.messageInput).toHaveValue('')
    await expect(page.getByText(message)).toBeVisible({ timeout: 10000 })
  })
})
