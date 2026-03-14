import { type Page, expect } from '@playwright/test'

export class CuratorClientDetailPage {
  constructor(public page: Page) {}

  get backButton() {
    return this.page.getByLabel('Назад')
  }

  get clientName() {
    return this.page.locator('h1, h2').first()
  }

  get messageButton() {
    return this.page.getByRole('button', { name: 'Написать' })
  }

  get detailsToggle() {
    return this.page.getByRole('button', { name: /Подробнее/ })
  }

  // Tabs
  get overviewTab() {
    return this.page.getByRole('button', { name: 'Обзор' })
  }

  get planTab() {
    return this.page.getByRole('button', { name: 'План' })
  }

  get tasksTab() {
    return this.page.getByRole('button', { name: 'Задачи' })
  }

  get reportsTab() {
    return this.page.getByRole('button', { name: 'Отчёты' })
  }

  // Overview sections
  get nutritionHeading() {
    return this.page.getByRole('heading', { name: 'Питание' })
  }

  get weightHeading() {
    return this.page.getByRole('heading', { name: 'Динамика веса' })
  }

  get stepsHeading() {
    return this.page.getByRole('heading', { name: 'Динамика шагов' })
  }

  get waterHeading() {
    return this.page.getByRole('heading', { name: 'Вода' })
  }

  // Plan tab
  get currentPlanHeading() {
    return this.page.getByRole('heading', { name: 'Текущий план' })
  }

  get createPlanButton() {
    return this.page.getByLabel('Создать план')
  }

  // Tasks tab
  get activeTasksFilter() {
    return this.page.getByRole('button', { name: 'Активные' })
  }

  get completedTasksFilter() {
    return this.page.getByRole('button', { name: 'Завершённые' })
  }

  get createTaskButton() {
    return this.page.getByLabel('Создать задачу')
  }

  async goto(clientId: string) {
    await this.page.goto(`/curator/clients/${clientId}`)
  }

  async expectLoaded() {
    await expect(this.page.getByTestId('curator-layout')).toBeVisible({
      timeout: 15000,
    })
    // Wait for client data to load (spinner disappears)
    await expect(this.backButton).toBeVisible({ timeout: 10000 })
  }
}
