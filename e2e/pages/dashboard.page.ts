import { type Page, expect } from '@playwright/test'

export class DashboardPage {
  constructor(private page: Page) {}

  get layout() {
    return this.page.getByTestId('dashboard-layout')
  }

  get calendarNavigator() {
    return this.page.getByRole('radiogroup', { name: 'Выбор дня недели' })
  }

  get prevWeekButton() {
    return this.page.getByLabel('Предыдущая неделя')
  }

  get nextWeekButton() {
    return this.page.getByLabel('Следующая неделя')
  }

  get calorieValue() {
    return this.page.getByTestId('calorie-value')
  }

  get macroProgress() {
    return this.page.getByRole('img', { name: 'Прогресс макронутриентов' })
  }

  get addFoodButton() {
    return this.page.getByLabel('Добавить еду')
  }

  get addStepsButton() {
    return this.page.getByLabel('Добавить шаги')
  }

  get addWorkoutButton() {
    return this.page.getByLabel('Добавить тренировку')
  }

  get addWaterButton() {
    return this.page.getByLabel('Добавить стакан воды').first()
  }

  get weightSection() {
    return this.page.getByLabel('Добавить вес').or(this.page.getByLabel('Изменить вес'))
  }

  async goto() {
    await this.page.goto('/dashboard')
  }

  async expectLoaded() {
    await expect(this.layout).toBeVisible({ timeout: 15000 })
    await expect(this.calendarNavigator).toBeVisible({ timeout: 10000 })
  }

  async selectDay(index: number) {
    const days = this.page.getByRole('radio')
    await days.nth(index).click()
  }
}
