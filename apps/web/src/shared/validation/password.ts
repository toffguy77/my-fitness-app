/**
 * Правила пароля — один список на всё приложение.
 *
 * Правила жили в двух местах сразу: схема Zod в `features/auth/utils/validation.ts`
 * проверяла их перед отправкой, а `shared/components/forms/PasswordInput.tsx`
 * держал собственную копию, чтобы рисовать список требований под полем.
 * Две копии одной политики означают форму, где список может быть зелёным, а
 * отправка отклонена — и наоборот; разойтись им достаточно одной правки в
 * одном из файлов.
 *
 * Список лежит в shared, а не в features/auth: его читает и поле ввода, а
 * поле ввода — общий компонент и о features знать не должен.
 */
import { t } from '@/shared/i18n';

export interface PasswordRule {
    /** Устойчивый идентификатор — ключ списка и зацепка для тестов. */
    id: 'min' | 'max' | 'upper' | 'lower' | 'digit' | 'special';
    /** Текст правила; он же текст ошибки — формулировка годится для обоих. */
    message: string;
    satisfied: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
    { id: 'min', message: t('auth.validation.passwordMin'), satisfied: (v) => v.length >= 8 },
    { id: 'max', message: t('auth.validation.passwordMax'), satisfied: (v) => v.length <= 128 },
    { id: 'upper', message: t('auth.validation.passwordUpper'), satisfied: (v) => /[A-Z]/.test(v) },
    { id: 'lower', message: t('auth.validation.passwordLower'), satisfied: (v) => /[a-z]/.test(v) },
    { id: 'digit', message: t('auth.validation.passwordDigit'), satisfied: (v) => /[0-9]/.test(v) },
    {
        id: 'special',
        message: t('auth.validation.passwordSpecial'),
        satisfied: (v) => /[^A-Za-z0-9]/.test(v),
    },
] as const;
