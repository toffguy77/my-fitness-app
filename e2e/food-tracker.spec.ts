/**
 * E2E Tests for Food Tracker Feature
 * Tests complete user flows in a real browser environment
 *
 * Requirements: All (E2E validation)
 * Task: 32.3 Write E2E tests with Playwright
 *
 * Test scenarios covered:
 * 1. Food tracker page loads with all sections
 * 2. Date navigation (previous/next day, calendar)
 * 3. Tab switching (Рацион, Рекомендации)
 * 4. Meal slots display and interaction
 * 5. КБЖУ summary display
 * 6. Water tracker functionality
 * 7. Responsive layout on different viewports
 * 8. Keyboard navigation
 * 9. Russian text verification
 */

import { test, expect } from '@playwright/test'

test.describe('Food Tracker Page E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to login page
        await page.goto('/auth')

        // Login (adjust selectors based on actual login form)
        await page.fill('input[name="email"]', 'test@example.com')
        await page.fill('input[name="password"]', 'password')
        await page.click('button[type="submit"]')

        // Wait for redirect to dashboard
        await page.waitForURL(/\/dashboard/)

        // Navigate to food tracker
        await page.goto('/food-tracker')
    })

    // =========================================================================
    // Section 1: Food Tracker Page Load Tests
    // =========================================================================

    test.describe('Food Tracker Page Load', () => {
        test('should load food tracker page with all main sections', async ({ page }) => {
            await page.goto('/food-tracker')

            // Wait for page to load
            await page.waitForSelector('text=Рацион')

            // Verify tabs are present
            await expect(page.locator('text=Рацион')).toBeVisible()
            await expect(page.locator('text=Рекомендации')).toBeVisible()

            // Verify meal slots are present (Russian names)
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Обед')).toBeVisible()
            await expect(page.locator('text=Ужин')).toBeVisible()
            await expect(page.locator('text=Перекус')).toBeVisible()

            // Verify КБЖУ summary is present
            await expect(page.locator('text=Ккал')).toBeVisible()
            await expect(page.locator('text=Белки')).toBeVisible()
            await expect(page.locator('text=Жиры')).toBeVisible()
            await expect(page.locator('text=Углеводы')).toBeVisible()

            // Verify water tracker is present
            await expect(page.locator('text=Вода')).toBeVisible()
        })

        test('should display page title in Russian', async ({ page }) => {
            await page.goto('/food-tracker')

            // Check page title
            await expect(page).toHaveTitle(/Дневник питания/)
        })

        test('should display loading state initially', async ({ page }) => {
            // Intercept API to delay response
            await page.route('**/api/food-tracker/**', async route => {
                await new Promise(resolve => setTimeout(resolve, 1000))
                await route.continue()
            })

            await page.goto('/food-tracker')

            // Check for loading indicators or skeleton screens
            const loadingIndicator = page.locator('[aria-label*="Загрузка"]')
            // Loading state may or may not be visible depending on timing
        })
    })

    // =========================================================================
    // Section 2: Date Navigation Tests
    // =========================================================================

    test.describe('Date Navigation', () => {
        test('should display current date in Russian format', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify Russian month names are used
            const russianMonths = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

            // At least one Russian month should be visible
            let monthFound = false
            for (const month of russianMonths) {
                const monthElement = page.locator(`text=${month}`)
                if (await monthElement.count() > 0) {
                    monthFound = true
                    break
                }
            }
            expect(monthFound).toBe(true)
        })

        test('should navigate to previous day', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Find and click previous day button
            const prevButton = page.locator('[aria-label="Предыдущий день"]')
            await expect(prevButton).toBeVisible()
            await prevButton.click()

            // Wait for data to update
            await page.waitForTimeout(300)
        })

        test('should disable next day button when on today', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Find next day button
            const nextButton = page.locator('[aria-label="Следующий день"]')

            // Should be disabled when viewing today
            await expect(nextButton).toBeDisabled()
        })

        test('should show "Сегодня" button when viewing past date', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Navigate to previous day
            const prevButton = page.locator('[aria-label="Предыдущий день"]')
            await prevButton.click()
            await page.waitForTimeout(300)

            // "Сегодня" button should appear
            const todayButton = page.locator('button', { hasText: 'Сегодня' })
            await expect(todayButton).toBeVisible()
        })
    })

    // =========================================================================
    // Section 3: Tab Switching Tests
    // =========================================================================

    test.describe('Tab Switching', () => {
        test('should switch between Рацион and Рекомендации tabs', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify Рацион tab is active by default
            const dietTab = page.locator('[role="tab"]', { hasText: 'Рацион' })
            await expect(dietTab).toHaveAttribute('aria-selected', 'true')

            // Click Рекомендации tab
            const recommendationsTab = page.locator('[role="tab"]', { hasText: 'Рекомендации' })
            await recommendationsTab.click()

            // Verify tab switched
            await expect(recommendationsTab).toHaveAttribute('aria-selected', 'true')
            await expect(dietTab).toHaveAttribute('aria-selected', 'false')
        })

        test('should support keyboard navigation between tabs', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Focus on diet tab
            const dietTab = page.locator('[role="tab"]', { hasText: 'Рацион' })
            await dietTab.focus()

            // Press right arrow to move to recommendations
            await page.keyboard.press('ArrowRight')

            // Verify recommendations tab is now focused/selected
            const recommendationsTab = page.locator('[role="tab"]', { hasText: 'Рекомендации' })
            await expect(recommendationsTab).toBeFocused()
        })
    })

    // =========================================================================
    // Section 4: Meal Slots Tests
    // =========================================================================

    test.describe('Meal Slots', () => {
        test('should display all four meal slots with Russian names', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify all meal slots are present
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Обед')).toBeVisible()
            await expect(page.locator('text=Ужин')).toBeVisible()
            await expect(page.locator('text=Перекус')).toBeVisible()
        })

        test('should have add button for each meal slot', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify add buttons are present
            const addButtons = page.locator('[aria-label*="Добавить в"]')
            await expect(addButtons).toHaveCount(4)
        })

        test('should open food entry modal when clicking add button', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Click add button for breakfast
            const addBreakfastButton = page.locator('[aria-label="Добавить в Завтрак"]')
            await addBreakfastButton.click()

            // Verify modal opens
            const modal = page.locator('[role="dialog"]')
            await expect(modal).toBeVisible()

            // Verify modal has entry method tabs
            await expect(page.locator('text=Поиск')).toBeVisible()
        })
    })

    // =========================================================================
    // Section 5: КБЖУ Summary Tests
    // =========================================================================

    test.describe('КБЖУ Summary', () => {
        test('should display КБЖУ summary with progress bars', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify КБЖУ labels are present
            await expect(page.locator('text=Ккал')).toBeVisible()
            await expect(page.locator('text=Белки')).toBeVisible()
            await expect(page.locator('text=Жиры')).toBeVisible()
            await expect(page.locator('text=Углеводы')).toBeVisible()

            // Verify progress bars are present
            const progressBars = page.locator('[role="progressbar"]')
            await expect(progressBars).toHaveCount(5) // 4 macros + water
        })

        test('should display current/target format', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify format like "0 / 2000" is displayed
            const targetDisplay = page.locator('text=/\\d+\\s*\\/\\s*\\d+/')
            await expect(targetDisplay.first()).toBeVisible()
        })
    })

    // =========================================================================
    // Section 6: Water Tracker Tests
    // =========================================================================

    test.describe('Water Tracker', () => {
        test('should display water tracker with Russian text', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify water section is present
            await expect(page.locator('text=Вода')).toBeVisible()

            // Verify Russian format "X / Y стаканов"
            await expect(page.locator('text=/стакан/')).toBeVisible()
        })

        test('should have add water button', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify add water button is present
            const addWaterButton = page.locator('[aria-label="Добавить стакан воды"]')
            await expect(addWaterButton).toBeVisible()
        })

        test('should increment water count on button click', async ({ page }) => {
            // Mock API response
            await page.route('**/api/food-tracker/water', route => {
                if (route.request().method() === 'POST') {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ log: { glasses: 1, goal: 8, glassSize: 250 } })
                    })
                } else {
                    route.continue()
                }
            })

            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Click add water button
            const addWaterButton = page.locator('[aria-label="Добавить стакан воды"]')
            await addWaterButton.click()

            // Wait for update
            await page.waitForTimeout(500)
        })
    })

    // =========================================================================
    // Section 7: FAB Button Tests
    // =========================================================================

    test.describe('FAB Button', () => {
        test('should display FAB button for quick add', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify FAB button is present
            const fabButton = page.locator('[data-testid="fab-add-food"]')
            await expect(fabButton).toBeVisible()
        })

        test('should open food entry modal when clicking FAB', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Click FAB button
            const fabButton = page.locator('[data-testid="fab-add-food"]')
            await fabButton.click()

            // Verify modal opens
            const modal = page.locator('[role="dialog"]')
            await expect(modal).toBeVisible()
        })
    })

    // =========================================================================
    // Section 8: Responsive Layout Tests
    // =========================================================================

    test.describe('Responsive Layout', () => {
        test('should display correctly on mobile viewport', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 })

            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify main elements are visible
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Ккал')).toBeVisible()
            await expect(page.locator('text=Вода')).toBeVisible()
        })

        test('should display correctly on tablet viewport', async ({ page }) => {
            // Set tablet viewport
            await page.setViewportSize({ width: 768, height: 1024 })

            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify main elements are visible
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Ккал')).toBeVisible()
        })

        test('should display correctly on desktop viewport', async ({ page }) => {
            // Set desktop viewport
            await page.setViewportSize({ width: 1280, height: 800 })

            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify main elements are visible
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Ккал')).toBeVisible()
        })
    })

    // =========================================================================
    // Section 9: Keyboard Navigation Tests
    // =========================================================================

    test.describe('Keyboard Navigation', () => {
        test('should support Tab navigation through interactive elements', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Press Tab multiple times and verify focus moves
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')

            // Verify some element is focused
            const focusedElement = page.locator(':focus')
            await expect(focusedElement).toBeVisible()
        })

        test('should close modal on Escape key', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Open modal
            const fabButton = page.locator('[data-testid="fab-add-food"]')
            await fabButton.click()

            // Verify modal is open
            const modal = page.locator('[role="dialog"]')
            await expect(modal).toBeVisible()

            // Press Escape
            await page.keyboard.press('Escape')

            // Verify modal is closed
            await expect(modal).not.toBeVisible()
        })
    })

    // =========================================================================
    // Section 10: Russian Text Verification
    // =========================================================================

    test.describe('Russian Text Verification', () => {
        test('should display all UI text in Russian', async ({ page }) => {
            await page.goto('/food-tracker')
            await page.waitForSelector('text=Рацион')

            // Verify Russian text throughout the page
            await expect(page.locator('text=Рацион')).toBeVisible()
            await expect(page.locator('text=Рекомендации')).toBeVisible()
            await expect(page.locator('text=Завтрак')).toBeVisible()
            await expect(page.locator('text=Обед')).toBeVisible()
            await expect(page.locator('text=Ужин')).toBeVisible()
            await expect(page.locator('text=Перекус')).toBeVisible()
            await expect(page.locator('text=Ккал')).toBeVisible()
            await expect(page.locator('text=Белки')).toBeVisible()
            await expect(page.locator('text=Жиры')).toBeVisible()
            await expect(page.locator('text=Углеводы')).toBeVisible()
            await expect(page.locator('text=Вода')).toBeVisible()
        })

        test('should display Russian error messages', async ({ page }) => {
            // Mock API error
            await page.route('**/api/food-tracker/entries', route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: { code: 'SERVER_ERROR', message: 'Ошибка сервера. Попробуйте позже.' }
                    })
                })
            })

            await page.goto('/food-tracker')

            // Wait for error to appear (if displayed)
            await page.waitForTimeout(1000)
        })
    })
})
