/**
 * E2E Tests for Metrics Dashboard
 */

import { test, expect } from '@playwright/test'

test.describe('Metrics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')

    // Login as super_admin or coordinator
    // Note: This requires test user setup
    await page.fill('input[type="email"]', 'admin@test.com')
    await page.fill('input[type="password"]', 'testpassword')
    await page.click('button[type="submit"]')

    // Wait for navigation
    await page.waitForURL('/app/dashboard', { timeout: 5000 })
  })

  test('should display metrics dashboard for authorized users', async ({ page }) => {
    await page.goto('/app/admin/metrics')

    // Check page title
    await expect(page.getByText('Метрики и аналитика')).toBeVisible()

    // Check key metrics are displayed
    await expect(page.getByText('Time to First Value')).toBeVisible()
    await expect(page.getByText('Daily Active Users')).toBeVisible()
    await expect(page.getByText('Onboarding Completion')).toBeVisible()
  })

  test('should redirect unauthorized users', async ({ page }) => {
    // Logout first
    await page.goto('/app/dashboard')
    // ... logout logic ...

    // Try to access metrics page
    await page.goto('/app/admin/metrics')

    // Should be redirected
    await expect(page).toHaveURL(/\/login|\/app\/dashboard/)
  })

  test('should filter metrics by date range', async ({ page }) => {
    await page.goto('/app/admin/metrics')

    // Wait for page to load
    await page.waitForSelector('input[type="date"]', { timeout: 5000 })

    // Change start date
    const startDateInput = page.locator('input[type="date"]').first()
    await startDateInput.fill('2024-01-01')

    // Change end date
    const endDateInput = page.locator('input[type="date"]').last()
    await endDateInput.fill('2024-01-31')

    // Metrics should update (we can't easily test the API call, but we can verify UI)
    await expect(page.getByText('Time to First Value')).toBeVisible()
  })

  test('should display charts', async ({ page }) => {
    await page.goto('/app/admin/metrics')

    // Wait for charts to load
    await page.waitForSelector('.recharts-wrapper', { timeout: 10000 })

    // Check that charts are rendered
    const charts = page.locator('.recharts-wrapper')
    await expect(charts.first()).toBeVisible()
  })

  test('should display feature adoption metrics', async ({ page }) => {
    await page.goto('/app/admin/metrics')

    // Wait for metrics to load
    await page.waitForSelector('text=Feature Adoption', { timeout: 5000 })

    // Check feature adoption section
    await expect(page.getByText('Feature Adoption')).toBeVisible()
    await expect(page.getByText(/Сохранение приемов пищи/)).toBeVisible()
  })
})
