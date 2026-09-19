import { test, expect, signIn, asUser } from '../fixtures/session'
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
 * The `foods[0]` entry below is what the model returns for the *combined*
 * dish; the backend derives it from the composition rather than inventing it
 * independently (internal/modules/food-tracker/service.go, RecognizeFood):
 * estimated_weight is the sum of the composition's weights (200 + 80 = 280),
 * confidence is the minimum across composition items (min(0.9, 0.88) = 0.88),
 * and nutrition is the composition's weight-weighted average per 100 g
 * ((88×200 + 89×80) / 280 ≈ 88.29, and so on for protein/fat/carbs). Kept
 * consistent here so this fixture reads as a real response, not a decoy.
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
        confidence: 0.88,
        estimated_weight: 280,
        nutrition: { calories: 88.29, protein: 2.46, fat: 1.3, carbs: 17.29 },
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

/** Registers the recognize-endpoint mock and opens the photo tab, ready for
 * a file to be uploaded. */
async function openPhotoTabWithMock(page: import('@playwright/test').Page, foodTracker: FoodTrackerPage) {
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
}

test.describe('Food recognition from a photo', () => {
  let foodTracker: FoodTrackerPage

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    await openPhotoTabWithMock(page, foodTracker)
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

    // The input itself carries the invalid state...
    await expect(foodTracker.weightInput('Овсяная каша')).toHaveAttribute('aria-invalid', 'true')
    // ...and the reason is worded as "an extra digit", not a generic complaint.
    await expect(foodTracker.weightErrorText('Овсяная каша', /лишняя цифра/)).toBeVisible()
    await expect(foodTracker.photoConfirmButton).toBeDisabled()
  })

  test('a photo without a composition — one item, not a dish broken into parts — still asks for a weight', async ({ page }) => {
    // Overrides the beforeEach's route: this scenario needs a response
    // shaped differently, not the composition one. In this branch
    // getWeighablePositions() falls back to the single top-level `food`
    // (AIPhotoTab.tsx), so the position's name is the dish name itself, and
    // the "Состав" heading and per-position name label — both gated on
    // `hasComposition` — do not render.
    await page.unroute('**/api/v1/food-tracker/recognize')
    await page.route('**/api/v1/food-tracker/recognize', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: {
            foods: [
              {
                name: 'Яблоко',
                confidence: 0.93,
                estimated_weight: 150,
                nutrition: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
              },
            ],
            composition: [],
            success: true,
            photo_url: '',
            remaining_recognitions: 2,
          },
        }),
      }),
    )

    await foodTracker.uploadPhoto(PNG)

    // Exactly one field, labelled with the dish's own name — the
    // per-ingredient list heading never appears.
    await expect(page.getByText('Состав')).toHaveCount(0)
    await expect(page.getByText('Вес порции', { exact: true })).toBeVisible()
    await expect(foodTracker.weightInput('Яблоко')).toHaveValue('')
    await expect(page.getByText('Оценка модели: 150 г')).toBeVisible()

    await expect(foodTracker.photoConfirmButton).toBeDisabled()
    await foodTracker.weightInput('Яблоко').fill('130')
    await expect(foodTracker.photoConfirmButton).toBeEnabled()
  })

  test('the upload actually sends a "photo" multipart field, not just a well-formed request', async ({ page }) => {
    // route.fulfill() above answers without looking — a renamed form field
    // would pass every other test in this file and still be broken. This
    // one inspects the intercepted request itself, replacing the
    // beforeEach's route rather than stacking on top of it.
    await page.unroute('**/api/v1/food-tracker/recognize')
    let capturedFieldNames: string[] = []
    await page.route('**/api/v1/food-tracker/recognize', async (route) => {
      const request = route.request()
      const headerContentType = request.headers()['content-type'] ?? ''
      expect(headerContentType).toContain('multipart/form-data')

      const body = request.postDataBuffer()
      const boundaryMatch = headerContentType.match(/boundary=(.+)$/)
      expect(boundaryMatch, 'multipart request had no boundary').toBeTruthy()
      const text = body?.toString('utf8') ?? ''
      capturedFieldNames = [...text.matchAll(/name="([^"]+)"/g)].map((m) => m[1])

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RECOGNITION_RESPONSE),
      })
    })

    await foodTracker.uploadPhoto(PNG)
    await expect(foodTracker.weightInput('Банан')).toBeVisible()

    expect(capturedFieldNames).toContain('photo')
  })
})

/**
 * The main assertion of the whole feature: the diary ends up with the
 * weight the human typed, not the model's estimate.
 *
 * This is the one test in the file that actually saves — the rest never get
 * past the "select-portion" step. Two things guard against the test lying
 * about that save:
 *
 * 1. The weights are derived from `Date.now()` so the saved entry's label is
 *    unique to this run. A fixed "300 г" would, after the very first green
 *    run, sit in the diary forever (CI's Postgres is fresh per run, but a
 *    long-lived database — including dev, which `playwright.config.ts`
 *    allows pointing at via `E2E_BASE_URL` — is not). A later run whose
 *    assertion used `.first()` to tolerate the duplicate would then find
 *    *last* run's leftover row and pass even if the save under test were
 *    broken: verified by mutating handleConfirmSelection to use the model's
 *    estimate instead of the typed weight and re-running against a database
 *    that already had a real "…, 350 г" entry from an earlier correct run —
 *    it stayed green. See the report for the exact before/after.
 * 2. `afterEach` deletes the entry it created, via the API with a token from
 *    `asUser()` — the same shape as `change-password.spec.ts`'s cleanup,
 *    which exists for the same reason: "without this the test poisons
 *    itself."
 */
test.describe('Food recognition — saved to the diary', () => {
  let foodTracker: FoodTrackerPage
  let createdEntryId: string | undefined

  test.beforeEach(async ({ page }) => {
    foodTracker = new FoodTrackerPage(page)
    createdEntryId = undefined
    await openPhotoTabWithMock(page, foodTracker)
  })

  test.afterEach(async ({ context, baseURL }) => {
    if (!createdEntryId) return
    const token = await signIn(context, baseURL!, 'client')
    await context.request.delete(`${baseURL}/api/v1/food-tracker/entries/${createdEntryId}`, {
      headers: asUser(token),
    })
  })

  test('what the human typed reaches the diary — not the model\'s estimate', async ({ page }) => {
    // Unique per run, and deliberately different from the model's 200 g /
    // 80 g — if the model's numbers leaked through instead, the saved
    // weight would read 280 g (the model's total), not this one.
    const jitter = Date.now() % 97
    const oatWeight = 300 + jitter
    const bananaWeight = 50 + (jitter % 41)
    const totalWeight = oatWeight + bananaWeight

    await foodTracker.uploadPhoto(PNG)

    await foodTracker.weightInput('Овсяная каша').fill(String(oatWeight))
    await foodTracker.weightInput('Банан').fill(String(bananaWeight))
    await foodTracker.photoConfirmButton.click()

    // Onward to the portion step, which opens with the human's total already
    // filled in, then the final save into the diary — captured so it can be
    // cleaned up, and so the id is available even though the UI does not
    // show it.
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/v1/food-tracker/entries') && res.request().method() === 'POST',
      ),
      foodTracker.foodModal.getByRole('button', { name: /Добавить/ }).click(),
    ])
    const body = await response.json()
    createdEntryId = body?.data?.id ?? body?.id
    expect(createdEntryId, 'save did not return an entry id to clean up').toBeTruthy()

    await expect(foodTracker.foodModal).toBeHidden({ timeout: 10000 })

    const breakfastSlot = foodTracker.mealSlot('Завтрак')
    await expect(
      breakfastSlot.getByLabel(new RegExp(`Овсяная каша с фруктами, ${totalWeight} г`)),
    ).toBeVisible({ timeout: 5000 })
  })
})
