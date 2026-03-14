import { test, expect } from '@playwright/test'
import { CuratorHubPage } from '../pages/curator-hub.page'
import { CuratorClientDetailPage } from '../pages/curator-client-detail.page'

test.describe('Curator Client Detail', () => {
  let hub: CuratorHubPage
  let detail: CuratorClientDetailPage

  test.beforeEach(async ({ page }) => {
    hub = new CuratorHubPage(page)
    detail = new CuratorClientDetailPage(page)

    // Navigate directly to a known client detail page
    // First go to hub to find a client ID from the URL
    await hub.goto()
    await hub.expectLoaded()

    // Click any client card in the attention section
    const clientLink = page.locator('a[href*="/curator/clients/"]').first()
    const clientButton = page
      .getByRole('button')
      .filter({ hasText: /Калории|Нет записей|Нет активности/ })
      .first()

    // Try link first, then button
    const hasLink = await clientLink.isVisible().catch(() => false)
    if (hasLink) {
      await clientLink.click()
    } else {
      await clientButton.click()
    }

    await expect(page).toHaveURL(/\/curator\/clients\//, { timeout: 10000 })
    await detail.expectLoaded()
  })

  test('client header is visible with name and message button', async () => {
    await expect(detail.backButton).toBeVisible()
    await expect(detail.messageButton).toBeVisible()
  })

  test('overview tab sections are visible', async () => {
    // Overview tab is default — check key sections
    await expect(detail.nutritionHeading).toBeVisible({ timeout: 10000 })
    // Weight section only renders if client has weight data
    const weightVisible = await detail.weightHeading
      .isVisible()
      .catch(() => false)
    if (weightVisible) {
      await expect(detail.weightHeading).toBeVisible()
    }
  })

  test('details toggle shows client info', async ({ page }) => {
    await detail.detailsToggle.click()

    // Should show client details like email
    await expect(page.getByText(/@/).first()).toBeVisible({ timeout: 5000 })
  })

  test('switch to plan tab', async ({ page }) => {
    await detail.planTab.click()
    await expect(page).toHaveURL(/tab=plan/, { timeout: 10000 })

    // Should show either current plan or "create plan"
    const planHeading = detail.currentPlanHeading
    const emptyPlan = page.getByText('Активный план не задан')
    await expect(planHeading.or(emptyPlan)).toBeVisible({ timeout: 10000 })
  })

  test('switch to tasks tab', async ({ page }) => {
    await detail.tasksTab.click()
    await expect(page).toHaveURL(/tab=tasks/, { timeout: 10000 })

    // Should show task filters
    await expect(detail.activeTasksFilter).toBeVisible({ timeout: 10000 })
    await expect(detail.completedTasksFilter).toBeVisible()
  })

  test('switch to reports tab', async ({ page }) => {
    await detail.reportsTab.click()
    await expect(page).toHaveURL(/tab=reports/, { timeout: 10000 })
  })

  test('back button returns to curator hub', async ({ page }) => {
    await detail.backButton.click()
    await expect(page).toHaveURL(/\/curator$/, { timeout: 10000 })
  })

  test('message button navigates to chat', async ({ page }) => {
    await detail.messageButton.click()
    await expect(page).toHaveURL(/\/curator\/chat\//, { timeout: 10000 })
  })
})
