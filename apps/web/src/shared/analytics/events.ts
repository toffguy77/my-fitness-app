/**
 * The product event dictionary.
 *
 * Mirrors apps/api/internal/modules/analytics/dictionary.go. The server refuses
 * anything it does not know, so a name invented here is a name that quietly
 * never arrives — which is why both sides declare the same list.
 *
 * Server-side facts are absent on purpose, and a test holds them out: declaring
 * one here is an invitation to call track() with it, and that call is refused at
 * the door. Первая запись о еде и первое сообщение куратору — среди них.
 */

export const EVENTS = {
    landingViewed: 'landing_viewed',
    landingScrollDepth: 'landing_scroll_depth',
    onboardingStarted: 'onboarding_started',
    onboardingStep: 'onboarding_step_completed',
    onboardingResult: 'onboarding_result_shown',
    leadSaved: 'lead_saved',
    registrationOpened: 'registration_opened',
    registrationFailed: 'registration_failed',
    contactCaptured: 'contact_captured',
    magicLinkRequested: 'magic_link_requested',
    magicLinkConsumed: 'magic_link_consumed',
    foodEntryCreated: 'food_entry_created',
    foodRecognition: 'food_recognition_used',
    supportOpened: 'support_chat_opened',
    curatorOfferShown: 'curator_offer_shown',
    curatorOfferClicked: 'curator_offer_clicked',
    calculatorResult: 'calculator_result',
    articleCtaClicked: 'article_cta_clicked',
    // Каталог рецептов. Без свойств: id рецепта — не то, по чему группируют
    // отчёт, а необъявленное свойство отвергает событие вместе со всем пакетом.
    menuOpened: 'menu_opened',
    recipeOpened: 'recipe_opened',
    recipeRejected: 'recipe_rejected',
    recipeSubmitted: 'recipe_submitted',
    recipeApproved: 'recipe_approved',
    // План питания на день. Тоже без свойств: plan_generated — первое открытие
    // даты за сессию (в ответе нет признака свежей сборки), plan_off_target —
    // собранный сервером день вне допуска.
    planGenerated: 'plan_generated',
    planRegenerated: 'plan_regenerated',
    planItemReplaced: 'plan_item_replaced',
    planItemLocked: 'plan_item_locked',
    planGramsSet: 'plan_grams_set',
    planOffTarget: 'plan_off_target',
    // Связь плана с дневником. source у plan_item_eaten — где нажали:
    // `plan` — «Съел» в плане, `diary` — «+» в блоке «По плану» дневника.
    planItemEaten: 'plan_item_eaten',
    planRefit: 'plan_refit',
    recipeLoggedFromSearch: 'recipe_logged_from_search',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

/** Property values are categorical or numeric. Nothing else is accepted. */
export type EventProperties = Record<string, string | number | boolean>

/**
 * The events mirrored into the web analytics counter as goals.
 *
 * Five names, each answering "how many people got this far". Only the name
 * travels: properties are never sent outside, because every report that would
 * group by one is an SQL query against our own table, where the property
 * already lives — and an open channel outwards is how a forbidden property
 * leaves the first time somebody extends the dictionary.
 *
 * A goal in the counter is what a retargeting audience condition is built on,
 * which is the whole reason any of this is mirrored: our own table cannot be
 * named in an advertising account.
 *
 * `landingScrollDepth` is deliberately absent — four events per visit instead
 * of one would turn the goal report into noise, and "do they read that far" is
 * a question for our own table.
 *
 * Server-only facts are absent too, and cannot be added: they do not happen in
 * a browser at all. They reach the counter as offline conversions instead.
 */
export const MIRRORED_EVENTS: readonly EventName[] = [
    EVENTS.landingViewed,
    EVENTS.onboardingStarted,
    EVENTS.onboardingResult,
    EVENTS.leadSaved,
    EVENTS.registrationOpened,
]

/** Whether this event is mirrored into the counter. */
export function isMirrored(name: EventName): boolean {
    return MIRRORED_EVENTS.includes(name)
}
