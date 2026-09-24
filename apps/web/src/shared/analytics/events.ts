/**
 * The product event dictionary.
 *
 * Mirrors apps/api/internal/modules/analytics/dictionary.go. The server refuses
 * anything it does not know, so a name invented here is a name that quietly
 * never arrives — which is why both sides declare the same list.
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
    firstFoodEntry: 'first_food_entry',
    foodEntryCreated: 'food_entry_created',
    foodRecognition: 'food_recognition_used',
    firstMessage: 'first_curator_message',
    supportOpened: 'support_chat_opened',
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
