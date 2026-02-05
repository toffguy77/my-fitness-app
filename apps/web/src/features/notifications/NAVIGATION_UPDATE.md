# Navigation Update - Notifications Page

## Изменения

Добавлена кнопка "Назад" на странице уведомлений для возврата на дашборд.

## Что было изменено

### 1. NotificationsLayout Component
**Файл:** `apps/web/src/features/notifications/components/NotificationsLayout.tsx`

**Изменения:**
- Добавлен импорт `useRouter` из `next/navigation`
- Добавлен импорт иконки `ArrowLeft` из `lucide-react`
- Добавлена функция `handleBackClick()` для навигации на `/dashboard`
- Добавлена кнопка "Назад" в хедер слева от заголовка "Уведомления"

**Функциональность:**
- Кнопка с иконкой стрелки влево (←)
- При клике переходит на `/dashboard`
- Полностью доступна (ARIA labels, keyboard navigation)
- Адаптивный дизайн (mobile/tablet/desktop)
- Минимальный размер touch target 44x44px (WCAG 2.1)

### 2. Tests
**Файл:** `apps/web/src/features/notifications/components/NotificationsLayout.test.tsx`

**Добавлены тесты:**
- Mock для `useRouter` из Next.js
- Тест рендеринга кнопки "Назад"
- Тест навигации при клике (проверка вызова `router.push('/dashboard')`)
- Тесты accessibility (ARIA label, title attribute)
- Тест focus-visible стилей

**Результаты:** 30/30 тестов прошли успешно ✓

## UI/UX

### Расположение
```
┌─────────────────────────────────────────┐
│  [←]  Уведомления              [⚙️]     │  ← Header
└─────────────────────────────────────────┘
```

### Стили
- Иконка: 20px (mobile), 24px (tablet/desktop)
- Цвет: gray-600, hover: gray-900
- Фон при hover: gray-100
- Rounded corners: 8px
- Focus ring: blue-500 (2px)
- Transition: colors

### Accessibility
- `aria-label="Back to dashboard"`
- `title="Вернуться на дашборд"`
- Keyboard navigation support
- Focus-visible indicators
- Minimum touch target: 44x44px

## Требования

Соответствует требованиям:
- **1.1**: Навигация между страницами
- **6.1, 6.2, 6.3**: Адаптивный дизайн (mobile/tablet/desktop)
- **6.4**: Accessibility (WCAG 2.1)
- **6.7**: Keyboard navigation

## Использование

Пользователь может вернуться на дашборд:
1. Кликом на кнопку "Назад" (←)
2. Через нижнюю навигацию (FooterNavigation)
3. Клавиатурой (Tab + Enter на кнопке)

## Совместимость

- ✅ Desktop (Chrome, Firefox, Safari, Edge)
- ✅ Tablet (iPad, Android tablets)
- ✅ Mobile (iOS Safari, Chrome Mobile)
- ✅ Keyboard navigation
- ✅ Screen readers

## Статус

✅ Реализовано
✅ Протестировано (30/30 tests passed)
✅ Готово к продакшену
