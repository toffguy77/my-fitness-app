// i18n-exempt-file: the Russian strings below are `case` labels, not text. They
// are the values this column held before migration 061, kept so a page opened
// before the deploy still reads its rows. What is shown comes from the
// dictionary calls beside them.
import { t } from '@/shared/i18n'

/**
 * The label for a unit stored with a food or a nutrient.
 *
 * What the database holds is a value, not a sentence: 'g', 'ml', 'mcg'. It used
 * to hold 'г', 'мл', 'мкг' and screens printed it as it was, which is why a
 * second language would have shown Russian abbreviations in the middle of
 * English text.
 *
 * Both spellings are accepted. A page already open in somebody's browser when
 * the migration runs is reading rows it has not been redeployed for, and an
 * imported food may carry a unit nobody planned for — that one is shown as it
 * came, because inventing a label for it would lose what it said.
 */
export function unitLabel(stored: string | null | undefined): string {
    switch (stored) {
        case 'g':
        case 'г':
            return t('units.gram')
        case 'ml':
        case 'мл':
            return t('units.milliliter')
        case 'pcs':
        case 'шт':
            return t('units.piece')
        case 'serving':
        case 'порция':
            return t('units.serving')
        case 'mg':
        case 'мг':
            return t('units.milligram')
        case 'mcg':
        case 'мкг':
            return t('units.microgram')
        case 'IU':
        case 'МЕ':
            return t('units.iu')
        default:
            return stored ?? ''
    }
}
