/**
 * Russian number agreement.
 *
 * "3 попытки" and "5 попыток" are not a formatting detail: getting it wrong is
 * the most visible way a translated interface reads as machine-made.
 */

export interface PluralForms {
    /** 1 попытка */
    one: string
    /** 2 попытки */
    few: string
    /** 5 попыток */
    many: string
}

export function pluralRu(count: number, forms: PluralForms): string {
    const absolute = Math.abs(Math.trunc(count))
    const lastTwo = absolute % 100
    const last = absolute % 10

    // 11–14 take the "many" form regardless of their last digit.
    if (lastTwo >= 11 && lastTwo <= 14) return forms.many
    if (last === 1) return forms.one
    if (last >= 2 && last <= 4) return forms.few
    return forms.many
}

/** English is simpler, and stated rather than assumed. */
export function pluralEn(count: number, forms: PluralForms): string {
    return Math.abs(count) === 1 ? forms.one : forms.many
}
