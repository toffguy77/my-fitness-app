# Справочник компонентов My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Обзор

Этот документ описывает все React компоненты My Fitness App, их props, интерфейсы и примеры использования.

---

## Структура компонентов

```
src/components/
├── ui/                    # Базовые UI компоненты
├── charts/                # Компоненты графиков
├── chat/                  # Компоненты чата
├── products/              # Компоненты продуктов
├── ocr/                   # Компоненты OCR
├── achievements/          # Компоненты достижений
├── reports/               # Компоненты отчетов
├── invites/               # Компоненты инвайт-кодов
└── pwa/                   # Компоненты PWA
```

---

## Базовые UI компоненты

### ToastProvider

**Файл:** `src/components/ToastProvider.tsx`

**Описание:** Глобальный провайдер для toast уведомлений

**Использование:**
```tsx
import ToastProvider from '@/components/ToastProvider'

export default function Layout({ children }) {
  return (
    <>
      {children}
      <ToastProvider />
    </>
  )
}
```

**Настройки:**
- Позиция: top-right
- Длительность: 4 секунды
- Темная тема

---

### LoadingSpinner

**Файл:** `src/components/LoadingSpinner.tsx`

**Описание:** Компонент спиннера загрузки

**Props:**
```typescript
type LoadingSpinnerProps = {
  size?: 'sm' | 'default' | 'lg' | 'xl'
  color?: 'default' | 'primary' | 'secondary' | 'white'
  className?: string
}
```

**Пример:**
```tsx
<LoadingSpinner size="lg" color="primary" />
```

---

### SkeletonLoader

**Файл:** `src/components/SkeletonLoader.tsx`

**Описание:** Компонент для skeleton loading состояний

**Props:**
```typescript
type SkeletonLoaderProps = {
  count?: number
  className?: string
}
```

**Пример:**
```tsx
<SkeletonLoader count={3} />
```

---

### ProgressBar

**Файл:** `src/components/ProgressBar.tsx`

**Описание:** Визуализация прогресса по текущему значению и цели

**Props:**
```typescript
type ProgressBarProps = {
  label: string
  current: number
  target: number
  unit?: string
  showPercentage?: boolean
  className?: string
}
```

**Пример:**
```tsx
<ProgressBar
  label="Калории"
  current={1800}
  target={2000}
  unit="ккал"
  showPercentage={true}
/>
```

**Цветовая индикация:**
- Зеленый: ≥80%
- Желтый: ≥50%
- Красный: <50%

---

### ValidationWarning

**Файл:** `src/components/ValidationWarning.tsx`

**Описание:** Компонент для отображения предупреждений валидации

**Props:**
```typescript
type ValidationWarningProps = {
  messages: string[]
  type?: 'error' | 'warning' | 'info' | 'success'
  className?: string
}
```

**Пример:**
```tsx
<ValidationWarning
  messages={['Калории не соответствуют макронутриентам']}
  type="error"
/>
```

---

### DayToggle

**Файл:** `src/components/DayToggle.tsx`

**Описание:** Переключатель типа дня (тренировка/отдых)

**Props:**
```typescript
type DayToggleProps = {
  value: 'training' | 'rest'
  onChange: (value: 'training' | 'rest') => void
  disabled?: boolean
}
```

**Пример:**
```tsx
<DayToggle
  value={dayType}
  onChange={setDayType}
  disabled={isCompleted}
/>
```

---

### DateInput

**Файл:** `src/components/DateInput.tsx`

**Описание:** Компонент для выбора даты

**Props:**
```typescript
type DateInputProps = {
  value: string
  onChange: (date: string) => void
  min?: string
  max?: string
  disabled?: boolean
}
```

---

### Pagination

**Файл:** `src/components/Pagination.tsx`

**Описание:** Компонент пагинации для больших списков

**Props:**
```typescript
type PaginationProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  itemsPerPage?: number
  totalItems?: number
}
```

**Пример:**
```tsx
<Pagination
  currentPage={1}
  totalPages={10}
  onPageChange={setCurrentPage}
  itemsPerPage={20}
  totalItems={200}
/>
```

---

## Компоненты графиков

### WeightChart

**Файл:** `src/components/charts/WeightChart.tsx`

**Описание:** Линейный график динамики веса

**Props:**
```typescript
type WeightChartProps = {
  data: Array<{ date: string; weight: number }>
  period?: '7d' | '30d' | '90d' | 'all'
  onPeriodChange?: (period: string) => void
}
```

**Функциональность:**
- Линейный график динамики веса
- Трендовая линия (линейная регрессия)
- Фильтр по периоду

---

### MacrosChart

**Файл:** `src/components/charts/MacrosChart.tsx`

**Описание:** График калорий и макронутриентов

**Props:**
```typescript
type MacrosChartProps = {
  data: Array<{
    date: string
    calories: number
    protein: number
    fats: number
    carbs: number
  }>
  targets?: {
    calories: number
    protein: number
    fats: number
    carbs: number
  }
  period?: '7d' | '30d' | '90d' | 'all'
  onPeriodChange?: (period: string) => void
}
```

**Функциональность:**
- График калорий с целевой линией
- График макронутриентов с целевыми линиями
- Фильтр по периоду

---

## Компоненты чата

### ChatWidget

**Файл:** `src/components/chat/ChatWidget.tsx`

**Описание:** Компактный виджет чата

**Props:**
```typescript
type ChatWidgetProps = {
  userId: string
  otherUserId: string
  onOpen?: () => void
}
```

---

### ChatWindow

**Файл:** `src/components/chat/ChatWindow.tsx`

**Описание:** Полноэкранное окно чата

**Props:**
```typescript
type ChatWindowProps = {
  userId: string
  otherUserId: string
  onClose: () => void
}
```

---

### MessageList

**Файл:** `src/components/chat/MessageList.tsx`

**Описание:** Список сообщений в чате

**Props:**
```typescript
type MessageListProps = {
  messages: Array<{
    id: string
    sender_id: string
    content: string
    created_at: string
    read_at?: string
  }>
  currentUserId: string
}
```

---

### MessageInput

**Файл:** `src/components/chat/MessageInput.tsx`

**Описание:** Поле ввода сообщения

**Props:**
```typescript
type MessageInputProps = {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}
```

---

## Компоненты продуктов

### ProductSearch

**Файл:** `src/components/products/ProductSearch.tsx`

**Описание:** Поиск продуктов в базе

**Props:**
```typescript
type ProductSearchProps = {
  onSelect: (product: Product) => void
  placeholder?: string
}
```

---

### ProductCard

**Файл:** `src/components/products/ProductCard.tsx`

**Описание:** Карточка продукта

**Props:**
```typescript
type ProductCardProps = {
  product: Product
  onSelect: (product: Product) => void
  showActions?: boolean
}
```

---

### UserProductsManager

**Файл:** `src/components/products/UserProductsManager.tsx`

**Описание:** Управление пользовательскими продуктами

**Props:**
```typescript
type UserProductsManagerProps = {
  userId: string
  onSelect?: (product: UserProduct) => void
}
```

---

## Компоненты OCR

### OCRModal

**Файл:** `src/components/ocr/OCRModal.tsx`

**Описание:** Модальное окно для OCR распознавания

**Props:**
```typescript
type OCRModalProps = {
  isOpen: boolean
  onClose: () => void
  onResult: (data: OCRResult) => void
}
```

---

### PhotoUpload

**Файл:** `src/components/ocr/PhotoUpload.tsx`

**Описание:** Компонент загрузки фото для OCR

**Props:**
```typescript
type PhotoUploadProps = {
  onUpload: (file: File) => void
  accept?: string
  maxSize?: number
}
```

---

### OCRProcessor

**Файл:** `src/components/ocr/OCRProcessor.tsx`

**Описание:** Обработчик OCR распознавания

**Функциональность:**
- Гибридный подход (Tesseract.js + OpenRouter)
- Извлечение данных из изображения
- Обработка результатов

---

### OCRResult

**Файл:** `src/components/ocr/OCRResult.tsx`

**Описание:** Отображение результатов OCR

**Props:**
```typescript
type OCRResultProps = {
  result: OCRResult
  onConfirm: (data: NutritionData) => void
  onEdit: (data: NutritionData) => void
}
```

---

## Компоненты достижений

### AchievementBadge

**Файл:** `src/components/achievements/AchievementBadge.tsx`

**Описание:** Бейдж достижения

**Props:**
```typescript
type AchievementBadgeProps = {
  achievement: Achievement
  progress?: number
  size?: 'sm' | 'md' | 'lg'
}
```

---

### AchievementNotification

**Файл:** `src/components/achievements/AchievementNotification.tsx`

**Описание:** Уведомление о получении достижения

**Props:**
```typescript
type AchievementNotificationProps = {
  achievement: Achievement
  onClose: () => void
}
```

---

### AchievementsPage

**Файл:** `src/components/achievements/AchievementsPage.tsx`

**Описание:** Страница со списком достижений

**Функциональность:**
- Отображение всех достижений по категориям
- Прогресс выполнения
- Полученные и неполученные достижения

---

## Компоненты отчетов

### ExportButton

**Файл:** `src/components/reports/ExportButton.tsx`

**Описание:** Кнопка экспорта данных

**Props:**
```typescript
type ExportButtonProps = {
  data: DailyLog[]
  targets?: NutritionTargets
  formats?: ('csv' | 'json' | 'pdf')[]
}
```

**Функциональность:**
- Экспорт в CSV, JSON, PDF
- Автоматическое именование файлов

---

### ReportFilters

**Файл:** `src/components/reports/ReportFilters.tsx`

**Описание:** Фильтры для отчетов

**Props:**
```typescript
type ReportFiltersProps = {
  onFilterChange: (filters: ReportFilters) => void
  initialFilters?: ReportFilters
}
```

**Функциональность:**
- Фильтрация по диапазону дат
- Фильтрация по типу дня
- Сортировка

---

## Компоненты инвайт-кодов

### InviteCodeManager

**Файл:** `src/components/invites/InviteCodeManager.tsx`

**Описание:** Управление инвайт-кодами

**Функциональность:**
- Список всех кодов
- Создание нового кода
- Деактивация кода
- Статистика использования

---

### CreateInviteCodeModal

**Файл:** `src/components/invites/CreateInviteCodeModal.tsx`

**Описание:** Модальное окно создания инвайт-кода

**Props:**
```typescript
type CreateInviteCodeModalProps = {
  isOpen: boolean
  onClose: () => void
  onCreate: (code: InviteCode) => void
}
```

---

### InviteCodeCard

**Файл:** `src/components/invites/InviteCodeCard.tsx`

**Описание:** Карточка инвайт-кода

**Props:**
```typescript
type InviteCodeCardProps = {
  code: InviteCode
  onDeactivate: (id: string) => void
  onCopy: (code: string) => void
}
```

---

## Компоненты PWA

### InstallPrompt

**Файл:** `src/components/pwa/InstallPrompt.tsx`

**Описание:** Подсказка для установки PWA

**Функциональность:**
- Определение возможности установки
- Показ подсказки пользователю
- Обработка установки

---

### OfflineIndicator

**Файл:** `src/components/pwa/OfflineIndicator.tsx`

**Описание:** Индикатор подключения к сети

**Функциональность:**
- Отображение статуса подключения
- Предупреждение при отсутствии интернета

---

## Специализированные компоненты

### ClientDashboardView

**Файл:** `src/components/ClientDashboardView.tsx`

**Описание:** Просмотр дашборда клиента (для тренера)

**Props:**
```typescript
type ClientDashboardViewProps = {
  clientId: string
  selectedDate: string
  isReadOnly?: boolean
}
```

---

### Paywall

**Файл:** `src/components/Paywall.tsx`

**Описание:** Заглушка для Premium функций

**Props:**
```typescript
type PaywallProps = {
  feature: string
  onUpgrade?: () => void
}
```

---

### PremiumFeatureModal

**Файл:** `src/components/PremiumFeatureModal.tsx`

**Описание:** Модальное окно Premium функции

**Props:**
```typescript
type PremiumFeatureModalProps = {
  isOpen: boolean
  onClose: () => void
  feature: string
  onUpgrade?: () => void
}
```

---

### SubscriptionBanner

**Файл:** `src/components/SubscriptionBanner.tsx`

**Описание:** Баннер для истекших подписок

**Props:**
```typescript
type SubscriptionBannerProps = {
  subscriptionStatus: SubscriptionStatus
  subscriptionEndDate?: string
  onRenew?: () => void
}
```

---

### NotificationSettings

**Файл:** `src/components/NotificationSettings.tsx`

**Описание:** Настройки уведомлений

**Props:**
```typescript
type NotificationSettingsProps = {
  userId: string
  initialSettings?: NotificationSettings
  onSave: (settings: NotificationSettings) => void
}
```

---

## Компонентная архитектура

### Принципы

1. **Композиция:** Компоненты строятся из более мелких компонентов
2. **Переиспользование:** Общие компоненты выносятся в `ui/`
3. **Типизация:** Все компоненты типизированы через TypeScript
4. **Изоляция:** Каждый компонент независим и тестируем

### Паттерны

1. **Container/Presentational:** Разделение логики и представления
2. **Custom Hooks:** Переиспользуемая логика в hooks
3. **Compound Components:** Связанные компоненты работают вместе
4. **Render Props:** Гибкость через функции-рендеры

---

## Связанные документы

- [Technical_Architecture.md](./Technical_Architecture.md) - Техническая архитектура
- [Functional_Specification.md](./Functional_Specification.md) - Функциональная спецификация
- [Implementation_Guide.md](./Implementation_Guide.md) - Руководство по реализации

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0

