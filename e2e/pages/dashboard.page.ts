import { type Page, expect } from '@playwright/test'

export class DashboardPage {
  constructor(public page: Page) {}

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

  // --- Water tracking ---

  get waterHeading() {
    return this.page.getByRole('heading', { name: 'Вода' })
  }

  async addWater() {
    await this.addWaterButton.click()
  }

  // --- Weight logging ---

  get addWeightButton() {
    return this.page
      .getByRole('button', { name: 'Добавить вес' })
      .or(this.page.getByRole('button', { name: 'Изменить вес' }))
  }

  get weightInput() {
    return this.page.getByRole('spinbutton', { name: 'Вес в килограммах' })
  }

  get saveWeightButton() {
    return this.page.getByRole('button', { name: 'Сохранить' })
  }

  get cancelWeightButton() {
    return this.page.getByRole('button', { name: 'Отмена' })
  }

  async logWeight(value: string) {
    await this.addWeightButton.click()
    await expect(this.weightInput).toBeVisible({ timeout: 3000 })
    await this.weightInput.fill(value)
    await this.saveWeightButton.click()
  }

  // --- Steps logging ---

  get stepsRegion() {
    return this.page.getByRole('region', { name: 'Прогресс шагов' })
  }

  get stepsProgress() {
    return this.page.getByRole('progressbar', { name: /Прогресс шагов/ })
  }

  get stepsInput() {
    return this.page.getByRole('spinbutton', { name: 'Количество шагов' })
  }

  async logSteps(value: string) {
    await this.addStepsButton.first().click()
    await expect(this.stepsInput).toBeVisible({ timeout: 3000 })
    await this.stepsInput.fill(value)
    // Save button near the input
    await this.page.getByRole('button', { name: /Сохранить/i }).click()
  }
}
