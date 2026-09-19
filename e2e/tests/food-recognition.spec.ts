import { test, expect } from '../fixtures/session'
import { FoodTrackerPage } from '../pages/food-tracker.page'

/**
 * Photo → composition → human-entered weight → live total → diary.
 *
 * The model's own answer never reaches this suite: recognition costs money
 * per call, one photo's answer varied threefold between runs, and a person
 * gets three recognitions a day — a fourth run in CI would hit that limit.
 * `**\/api/v1/food-tracker/recognize` is intercepted and answered with a
 * fixed payload instead, shaped like the actual response
 * (internal/modules/food-tracker/types.go: AIRecognitionResponse,
 * RecognizedFood — estimated_weight is snake_case only, nutrition is per
 * 100 g of that ingredient, not of the estimated portion).
 *
 * The point of the feature: the model names the dish and its composition
 * reliably, but the weight it guesses is only ever a hint — a human must
 * type the real number before anything can be saved, and it is the human's
 * number, not the model's, that ends up in the diary.
 */
const RECOGNITION_RESPONSE = {
  status: 'success',
  data: {
    foods: [
      {
        name: 'Овсяная каша с фруктами',
        confidence: 0.85,
        estimated_weight: 450,
        nutrition: { calories: 122.71, protein: 4, fat: 6, carbs: 19 },
      },
    ],
    composition: [
      {
        name: 'Овсяная каша',
        confidence: 0.9,
        estimated_weight: 200,
        nutrition: { calories: 88, protein: 3, fat: 1.7, carbs: 15 },
      },
      {
        name: 'Банан',
        confidence: 0.88,
        estimated_weight: 80,
        nutrition: { calories: 89, protein: 1.1, fat: 0.3, carbs: 23 },
      },
    ],
    success: true,
    photo_url: '',
    remaining_recognitions: 2,
  },
}

/** A real 1×1 PNG: compressImage() calls createImageBitmap() on the upload,
 * which rejects anything that isn't decodable image data. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('Food recognition from a photo', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await foodTracker.goto()
    await foodTracker.expectLoaded()
    await foodTracker.openAddFoodForMeal('Завтрак')
    await foodTracker.openPhotoTab()

    await page.route('**/api/v1/food-tracker/recognize', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RECOGNITION_RESPONSE),
      }),
    )
  })

  test('weight fields start empty; the model\'s guess is only a hint next to them', async () => {
    await foodTracker.uploadPhoto(PNG)

    await expect(foodTracker.weightInput('Овсяная каша')).toHaveValue('')
    await expect(foodTracker.weightInput('Банан')).toHaveValue('')
    await expect(foodTracker.modelEstimateText('Овсяная каша')).toHaveText('Оценка модели: 200 г')
    await expect(foodTracker.modelEstimateText('Банан')).toHaveText('Оценка модели: 80 г')
  })

  test('"Добавить" stays disabled until every position has a weight, and the total is marked partial', async () => {
    await foodTracker.uploadPhoto(PNG)

    await expect(foodTracker.photoConfirmButton).toBeDisabled()
    await expect(foodTracker.photoWeightRequiredHint).toBeVisible()

    await foodTracker.weightInput('Овсяная каша').fill('220')
    await expect(foodTracker.photoConfirmButton).toBeDisabled()
    await expect(foodTracker.photoLiveTotalPartial).toBeVisible()

    await foodTracker.weightInput('Банан').fill('90')
    await expect(foodTracker.photoConfirmButton).toBeEnabled()
    await expect(foodTracker.photoLiveTotalPartial).toBeHidden()
  })

  test('"Подставить" copies the model\'s estimate into the field on demand, and the total recalculates live', async () => {
    await foodTracker.uploadPhoto(PNG)

    await expect(foodTracker.photoLiveTotal).toHaveText('Итого: 0 ккал')
    await expect(foodTracker.weightInput('Банан')).toHaveValue('')

    await foodTracker.useModelEstimateButton('Банан').click()

    await expect(foodTracker.weightInput('Банан')).toHaveValue('80')
    // 80 g of "Банан" at 89 ккал/100г = 71.2, rounded for display.
    await expect(foodTracker.photoLiveTotal).toHaveText('Итого: 71 ккал')
  })

  test('a weight over 5000 g is refused with an explanation, and the button stays disabled', async () => {
    await foodTracker.uploadPhoto(PNG)

    await foodTracker.weightInput('Банан').fill('80')
    await foodTracker.weightInput('Овсяная каша').fill('6000')

    await expect(foodTracker.weightError('Овсяная каша')).toContainText('лишняя цифра')
    await expect(foodTracker.photoConfirmButton).toBeDisabled()
  })

  test('what the human typed reaches the diary — not the model\'s estimate', async () => {
    await foodTracker.uploadPhoto(PNG)

    // Deliberately different from the model's 200 g / 80 g — if the model's
    // numbers leaked through instead, the saved weight would read 280 g.
    await foodTracker.weightInput('Овсяная каша').fill('300')
    await foodTracker.weightInput('Банан').fill('50')
    await foodTracker.photoConfirmButton.click()

    // Onward to the portion step, which opens with the human's total already
    // filled in, then the final save into the diary.
    await foodTracker.foodModal.getByRole('button', { name: /Добавить/ }).click()
    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    const breakfastSlot = foodTracker.mealSlot('Завтрак')
    // .first(): a rerun against a database that already has today's earlier
    // entry (unlike CI's fresh-per-run Postgres) would otherwise match two —
    // the assertion only needs at least one to carry the human's total.
    await expect(
      breakfastSlot.getByLabel(/Овсяная каша с фруктами, 350 г/).first(),
    ).toBeVisible({ timeout: 5000 })
  })
})
