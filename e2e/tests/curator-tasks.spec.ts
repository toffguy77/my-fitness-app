import { test, expect } from '@playwright/test'
import { CuratorHubPage } from '../pages/curator-hub.page'
import { CuratorClientDetailPage } from '../pages/curator-client-detail.page'

test.describe('Curator Task Management', () => {
  let hub: CuratorHubPage
  let detail: CuratorClientDetailPage

  test.beforeEach(async ({ page }) => {
    hub = new CuratorHubPage(page)
    detail = new CuratorClientDetailPage(page)

    // Navigate to a client detail page
    await hub.goto()
    await hub.expectLoaded()

    const clientLink = page.locator('a[href*="/curator/clients/"]').first()
    const clientButton = page
      .getByRole('button')
      .filter({ hasText: /Калории|Нет записей|Нет активности/ })
      .first()

    const hasLink = await clientLink.isVisible().catch(() => false)
    if (hasLink) {
      await clientLink.click()
    } else {
      await clientButton.click()
    }

    await expect(page).toHaveURL(/\/curator\/clients\//, { timeout: 10000 })
    await detail.expectLoaded()

    // Switch to tasks tab
    await detail.tasksTab.click()
    await expect(page).toHaveURL(/tab=tasks/, { timeout: 10000 })
  })

  test('task filters are visible', async () => {
    await expect(detail.activeTasksFilter).toBeVisible({ timeout: 10000 })
    await expect(detail.completedTasksFilter).toBeVisible()
    // Overdue filter
    await expect(
      detail.page.getByRole('button', { name: 'Просроченные' })
    ).toBeVisible()
  })

  test('create task button is visible', async () => {
    await expect(detail.createTaskButton).toBeVisible({ timeout: 10000 })
  })

  test('open task creation form', async ({ page }) => {
    // Use the inline button (not the FAB which is behind footer nav)
    await detail.page
      .getByRole('button', { name: 'Создать задачу' })
      .first()
      .click()

    // Task form should appear with title input
    const titleInput = page.getByPlaceholder('Что нужно сделать?')
    await expect(titleInput).toBeVisible({ timeout: 5000 })
  })

  test('switch between task filters', async ({ page }) => {
    await detail.completedTasksFilter.click()
    // Should still show tasks tab
    await expect(detail.completedTasksFilter).toBeVisible()

    await page.getByRole('button', { name: 'Просроченные' }).click()
    await expect(
      page.getByRole('button', { name: 'Просроченные' })
    ).toBeVisible()

    // Switch back to active
    await detail.activeTasksFilter.click()
    await expect(detail.activeTasksFilter).toBeVisible()
  })
})
