import { test, expect } from '@playwright/test'
import { AuthPage } from '../pages/auth.page'
import { accounts } from '../fixtures/test-accounts'

test.describe('Role-based access control', () => {
  test('client cannot access /curator', async ({ page }) => {
    // Login as client
    const authPage = new AuthPage(page)
    await authPage.goto()
    await authPage.login(accounts.client.email, accounts.client.password)
    await page.waitForURL('**/dashboard**', { timeout: 15000 })

    // Try to access curator page
    await page.goto('/curator')
    await page.waitForURL('**/dashboard**', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })

  test('client cannot access /admin', async ({ page }) => {
    const authPage = new AuthPage(page)
    await authPage.goto()
    await authPage.login(accounts.client.email, accounts.client.password)
    await page.waitForURL('**/dashboard**', { timeout: 15000 })

    await page.goto('/admin')
    await page.waitForURL('**/dashboard**', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })

  test('curator cannot access /admin', async ({ page }) => {
    const authPage = new AuthPage(page)
    await authPage.goto()
    await authPage.login(accounts.curator.email, accounts.curator.password)
    await page.waitForURL('**/curator**', { timeout: 15000 })

    await page.goto('/admin')
    await page.waitForURL('**/dashboard**', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })
})
