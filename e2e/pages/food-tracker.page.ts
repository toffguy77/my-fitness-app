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

  // --- Food entry modal ---

  get foodModal() {
    return this.page.getByRole('dialog')
  }

  get searchInput() {
    return this.page.getByPlaceholder('Поиск блюд и продуктов')
  }

  get foodList() {
    return this.page.getByRole('listbox', { name: 'Список продуктов' })
  }

  get closeModalButton() {
    return this.page.getByLabel('Закрыть')
  }

  async openAddFoodForMeal(mealName: string) {
    await this.addToMealButton(mealName).click()
    await expect(this.foodModal).toBeVisible({ timeout: 5000 })
  }

  async searchFood(query: string) {
    await this.searchInput.fill(query)
    // Wait for debounce + API response + results rendering
    await expect(this.foodList.getByRole('option').first()).toBeVisible({
      timeout: 10000,
    })
  }

  async selectFirstResult() {
    const options = this.foodList.getByRole('option')
    await options.first().click()
  }

  async submitFoodEntry() {
    await this.page.getByRole('button', { name: /Добавить/ }).click()
  }

  // --- AI photo recognition tab ---

  get photoTab() {
    return this.page.getByRole('tab', { name: 'Фото еды' })
  }

  /** Hidden file input behind "Галерея" — Playwright can fill it without a click. */
  get photoGalleryInput() {
    return this.page.getByLabel('Выбрать фото из галереи')
  }

  async openPhotoTab() {
    await this.photoTab.click()
  }

  async uploadPhoto(buffer: Buffer, name = 'meal.png', mimeType = 'image/png') {
    await this.photoGalleryInput.setInputFiles({ name, mimeType, buffer })
  }

  /** The <li> for one recognized position, found by its visible name. */
  positionRow(positionName: string) {
    return this.page.getByRole('listitem').filter({ hasText: positionName })
  }

  weightInput(positionName: string) {
    return this.page.getByLabel(`Вес порции: ${positionName}`)
  }

  modelEstimateText(positionName: string) {
    return this.positionRow(positionName).getByText(/Оценка модели: \d+ г/)
  }

  useModelEstimateButton(positionName: string) {
    return this.page.getByLabel(`Подставить оценку модели: ${positionName}`)
  }

  /** The invalid-weight message for one position, found by its own text —
   * not by the paragraph's class. `aria-invalid` on `weightInput()` is the
   * honest anchor for the *state*; this is only for the message's wording. */
  weightErrorText(positionName: string, pattern: RegExp) {
    return this.positionRow(positionName).getByText(pattern)
  }

  /** The "Добавить" button inside the photo tab's results screen — distinct
   * from the meal-slot "Добавить в …" buttons and from the final save button
   * on the portion step, both of which live outside this screen at any time. */
  get photoConfirmButton() {
    return this.foodModal.getByRole('button', { name: 'Добавить', exact: true })
  }

  get photoWeightRequiredHint() {
    return this.page.getByText('Введите вес каждой позиции, чтобы сохранить запись')
  }

  get photoLiveTotalPartial() {
    return this.page.getByText('Промежуточный итог — не все веса введены')
  }

  /** Scoped to the modal: the same word ("Итого:") also labels a meal
   * slot's subtotal elsewhere on the page. */
  get photoLiveTotal() {
    return this.foodModal.getByText(/Итого: \d+ ккал/)
  }
}
