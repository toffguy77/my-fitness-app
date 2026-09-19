import { type Page, expect } from '@playwright/test'

export class AuthPage {
  constructor(private page: Page) {}

  get emailInput() {
    return this.page.getByLabel('Email address')
  }

  get passwordInput() {
    return this.page.getByLabel('Password')
  }

  get loginButton() {
    return this.page.getByLabel('Log in to your account')
  }

  get registerButton() {
    return this.page.getByLabel('Register a new account')
  }

  async goto() {
    await this.page.goto('/auth')
    // The screen shows the magic-link form first; every test in this object
    // exercises the password form, so it switches to it the same way a real
    // visitor would — a click, not a reload. The button is server-rendered
    // before hydration attaches its handler, so a single click can land in
    // that window and do nothing — a classic lost Next.js click, and the
    // failure it produces (expectLoaded() timing out on "Email address not
    // visible") says nothing about a missed click. Unlike every other page
    // object here (see dashboard.page.ts, settings.page.ts), goto() acts
    // instead of only navigating, precisely because this screen requires a
    // click to reach the form the rest of the object assumes. `toPass`
    // retries the click itself, not just the wait after it — a plain
    // `expect(...).toBeVisible()` here would still time out once if the
    // click were lost, just with a clearer stack trace.
    await expect(async () => {
      await this.page.getByRole('button', { name: 'Войти по паролю' }).click()
      await expect(this.emailInput).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.loginButton.click()
  }

  async expectLoaded() {
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
    await expect(this.loginButton).toBeVisible()
  }

  async expectErrorToast(text: string) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 5000 })
  }
}
