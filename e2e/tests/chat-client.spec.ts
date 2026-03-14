import { test, expect } from '@playwright/test'
import { ClientChatPage } from '../pages/chat.page'

test.describe('Client Chat', () => {
  let chat: ClientChatPage

  test.beforeEach(async ({ page }) => {
    chat = new ClientChatPage(page)
    await chat.goto()
    await chat.expectLoaded()
  })

  test('chat input and buttons are visible', async () => {
    await expect(chat.messageInput).toBeVisible()
    await expect(chat.attachButton).toBeVisible()
    await expect(chat.sendButton).toBeVisible()
  })

  test('send button is disabled when input is empty', async () => {
    await expect(chat.sendButton).toBeDisabled()
  })

  test('send button enables when text is entered', async () => {
    await chat.messageInput.fill('test')
    await expect(chat.sendButton).toBeEnabled()
  })

  test('send a text message', async ({ page }) => {
    const message = `e2e-test-${Date.now()}`
    await chat.messageInput.fill(message)
    await chat.sendButton.click()

    // Input should be cleared after sending
    await expect(chat.messageInput).toHaveValue('')

    // Message should appear in the chat
    await expect(page.getByText(message)).toBeVisible({ timeout: 10000 })
  })

  test('participant name is shown in header', async () => {
    await expect(chat.participantHeading).toBeVisible()
    // Should show curator name, not loading text
    await expect(chat.participantHeading).not.toHaveText('')
  })
})
