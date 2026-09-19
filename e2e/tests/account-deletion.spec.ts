import { test, expect } from '../fixtures/session'
import { SettingsPrivacyPage } from '../pages/settings.page'

/**
 * Account deletion, as it actually exists on `dev` today: a password and a
 * typed confirmation phrase, no email code. (A code-based version exists on
 * an unmerged branch; testing that here would test code nobody runs.)
 *
 * The request itself is always intercepted — a real deletion in E2E would
 * mean actually destroying a test account's data, which the suite must never
 * be able to do.
 */
test.describe('Account deletion', () => {
  let privacy: SettingsPrivacyPage

  test.beforeEach(async ({ page }) => {
    privacy = new SettingsPrivacyPage(page)
    await privacy.goto()
    await privacy.expectLoaded()
    await privacy.openDeleteForm()
  })

  test('the confirm button stays disabled until both the password and the phrase are given', async () => {
    await expect(privacy.confirmDeleteButton).toBeDisabled()

    await privacy.passwordInput.fill('whatever-the-password-is')
    await expect(privacy.confirmDeleteButton).toBeDisabled()

    await privacy.confirmPhraseInput.fill('УДАЛИТЬ')
    await expect(privacy.confirmDeleteButton).toBeEnabled()
  })

  test('a wrong confirmation phrase does not unlock the button', async () => {
    await privacy.passwordInput.fill('whatever-the-password-is')

    for (const wrong of ['удалить', 'УДАЛит', 'DELETE', 'УДАЛИТЬ ']) {
      await privacy.confirmPhraseInput.fill(wrong)
      await expect(privacy.confirmDeleteButton).toBeDisabled()
    }

    await privacy.confirmPhraseInput.fill('УДАЛИТЬ')
    await expect(privacy.confirmDeleteButton).toBeEnabled()
  })

  test('a server refusal is shown to the person, not swallowed', async ({ page }) => {
    await page.route('**/api/v1/users/me/deletion', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'internal error' }),
      })
    })

    await privacy.passwordInput.fill('whatever-the-password-is')
    await privacy.confirmPhraseInput.fill('УДАЛИТЬ')
    await privacy.confirmDeleteButton.click()

    // Not a silent no-op: told something went wrong, and the form is still
    // there rather than having quietly "succeeded".
    await expect(page.getByText(/Не удалось запросить удаление/)).toBeVisible({ timeout: 10000 })
    await expect(privacy.passwordInput).toBeVisible()
  })

  test('a wrong current password is reported as such, not as a generic failure', async ({ page }) => {
    await page.route('**/api/v1/users/me/deletion', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Неверный пароль' }),
      })
    })

    await privacy.passwordInput.fill('definitely-not-the-password')
    await privacy.confirmPhraseInput.fill('УДАЛИТЬ')
    await privacy.confirmDeleteButton.click()

    await expect(page.getByText('Неверный пароль')).toBeVisible({ timeout: 10000 })
  })
})
