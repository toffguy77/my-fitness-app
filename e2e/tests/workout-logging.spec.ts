import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'

test.describe('Workout Logging', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()
  })

  test('workout block is visible with add button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Тренировка' })).toBeVisible()
    await expect(
      page
        .getByLabel('Добавить тренировку')
        .or(page.getByLabel('Изменить тренировку'))
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('open workout dialog and select type', async ({ page }) => {
    const addButton = page
      .getByLabel('Добавить тренировку')
      .or(page.getByLabel('Изменить тренировку'))
    await addButton.first().click()

    // Dialog should open with workout type radiogroup
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Workout type radio buttons should be available
    const silRadio = page.getByRole('radio', { name: 'Тип тренировки: Силовая' })
    await expect(silRadio).toBeVisible()
    await silRadio.click()
    await expect(silRadio).toHaveAttribute('aria-checked', 'true')
  })

  test('cancel workout dialog', async ({ page }) => {
    const addButton = page
      .getByLabel('Добавить тренировку')
      .or(page.getByLabel('Изменить тренировку'))
    await addButton.first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await page.getByLabel('Отменить добавление тренировки').click()
    await expect(dialog).toBeHidden({ timeout: 5000 })
  })

  test('save workout with type and duration', async ({ page }) => {
    const addButton = page
      .getByLabel('Добавить тренировку')
      .or(page.getByLabel('Изменить тренировку'))
    await addButton.first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Select workout type (use radio role to avoid matching the info display)
    await page.getByRole('radio', { name: 'Тип тренировки: Кардио' }).click()

    // Enter duration
    await page.getByLabel('Длительность тренировки в минутах').fill('45')

    // Save
    await page.getByLabel('Сохранить тренировку').click()

    // Should show completion status
    await expect(
      page.getByLabel('Тренировка выполнена')
    ).toBeVisible({ timeout: 10000 })
  })
})
