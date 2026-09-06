// Package analytics records what people do in the product.
//
// Every event is declared here. A free-form name is a dictionary of typos and
// synonyms within a month, so the server refuses anything it does not know.
package analytics

// Event names. Grouped by the question each group answers.
const (
	// The way in: landing page to registered account.
	EventLandingViewed      = "landing_viewed"
	EventOnboardingStarted  = "onboarding_started"
	EventOnboardingStep     = "onboarding_step_completed"
	EventOnboardingResult   = "onboarding_result_shown"
	EventLeadSaved          = "lead_saved"
	EventRegistrationOpened = "registration_opened"
	EventRegistrationFailed = "registration_failed"

	// Facts, sent from the server: a client-sent "registered" lies when the
	// connection drops after a successful request, and disappears entirely
	// behind a blocker.
	EventRegistered    = "registered"
	EventEmailVerified = "email_verified"
	EventSignedIn      = "signed_in"
	EventCuratorAssign = "curator_assigned"
	EventWeeklyReport  = "weekly_report_submitted"

	// Reaching the point where the product does something for them.
	EventFirstFoodEntry   = "first_food_entry"
	EventFoodEntryCreated = "food_entry_created"
	EventFoodRecognition  = "food_recognition_used"
	EventFirstMessage     = "first_curator_message"

	// Support, before there is a curator to ask.
	EventSupportOpened    = "support_chat_opened"
	EventSupportEscalated = "support_escalated"
)

// Definition declares one event.
type Definition struct {
	// Required properties, refused when absent.
	Required []string
	// Optional properties, accepted when present.
	Optional []string
	// ServerOnly events are facts; accepting them from a browser would let
	// anybody claim a registration that never happened.
	ServerOnly bool
}

// Dictionary is every event the service accepts.
var Dictionary = map[string]Definition{
	EventLandingViewed:      {Optional: []string{"source"}},
	EventOnboardingStarted:  {Optional: []string{"source"}},
	EventOnboardingStep:     {Required: []string{"step"}},
	EventOnboardingResult:   {Optional: []string{"goal", "activity_level"}},
	EventLeadSaved:          {Optional: []string{"contact_consent"}},
	EventRegistrationOpened: {Optional: []string{"method"}},
	EventRegistrationFailed: {Required: []string{"reason"}, Optional: []string{"method"}},

	// method is required, not optional, on both: an account arrives either by
	// password or through a named provider, and an event that does not say
	// which is counted as neither. When it was optional the provider path
	// recorded nothing and the funnel read as if everyone used a password.
	EventRegistered:    {Required: []string{"method"}, ServerOnly: true},
	EventEmailVerified: {ServerOnly: true},
	EventSignedIn:      {Required: []string{"method"}, ServerOnly: true},
	EventCuratorAssign: {ServerOnly: true},
	EventWeeklyReport:  {ServerOnly: true},

	EventFirstFoodEntry:   {Optional: []string{"method"}},
	EventFoodEntryCreated: {Optional: []string{"method", "meal_type"}},
	EventFoodRecognition:  {Optional: []string{"outcome"}},
	EventFirstMessage:     {},

	EventSupportOpened:    {Optional: []string{"from"}},
	EventSupportEscalated: {Optional: []string{"reason"}, ServerOnly: true},
}

// forbiddenProperties never belong in an event, whatever the dictionary says.
//
// "Send it just in case, we will sort it out later" is the usual way health
// data ends up in analytics, so this is checked automatically rather than at
// review time.
var forbiddenProperties = map[string]struct{}{
	"email": {}, "e_mail": {}, "mail": {}, "address": {},
	"name": {}, "first_name": {}, "last_name": {}, "full_name": {},
	"message": {}, "text": {}, "content": {}, "comment": {},
	"weight": {}, "weight_kg": {}, "height": {}, "height_cm": {},
	"calories": {}, "protein": {}, "fat": {}, "carbs": {},
	"waist": {}, "hips": {}, "chest": {}, "measurements": {},
	"dish": {}, "dish_name": {}, "food_name": {}, "product": {},
	"birth_date": {}, "phone": {}, "telegram_username": {},
}

// IsForbidden reports whether a property name may never be sent.
func IsForbidden(property string) bool {
	_, forbidden := forbiddenProperties[property]
	return forbidden
}
