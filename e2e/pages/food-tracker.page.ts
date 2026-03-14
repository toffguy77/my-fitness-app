import { type Page, expect } from '@playwright/test'

export class FoodTrackerPage {
  constructor(private page: Page) {}

  get kbzhuSummary() {
    return this.page.getByLabel('Сводка КБЖУ за день')
  }

  get waterTracker() {
    return this.page.getByLabel('Отслеживание воды')
  }

  get addWaterButton() {
    return this.page.getByLabel('Добавить стакан воды')
  }

  get fabAddFood() {
    return this.page.getByTestId('fab-add-food')
  }

  mealSlot(name: string) {
    return this.page.getByLabel(`${name} - приём пищи`)
  }

  addToMealButton(name: string) {
    return this.page.getByLabel(`Добавить в ${name}`)
  }

  async goto() {
    await this.page.goto('/food-tracker')
  }

  async expectLoaded() {
    await expect(this.kbzhuSummary).toBeVisible({ timeout: 15000 })
  }

  async expectMealSlotsVisible() {
    for (const name of ['Завтрак', 'Обед', 'Ужин', 'Перекус']) {
      await expect(this.mealSlot(name)).toBeVisible()
    }
  }

  async expectKBZHULabels() {
    for (const label of ['Ккал', 'Белки', 'Жиры', 'Углеводы']) {
      await expect(this.page.getByText(label).first()).toBeVisible()
    }
  }
}
