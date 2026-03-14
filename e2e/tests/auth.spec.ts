import { test, expect } from '@playwright/test'
import { AuthPage } from '../pages/auth.page'
import { accounts } from '../fixtures/test-accounts'

test.describe('Authentication', () => {
  let authPage: AuthPage

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page)
    await authPage.goto()
    await authPage.expectLoaded()
  })

  test('login as client redirects to /dashboard', async ({ page }) => {
    const { email, password } = accounts.client
    await authPage.login(email, password)
    await page.waitForURL('**/dashboard**', { timeout: 15000 })
    expect(page.url()).toContain('/dashboard')
  })

  test('login as curator redirects to /curator', async ({ page }) => {
    const { email, password } = accounts.curator
    await authPage.login(email, password)
    await page.waitForURL('**/curator**', { timeout: 15000 })
    expect(page.url()).toContain('/curator')
  })

  test('login as admin redirects to /admin', async ({ page }) => {
    const { email, password } = accounts.admin
    await authPage.login(email, password)
    await page.waitForURL('**/admin**', { timeout: 15000 })
    expect(page.url()).toContain('/admin')
  })

  test('invalid credentials show error', async ({ page }) => {
    await authPage.login('wrong@example.com', 'wrongpassword')
    await authPage.expectErrorToast('Неверный логин или пароль')
  })

  test('unauthenticated user redirected to /auth from /dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/auth**', { timeout: 15000 })
    expect(page.url()).toContain('/auth')
  })
})
