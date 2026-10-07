/**
 * Formatting utilities
 */

export const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(d)
}


/**
 * Format a Date to YYYY-MM-DD using local timezone (not UTC).
 * Use this instead of toISOString().split('T')[0] which converts to UTC.
 */
export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export const formatNumber = (num: number, decimals = 0): string => {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num)
}

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
    }).format(amount)
}

/**
 * Дробное число для показа — по-русски: запятая и не больше `maxDigits` знаков
 * после неё, целое — без «,0» («67,4», «68»). Для полей ввода не годится:
 * их значение разбирается как число с точкой.
 */
export function formatDecimal(value: number, maxDigits = 1): string {
    return value.toLocaleString('ru-RU', { maximumFractionDigits: maxDigits })
}
