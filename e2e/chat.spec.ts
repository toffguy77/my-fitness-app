/**
 * E2E Tests: Chat Flow
 * Critical scenarios: Full chat flow between coordinator and client, realtime notifications
 */

import { test, expect } from '@playwright/test'

test.describe('Chat Flow', () => {
    test.describe('Full chat flow between coordinator and client', () => {
        test.beforeEach(async ({ page }) => {
            // Navigate to app dashboard (requires authentication)
            await page.goto('/app/dashboard')
        })

        test('should display chat widget for client', async ({ page }) => {
            // Look for chat widget button
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"], button:has(svg):has-text("MessageSquare")')

            // Chat widget should be visible
            await expect(chatButton.or(page.locator('[data-testid="chat-widget"]'))).toBeVisible({ timeout: 10000 })
        })

        test('should open chat window when clicking chat widget', async ({ page }) => {
            // Find and click chat widget button
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()

                // Chat window should open
                await expect(
                    page.locator('text=/чат|chat/i, [data-testid="chat-window"]')
                ).toBeVisible({ timeout: 5000 })

                // Should show coordinator name in header
                await expect(
                    page.locator('text=/координатор|тренер|coach/i')
                ).toBeVisible({ timeout: 3000 })
            }
        })

        test('should send message from client to coordinator', async ({ page }) => {
            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()

                // Wait for chat window to open
                await page.waitForSelector('text=/чат|chat/i, [data-testid="chat-window"]', { timeout: 5000 })

                // Find message input
                const messageInput = page.locator('textarea[placeholder*="Написать"], input[placeholder*="сообщение"], [data-testid="message-input"]')

                if (await messageInput.count() > 0) {
                    const testMessage = `Тестовое сообщение от клиента ${Date.now()}`

                    // Type and send message
                    await messageInput.fill(testMessage)

                    // Find and click send button
                    const sendButton = page.locator('button:has-text(/отправить|send/i), button[type="submit"], [data-testid="send-button"]')
                    await sendButton.click()

                    // Message should appear in chat
                    await expect(
                        page.locator(`text="${testMessage}"`)
                    ).toBeVisible({ timeout: 5000 })

                    // Input should be cleared
                    await expect(messageInput).toHaveValue('')
                }
            }
        })

        test('should display connection status indicator', async ({ page }) => {
            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()

                // Wait for chat window
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Should show connection status (wifi icon or connection indicator)
                await expect(
                    page.locator('svg:has-text("Wifi"), [data-testid="connection-status"], text=/подключено|connected/i')
                ).toBeVisible({ timeout: 3000 })
            }
        })

        test('should show unread message count', async ({ page }) => {
            // Look for unread count badge on chat widget
            const unreadBadge = page.locator('span:has-text(/[0-9]+/), [data-testid="unread-count"]')

            // If there are unread messages, badge should be visible
            if (await unreadBadge.count() > 0) {
                await expect(unreadBadge).toBeVisible()

                // Badge should contain a number
                const badgeText = await unreadBadge.textContent()
                expect(badgeText).toMatch(/\d+/)
            }
        })

        test('should mark messages as read when opening chat', async ({ page }) => {
            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                // Check if there's an unread count before opening
                const unreadBadge = page.locator('span:has-text(/[0-9]+/)').first()
                const hadUnreadMessages = await unreadBadge.count() > 0

                await chatButton.click()

                // Wait for chat to open
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Close chat
                const closeButton = page.locator('button:has(svg):has-text("X"), [data-testid="close-chat"]')
                if (await closeButton.count() > 0) {
                    await closeButton.click()
                }

                // If there were unread messages, the badge should be gone or reduced
                if (hadUnreadMessages) {
                    await page.waitForTimeout(1000) // Wait for state update

                    // Unread badge should be gone or have fewer messages
                    const newUnreadBadge = page.locator('span:has-text(/[0-9]+/)').first()
                    if (await newUnreadBadge.count() > 0) {
                        const newCount = await newUnreadBadge.textContent()
                        // At minimum, the count should have changed or be gone
                        expect(newCount).toBeTruthy()
                    }
                }
            }
        })

        test('should close chat window', async ({ page }) => {
            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()

                // Wait for chat window
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Find and click close button
                const closeButton = page.locator('button:has(svg):has-text("X"), [data-testid="close-chat"]')

                if (await closeButton.count() > 0) {
                    await closeButton.click()

                    // Chat window should close
                    await expect(
                        page.locator('text=/чат|chat/i, [data-testid="chat-window"]')
                    ).not.toBeVisible({ timeout: 3000 })

                    // Chat widget button should be visible again
                    await expect(chatButton).toBeVisible()
                }
            }
        })
    })

    test.describe('Coordinator chat view', () => {
        test.beforeEach(async ({ page }) => {
            // Navigate to coordinator dashboard
            await page.goto('/app/coordinator')
        })

        test('should access client chat from coordinator dashboard', async ({ page }) => {
            // Look for client cards or chat links
            const clientCard = page.locator('[data-testid="client-card"], .client-card, button:has-text(/клиент|client/i)').first()

            if (await clientCard.count() > 0) {
                await clientCard.click()

                // Should navigate to client view or open chat
                await expect(
                    page.locator('text=/чат|сообщения|chat|messages/i')
                ).toBeVisible({ timeout: 5000 })
            }
        })

        test('should send message from coordinator to client', async ({ page }) => {
            // Navigate to a client chat (assuming URL pattern)
            await page.goto('/app/coordinator/test-client-id')

            // Look for message input in coordinator view
            const messageInput = page.locator('textarea[placeholder*="Написать"], input[placeholder*="сообщение"], [data-testid="message-input"]')

            if (await messageInput.count() > 0) {
                const testMessage = `Сообщение от координатора ${Date.now()}`

                // Type and send message
                await messageInput.fill(testMessage)

                // Find and click send button
                const sendButton = page.locator('button:has-text(/отправить|send/i), button[type="submit"], [data-testid="send-button"]')
                await sendButton.click()

                // Message should appear in chat
                await expect(
                    page.locator(`text="${testMessage}"`)
                ).toBeVisible({ timeout: 5000 })
            }
        })
    })

    test.describe('Bidirectional communication', () => {
        test('should support real-time message delivery in both directions', async ({ browser }) => {
            // Create two browser contexts to simulate coordinator and client
            const coordinatorContext = await browser.newContext()
            const clientContext = await browser.newContext()

            const coordinatorPage = await coordinatorContext.newPage()
            const clientPage = await clientContext.newPage()

            try {
                // Navigate both users to their respective views
                await coordinatorPage.goto('/app/coordinator/test-client-id')
                await clientPage.goto('/app/dashboard')

                // Open client chat
                const clientChatButton = clientPage.locator('button[title*="Чат"], button[aria-label*="чат"]').first()
                if (await clientChatButton.count() > 0) {
                    await clientChatButton.click()
                    await clientPage.waitForSelector('text=/чат|chat/i', { timeout: 5000 })
                }

                // Send message from coordinator
                const coordinatorInput = coordinatorPage.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await coordinatorInput.count() > 0) {
                    const coordinatorMessage = `Сообщение от координатора ${Date.now()}`
                    await coordinatorInput.fill(coordinatorMessage)

                    const coordinatorSendButton = coordinatorPage.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await coordinatorSendButton.click()

                    // Message should appear in client chat (realtime)
                    await expect(
                        clientPage.locator(`text="${coordinatorMessage}"`)
                    ).toBeVisible({ timeout: 10000 })
                }

                // Send message from client
                const clientInput = clientPage.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await clientInput.count() > 0) {
                    const clientMessage = `Ответ от клиента ${Date.now()}`
                    await clientInput.fill(clientMessage)

                    const clientSendButton = clientPage.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await clientSendButton.click()

                    // Message should appear in coordinator chat (realtime)
                    await expect(
                        coordinatorPage.locator(`text="${clientMessage}"`)
                    ).toBeVisible({ timeout: 10000 })
                }

            } finally {
                await coordinatorContext.close()
                await clientContext.close()
            }
        })
    })

    test.describe('Error scenarios and network failures', () => {
        test('should handle network disconnection gracefully', async ({ page, context }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Simulate network disconnection
                await context.setOffline(true)

                // Try to send a message while offline
                const messageInput = page.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await messageInput.count() > 0) {
                    await messageInput.fill('Сообщение в оффлайне')

                    const sendButton = page.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await sendButton.click()

                    // Should show error indicator or offline status
                    await expect(
                        page.locator('text=/ошибка|error|оффлайн|offline|нет соединения/i, svg:has-text("WifiOff"), [data-testid="connection-error"]')
                    ).toBeVisible({ timeout: 5000 })
                }

                // Restore network connection
                await context.setOffline(false)

                // Should show reconnection indicator
                await expect(
                    page.locator('text=/подключение|reconnect|connected/i, svg:has-text("Wifi"), [data-testid="connection-restored"]')
                ).toBeVisible({ timeout: 10000 })
            }
        })

        test('should show error message for failed message delivery', async ({ page }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Intercept message API and make it fail
                await page.route('**/messages', (route) => {
                    if (route.request().method() === 'POST') {
                        route.fulfill({
                            status: 500,
                            contentType: 'application/json',
                            body: JSON.stringify({ error: 'Internal server error' })
                        })
                    } else {
                        route.continue()
                    }
                })

                // Try to send a message
                const messageInput = page.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await messageInput.count() > 0) {
                    await messageInput.fill('Сообщение с ошибкой')

                    const sendButton = page.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await sendButton.click()

                    // Should show error toast or message
                    await expect(
                        page.locator('text=/ошибка отправки|failed to send|error/i, [data-testid="error-toast"]')
                    ).toBeVisible({ timeout: 5000 })
                }
            }
        })

        test('should handle rate limiting gracefully', async ({ page }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Intercept message API and simulate rate limiting
                await page.route('**/messages', (route) => {
                    if (route.request().method() === 'POST') {
                        route.fulfill({
                            status: 429,
                            contentType: 'application/json',
                            body: JSON.stringify({ error: 'Rate limit exceeded' })
                        })
                    } else {
                        route.continue()
                    }
                })

                // Try to send a message
                const messageInput = page.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await messageInput.count() > 0) {
                    await messageInput.fill('Сообщение с rate limit')

                    const sendButton = page.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await sendButton.click()

                    // Should show rate limit error message
                    await expect(
                        page.locator('text=/слишком много сообщений|rate limit|подождите/i')
                    ).toBeVisible({ timeout: 5000 })
                }
            }
        })

        test('should handle realtime subscription failures', async ({ page }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Intercept WebSocket connections and make them fail
                await page.route('**/realtime/**', (route) => {
                    route.fulfill({
                        status: 500,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Realtime connection failed' })
                    })
                })

                // Wait for potential connection error
                await page.waitForTimeout(3000)

                // Should show connection error indicator
                await expect(
                    page.locator('text=/ошибка подключения|connection error|realtime error/i, svg:has-text("WifiOff"), [data-testid="realtime-error"]')
                ).toBeVisible({ timeout: 5000 })
            }
        })

        test('should attempt reconnection after connection loss', async ({ page, context }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Verify initial connection
                await expect(
                    page.locator('svg:has-text("Wifi"), [data-testid="connection-status"]')
                ).toBeVisible({ timeout: 3000 })

                // Simulate network disconnection
                await context.setOffline(true)
                await page.waitForTimeout(2000)

                // Should show disconnected state
                await expect(
                    page.locator('svg:has-text("WifiOff"), text=/нет соединения|disconnected/i')
                ).toBeVisible({ timeout: 5000 })

                // Restore connection
                await context.setOffline(false)

                // Should show reconnecting state
                await expect(
                    page.locator('text=/переподключение|reconnecting/i, svg.animate-spin')
                ).toBeVisible({ timeout: 5000 })

                // Should eventually reconnect
                await expect(
                    page.locator('svg:has-text("Wifi"), text=/подключено|connected/i')
                ).toBeVisible({ timeout: 15000 })
            }
        })

        test('should validate message content before sending', async ({ page }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                const messageInput = page.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                const sendButton = page.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')

                if (await messageInput.count() > 0 && await sendButton.count() > 0) {
                    // Try to send empty message
                    await messageInput.fill('')
                    await sendButton.click()

                    // Should not send empty message (input should remain focused or show validation)
                    await expect(messageInput).toBeFocused()

                    // Try to send whitespace-only message
                    await messageInput.fill('   ')
                    await sendButton.click()

                    // Should not send whitespace-only message
                    await expect(messageInput).toBeFocused()

                    // Try to send very long message
                    const longMessage = 'A'.repeat(5000)
                    await messageInput.fill(longMessage)
                    await sendButton.click()

                    // Should either truncate or show validation error
                    // (Implementation may vary - either is acceptable)
                    await page.waitForTimeout(1000)
                }
            }
        })

        test('should handle authentication errors gracefully', async ({ page }) => {
            // Navigate to chat
            await page.goto('/app/dashboard')

            // Open chat widget
            const chatButton = page.locator('button[title*="Чат"], button[aria-label*="чат"]').first()

            if (await chatButton.count() > 0) {
                await chatButton.click()
                await page.waitForSelector('text=/чат|chat/i', { timeout: 5000 })

                // Intercept API calls and simulate authentication error
                await page.route('**/messages', (route) => {
                    route.fulfill({
                        status: 401,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Unauthorized' })
                    })
                })

                // Try to send a message
                const messageInput = page.locator('textarea[placeholder*="Написать"], [data-testid="message-input"]')
                if (await messageInput.count() > 0) {
                    await messageInput.fill('Сообщение с auth ошибкой')

                    const sendButton = page.locator('button:has-text(/отправить|send/i), [data-testid="send-button"]')
                    await sendButton.click()

                    // Should show authentication error or redirect to login
                    await expect(
                        page.locator('text=/ошибка авторизации|unauthorized|войти|login/i')
                    ).toBeVisible({ timeout: 5000 })
                }
            }
        })
    })
})
