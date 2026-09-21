import { type Page, expect } from '@playwright/test'
import { ru } from '../../apps/web/src/shared/i18n/dictionaries/ru'

// Доступные имена берутся из того же словаря, что и разметка (AuthForm.tsx,
// AuthScreen.tsx) — раньше они были вписаны здесь строками и разошлись со
// словарём в третьем круге правок задачи 9, когда подписи перевели на
// русский. Импорт из словаря делает расхождение невозможным: сборка упадёт
// раньше, чем спек покраснеет молча.
export class AuthPage {
  constructor(private page: Page) {}

  get emailInput() {
    return this.page.getByLabel(ru.auth.emailLabel, { exact: true })
  }

  get passwordInput() {
    return this.page.getByLabel(ru.auth.password, { exact: true })
  }

  get loginButton() {
    return this.page.getByLabel(ru.auth.signIn, { exact: true })
  }

  get registerButton() {
    return this.page.getByLabel(ru.auth.register, { exact: true })
  }

  async goto() {
    await this.page.goto('/auth')
    // `/auth` открывает форму пароля сразу — вход и регистрация разведены по
    // существу, а не по подписи. Переключаться некуда и не нужно.
    //
    // Клик оставлен как запасной путь: если экран почему-то открылся формой
    // ссылки (например, пришли по `?mode=register`), к паролю ведёт
    // переключатель. Он отрисован сервером раньше, чем к нему привязан
    // обработчик, поэтому одиночный клик может попасть в это окно и не
    // сделать ничего — `toPass` повторяет сам клик, а не только ожидание
    // после него.
    await expect(async () => {
      if (!(await this.emailInput.isVisible().catch(() => false))) {
        await this.page.getByRole('button', { name: 'Войти по паролю' }).click()
      }
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
