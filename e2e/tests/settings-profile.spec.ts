import { test, expect } from '@playwright/test'
import { SettingsProfilePage } from '../pages/settings.page'

test.describe('Settings Profile', () => {
  let settings: SettingsProfilePage

  test.beforeEach(async ({ page }) => {
    settings = new SettingsProfilePage(page)
    await settings.goto()
    await settings.expectLoaded()
  })

  test('page heading and back link are visible', async () => {
    await expect(settings.heading).toBeVisible()
    await expect(settings.backLink).toBeVisible()
  })

  test('name input is visible with current value', async () => {
    await expect(settings.nameInput).toBeVisible()
    const value = await settings.nameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('language selector shows current language', async () => {
    await expect(settings.russianLangButton).toBeVisible()
    await expect(settings.englishLangButton).toBeVisible()

    // One of them should be active (aria-pressed)
    const ruPressed = await settings.russianLangButton.getAttribute(
      'aria-pressed'
    )
    const enPressed = await settings.englishLangButton.getAttribute(
      'aria-pressed'
    )
    expect(ruPressed === 'true' || enPressed === 'true').toBeTruthy()
  })

  test('unit selector shows current units', async () => {
    await expect(settings.metricUnitsButton).toBeVisible()
    await expect(settings.imperialUnitsButton).toBeVisible()

    const metricPressed = await settings.metricUnitsButton.getAttribute(
      'aria-pressed'
    )
    const imperialPressed = await settings.imperialUnitsButton.getAttribute(
      'aria-pressed'
    )
    expect(
      metricPressed === 'true' || imperialPressed === 'true'
    ).toBeTruthy()
  })

  test('back link navigates to profile', async ({ page }) => {
    await settings.backLink.click()
    await expect(page).toHaveURL(/\/profile/, { timeout: 10000 })
  })
})
