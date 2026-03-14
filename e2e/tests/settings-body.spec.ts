import { test, expect } from '@playwright/test'
import { SettingsBodyPage } from '../pages/settings.page'

test.describe('Settings Body & Goals', () => {
  let body: SettingsBodyPage

  test.beforeEach(async ({ page }) => {
    body = new SettingsBodyPage(page)
    await body.goto()
    await body.expectLoaded()
  })

  test('all form fields are visible', async () => {
    await expect(body.birthDateInput).toBeVisible()
    await expect(body.maleRadio).toBeVisible()
    await expect(body.femaleRadio).toBeVisible()
    await expect(body.heightInput).toBeVisible()
    await expect(body.targetWeightInput).toBeVisible()
    await expect(body.activitySelect).toBeVisible()
    await expect(body.saveButton).toBeVisible()
  })

  test('fitness goal options are visible', async () => {
    await expect(body.goalLoss).toBeVisible()
    await expect(body.goalMaintain).toBeVisible()
    await expect(body.goalGain).toBeVisible()
  })

  test('biological sex radio buttons are functional', async ({ page }) => {
    // Both radio options should be visible
    await expect(body.maleRadio).toBeVisible()
    await expect(body.femaleRadio).toBeVisible()

    // Click male and verify the hidden radio input gets checked
    await body.maleRadio.click()
    const maleInput = page.locator('input[name="biological_sex"][value="male"]')
    await expect(maleInput).toBeChecked()
  })

  test('activity level select has options', async () => {
    const options = body.activitySelect.locator('option')
    // Should have at least the 4 activity levels + optional placeholder
    await expect(options).toHaveCount(5) // placeholder + 4 levels
  })

  test('save button submits form', async ({ page }) => {
    await body.saveButton.click()

    // Should show success toast from saveSettings hook
    await expect(page.getByText('Настройки сохранены')).toBeVisible({
      timeout: 10000,
    })
  })
})
