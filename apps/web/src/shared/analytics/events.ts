/**
 * The product event dictionary.
 *
 * Mirrors apps/api/internal/modules/analytics/dictionary.go. The server refuses
 * anything it does not know, so a name invented here is a name that quietly
 * never arrives — which is why both sides declare the same list.
 */

export const EVENTS = {
    landingViewed: 'landing_viewed',
    onboardingStarted: 'onboarding_started',
    onboardingStep: 'onboarding_step_completed',
    onboardingResult: 'onboarding_result_shown',
    leadSaved: 'lead_saved',
    registrationOpened: 'registration_opened',
    registrationFailed: 'registration_failed',
    firstFoodEntry: 'first_food_entry',
    foodEntryCreated: 'food_entry_created',
    foodRecognition: 'food_recognition_used',
    firstMessage: 'first_curator_message',
    supportOpened: 'support_chat_opened',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

/** Property values are categorical or numeric. Nothing else is accepted. */
export type EventProperties = Record<string, string | number | boolean>
