import { type Page, expect } from '@playwright/test'

export class SettingsProfilePage {
  constructor(public page: Page) {}

  get backLink() {
    return this.page.getByText('Профиль').first()
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Настройки профиля' })
  }

  get nameInput() {
    return this.page.getByPlaceholder('Ваше имя')
  }

  get heightInput() {
    return this.page.getByPlaceholder('175')
  }

  get saveButton() {
    return this.page.getByRole('button', { name: 'Сохранить' })
  }

  get russianLangButton() {
    return this.page.getByRole('button', { name: 'Русский' })
  }

  get englishLangButton() {
    return this.page.getByRole('button', { name: 'English' })
  }

  get metricUnitsButton() {
    return this.page.getByRole('button', { name: 'Кг, см' })
  }

  get imperialUnitsButton() {
    return this.page.getByRole('button', { name: 'Фунты, дюймы' })
  }

  get deleteAccountButton() {
    return this.page.getByRole('button', { name: /Удалить аккаунт/ })
  }

  async goto() {
    await this.page.goto('/settings/profile')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }
}

export class SettingsBodyPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Тело и цели' })
  }

  get birthDateInput() {
    return this.page.locator('input[type="date"]')
  }

  get maleRadio() {
    return this.page.getByText('Мужской')
  }

  get femaleRadio() {
    return this.page.getByText('Женский')
  }

  get heightInput() {
    return this.page.getByPlaceholder('175')
  }

  get targetWeightInput() {
    return this.page.getByPlaceholder('70')
  }

  get activitySelect() {
    return this.page.locator('select')
  }

  get goalLoss() {
    return this.page.getByText('Снижение веса')
  }

  get goalMaintain() {
    return this.page.getByText('Поддержание')
  }

  get goalGain() {
    return this.page.getByText('Набор массы')
  }

  get saveButton() {
    return this.page.getByRole('button', { name: 'Сохранить' })
  }

  async goto() {
    await this.page.goto('/settings/body')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }
}

export class SettingsNotificationsPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Уведомления' })
  }

  get doNotDisturbLabel() {
    return this.page.getByText('Не беспокоить')
  }

  get switches() {
    return this.page.getByRole('switch')
  }

  get doNotDisturbSwitch() {
    return this.switches.first()
  }

  async goto() {
    await this.page.goto('/settings/notifications')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
    // Wait for API to load preferences and render switches
    await expect(this.doNotDisturbSwitch).toBeVisible({ timeout: 10000 })
  }
}

export class SettingsSocialPage {
  constructor(public page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Аккаунты социальных сетей' })
  }

  get telegramInput() {
    return this.page.locator('#settings-telegram')
  }

  get instagramInput() {
    return this.page.locator('#settings-instagram')
  }

  get saveButton() {
    return this.page.getByRole('button', { name: 'Сохранить' })
  }

  async goto() {
    await this.page.goto('/settings/social')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }
}
