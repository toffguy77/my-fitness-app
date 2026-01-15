# Email шаблоны My Fitness App

Эта папка содержит шаблоны email для настройки в Supabase Dashboard.

## Настройка шаблонов

### 1. Подтверждение регистрации

**Файл:** [signup-confirmation-ru.md](./signup-confirmation-ru.md)

**Где настроить:**
1. Supabase Dashboard → Authentication → Email Templates
2. Выберите шаблон **Confirm signup**
3. Скопируйте содержимое из файла

**Статус:** ✅ Готов к использованию

---

## Другие шаблоны

### Magic Link (вход по ссылке)

Можно настроить аналогично, используя переменную `{{ .Token }}` или `{{ .ConfirmationURL }}`

### Сброс пароля

Можно настроить аналогично, используя переменную `{{ .ConfirmationURL }}`

---

## Кастомные email через Resend

Для кастомных уведомлений (заметки тренера, напоминания и т.д.) используется система через Resend API.

См. `src/utils/email.ts` для доступных шаблонов:
- `reminder_data_entry` - напоминание о внесении данных
- `coach_note_notification` - уведомление о заметке тренера
- `subscription_expiring` - подписка истекает
- `subscription_expired` - подписка истекла
- `invite_code_registration` - регистрация по инвайт-коду

---

**Последнее обновление:** Январь 2025
