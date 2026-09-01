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

// Lead is a saved onboarding attempt.
type Lead struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Name       string     `json:"name,omitempty"`
	Parameters Parameters `json:"parameters"`
	Result     *Result    `json:"result,omitempty"`
	LastStep   string     `json:"last_step"`
	Source     string     `json:"source,omitempty"`
	Consents   Consents   `json:"consents"`
	HandledAt  *time.Time `json:"handled_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// CreateInput is what the contact step submits.
type CreateInput struct {
	Email      string     `json:"email" binding:"required,email"`
	Name       string     `json:"name"`
	Parameters Parameters `json:"parameters"`
	Result     *Result    `json:"result"`
	LastStep   string     `json:"last_step"`
	Source     string     `json:"source"`
	Consents   Consents   `json:"consents"`
}
