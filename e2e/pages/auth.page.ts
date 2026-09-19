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
    // visitor would — a click, not a reload.
    await this.page.getByRole('button', { name: 'Войти по паролю' }).click()
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
