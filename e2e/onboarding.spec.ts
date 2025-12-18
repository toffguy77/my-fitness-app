/**
 * E2E Tests: Onboarding Flow
 * Critical scenario: New user completes onboarding
 */

import { test, expect } from '@playwright/test'

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to onboarding (requires auth - would need setup)
    await page.goto('/onboarding')
  })

  test('should display onboarding steps', async ({ page }) => {
    // Step 1: Biometrics
    await expect(page.locator('text=/биометрия|рост|вес/i')).toBeVisible()
    await expect(page.locator('input[name="height"]')).toBeVisible()
    await expect(page.locator('input[name="weight"]')).toBeVisible()
  })

  test('should validate biometric inputs', async ({ page }) => {
    // Try to proceed without filling required fields
    await page.click('button:has-text("Далее")')
    
    // Should show validation errors
    await expect(page.locator('text=/обязательно|required/i')).toBeVisible()
  })

  test('should navigate between onboarding steps', async ({ page }) => {
    // Fill step 1
    await page.fill('input[name="height"]', '175')
    await page.fill('input[name="weight"]', '70')
    await page.selectOption('select[name="gender"]', 'male')
    await page.fill('input[name="birth_date"]', '1990-01-01')
    
    // Proceed to step 2
    await page.click('button:has-text("Далее")')
    
    // Should be on activity level step
    await expect(page.locator('text=/активность|activity/i')).toBeVisible()
  })

  test('should calculate and save targets after onboarding', async ({ page }) => {
    // Complete all steps
    // Step 1: Biometrics
    await page.fill('input[name="height"]', '175')
    await page.fill('input[name="weight"]', '70')
    await page.selectOption('select[name="gender"]', 'male')
    await page.fill('input[name="birth_date"]', '1990-01-01')
    await page.click('button:has-text("Далее")')
    
    // Step 2: Activity
    await page.click('button:has-text(/умеренная|moderate/i)')
    await page.click('button:has-text("Далее")')
    
    // Step 3: Goal
    await page.click('button:has-text(/похудение|weight loss/i)')
    await page.click('button:has-text("Завершить")')
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/)
  })
})

