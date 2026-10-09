/**
 * Классы поля ввода — те же, что у `ui/Input`, для элементов, которые `Input`
 * не покрывает: `<select>`, кнопка-список, поле с собственной разметкой.
 *
 * 48 px высоты и 16 px текста: iOS не масштабирует страницу при фокусе.
 */
export const fieldClass =
    'flex h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors ' +
    'focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 ' +
    'disabled:cursor-not-allowed disabled:opacity-50'

/** Подпись над полем. */
export const fieldLabelClass = 'mb-1.5 block text-sm font-medium text-fg-muted'
