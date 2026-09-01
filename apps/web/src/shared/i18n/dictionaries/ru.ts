/**
 * Russian messages.
 *
 * Error keys mirror apps/api/internal/shared/apperrors/codes.go: the API names
 * what happened, and this decides how to say it. A code with no entry here is a
 * build failure, not a blank screen.
 */

export const ru = {
    errors: {
        not_found: 'Не найдено',
        unauthorized: 'Нужно войти в аккаунт',
        forbidden: 'Нет доступа',
        invalid_credentials: 'Неверный логин или пароль',
        token_invalid: 'Ссылка недействительна',
        token_expired: 'Срок действия ссылки истёк',
        code_expired: 'Срок действия кода истёк',
        too_many_attempts: 'Слишком много попыток. Попробуйте позже.',
        rate_limited: 'Слишком много запросов. Подождите немного.',
        unsupported_media: 'Такой файл загрузить нельзя',
        password_policy: 'Пароль не соответствует требованиям',
        password_unchanged: 'Новый пароль должен отличаться от текущего',
        email_unavailable: 'Отправка писем сейчас недоступна',
        conflict: 'Действие невозможно в текущем состоянии',
        gone: 'Больше недоступно',
        validation: 'Проверьте введённые данные',
        feature_unavailable: 'Возможность отключена в этой среде',
        internal: 'Сервис временно недоступен',
    },
} as const

export type Dictionary = typeof ru
