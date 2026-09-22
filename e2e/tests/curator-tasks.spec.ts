import { test, expect } from '../fixtures/session'
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

    await hub.openFirstClient()
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
    // Раньше здесь стояло «берём встроенную кнопку, а не плавающую, потому что
    // та за навигацией» — обход дефекта, записанный в тест вместо починки.
    // Обход к тому же был ненадёжен: `.first()` выбирал как раз плавающую,
    // когда она шла раньше в разметке, и тест упирался в перекрытие.
    //
    // Плавающая кнопка поднята над навигацией (TasksTab.tsx, sm:bottom-24
    // и z-50 — тем же способом, каким это уже решено в дневнике питания),
    // поэтому кликается именно она: если она снова уедет под навигацию,
    // упадёт этот тест, а не пользователь.
    // Именно плавающая кнопка, по метке, а не `.first()` по имени: обе кнопки
    // называются одинаково, и `.first()` брал то одну, то другую — в
    // зависимости от порядка в разметке. Дефект перекрытия касается только
    // плавающей, и стеречь его может лишь проверка, которая жмёт её саму.
    await detail.page.getByTestId('create-task-fab').click()

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
