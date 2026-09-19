import { test, expect } from '../fixtures/session'
import { FoodTrackerPage } from '../pages/food-tracker.page'

/**
 * Три отказа сервера при распознавании фото, и каждый обязан дойти до
 * человека своими словами.
 *
 * Так было не всегда: `AIPhotoTab` ловил любую неудачу пустым `catch { … }`,
 * выбрасывал ошибку и показывал одну фразу — «Ошибка при распознавании
 * фото» — на все три случая сразу. Человек, исчерпавший суточный потолок,
 * переснимал тарелку до посинения, потому что интерфейс не говорил ему, что
 * снимки кончились до завтра.
 *
 * Эти тесты писались красными на том поведении и позеленели вместе с
 * починкой (PR #99). Они здесь затем, чтобы `catch`, теряющий причину, не
 * вернулся незамеченным:
 *
 * - 422, модель не разобрала снимок -> `recognition_unclear`: предложение
 *   снять ближе или добавить еду вручную;
 * - 429, суточный потолок исчерпан -> `recognition_daily_limit`: снимки
 *   кончились до завтра. Намеренно НЕ общий текст про «подождите немного»:
 *   ждать минуту бесполезно, потолок сбрасывается назавтра;
 * - 503, возможность выключена в среде -> `feature_unavailable`.
 *
 * Ответ сервера подменяется целиком, живая модель не вызывается: она стоит
 * денег, недетерминирована и упирается в тот самый суточный потолок.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function openPhotoTab(page: import('@playwright/test').Page): Promise<FoodTrackerPage> {
  const foodTracker = new FoodTrackerPage(page)
  await foodTracker.goto()
  await foodTracker.expectLoaded()
  await foodTracker.openAddFoodForMeal('Завтрак')
  await foodTracker.openPhotoTab()
  return foodTracker
}

test.describe('Food recognition — server refusals explain themselves', () => {
  test('a 422 tells the person to shoot closer or add the food manually', async ({ page }) => {
    const foodTracker = await openPhotoTab(page)

    await page.route('**/api/v1/food-tracker/recognize', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          message: 'Не удалось разобрать это фото — попробуйте снять ближе или добавьте еду вручную',
          code: 'recognition_unclear',
        }),
      }),
    )

    await foodTracker.uploadPhoto(PNG)

    await expect(page.getByText(/снять ближе|добавьте еду вручную/)).toBeVisible({ timeout: 10000 })
  })

  test("today's daily recognition limit says to come back tomorrow, not to wait a moment", async ({ page }) => {
    const foodTracker = await openPhotoTab(page)

    await page.route('**/api/v1/food-tracker/recognize', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          message: 'Снимки на сегодня закончились — новый можно будет сделать завтра. Добавьте эту еду вручную.',
          code: 'daily_limit_reached',
        }),
      }),
    )

    await foodTracker.uploadPhoto(PNG)

    await expect(page.getByText(/завтра/)).toBeVisible({ timeout: 10000 })
    // The generic rate-limit text is wrong here — it promises that trying
    // again in a moment will help, which it will not until tomorrow.
    await expect(page.getByText(/подожд/i)).toHaveCount(0)
  })

  test('a disabled recognition capability says so, not a generic recognition failure', async ({ page }) => {
    const foodTracker = await openPhotoTab(page)

    await page.route('**/api/v1/food-tracker/recognize', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          message: 'Возможность отключена в этой среде',
          code: 'feature_unavailable',
        }),
      }),
    )

    await foodTracker.uploadPhoto(PNG)

    await expect(page.getByText('Возможность отключена в этой среде')).toBeVisible({ timeout: 10000 })
  })
})
