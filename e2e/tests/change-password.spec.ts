import { test, expect, type Page } from '@playwright/test'
import { getAccount } from '../fixtures/test-accounts'

/**
 * Changing a password.
 *
 * The feature shipped broken: the frontend called an endpoint that did not
 * exist, and nothing checked. This walks the whole path.
 */
test.describe('Change password', () => {
  test('the form explains the rules and refuses a weak password', async ({ page }) => {
    await page.goto('/settings/password')

    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('E2e!Client#2026')
    await page.getByLabel(/^Новый пароль/).fill('password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('password')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    // Refused, and told why — not a generic failure.
    await expect(page.getByText(/заглавную букву|минимум 8|цифру|специальный/i).first()).toBeVisible()
  })

  test('mismatched confirmation is caught before the request', async ({ page }) => {
    await page.goto('/settings/password')
    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('E2e!Client#2026')
    await page.getByLabel(/^Новый пароль/).fill('An0ther!Password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('An0ther!Different')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    await expect(page.getByText(/не совпада/i).first()).toBeVisible()
  })

  test('a wrong current password is reported as such', async ({ page }) => {
    await page.goto('/settings/password')
    await expect(page.getByRole('heading', { name: /Изменить пароль/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByLabel(/Текущий пароль/).fill('NotTheCurrent!1')
    await page.getByLabel(/^Новый пароль/).fill('An0ther!Password')
    await page.getByLabel(/Подтвердите новый пароль/).fill('An0ther!Password')
    await page.getByRole('button', { name: 'Изменить пароль' }).click()

    // The endpoint exists and answers: the point of the test is that this
    // reaches the API at all.
    await expect(page.getByText(/Неверный текущий пароль|Не удалось изменить/i).first()).toBeVisible({
      timeout: 15000,
    })
  })
})

/**
 * The whole path, end to end: change the password, sign in with the new one,
 * and put it back.
 *
 * On its own account, because a successful change ends every session that user
 * has — sharing the client account would sign the rest of the suite out
 * mid-run. It is also why this test signs in itself rather than reusing the
 * stored state.
 */
test.describe('Change password, end to end', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  const account = getAccount('password')
  const NEW_PASSWORD = 'Rotated!Password#2026'

  async function signIn(page: Page, email: string, password: string) {
    await page.goto('/auth')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByLabel('Log in to your account').click()
    await page.waitForURL('**/dashboard**', { timeout: 15000 })
  }

  async function change(page: Page, current: string, next: string) {
    await page.goto('/settings/password')
    await page.getByLabel(/Текущий пароль/).fill(current)
    await page.getByLabel(/^Новый пароль/).fill(next)
    await page.getByLabel(/Подтвердите новый пароль/).fill(next)
    await page.getByRole('button', { name: 'Изменить пароль' }).click()
    await expect(page.getByText(/Пароль успешно изменён/)).toBeVisible({ timeout: 15000 })
  }

  test('the new password works and the old one does not', async ({ page }) => {
    await signIn(page, account.email, account.password)
    await change(page, account.password, NEW_PASSWORD)

    // The old password is refused.
    await page.context().clearCookies()
    await page.goto('/auth')
    await page.getByLabel('Email address').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByLabel('Log in to your account').click()
    await expect(page.getByText('Неверный логин или пароль')).toBeVisible({ timeout: 15000 })

    // The new one works.
    await signIn(page, account.email, NEW_PASSWORD)

    // Put it back, so the account is where the seed left it.
    await change(page, NEW_PASSWORD, account.password)
  })
})
