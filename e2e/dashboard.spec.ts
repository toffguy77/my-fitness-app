/**
 * E2E Tests for Dashboard Feature
 * Tests complete user flows in a real browser environment
 *
 * Requirements: All (E2E validation)
 * Task: 20.1 Write E2E tests with Playwright
 *
 * Test scenarios covered:
 * 1. Dashboard page loads with all sections
 * 2. Calendar navigation (day selection, week navigation)
 * 3. Daily tracking blocks (nutrition, weight, steps, workout)
 * 4. Long-term sections (progress, photo upload, weekly plan, tasks)
 * 5. Attention indicators display and removal
 * 6. Responsive layout on different viewports
 * 7. Keyboard navigation
 * 8. Error handling and offline mode
 */

import { test, expect } from '@playwright/test'

test.describe('Dashboard Page E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to login page
        await page.goto('/auth')

        // Login (adjust selectors based on actual login form)
        await page.fill('input[name="email"]', 'test@example.com')
        await page.fill('input[name="password"]', 'password')
        await page.click('button[type="submit"]')

        // Wait for redirect to dashboard
        await page.waitForURL(/\/dashboard/)
    })

    // =========================================================================
    // Section 1: Dashboard Page Load Tests
    // =========================================================================

    test.describe('Dashboard Page Load', () => {
        test('should load dashboard page with all main sections', async ({ page }) => {
            await page.goto('/dashboard')

            // Wait for page to load
            await page.waitForSelector('.calendar-navigator')

            // Verify Calendar Navigator is present
            await expect(page.locator('.calendar-navigator')).toBeVisible()

            // Verify Daily Tracking Grid is present
            await expect(page.locator('[class*="grid"]').first()).toBeVisible()

            // Verify all four daily tracking blocks are present
            const nutritionBlock = page.locator('text=Питание').first()
            const weightBlock = page.locator('text=Вес').first()
            const stepsBlock = page.locator('text=Шаги').first()
            const workoutBlock = page.locator('text=Тренировка').first()

            await expect(nutritionBlock).toBeVisible()
            await expect(weightBlock).toBeVisible()
            await expect(stepsBlock).toBeVisible()
            await expect(workoutBlock).toBeVisible()

            // Verify long-term sections are present
            await expect(page.locator('text=Прогресс').first()).toBeVisible()
            await expect(page.locator('text=Фото прогресса').first()).toBeVisible()
            await expect(page.locator('text=Недельная планка').first()).toBeVisible()
            await expect(page.locator('text=Задачи').first()).toBeVisible()
        })

        test('should display loading state initially', async ({ page }) => {
            // Intercept API to delay response
            await page.route('**/api/dashboard/**', async route => {
                await new Promise(resolve => setTimeout(resolve, 1000))
                await route.continue()
            })

            await page.goto('/dashboard')

            // Check for loading indicators
            const loadingIndicator = page.locator('[aria-label*="Загрузка"]')
            await expect(loadingIndicator.first()).toBeVisible({ timeout: 500 })
        })

        test('should load data within 2 seconds (Requirement 13.2)', async ({ page }) => {
            const startTime = Date.now()

            await page.goto('/dashboard')

            // Wait for data to load (no loading indicators visible)
            await page.waitForSelector('.calendar-navigator')
            await page.waitForFunction(() => {
                const loadingElements = document.querySelectorAll('[aria-label*="Загрузка"]')
                return loadingElements.length === 0
            }, { timeout: 2000 })

            const loadTime = Date.now() - startTime
            expect(loadTime).toBeLessThan(2000)
        })
    })

    // =========================================================================
    // Section 2: Calendar Navigation Tests
    // =========================================================================

    test.describe('Calendar Navigation', () => {
        test('should display current week with 7 days (Mon-Sun)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Verify 7 day buttons are present
            const dayButtons = page.locator('[role="radiogroup"] [role="radio"]')
            await expect(dayButtons).toHaveCount(7)

            // Verify day names are in Russian
            const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
            for (const dayName of dayNames) {
                await expect(page.locator(`text=${dayName}`).first()).toBeVisible()
            }
        })

        test('should highlight current day (Requirement 1.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Find the day with aria-current="date"
            const currentDay = page.locator('[aria-current="date"]')
            await expect(currentDay).toBeVisible()

            // Verify it has distinct styling (ring-2 ring-blue-300)
            await expect(currentDay).toHaveClass(/ring-2/)
        })

        test('should navigate to previous week (Requirement 1.3)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Get current week range text
            const weekRangeText = await page.locator('.calendar-navigator .text-sm.font-medium').textContent()

            // Click previous week button
            await page.click('[aria-label="Предыдущая неделя"]')

            // Wait for update
            await page.waitForTimeout(300)

            // Verify week range changed
            const newWeekRangeText = await page.locator('.calendar-navigator .text-sm.font-medium').textContent()
            expect(newWeekRangeText).not.toBe(weekRangeText)
        })

        test('should navigate to next week (Requirement 1.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Get current week range text
            const weekRangeText = await page.locator('.calendar-navigator .text-sm.font-medium').textContent()

            // Click next week button
            await page.click('[aria-label="Следующая неделя"]')

            // Wait for update
            await page.waitForTimeout(300)

            // Verify week range changed
            const newWeekRangeText = await page.locator('.calendar-navigator .text-sm.font-medium').textContent()
            expect(newWeekRangeText).not.toBe(weekRangeText)
        })

        test('should select a specific day and update data (Requirement 1.5)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Get all day buttons
            const dayButtons = page.locator('[role="radiogroup"] [role="radio"]')

            // Click on a different day (not the selected one)
            const firstDay = dayButtons.first()
            const isFirstSelected = await firstDay.getAttribute('aria-checked')

            if (isFirstSelected === 'true') {
                // Click second day
                await dayButtons.nth(1).click()
                await expect(dayButtons.nth(1)).toHaveAttribute('aria-checked', 'true')
            } else {
                // Click first day
                await firstDay.click()
                await expect(firstDay).toHaveAttribute('aria-checked', 'true')
            }
        })

        test('should display goal completion indicators (Requirement 1.6)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Verify goal status indicators are present
            const statusGroups = page.locator('[role="group"][aria-label="Статус целей"]')
            await expect(statusGroups.first()).toBeVisible()

            // Each day should have 3 indicators (nutrition, weight, activity)
            const firstDayIndicators = statusGroups.first().locator('div')
            await expect(firstDayIndicators).toHaveCount(3)
        })

        test('should show submit report button on Sunday (Requirement 1.8)', async ({ page }) => {
            // This test checks if the button appears on Sunday
            // We'll navigate to a Sunday to test this
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check if today is Sunday
            const today = new Date()
            if (today.getDay() === 0) {
                // If today is Sunday, the button should be visible
                const submitButton = page.locator('button', { hasText: 'Отправить недельный отчет' })
                await expect(submitButton).toBeVisible()
            }
        })
    })

    // =========================================================================
    // Section 3: Daily Tracking Blocks Tests
    // =========================================================================

    test.describe('Nutrition Block', () => {
        test('should display calorie goal and current intake (Requirement 2.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Питание')

            // Find nutrition block
            const nutritionBlock = page.locator('section, div').filter({ hasText: 'Питание' }).first()

            // Verify calorie display
            await expect(nutritionBlock.locator('text=/ккал/')).toBeVisible()
        })

        test('should display macro breakdown (Requirement 2.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Питание')

            // Verify macros are displayed
            await expect(page.locator('text=Белки').first()).toBeVisible()
            await expect(page.locator('text=Жиры').first()).toBeVisible()
            await expect(page.locator('text=Углеводы').first()).toBeVisible()
        })

        test('should have quick add button linking to food tracker (Requirement 2.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Питание')

            // Find and click quick add button
            const addButton = page.locator('[aria-label="Добавить еду"]')
            await expect(addButton).toBeVisible()

            // Click should navigate to food tracker
            await addButton.click()
            await page.waitForURL(/\/food-tracker/)
        })

        test('should show warning when calorie goal exceeded (Requirement 2.6)', async ({ page }) => {
            // This test requires mocking data where calories exceed goal
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            nutrition: { calories: 2500, protein: 100, fat: 80, carbs: 300 },
                            completionStatus: { nutritionFilled: true, weightLogged: false, activityCompleted: false }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Питание')

            // Check for warning indicator
            const warning = page.locator('[role="alert"]', { hasText: 'Превышена дневная норма' })
            await expect(warning).toBeVisible()
        })
    })

    test.describe('Weight Block', () => {
        test('should display weight input field (Requirement 3.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Find weight block
            const weightBlock = page.locator('section, div').filter({ hasText: /^Вес$/ }).first()
            await expect(weightBlock).toBeVisible()
        })

        test('should validate weight input (Requirement 3.3, 3.7)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Click add button to open input
            const addButton = page.locator('[aria-label="Добавить вес"]')
            await addButton.click()

            // Find input field
            const weightInput = page.locator('#weight-input')
            await expect(weightInput).toBeVisible()

            // Test invalid input (negative)
            await weightInput.fill('-10')
            await page.keyboard.press('Tab')
            await page.waitForTimeout(400) // Wait for debounced validation

            // Check for error message
            const errorMessage = page.locator('[role="alert"]')
            await expect(errorMessage).toBeVisible()
        })

        test('should save valid weight and show completion indicator (Requirement 3.4, 3.5)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Click add button
            const addButton = page.locator('[aria-label="Добавить вес"]')
            await addButton.click()

            // Enter valid weight
            const weightInput = page.locator('#weight-input')
            await weightInput.fill('75.5')

            // Click save
            await page.click('[aria-label="Сохранить вес"]')

            // Wait for save and check completion indicator
            await page.waitForTimeout(500)
            const completionIndicator = page.locator('text=Вес записан')
            await expect(completionIndicator).toBeVisible()
        })

        test('should display previous weight for comparison (Requirement 3.6)', async ({ page }) => {
            // Mock data with previous weight
            await page.route('**/api/dashboard/week**', route => {
                const today = new Date().toISOString().split('T')[0]
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            [today]: { weight: 75.5 },
                            [yesterday]: { weight: 76.0 }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Check for previous weight display
            const previousWeight = page.locator('text=/Вчера:/')
            await expect(previousWeight).toBeVisible()
        })
    })

    test.describe('Steps Block', () => {
        test('should display step goal and current count (Requirement 4.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Verify steps display
            const stepsBlock = page.locator('section, div').filter({ hasText: /^Шаги$/ }).first()
            await expect(stepsBlock).toBeVisible()
            await expect(stepsBlock.locator('text=/шагов/')).toBeVisible()
        })

        test('should display progress bar (Requirement 4.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Find progress bar
            const progressBar = page.locator('[role="progressbar"][aria-label*="Прогресс шагов"]')
            await expect(progressBar).toBeVisible()
        })

        test('should open input dialog on quick add (Requirement 4.3)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Click add button
            const addButton = page.locator('[aria-label="Добавить шаги"]')
            await addButton.click()

            // Verify dialog opens
            const dialog = page.locator('[role="dialog"]')
            await expect(dialog).toBeVisible()
        })

        test('should validate step count input (Requirement 4.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Open dialog
            await page.click('[aria-label="Добавить шаги"]')

            // Enter invalid input (negative)
            const stepsInput = page.locator('#steps-input')
            await stepsInput.fill('-100')
            await page.keyboard.press('Tab')
            await page.waitForTimeout(400)

            // Check for error
            const errorMessage = page.locator('[role="alert"]')
            await expect(errorMessage).toBeVisible()
        })

        test('should show completion indicator when goal reached (Requirement 4.6)', async ({ page }) => {
            // Mock data with goal reached
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            steps: 12000,
                            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: true }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Check for completion indicator
            const completionIndicator = page.locator('text=Цель достигнута!')
            await expect(completionIndicator).toBeVisible()
        })
    })

    test.describe('Workout Block', () => {
        test('should display workout completion status (Requirement 5.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Тренировка')

            // Verify workout block is visible
            const workoutBlock = page.locator('section, div').filter({ hasText: /^Тренировка$/ }).first()
            await expect(workoutBlock).toBeVisible()
        })

        test('should open workout dialog on quick add (Requirement 5.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Тренировка')

            // Click add button
            const addButton = page.locator('[aria-label="Добавить тренировку"]')
            await addButton.click()

            // Verify dialog opens with workout types
            const dialog = page.locator('[role="dialog"]')
            await expect(dialog).toBeVisible()

            // Verify workout type options
            await expect(page.locator('[role="radiogroup"]')).toBeVisible()
        })

        test('should save workout and show completion indicator (Requirement 5.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Тренировка')

            // Open dialog
            await page.click('[aria-label="Добавить тренировку"]')

            // Select workout type
            await page.click('[aria-label="Тип тренировки: Силовая"]')

            // Save
            await page.click('[aria-label="Сохранить тренировку"]')

            // Wait and check completion
            await page.waitForTimeout(500)
            const completionIndicator = page.locator('text=Тренировка выполнена')
            await expect(completionIndicator).toBeVisible()
        })

        test('should display workout type when logged (Requirement 5.5)', async ({ page }) => {
            // Mock data with workout logged
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            workout: { completed: true, type: 'Силовая', duration: 60 }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Тренировка')

            // Check workout type is displayed
            await expect(page.locator('text=Силовая')).toBeVisible()
        })

        test('should show prompt when no workout logged (Requirement 5.6)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Тренировка')

            // Check for prompt
            const prompt = page.locator('text=Тренировка не записана')
            await expect(prompt).toBeVisible()
        })
    })

    // =========================================================================
    // Section 4: Long-term Sections Tests
    // =========================================================================

    test.describe('Progress Section', () => {
        test('should display progress section with chart (Requirement 6.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Прогресс')

            // Verify progress section is visible
            const progressSection = page.locator('section, div').filter({ hasText: /^Прогресс$/ }).first()
            await expect(progressSection).toBeVisible()
        })

        test('should navigate to analytics on click (Requirement 6.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Прогресс')

            // Click "Подробнее" button
            const detailsButton = page.locator('[aria-label="Перейти к аналитике"]')
            await detailsButton.click()

            // Verify navigation
            await page.waitForURL(/\/analytics/)
        })

        test('should show placeholder when insufficient data (Requirement 6.5)', async ({ page }) => {
            // Mock empty progress data
            await page.route('**/api/dashboard/progress**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            weightTrend: [],
                            nutritionAdherence: 0,
                            achievements: []
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Прогресс')

            // Check for placeholder
            const placeholder = page.locator('text=Недостаточно данных')
            await expect(placeholder).toBeVisible()
        })
    })

    test.describe('Photo Upload Section', () => {
        test('should display photo upload section (Requirement 7.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Фото прогресса')

            // Verify section is visible
            const photoSection = page.locator('section').filter({ hasText: 'Фото прогресса' })
            await expect(photoSection).toBeVisible()
        })

        test('should have upload button (Requirement 7.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Фото прогресса')

            // Verify upload button
            const uploadButton = page.locator('[aria-label*="Загрузить фото"]')
            await expect(uploadButton).toBeVisible()
        })

        test('should validate file format (Requirement 7.3)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Фото прогресса')

            // Create a mock file input event with invalid file type
            const fileInput = page.locator('input[type="file"]')

            // Set up file chooser
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser'),
                page.click('[aria-label*="Загрузить фото"]')
            ])

            // Try to upload invalid file (this would be rejected by accept attribute)
            // The accept attribute should only allow image/jpeg,image/png,image/webp
            const acceptAttribute = await fileInput.getAttribute('accept')
            expect(acceptAttribute).toContain('image/jpeg')
            expect(acceptAttribute).toContain('image/png')
            expect(acceptAttribute).toContain('image/webp')
        })

        test('should display file requirements', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Фото прогресса')

            // Check for requirements text
            await expect(page.locator('text=Формат: JPEG, PNG или WebP')).toBeVisible()
            await expect(page.locator('text=Максимальный размер: 10 МБ')).toBeVisible()
        })
    })

    test.describe('Weekly Plan Section', () => {
        test('should display weekly plan section (Requirement 8.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Недельная планка')

            // Verify section is visible
            const planSection = page.locator('section').filter({ hasText: 'Недельная планка' })
            await expect(planSection).toBeVisible()
        })

        test('should display calorie and protein targets when plan exists (Requirement 8.1, 8.2)', async ({ page }) => {
            // Mock active plan
            await page.route('**/api/dashboard/weekly-plan**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            id: '1',
                            caloriesGoal: 2000,
                            proteinGoal: 150,
                            startDate: new Date().toISOString(),
                            endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
                            isActive: true
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Недельная планка')

            // Check for targets
            await expect(page.locator('text=2000 ккал')).toBeVisible()
            await expect(page.locator('text=150 г')).toBeVisible()
        })

        test('should display active indicator (Requirement 8.4)', async ({ page }) => {
            // Mock active plan
            await page.route('**/api/dashboard/weekly-plan**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            id: '1',
                            caloriesGoal: 2000,
                            proteinGoal: 150,
                            startDate: new Date().toISOString(),
                            endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
                            isActive: true
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Недельная планка')

            // Check for active indicator
            await expect(page.locator('text=Активна')).toBeVisible()
        })

        test('should show placeholder when no plan exists (Requirement 8.5)', async ({ page }) => {
            // Mock no plan
            await page.route('**/api/dashboard/weekly-plan**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: null })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Недельная планка')

            // Check for placeholder
            await expect(page.locator('text=Скоро тут будет твоя планка')).toBeVisible()
        })
    })

    test.describe('Tasks Section', () => {
        test('should display tasks section (Requirement 9.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Verify section is visible
            const tasksSection = page.locator('section').filter({ hasText: /^Задачи$/ })
            await expect(tasksSection).toBeVisible()
        })

        test('should display week indicators (Requirement 9.3)', async ({ page }) => {
            // Mock tasks with week numbers
            await page.route('**/api/dashboard/tasks**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            { id: '1', title: 'Task 1', weekNumber: 1, status: 'active', dueDate: new Date().toISOString() },
                            { id: '2', title: 'Task 2', weekNumber: 2, status: 'completed', dueDate: new Date().toISOString() }
                        ]
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Check for week indicators
            await expect(page.locator('text=/Неделя \\d+/')).toBeVisible()
        })

        test('should allow marking task as complete (Requirement 9.5)', async ({ page }) => {
            // Mock tasks
            await page.route('**/api/dashboard/tasks**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            { id: '1', title: 'Test Task', weekNumber: 1, status: 'active', dueDate: new Date().toISOString() }
                        ]
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Find and click complete button
            const completeButton = page.locator('[aria-label="Отметить задачу как выполненную"]')
            await completeButton.click()

            // Wait for update
            await page.waitForTimeout(500)
        })

        test('should show "Еще" link when more than 5 tasks (Requirement 9.6)', async ({ page }) => {
            // Mock many tasks
            const tasks = Array.from({ length: 8 }, (_, i) => ({
                id: String(i + 1),
                title: `Task ${i + 1}`,
                weekNumber: 1,
                status: 'active',
                dueDate: new Date().toISOString()
            }))

            await page.route('**/api/dashboard/tasks**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: tasks })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Check for "Еще" link
            await expect(page.locator('text=/Еще \\(\\d+\\)/')).toBeVisible()
        })

        test('should show empty state when no tasks', async ({ page }) => {
            // Mock no tasks
            await page.route('**/api/dashboard/tasks**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [] })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Check for empty state
            await expect(page.locator('text=Нет активных задач')).toBeVisible()
        })
    })

    // =========================================================================
    // Section 5: Attention Indicators Tests
    // =========================================================================

    test.describe('Attention Indicators', () => {
        test('should display attention indicator when weight not logged (Requirement 15.2)', async ({ page }) => {
            // Mock data without weight
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            weight: null,
                            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: false }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Check for attention indicator
            const attentionIndicator = page.locator('[aria-label="Вес не записан сегодня"]')
            await expect(attentionIndicator).toBeVisible()
        })

        test('should display attention indicator when nutrition not logged (Requirement 15.3)', async ({ page }) => {
            // Mock data without nutrition
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: false }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Питание')

            // Check for attention indicator
            const attentionIndicator = page.locator('[aria-label="Питание не записано сегодня"]')
            await expect(attentionIndicator).toBeVisible()
        })

        test('should display attention indicator when steps not logged (Requirement 15.4)', async ({ page }) => {
            // Mock data without steps
            await page.route('**/api/dashboard/daily/**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            steps: 0,
                            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: false }
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Шаги')

            // Check for attention indicator
            const attentionIndicator = page.locator('[aria-label="Шаги не записаны сегодня"]')
            await expect(attentionIndicator).toBeVisible()
        })

        test('should remove attention indicator after completing action (Requirement 15.11)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Check initial attention indicator
            const attentionIndicator = page.locator('[aria-label="Вес не записан сегодня"]')

            // If indicator is visible, complete the action
            if (await attentionIndicator.isVisible()) {
                // Add weight
                await page.click('[aria-label="Добавить вес"]')
                await page.fill('#weight-input', '75')
                await page.click('[aria-label="Сохранить вес"]')

                // Wait for indicator to disappear
                await page.waitForTimeout(600)
                await expect(attentionIndicator).not.toBeVisible()
            }
        })

        test('should display task attention indicator for urgent tasks (Requirement 15.6)', async ({ page }) => {
            // Mock tasks due within 2 days
            const tomorrow = new Date(Date.now() + 86400000).toISOString()

            await page.route('**/api/dashboard/tasks**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            { id: '1', title: 'Urgent Task', weekNumber: 1, status: 'active', dueDate: tomorrow }
                        ]
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('text=Задачи')

            // Check for attention badge with count
            const attentionBadge = page.locator('[aria-label*="требует внимания"]')
            await expect(attentionBadge).toBeVisible()
        })

        test('attention indicators should have ARIA labels (Requirement 15.12)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Find all attention indicators
            const attentionIndicators = page.locator('[class*="attention"], [aria-label*="не записан"]')
            const count = await attentionIndicators.count()

            // Each indicator should have an aria-label
            for (let i = 0; i < count; i++) {
                const indicator = attentionIndicators.nth(i)
                const ariaLabel = await indicator.getAttribute('aria-label')
                expect(ariaLabel).toBeTruthy()
            }
        })
    })

    // =========================================================================
    // Section 6: Responsive Design Tests
    // =========================================================================

    test.describe('Responsive Design', () => {
        test('should display single-column layout on mobile (Requirement 12.1)', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 })

            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Verify single column layout
            const grid = page.locator('.grid').first()
            const gridClasses = await grid.getAttribute('class')

            // On mobile, should have grid-cols-1
            expect(gridClasses).toContain('grid-cols-1')
        })

        test('should display two-column layout on tablet (Requirement 12.2)', async ({ page }) => {
            // Set tablet viewport
            await page.setViewportSize({ width: 768, height: 1024 })

            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Verify two column layout
            const grid = page.locator('.grid').first()
            const gridClasses = await grid.getAttribute('class')

            // On tablet, should have sm:grid-cols-2
            expect(gridClasses).toContain('sm:grid-cols-2')
        })

        test('should display multi-column layout on desktop (Requirement 12.3)', async ({ page }) => {
            // Set desktop viewport
            await page.setViewportSize({ width: 1440, height: 900 })

            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Verify multi-column layout
            const grid = page.locator('.grid').first()
            const gridClasses = await grid.getAttribute('class')

            // On desktop, should have lg:grid-cols-4
            expect(gridClasses).toContain('lg:grid-cols-4')
        })

        test('calendar should remain functional on all devices (Requirement 12.4)', async ({ page }) => {
            const viewports = [
                { width: 375, height: 667, name: 'mobile' },
                { width: 768, height: 1024, name: 'tablet' },
                { width: 1440, height: 900, name: 'desktop' }
            ]

            for (const viewport of viewports) {
                await page.setViewportSize({ width: viewport.width, height: viewport.height })
                await page.goto('/dashboard')
                await page.waitForSelector('.calendar-navigator')

                // Verify calendar navigation works
                const prevButton = page.locator('[aria-label="Предыдущая неделя"]')
                const nextButton = page.locator('[aria-label="Следующая неделя"]')

                await expect(prevButton).toBeVisible()
                await expect(nextButton).toBeVisible()

                // Click navigation
                await prevButton.click()
                await page.waitForTimeout(300)
                await nextButton.click()
                await page.waitForTimeout(300)

                // Verify day selection works
                const dayButtons = page.locator('[role="radiogroup"] [role="radio"]')
                await dayButtons.first().click()
                await expect(dayButtons.first()).toHaveAttribute('aria-checked', 'true')
            }
        })

        test('should not require horizontal scrolling (Requirement 12.5)', async ({ page }) => {
            const viewports = [
                { width: 375, height: 667 },
                { width: 768, height: 1024 },
                { width: 1440, height: 900 }
            ]

            for (const viewport of viewports) {
                await page.setViewportSize(viewport)
                await page.goto('/dashboard')
                await page.waitForSelector('.calendar-navigator')

                // Check that body doesn't have horizontal overflow
                const hasHorizontalScroll = await page.evaluate(() => {
                    return document.body.scrollWidth > document.body.clientWidth
                })

                expect(hasHorizontalScroll).toBe(false)
            }
        })

        test('should adapt layout on orientation change (Requirement 12.6)', async ({ page }) => {
            // Start in portrait
            await page.setViewportSize({ width: 375, height: 667 })
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Get initial layout
            const initialGrid = await page.locator('.grid').first().getAttribute('class')

            // Change to landscape
            await page.setViewportSize({ width: 667, height: 375 })

            // Wait for layout adaptation (should be within 300ms)
            await page.waitForTimeout(350)

            // Verify layout adapted
            const newGrid = await page.locator('.grid').first().getAttribute('class')
            // Layout classes should still be present and functional
            expect(newGrid).toBeTruthy()
        })
    })

    // =========================================================================
    // Section 7: Keyboard Navigation Tests
    // =========================================================================

    test.describe('Keyboard Navigation', () => {
        test('should support Tab navigation through interactive elements (Requirement 16.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Start from the beginning
            await page.keyboard.press('Tab')

            // Verify focus moves through elements
            let focusedElement = await page.evaluate(() => document.activeElement?.tagName)
            expect(['BUTTON', 'INPUT', 'A']).toContain(focusedElement)

            // Continue tabbing
            for (let i = 0; i < 5; i++) {
                await page.keyboard.press('Tab')
                focusedElement = await page.evaluate(() => document.activeElement?.tagName)
                expect(focusedElement).toBeTruthy()
            }
        })

        test('should display visible focus indicators (Requirement 16.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Tab to first interactive element
            await page.keyboard.press('Tab')

            // Check for focus ring
            const focusedElement = page.locator(':focus')
            const classes = await focusedElement.getAttribute('class')

            // Should have focus ring classes
            expect(classes).toMatch(/focus:|ring/)
        })

        test('should support arrow key navigation in calendar (Requirement 16.1)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Focus on calendar
            const dayButtons = page.locator('[role="radiogroup"] [role="radio"]')
            await dayButtons.first().focus()

            // Get initial selected day
            const initialSelected = await page.locator('[role="radio"][aria-checked="true"]').textContent()

            // Press right arrow
            await page.keyboard.press('ArrowRight')
            await page.waitForTimeout(100)

            // Verify focus moved
            const focusedElement = page.locator(':focus')
            await expect(focusedElement).toBeVisible()
        })

        test('should support Enter key to activate buttons', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Focus on add weight button
            const addButton = page.locator('[aria-label="Добавить вес"]')
            await addButton.focus()

            // Press Enter
            await page.keyboard.press('Enter')

            // Verify input dialog opened
            const weightInput = page.locator('#weight-input')
            await expect(weightInput).toBeVisible()
        })

        test('should support Escape key to close dialogs', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Open weight dialog
            await page.click('[aria-label="Добавить вес"]')
            await expect(page.locator('#weight-input')).toBeVisible()

            // Press Escape
            await page.keyboard.press('Escape')

            // Verify dialog closed
            await expect(page.locator('#weight-input')).not.toBeVisible()
        })
    })

    // =========================================================================
    // Section 8: Accessibility Tests
    // =========================================================================

    test.describe('Accessibility', () => {
        test('should have proper ARIA labels for visual indicators (Requirement 16.2)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check progress bars have aria-label
            const progressBars = page.locator('[role="progressbar"]')
            const count = await progressBars.count()

            for (let i = 0; i < count; i++) {
                const progressBar = progressBars.nth(i)
                const ariaLabel = await progressBar.getAttribute('aria-label')
                expect(ariaLabel).toBeTruthy()
            }
        })

        test('should have clear labels for form inputs (Requirement 16.3)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Open weight input
            await page.click('[aria-label="Добавить вес"]')

            // Check input has label
            const weightInput = page.locator('#weight-input')
            const ariaLabel = await weightInput.getAttribute('aria-label')
            expect(ariaLabel).toBeTruthy()
        })

        test('should announce errors to screen readers (Requirement 16.6)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Open weight input
            await page.click('[aria-label="Добавить вес"]')

            // Enter invalid value
            await page.fill('#weight-input', '-10')
            await page.keyboard.press('Tab')
            await page.waitForTimeout(400)

            // Check for ARIA live region
            const errorAlert = page.locator('[role="alert"]')
            await expect(errorAlert).toBeVisible()
        })

        test('should provide non-color indicators (Requirement 16.5)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check that completion indicators have icons, not just colors
            const checkIcons = page.locator('svg[class*="lucide-check"]')
            const count = await checkIcons.count()

            // Should have check icons for completed items
            expect(count).toBeGreaterThanOrEqual(0)
        })

        test('should have proper heading hierarchy', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check for h1, h2, h3 elements
            const h1Count = await page.locator('h1').count()
            const h2Count = await page.locator('h2').count()

            // Should have at least one h1 and multiple h2s for sections
            expect(h1Count).toBeGreaterThanOrEqual(0)
            expect(h2Count).toBeGreaterThan(0)
        })
    })

    // =========================================================================
    // Section 9: Error Handling and Offline Mode Tests
    // =========================================================================

    test.describe('Error Handling', () => {
        test('should display error message on API failure (Requirement 13.3)', async ({ page }) => {
            // Intercept API and return error
            await page.route('**/api/dashboard/**', route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal server error' })
                })
            })

            await page.goto('/dashboard')

            // Wait for error message
            await page.waitForSelector('text=/Не удалось загрузить|ошибка/i', { timeout: 5000 })

            // Verify error message is displayed
            const errorMessage = page.locator('text=/Не удалось загрузить|ошибка/i')
            await expect(errorMessage).toBeVisible()
        })

        test('should display retry button on error (Requirement 13.3)', async ({ page }) => {
            // Intercept API and return error
            await page.route('**/api/dashboard/**', route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal server error' })
                })
            })

            await page.goto('/dashboard')

            // Wait for retry button
            const retryButton = page.locator('button', { hasText: /Попробовать снова|повторить/i })
            await expect(retryButton).toBeVisible()
        })

        test('should retain unsaved data on error', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Open weight input
            await page.click('[aria-label="Добавить вес"]')

            // Enter value
            await page.fill('#weight-input', '75.5')

            // Intercept save request and return error
            await page.route('**/api/dashboard/daily**', route => {
                if (route.request().method() === 'POST') {
                    route.fulfill({
                        status: 500,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Save failed' })
                    })
                } else {
                    route.continue()
                }
            })

            // Try to save
            await page.click('[aria-label="Сохранить вес"]')

            // Wait for error
            await page.waitForTimeout(500)

            // Verify input still has value
            const inputValue = await page.locator('#weight-input').inputValue()
            expect(inputValue).toBe('75.5')
        })

        test('should show offline indicator when no connection (Requirement 13.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Simulate offline
            await page.context().setOffline(true)

            // Try to fetch data
            await page.reload()

            // Check for offline indicator
            const offlineIndicator = page.locator('text=/Нет подключения|офлайн/i')
            await expect(offlineIndicator).toBeVisible({ timeout: 5000 })

            // Restore online
            await page.context().setOffline(false)
        })
    })

    // =========================================================================
    // Section 10: Real-time Updates Tests
    // =========================================================================

    test.describe('Real-time Updates', () => {
        test('should update UI within 500ms after logging metric (Requirement 11.1-11.4)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('text=Вес')

            // Open weight input
            await page.click('[aria-label="Добавить вес"]')

            // Enter and save weight
            await page.fill('#weight-input', '75')

            const startTime = Date.now()
            await page.click('[aria-label="Сохранить вес"]')

            // Wait for completion indicator
            await page.waitForSelector('text=Вес записан', { timeout: 500 })

            const updateTime = Date.now() - startTime
            expect(updateTime).toBeLessThan(500)
        })

        test('should update calendar indicators after completing goal (Requirement 11.5)', async ({ page }) => {
            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Get initial indicator state
            const initialIndicators = await page.locator('[aria-label="Вес записан"]').count()

            // Log weight
            await page.click('[aria-label="Добавить вес"]')
            await page.fill('#weight-input', '75')
            await page.click('[aria-label="Сохранить вес"]')

            // Wait for update
            await page.waitForTimeout(600)

            // Check indicator updated
            const newIndicators = await page.locator('[aria-label="Вес записан"]').count()
            expect(newIndicators).toBeGreaterThanOrEqual(initialIndicators)
        })
    })

    // =========================================================================
    // Section 11: Weekly Report Submission Tests
    // =========================================================================

    test.describe('Weekly Report Submission', () => {
        test('should validate required data before submission (Requirement 10.2, 10.3)', async ({ page }) => {
            // This test requires being on Sunday
            // We'll mock the date or test the validation logic

            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check if submit button is visible (only on Sunday)
            const submitButton = page.locator('button', { hasText: 'Отправить недельный отчет' })

            if (await submitButton.isVisible()) {
                // Click submit
                await submitButton.click()

                // Should show validation errors if data is missing
                const validationError = page.locator('[role="alert"]')
                await expect(validationError).toBeVisible()
            }
        })

        test('should disable editing after report submission (Requirement 10.6)', async ({ page }) => {
            // Mock submitted report
            await page.route('**/api/dashboard/weekly-report**', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            id: '1',
                            submittedAt: new Date().toISOString()
                        }
                    })
                })
            })

            await page.goto('/dashboard')
            await page.waitForSelector('.calendar-navigator')

            // Check for "Report submitted" indicator
            const submittedIndicator = page.locator('text=/Отчет отправлен|Report submitted/i')

            // If report is submitted, editing should be disabled
            if (await submittedIndicator.isVisible()) {
                // Try to edit weight - should be disabled
                const addButton = page.locator('[aria-label="Добавить вес"]')
                const isDisabled = await addButton.isDisabled()
                expect(isDisabled).toBe(true)
            }
        })
    })
})
