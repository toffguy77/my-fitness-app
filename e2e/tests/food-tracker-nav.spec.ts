import { test, expect } from '../fixtures/session'
import { FoodTrackerPage } from '../pages/food-tracker.page'

test.describe('Food Tracker Navigation & Tabs', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
  })

  test('date navigation buttons are visible', async ({ page }) => {
    await expect(page.getByLabel('Предыдущий день')).toBeVisible()
    await expect(page.getByLabel('Следующий день')).toBeVisible()
    await expect(page.getByLabel('Открыть календарь')).toBeVisible()
  })

  test('next day is disabled on today', async ({ page }) => {
    await expect(page.getByLabel('Следующий день')).toBeDisabled()
  })

  test('navigate to previous day and back', async ({ page }) => {
    const prevButton = page.getByLabel('Предыдущий день')
    const nextButton = page.getByLabel('Следующий день')

    // Go to previous day
    await prevButton.click()

    // Next day should now be enabled
    await expect(nextButton).toBeEnabled({ timeout: 5000 })

    // KBJU summary should still be visible (data loaded)
    await expect(foodTracker.kbzhuSummary).toBeVisible()

    // Navigate back to today
    await nextButton.click()

    // Next day should be disabled again (back to today)
    await expect(nextButton).toBeDisabled({ timeout: 5000 })
  })

  test('tabs are visible with Рацион selected', async ({ page }) => {
    const tablist = page.getByRole('tablist', {
      name: 'Разделы дневника питания',
    })
    await expect(tablist).toBeVisible()

    const dietTab = page.getByRole('tab', { name: 'Рацион' })
    await expect(dietTab).toHaveAttribute('aria-selected', 'true')
  })

  test('switch to Рекомендации tab', async ({ page }) => {
    const recsTab = page.getByRole('tab', { name: 'Рекомендации' })
    await recsTab.click()

    // Рекомендации tab should be selected
    await expect(recsTab).toHaveAttribute('aria-selected', 'true')

    // Рацион tab should be deselected
    const dietTab = page.getByRole('tab', { name: 'Рацион' })
    await expect(dietTab).toHaveAttribute('aria-selected', 'false')

    // Recommendations tab panel should be visible
    await expect(
      page.getByRole('tabpanel', { name: 'Рекомендации' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('switch back to Рацион tab shows meal slots', async ({ page }) => {
    // Go to recommendations
    await page.getByRole('tab', { name: 'Рекомендации' }).click()
    await expect(
      page.getByRole('tabpanel', { name: 'Рекомендации' })
    ).toBeVisible({ timeout: 5000 })

    // Switch back
    await page.getByRole('tab', { name: 'Рацион' }).click()

    // Meal slots should be visible again
    await foodTracker.expectMealSlotsVisible()
  })
})

/**
 * Быстрая запись со вчерашнего дня дашборда ведёт сюда с
 * `?date=<вчера>&add=search`. Раньше дневник брал дату только из своего
 * состояния и открывался на сегодня: запись уходила не в тот день, и заметить
 * это можно было только по пропаже еды из вчерашнего итога.
 */
test.describe('Дневник по ссылке с датой', () => {
  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]

  test('быстрая запись со вчерашнего дня открывает вчера', async ({ page }) => {
    // «Вчера» — по часам браузера: так же его считают и дашборд, и дневник.
    await page.goto('/')
    const yesterday = await page.evaluate(() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const pad = (n: number) => String(n).padStart(2, '0')
      return {
        iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        day: d.getDate(),
        month: d.getMonth(),
      }
    })

    const dayRequest = page.waitForRequest(
      (request) => request.url().includes('/api/v1/food-tracker') && request.url().includes(`date=${yesterday.iso}`),
      { timeout: 15000 },
    )
    await page.goto(`/food-tracker?date=${yesterday.iso}&add=search`)

    // Выбран вчерашний день: на кнопке календаря его число, без «Сегодня»,
    // и шаг вперёд доступен — с сегодняшнего он выключен.
    const dateButton = page.getByLabel('Открыть календарь')
    await expect(dateButton).toHaveText(new RegExp(`^\\s*${yesterday.day} ${MONTHS[yesterday.month]}\\s*$`, 'i'))
    await expect(page.getByLabel('Следующий день')).toBeEnabled()
    await dayRequest

    // И окно добавления открыто сразу на поиске.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(dialog.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByPlaceholder('Поиск блюд и продуктов')).toBeVisible()
  })

  test('мусор в дате открывает сегодня', async ({ page }) => {
    await page.goto('/food-tracker?date=вчера')
    await expect(page.getByLabel('Открыть календарь')).toContainText('Сегодня')
    await expect(page.getByLabel('Следующий день')).toBeDisabled()
  })
})
