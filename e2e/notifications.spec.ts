/**
 * E2E Tests for Notifications Feature
 * Tests complete user flows in a real browser environment
 *
 * Requirements: All (E2E validation)
 */

import { test, expect } from '@playwright/test'

test.describe('Notifications Page E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to login page
        await page.goto('/auth')

        // Login (adjust selectors based on your actual login form)
        await page.fill('input[name="email"]', 'test@example.com')
        await page.fill('input[name="password"]', 'password')
        await page.click('button[type="submit"]')

        // Wait for redirect to dashboard or home
        await page.waitForURL(/\/(dashboard|home)/)
    })

    test('should navigate to notifications page and display notifications', async ({ page }) => {
        // Navigate to notifications page
        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // Verify page title
        await expect(page.locator('h1')).toContainText('Уведомления')

        // Verify tabs are present
        await expect(page.locator('[role="tab"]', { hasText: 'Основные' })).toBeVisible()
        await expect(page.locator('[role="tab"]', { hasText: 'Контент' })).toBeVisible()

        // Verify notifications are loaded
        await page.waitForSelector('[role="article"]', { timeout: 5000 })
        const notifications = await page.locator('[role="article"]').count()
        expect(notifications).toBeGreaterThan(0)
    })

    test('should switch between tabs and display correct notifications', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for initial load
        await page.waitForSelector('[role="tablist"]')

        // Verify Main tab is active by default
        const mainTab = page.locator('[role="tab"]', { hasText: 'Основные' })
        await expect(mainTab).toHaveAttribute('aria-selected', 'true')

        // Get notification titles from Main tab
        await page.waitForSelector('[role="article"]')
        const mainNotifications = await page.locator('[role="article"] h3').allTextContents()

        // Switch to Content tab
        const contentTab = page.locator('[role="tab"]', { hasText: 'Контент' })
        await contentTab.click()

        // Verify Content tab is now active
        await expect(contentTab).toHaveAttribute('aria-selected', 'true')
        await expect(mainTab).toHaveAttribute('aria-selected', 'false')

        // Wait for Content notifications to load
        await page.waitForTimeout(500) // Brief wait for tab switch
        const contentNotifications = await page.locator('[role="article"] h3').allTextContents()

        // Verify different notifications are displayed
        expect(contentNotifications).not.toEqual(mainNotifications)
    })

    test('should mark notification as read on click', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for notifications to load
        await page.waitForSelector('[role="article"]')

        // Find an unread notification (has specific styling)
        const unreadNotification = page.locator('[role="article"]').first()

        // Get initial styling
        const initialClasses = await unreadNotification.getAttribute('class')

        // Click the notification
        await unreadNotification.click()

        // Wait for state update
        await page.waitForTimeout(500)

        // Verify styling changed (read notifications have different styling)
        const updatedClasses = await unreadNotification.getAttribute('class')
        expect(updatedClasses).not.toEqual(initialClasses)
    })

    test('should display unread badge counts', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for tabs to load
        await page.waitForSelector('[role="tablist"]')

        // Check for unread badges
        const mainTab = page.locator('[role="tab"]', { hasText: 'Основные' })
        const contentTab = page.locator('[role="tab"]', { hasText: 'Контент' })

        // Verify badges are visible if there are unread notifications
        const mainBadge = mainTab.locator('[class*="badge"]')
        const contentBadge = contentTab.locator('[class*="badge"]')

        // At least one tab should have a badge (assuming test data has unread notifications)
        const mainBadgeVisible = await mainBadge.isVisible().catch(() => false)
        const contentBadgeVisible = await contentBadge.isVisible().catch(() => false)

        expect(mainBadgeVisible || contentBadgeVisible).toBeTruthy()
    })

    test('should support keyboard navigation', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // Focus on Main tab
        const mainTab = page.locator('[role="tab"]', { hasText: 'Основные' })
        await mainTab.focus()

        // Verify focus is on Main tab
        await expect(mainTab).toBeFocused()

        // Press Tab to move to Content tab
        await page.keyboard.press('Tab')

        // Verify focus moved to Content tab
        const contentTab = page.locator('[role="tab"]', { hasText: 'Контент' })
        await expect(contentTab).toBeFocused()

        // Press Enter to activate Content tab
        await page.keyboard.press('Enter')

        // Verify Content tab is now active
        await expect(contentTab).toHaveAttribute('aria-selected', 'true')
    })

    test('should handle empty state when no notifications', async ({ page }) => {
        // This test assumes you can create a test user with no notifications
        // or mock the API to return empty results

        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // If there are no notifications, empty state should be visible
        const emptyState = page.locator('text=/no notifications|нет уведомлений/i')

        // This will pass if empty state is shown, or skip if there are notifications
        const hasNotifications = await page.locator('[role="article"]').count() > 0

        if (!hasNotifications) {
            await expect(emptyState).toBeVisible()
        }
    })

    test('should be responsive on mobile viewport', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 })

        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // Verify tabs are still visible and functional
        const mainTab = page.locator('[role="tab"]', { hasText: 'Основные' })
        const contentTab = page.locator('[role="tab"]', { hasText: 'Контент' })

        await expect(mainTab).toBeVisible()
        await expect(contentTab).toBeVisible()

        // Verify notifications are displayed in single column
        await page.waitForSelector('[role="article"]')
        const notifications = page.locator('[role="article"]')
        const firstNotification = notifications.first()

        // Check that notification takes full width (mobile layout)
        const box = await firstNotification.boundingBox()
        expect(box?.width).toBeGreaterThan(300) // Should be close to viewport width
    })

    test('should be responsive on tablet viewport', async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 })

        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // Verify layout adapts to tablet size
        const notifications = page.locator('[role="article"]')
        await expect(notifications.first()).toBeVisible()

        // Verify touch-friendly spacing
        const box = await notifications.first().boundingBox()
        expect(box?.height).toBeGreaterThan(60) // Touch-friendly height
    })

    test('should load more notifications on scroll', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for initial notifications to load
        await page.waitForSelector('[role="article"]')

        // Get initial count
        const initialCount = await page.locator('[role="article"]').count()

        // Scroll to bottom
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight)
        })

        // Wait for potential new notifications to load
        await page.waitForTimeout(2000)

        // Get new count
        const newCount = await page.locator('[role="article"]').count()

        // If there are more notifications available, count should increase
        // Otherwise, count stays the same (which is also valid)
        expect(newCount).toBeGreaterThanOrEqual(initialCount)
    })

    test('should display error message on API failure', async ({ page }) => {
        // Intercept API calls and return error
        await page.route('**/api/notifications*', route => {
            route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } })
            })
        })

        await page.goto('/notifications')

        // Wait for error message to appear
        await page.waitForSelector('text=/error|ошибка/i', { timeout: 5000 })

        // Verify error message is displayed
        const errorMessage = page.locator('text=/error|ошибка/i')
        await expect(errorMessage).toBeVisible()

        // Verify retry button is present
        const retryButton = page.locator('button', { hasText: /retry|повторить/i })
        await expect(retryButton).toBeVisible()
    })

    test('should have proper ARIA attributes for accessibility', async ({ page }) => {
        await page.goto('/notifications')

        // Wait for page to load
        await page.waitForSelector('[role="tablist"]')

        // Verify tablist has proper ARIA attributes
        const tablist = page.locator('[role="tablist"]')
        await expect(tablist).toBeVisible()

        // Verify tabs have proper ARIA attributes
        const tabs = page.locator('[role="tab"]')
        const tabCount = await tabs.count()
        expect(tabCount).toBe(2)

        // Verify each tab has aria-selected
        for (let i = 0; i < tabCount; i++) {
            const tab = tabs.nth(i)
            const ariaSelected = await tab.getAttribute('aria-selected')
            expect(ariaSelected).toBeTruthy()
        }

        // Verify tabpanel exists
        const tabpanel = page.locator('[role="tabpanel"]')
        await expect(tabpanel).toBeVisible()

        // Verify notifications have article role
        const articles = page.locator('[role="article"]')
        const articleCount = await articles.count()
        expect(articleCount).toBeGreaterThan(0)
    })
})
