// Package mealplan is the client's day plan: one dish per selected meal with
// weights fitted to the day's nutrition target.
//
// The fitting itself is the pure package mealplan/generator; this package
// reads the target (nutrition-calc), the candidates (approved recipes the
// client may see, by internal/shared/recipeaccess) and the stored plan, and
// writes the result.
package mealplan

import (
	"fmt"
	"strings"

	"github.com/burcev/api/internal/shared/apperrors"
)

// MaxManualGrams caps a weight the client types in.
const MaxManualGrams = 2000

// WindowDays is how far from today, either way, a plan may be addressed.
const WindowDays = 30

// Nutrition is КБЖУ as the API shows it.
type Nutrition struct {
	Kcal    float64 `json:"kcal"`
	Protein float64 `json:"protein"`
	Fat     float64 `json:"fat"`
	Carbs   float64 `json:"carbs"`
}

// Percent is a nutrition breakdown in whole percent of the day's target.
type Percent struct {
	Kcal    int `json:"kcal"`
	Protein int `json:"protein"`
	Fat     int `json:"fat"`
	Carbs   int `json:"carbs"`
}

// PlanItem is one planned dish.
type PlanItem struct {
	MealType        string    `json:"meal_type"`
	RecipeID        string    `json:"recipe_id"`
	RecipeVersionID string    `json:"recipe_version_id"`
	Name            string    `json:"name"`
	PhotoURL        *string   `json:"photo_url"`
	Grams           int       `json:"grams"`
	PortionGrams    float64   `json:"portion_grams"`
	Nutrition       Nutrition `json:"nutrition"`
	PercentOfTarget Percent   `json:"percent_of_target"`
	Locked          bool      `json:"locked"`
	ManualGrams     bool      `json:"manual_grams"`
	Unavailable     bool      `json:"unavailable"`
	// Eaten: a diary entry on the plan's date in this meal was made from this
	// dish (plan-diary-logging). Nutrition and the day's totals then use
	// EatenGrams — the entry's weight, not the plan's.
	Eaten       bool     `json:"eaten"`
	EatenGrams  *float64 `json:"eaten_grams"`
	FoodEntryID *string  `json:"food_entry_id"`
}

// ReasonNoRecipes: no recipe the client may see suits the meal.
const ReasonNoRecipes = "no_recipes"

// EmptySlot is a selected meal without a dish.
type EmptySlot struct {
	MealType string `json:"meal_type"`
	Reason   string `json:"reason"`
}

// Deviation is a nutrient outside its tolerance; Delta is total − target.
type Deviation struct {
	Nutrient string  `json:"nutrient"`
	Delta    float64 `json:"delta"`
}

// CalorieSplit is the day's calories by source, in percent summing to 100.
type CalorieSplit struct {
	Protein int `json:"protein"`
	Fat     int `json:"fat"`
	Carbs   int `json:"carbs"`
}

// MealPlan is the day as the client sees it.
type MealPlan struct {
	Date            string       `json:"date"`
	MealTypes       []string     `json:"meal_types"`
	Target          Nutrition    `json:"target"`
	TargetChanged   bool         `json:"target_changed"`
	Items           []PlanItem   `json:"items"`
	Empty           []EmptySlot  `json:"empty"`
	Totals          Nutrition    `json:"totals"`
	PercentOfTarget Percent      `json:"percent_of_target"`
	Remaining       Nutrition    `json:"remaining"`
	CalorieSplit    CalorieSplit `json:"calorie_split"`
	Deviations      []Deviation  `json:"deviations"`
}

// Alternative is a replacement for one meal with the day it would make.
type Alternative struct {
	RecipeID  string    `json:"recipe_id"`
	Name      string    `json:"name"`
	PhotoURL  *string   `json:"photo_url"`
	Grams     int       `json:"grams"`
	Nutrition Nutrition `json:"nutrition"`
	DayTotals Nutrition `json:"day_totals"`
}

// Settings are the meals the client plans.
type Settings struct {
	MealTypes []string `json:"meal_types"`
}

// ItemUpdate is a change to one dish. Absent fields are left alone.
type ItemUpdate struct {
	RecipeID   *string  `json:"recipe_id"`
	Grams      *float64 `json:"grams"`
	Locked     *bool    `json:"locked"`
	ResetGrams bool     `json:"reset_grams"`
}

// EatRequest logs a planned dish to the diary. Absent grams are the plan's
// weight; absent time is the client's current time today, 12:00 on other days.
type EatRequest struct {
	Grams *float64 `json:"grams"`
	Time  *string  `json:"time"`
}

// EatResult is the diary entry of the dish and the plan after it.
type EatResult struct {
	EntryID string    `json:"entry_id"`
	Plan    *MealPlan `json:"plan"`
	// Created is false when the dish had already been logged and the existing
	// entry is returned.
	Created bool `json:"-"`
}

// TargetMissingError says the day's target cannot be calculated and why.
// Missing holds "profile" and/or "weight".
type TargetMissingError struct{ Missing []string }

func (e *TargetMissingError) Error() string {
	return "target cannot be calculated, missing: " + strings.Join(e.Missing, ", ")
}

// Unwrap makes it an ErrConflict for errors.Is.
func (e *TargetMissingError) Unwrap() error { return apperrors.ErrConflict }

func conflict(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{apperrors.ErrConflict}, args...)...)
}

func validation(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{apperrors.ErrValidation}, args...)...)
}
