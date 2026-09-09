// i18n-exempt-file: the Russian strings below are `case` labels, not text. They
// are what this column held before migration 062, kept so a page opened before
// the deploy still reads its rows. What is shown comes from the dictionary.

import { t } from '@/shared/i18n'

/**
 * The label for a workout type stored with a day.
 *
 * The column holds codes — and, when somebody chose "Другое", whatever they
 * typed instead. That text is theirs and is shown exactly as it came; only the
 * eight known codes get a label.
 *
 * Both spellings are accepted for the same reason as with units: a page already
 * open when the migration runs is reading rows it was not redeployed for.
 */
export function workoutTypeLabel(stored: string): string {
    switch (stored) {
        case 'strength':
        case 'Силовая':
            return t('dashboard.workoutTypes.strength')
        case 'cardio':
        case 'Кардио':
            return t('dashboard.workoutTypes.cardio')
        case 'yoga':
        case 'Йога':
            return t('dashboard.workoutTypes.yoga')
        case 'hiit':
        case 'HIIT':
            return t('dashboard.workoutTypes.hiit')
        case 'stretching':
        case 'Растяжка':
            return t('dashboard.workoutTypes.stretching')
        case 'swimming':
        case 'Плавание':
            return t('dashboard.workoutTypes.swimming')
        case 'running':
        case 'Бег':
            return t('dashboard.workoutTypes.running')
        case 'cycling':
        case 'Велосипед':
            return t('dashboard.workoutTypes.cycling')
        case 'other':
        case 'Другое':
            return t('dashboard.workoutTypes.other')
        default:
            // Somebody's own words.
            return stored
    }
}

/**
 * The code for a value read back from a day.
 *
 * Rows written before migration 062 hold Russian words, and a form that
 * compares them against the code list would find nothing selected and then save
 * the person's own workout as if they had typed it by hand. Anything that is
 * not one of the eight is returned as it came — that really is somebody's own
 * words.
 */
export function workoutTypeCode(stored: string): string {
    switch (stored) {
        case 'Силовая':
            return 'strength'
        case 'Кардио':
            return 'cardio'
        case 'Йога':
            return 'yoga'
        case 'HIIT':
            return 'hiit'
        case 'Растяжка':
            return 'stretching'
        case 'Плавание':
            return 'swimming'
        case 'Бег':
            return 'running'
        case 'Велосипед':
            return 'cycling'
        case 'Другое':
            return 'other'
        default:
            return stored
    }
}
