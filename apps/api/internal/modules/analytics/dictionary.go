// Package analytics records what people do in the product.
//
// Every event is declared here. A free-form name is a dictionary of typos and
// synonyms within a month, so the server refuses anything it does not know.
package analytics

import "sort"

// Event names. Grouped by the question each group answers.
const (
	// The way in: landing page to registered account.
	EventLandingViewed      = "landing_viewed"
	EventLandingScroll      = "landing_scroll_depth"
	EventOnboardingStarted  = "onboarding_started"
	EventOnboardingStep     = "onboarding_step_completed"
	EventOnboardingResult   = "onboarding_result_shown"
	EventLeadSaved          = "lead_saved"
	EventRegistrationOpened = "registration_opened"
	EventRegistrationFailed = "registration_failed"
	EventContactCaptured    = "contact_captured"

	// Sign-in by a one-time link: the request and the exchange are two
	// separate steps, and either can be where somebody drops off.
	EventMagicLinkRequested = "magic_link_requested"
	EventMagicLinkConsumed  = "magic_link_consumed"

	// Facts, sent from the server: a client-sent "registered" lies when the
	// connection drops after a successful request, and disappears entirely
	// behind a blocker.
	EventRegistered    = "registered"
	EventEmailVerified = "email_verified"
	EventSignedIn      = "signed_in"
	EventCuratorAssign = "curator_assigned"
	EventWeeklyReport  = "weekly_report_submitted"
	// Прекращение права на куратора — свершившийся факт, и происходит он без
	// участия браузера вовсе: чаще всего ночью, задачей.
	EventCuratorAccessEnded = "curator_access_ended"

	// Reaching the point where the product does something for them.
	EventFirstFoodEntry   = "first_food_entry"
	EventFoodEntryCreated = "food_entry_created"
	EventFoodRecognition  = "food_recognition_used"
	EventFirstMessage     = "first_curator_message"

	// Support, before there is a curator to ask.
	EventSupportOpened    = "support_chat_opened"
	EventSupportEscalated = "support_escalated"

	// Спрос на куратора. Без этих двух решение о цене и о составе платной части
	// принимается на глаз: сколько людей вообще хочет куратора — неизвестно.
	EventCuratorOfferShown   = "curator_offer_shown"
	EventCuratorOfferClicked = "curator_offer_clicked"
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
	// Values constrains a property to a fixed set, compared by printed form so
	// that 25 and "25" are the same answer. A property absent here takes any
	// scalar.
	//
	// It exists because a threshold is only useful if there are four of them:
	// a report groups by a handful of values, and a free number turns one line
	// into a hundred that nobody reads.
	Values map[string][]string
}

// Dictionary is every event the service accepts.
var Dictionary = map[string]Definition{
	EventLandingViewed: {Optional: []string{"source"}},
	// Карта скроллинга ушла вместе с записью сессий — одна опция Метрики несла
	// обе, — и это отвечает на вопрос, ради которого она была нужна:
	// дочитывают ли посадочную до утверждений, вокруг которых она построена.
	// Значение категориальное намеренно: сырой процент — сотня значений, по
	// которым никто не станет группировать.
	EventLandingScroll: {
		Required: []string{"depth"},
		Values:   map[string][]string{"depth": {"25", "50", "75", "100"}},
	},
	EventOnboardingStarted: {Optional: []string{"source"}},
	EventOnboardingStep:    {Required: []string{"step"}},
	EventOnboardingResult:  {Optional: []string{"goal", "activity_level"}},
	// capture_source says where the contact was left. It was missing here while
	// the client had been sending it since ee5a0aac, so every lead_saved was
	// refused at the door: two real leads in the table, not one event about
	// them — and contact_captured, sent a line later, died in the same batch.
	// Constrained like depth: a typo in the value would be a row no report
	// matches. The three values are the ones documented on leads.capture_source.
	EventLeadSaved: {
		Optional: []string{"contact_consent", "capture_source"},
		Values:   map[string][]string{"capture_source": {"result", "contact_step", "bot"}},
	},
	EventRegistrationOpened: {Optional: []string{"method"}},
	EventRegistrationFailed: {Required: []string{"reason"}, Optional: []string{"method"}},

	// source says where the contact was left, not who left it: no address,
	// no name, no number from the calculation.
	EventContactCaptured: {Required: []string{"source"}},

	// No properties: the response to the request is the same whether the
	// address has an account or not, and the event must not carry a
	// difference the response itself does not have.
	EventMagicLinkRequested: {},
	// outcome distinguishes an account created by this very link from an
	// existing one that was signed into — the fact the exchange produced,
	// not who was behind it.
	EventMagicLinkConsumed: {Required: []string{"outcome"}},

	// method is required, not optional, on both: an account arrives either by
	// password or through a named provider, and an event that does not say
	// which is counted as neither. When it was optional the provider path
	// recorded nothing and the funnel read as if everyone used a password.
	EventRegistered:    {Required: []string{"method"}, ServerOnly: true},
	EventEmailVerified: {ServerOnly: true},
	EventSignedIn:      {Required: []string{"method"}, ServerOnly: true},
	EventCuratorAssign: {ServerOnly: true},
	EventWeeklyReport:  {ServerOnly: true},
	// reason отличает истечение срока от снятия вручную: это разные причины
	// оттока, и складывать их в одно число нельзя.
	EventCuratorAccessEnded: {
		Optional:   []string{"reason"},
		ServerOnly: true,
		Values:     map[string][]string{"reason": {"expired", "revoked"}},
	},

	// Facts too, for the same reason as the group above. Both used to be
	// decided in the browser by a localStorage key: lost behind a blocker,
	// absent on another device, and first_food_entry never arrived at all
	// because the client sent meal_type, which was never declared for it.
	//
	// method is gone rather than moved: the server does not know which tab was
	// used, and the property had been sent zero times. The breakdown lives on
	// food_entry_created, which stays a client event.
	EventFirstFoodEntry:   {ServerOnly: true},
	EventFoodEntryCreated: {Optional: []string{"method", "meal_type"}},
	EventFoodRecognition:  {Optional: []string{"outcome"}},
	EventFirstMessage:     {ServerOnly: true},

	EventSupportOpened:    {Optional: []string{"from"}},
	EventSupportEscalated: {Optional: []string{"reason"}, ServerOnly: true},

	// place — где предложение показано. Значения перечислены: опечатка в
	// значении дала бы строку, которой не соответствует ни один отчёт.
	EventCuratorOfferShown: {
		Required: []string{"place"},
		Values:   map[string][]string{"place": {"chat", "dashboard"}},
	},
	EventCuratorOfferClicked: {
		Required: []string{"place"},
		Values:   map[string][]string{"place": {"chat", "dashboard"}},
	},
}

// AllEventNames returns every event name in the dictionary, sorted so the
// order is stable wherever it is compared or printed.
func AllEventNames() []string {
	names := make([]string, 0, len(Dictionary))
	for name := range Dictionary {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
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
