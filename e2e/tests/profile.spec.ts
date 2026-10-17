import { test, expect } from '../fixtures/session'
import { ProfilePage } from '../pages/profile.page'

test.describe('Profile Page', () => {
  let profile: ProfilePage

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page)
    await profile.goto()
    await profile.expectLoaded()
  })

  test('displays all menu items', async () => {
    await expect(profile.settingsProfileLink).toBeVisible()
    await expect(profile.bodyGoalsLink).toBeVisible()
    await expect(profile.socialAccountsLink).toBeVisible()
    await expect(profile.appleHealthLink).toBeVisible()
    await expect(profile.notificationsLink).toBeVisible()
  })

  test('logout button is visible', async () => {
    await expect(profile.logoutButton).toBeVisible()
  })

  test('navigate to settings profile', async ({ page }) => {
    await profile.settingsProfileLink.click()
    await expect(page).toHaveURL(/\/settings\/profile/, { timeout: 10000 })
  })

  test('navigate to body and goals', async ({ page }) => {
    await profile.bodyGoalsLink.click()
    await expect(page).toHaveURL(/\/settings\/body/, { timeout: 10000 })
  })

  test('navigate to social accounts', async ({ page }) => {
    await profile.socialAccountsLink.click()
    await expect(page).toHaveURL(/\/settings\/social/, { timeout: 10000 })
  })

  test('navigate to notifications settings', async ({ page }) => {
    await profile.notificationsLink.click()
    await expect(page).toHaveURL(/\/settings\/notifications/, { timeout: 10000 })
  })

  test('logout redirects to auth page', async ({ page }) => {
    await profile.logoutButton.click()
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })
  })

  /**
   * Выход завершает сессию на сервере, а не только в этой вкладке.
   *
   * Раньше профиль чистил токен в памяти и уходил на /auth, а refresh-токен
   * оставался действующим: тот, у кого была cookie, входил дальше. Проверяется
   * именно тот токен, который выход предъявил серверу, — взятый из заголовка
   * самого запроса, а не из банки cookie перед нажатием: банка к тому моменту
   * могла уже повернуть токен, и проверка прошла бы, не проверив ничего.
   */
  test('after logout /auth/refresh gives no session', async ({ page, context, baseURL }) => {
    const logoutRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v1/auth/logout'),
    )
    await profile.logoutButton.click()
    const sent = await logoutRequest
    const cookieHeader = (await sent.allHeaders())['cookie'] ?? ''
    const presented = /(?:^|;\s*)refresh_token=([^;]+)/.exec(cookieHeader)?.[1]
    expect(presented, 'выход не предъявил серверу refresh-токен').toBeTruthy()
    expect((await sent.response())?.ok(), 'POST /auth/logout не прошёл').toBeTruthy()

    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 })

    // Браузер больше ничего не держит: обновление отвечает без сессии.
    const afterLogout = await context.request.post(`${baseURL}/api/v1/auth/refresh`, { data: {} })
    if (afterLogout.status() !== 204) {
      expect(afterLogout.status()).toBe(401)
    }

    // И сервер не примет тот самый токен, даже если вернуть его в браузер.
    await context.addCookies([
      {
        name: 'refresh_token',
        value: presented!,
        domain: new URL(baseURL!).hostname,
        path: '/api/v1/auth',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ])
    const replayed = await context.request.post(`${baseURL}/api/v1/auth/refresh`, { data: {} })
    expect(replayed.status(), `отозванный токен снова дал сессию: ${await replayed.text()}`).toBe(401)
  })
})
