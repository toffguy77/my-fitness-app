// Package leads records people who went through the onboarding and left a
// contact without finishing registration.
//
// Before this existed, they left no trace at all: no address, no parameters, no
// record of where they stopped.
package leads

import "time"

// Parameters are what the guest told the wizard. Every field is optional
// because a lead can be saved at any point after the contact step.
type Parameters struct {
	Sex           string   `json:"sex,omitempty"`
	BirthDate     string   `json:"birth_date,omitempty"`
	HeightCm      *float64 `json:"height_cm,omitempty"`
	WeightKg      *float64 `json:"weight_kg,omitempty"`
	ActivityLevel string   `json:"activity_level,omitempty"`
	Goal          string   `json:"goal,omitempty"`
}

// Result is what the calculation produced for those parameters.
type Result struct {
	Calories     float64 `json:"calories"`
	Protein      float64 `json:"protein"`
	Fat          float64 `json:"fat"`
	Carbs        float64 `json:"carbs"`
	WaterGlasses int     `json:"water_glasses"`
}

// Consents are separate on purpose: saving the lead needs the first, writing to
// them needs the second.
type Consents struct {
	DataProcessing bool `json:"data_processing"`
	Contact        bool `json:"contact"`
}

// Attribution is where the person came from.
//
// Fields rather than the single `Source` string that came before: the question
// asked of this data is "which campaign", and an administrative list groups by
// campaign. Grouping by a URL means parsing one on every read.
//
// YandexClickID is separate from the tags because the tags can be put on a
// link by anybody, including us in our own letters, while the click id is set
// by the ad network and is what ties a conversion back to a paid click.
//
// MetrikaClientID arrives after the lead is saved — the counter hands it over
// through a callback that never fires behind an ad blocker — so it is written
// later and is often absent.
type Attribution struct {
	UTMSource   string `json:"utm_source,omitempty"`
	UTMMedium   string `json:"utm_medium,omitempty"`
	UTMCampaign string `json:"utm_campaign,omitempty"`
	UTMContent  string `json:"utm_content,omitempty"`
	UTMTerm     string `json:"utm_term,omitempty"`

	YandexClickID   string `json:"yandex_click_id,omitempty"`
	MetrikaClientID string `json:"metrika_client_id,omitempty"`
}

// Lead is a saved onboarding attempt.
type Lead struct {
	ID          string      `json:"id"`
	Email       string      `json:"email"`
	Name        string      `json:"name,omitempty"`
	Parameters  Parameters  `json:"parameters"`
	Result      *Result     `json:"result,omitempty"`
	LastStep    string      `json:"last_step"`
	Source      string      `json:"source,omitempty"`
	Attribution Attribution `json:"attribution"`
	Consents    Consents    `json:"consents"`
	HandledAt   *time.Time  `json:"handled_at,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// QueueEntry is a lead together with what a curator needs to act on it: how
// long it has waited, whether the one automatic reminder already went out,
// whether writing to the person is even allowed, and — when they also talked
// to the support bot — the conversation that explains what they asked.
type QueueEntry struct {
	Lead
	// AgeDays is how many days the person has waited. Computed in SQL, not
	// Go: a curator's browser and the database do not share a timezone, and
	// "three days" must not depend on which one counts.
	AgeDays int `json:"age_days"`
	// ReminderSent says whether the single automatic reminder has already
	// gone out, so a curator does not repeat by hand what already happened.
	ReminderSent bool `json:"reminder_sent"`
	// ContactAllowed mirrors the separate contact consent (migration 051): a
	// lead can belong in the queue — it says something about the funnel —
	// without permission to write to the person. A human follow-up cannot be
	// a loophole around a consent that was withheld.
	ContactAllowed bool `json:"contact_allowed"`
	// ConversationID names the support conversation opened from this lead's
	// resume link, when the person also went through the bot. It stays nil
	// for most leads until the public-support-widget plan starts linking
	// conversations widely — the queue must not offer a transition where
	// there is nothing to transition to.
	ConversationID *string `json:"conversation_id,omitempty"`
}

// CreateInput is what the contact step, the result screen and the support
// bot submit.
type CreateInput struct {
	Email       string      `json:"email" binding:"required,email"`
	Name        string      `json:"name"`
	Parameters  Parameters  `json:"parameters"`
	Result      *Result     `json:"result"`
	LastStep    string      `json:"last_step"`
	Source      string      `json:"source"`
	Attribution Attribution `json:"attribution"`
	// Which screen the contact was left on: contact_step | result | bot.
	// Empty defaults to contact_step in Service.Create — that was the only
	// place a lead was ever created before this field existed.
	CaptureSource string   `json:"capture_source"`
	Consents      Consents `json:"consents"`
}

// ClientIDInput carries the browser identifier for a lead already saved.
//
// Separate from CreateInput because it arrives later and on its own: waiting
// for it before saving the lead would lose the contact of everybody running an
// ad blocker, in exchange for attribution that would not exist in that case
// anyway. The contact matters more.
type ClientIDInput struct {
	Token    string `json:"token" binding:"required"`
	ClientID string `json:"client_id" binding:"required"`
}
