import { test, expect } from '../fixtures/session'
import { answerCookieBanner } from '../fixtures/cookie-banner'

/**
 * The way in, for somebody who has no account.
 *
 * The registration form used to stand first, before the product had shown
 * anybody anything; this path is the change, so it is worth a test that walks
 * it end to end.
 */
test.describe('Guest onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/onboarding')
  })

  test('asks for a goal first, not for an email address', async ({ page }) => {
    await expect(page.getByText('Какая у вас цель?')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })

  test('produces a calculation without an account', async ({ page }) => {
    await page.getByRole('button', { name: /Снизить вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: 'Женский' }).click()
    await page.getByLabel('Дата рождения').fill('1990-05-01')
    await page.getByLabel('Рост, см').fill('170')
    await page.getByLabel('Вес, кг').fill('65')
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: /Умеренная активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    // Their own number, before anybody asked them for anything.
    await expect(page.getByTestId('guest-calories')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('guest-calories')).not.toBeEmpty()
    await expect(page.getByText(/стаканов по 250 мл/)).toBeVisible()
  })

  test('offers to save the result and asks for consent before storing it', async ({ page }) => {
    await page.getByRole('button', { name: /Удержать вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Мужской' }).click()
    await page.getByLabel('Дата рождения').fill('1985-01-01')
    await page.getByLabel('Рост, см').fill('180')
    await page.getByLabel('Вес, кг').fill('80')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: /Сидячий образ жизни/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    await page.getByRole('button', { name: 'Сохранить результат' }).click()

    await expect(page.getByLabel('Email')).toBeVisible()
    // Storing body measurements because somebody typed an address is not a
    // basis, so the button stays out of reach until they say so.
    await page.getByLabel('Email').fill('guest@burcev.test')
    await expect(page.getByRole('button', { name: 'Сохранить и продолжить' })).toBeDisabled()

    await page.getByRole('checkbox', { name: /обработку моих данных/ }).check()
    await expect(page.getByRole('button', { name: 'Сохранить и продолжить' })).toBeEnabled()
  })

  test('leaves without saving anything', async ({ page }) => {
    await page.getByRole('button', { name: /Набрать массу/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Женский' }).click()
    await page.getByLabel('Дата рождения').fill('1995-06-15')
    await page.getByLabel('Рост, см').fill('165')
    await page.getByLabel('Вес, кг').fill('55')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: /Высокая активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()
    await page.getByRole('button', { name: 'Сохранить результат' }).click()

    await page.getByRole('button', { name: 'Продолжить без сохранения' }).click()

    await expect(page).toHaveURL(/\/auth/)
  })

  /**
   * The support widget (задача 8) floats `fixed`, `bottom-6 right-6`, over
   * every step of this wizard. On a narrow phone viewport the goal/body/
   * activity steps pin their "Далее"/"Показать мою норму" button flush to
   * the bottom of a `min-h-screen` column (a `flex-1` sibling above it
   * absorbs all the spare height), so the two were close enough to trade
   * pixels: with the wizard's old `pb-8` (32px), the button's box (roughly
   * 32–80px above the viewport bottom, full width) overlapped the widget's
   * collapsed bubble (24–72px above the bottom, ~24–164px from the right) —
   * the exact class of bug already found once in the curator section, a
   * button hidden under a layer that sits above it. `pb-24` (96px) was the
   * fix; this pins it down geometrically rather than trusting the arithmetic
   * to still hold after the next layout tweak.
   */
  test('не даёт плавающему виджету перекрыть кнопку продолжения на узком экране', async ({
    page,
  }) => {
    // iPhone SE width — the tightest common viewport, and where the overlap
    // was reproducible before the fix.
    await page.setViewportSize({ width: 375, height: 667 })

    // Полоса про cookie держит виджет скрытым, пока на неё не ответили, —
    // а перекрытие проверяется именно между виджетом и кнопкой «Далее».
    await answerCookieBanner(page)

    const continueButton = page.getByRole('button', { name: 'Далее', exact: true })
    const widgetButton = page.getByRole('button', { name: 'Задать вопрос' })

    await expect(continueButton).toBeVisible({ timeout: 15000 })
    await expect(widgetButton).toBeVisible()

    // «Далее» стоит задизаблено, пока цель не выбрана (см. соседние тесты
    // этого файла) — без выбора клик в конце теста бил бы по кнопке, которая
    // никогда не станет активной, независимо от того, перекрывает её виджет
    // или нет. Сам выбор геометрию не меняет: кнопка занимает то же место
    // задизабленной и активной.
    await page.getByRole('button', { name: /Снизить вес/ }).click()

    const continueBox = await continueButton.boundingBox()
    const widgetBox = await widgetButton.boundingBox()
    expect(continueBox).not.toBeNull()
    expect(widgetBox).not.toBeNull()

    const overlaps =
      continueBox!.x < widgetBox!.x + widgetBox!.width &&
      continueBox!.x + continueBox!.width > widgetBox!.x &&
      continueBox!.y < widgetBox!.y + widgetBox!.height &&
      continueBox!.y + continueBox!.height > widgetBox!.y

    expect(overlaps).toBe(false)

    // Not just geometry: a tap in the button's own box has to reach the
    // button, not a `fixed`, higher-stacking-context element sitting over it.
    await continueButton.click()
    await expect(page.getByText('Ваши параметры')).toBeVisible({ timeout: 15000 })
  })
})
