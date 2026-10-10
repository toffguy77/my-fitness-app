// Package recipes is the recipe catalogue: recipes and their versions, nutrition
// computed from our product catalogue, the draft → review → approved lifecycle,
// VkusVill import, and the client's food restrictions.
//
// Which recipes a client may see is not decided here: that rule lives in
// internal/shared/recipeaccess, so plan assembly and diary search apply the
// same one.
package recipes

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Version states.
const (
	StateDraft      = "draft"
	StateReview     = "review"
	StateApproved   = "approved"
	StateSuperseded = "superseded"
)

// Recipe statuses and sources.
const (
	StatusPublished   = "published"
	StatusUnpublished = "unpublished"
	SourceManual      = "manual"
	SourceVkusvill    = "vkusvill"
)

// MealTypes, Complexities and Allergens are the fixed vocabularies; the
// migration's CHECK constraints repeat them.
var (
	MealTypes    = []string{"breakfast", "lunch", "dinner", "snack"}
	Complexities = []string{"easy", "medium", "hard"}
	Allergens    = []string{"nuts", "peanuts", "gluten", "lactose", "eggs", "fish",
		"seafood", "soy", "sesame", "mustard", "celery"}
)

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// PhotoPrefix is where recipe photos live in the content bucket. Photos are not
// personal, so the key carries no user id and the object is public.
const PhotoPrefix = "recipes/"

// Nutrition is КБЖУ, rounded to 0.1.
type Nutrition struct {
	Kcal    float64 `json:"kcal"`
	Protein float64 `json:"protein"`
	Fat     float64 `json:"fat"`
	Carbs   float64 `json:"carbs"`
}

// Candidate is a catalogue product suggested for an imported ingredient.
type Candidate struct {
	FoodID        string   `json:"food_id"`
	Name          string   `json:"name"`
	DefaultWeight *float64 `json:"default_weight"`
}

// Ingredient of a stored version.
type Ingredient struct {
	Position        int         `json:"position"`
	FoodID          *string     `json:"food_id"`
	FoodName        *string     `json:"food_name"`
	SourceName      *string     `json:"source_name"`
	Grams           *float64    `json:"grams"`
	DisplayQuantity *string     `json:"display_quantity"`
	ToTaste         bool        `json:"to_taste"`
	Candidates      []Candidate `json:"candidates,omitempty"`
}

// Step of a stored version.
type Step struct {
	Position int     `json:"position"`
	Text     string  `json:"text"`
	PhotoKey *string `json:"photo_key"`
	PhotoURL *string `json:"photo_url"`
}

// RecipeVersion is one version with everything a card or the editor shows.
type RecipeVersion struct {
	ID            string       `json:"id"`
	RecipeID      string       `json:"recipe_id"`
	Version       int          `json:"version"`
	State         string       `json:"state"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	PhotoKey      *string      `json:"photo_key"`
	PhotoURL      *string      `json:"photo_url"`
	CookMinutes   int          `json:"cook_minutes"`
	Complexity    string       `json:"complexity"`
	Servings      int          `json:"servings"`
	YieldGrams    *float64     `json:"yield_grams"`
	TotalGrams    float64      `json:"total_grams"`
	PortionGrams  float64      `json:"portion_grams"`
	Approximate   bool         `json:"approximate"`
	MealTypes     []string     `json:"meal_types"`
	Tags          []string     `json:"tags"`
	Allergens     []string     `json:"allergens"`
	Per100g       Nutrition    `json:"per_100g"`
	PerPortion    Nutrition    `json:"per_portion"`
	Ingredients   []Ingredient `json:"ingredients"`
	Steps         []Step       `json:"steps"`
	ReviewComment *string      `json:"review_comment"`
	ApprovedAt    *time.Time   `json:"approved_at"`
	CreatedAt     time.Time    `json:"created_at"`
}

// RecipeSummary is one element of a list.
type RecipeSummary struct {
	ID              string    `json:"id"`
	Status          string    `json:"status"`
	Source          string    `json:"source"`
	Name            string    `json:"name"`
	PhotoKey        *string   `json:"photo_key"`
	PhotoURL        *string   `json:"photo_url"`
	CookMinutes     int       `json:"cook_minutes"`
	Complexity      string    `json:"complexity"`
	MealTypes       []string  `json:"meal_types"`
	PortionGrams    float64   `json:"portion_grams"`
	PerPortion      Nutrition `json:"per_portion"`
	Approximate     bool      `json:"approximate"`
	ApprovedVersion *int      `json:"approved_version"`
	WorkingState    *string   `json:"working_state"`
}

// RecipeDetail is what the team and the curator open: both versions side by side.
type RecipeDetail struct {
	Recipe   RecipeSummary  `json:"recipe"`
	Approved *RecipeVersion `json:"approved"`
	Working  *RecipeVersion `json:"working"`
}

// FlexID accepts a food id as the search returned it: a JSON number (products)
// or a string (products number or food_items UUID). null stays nil.
type FlexID struct{ Value *string }

// UnmarshalJSON implements json.Unmarshaler.
func (f *FlexID) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) {
		f.Value = nil
		return nil
	}
	if len(data) > 0 && data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			f.Value = nil
			return nil
		}
		f.Value = &s
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(data, &n); err != nil {
		return fmt.Errorf("food_id must be a string or a number")
	}
	if _, err := strconv.ParseInt(n.String(), 10, 64); err != nil {
		return fmt.Errorf("food_id must be an integer")
	}
	s := n.String()
	f.Value = &s
	return nil
}

// IngredientInput is an ingredient as the editor sends it.
type IngredientInput struct {
	FoodID          FlexID   `json:"food_id"`
	SourceName      *string  `json:"source_name"`
	Grams           *float64 `json:"grams"`
	DisplayQuantity *string  `json:"display_quantity"`
	ToTaste         bool     `json:"to_taste"`
}

// StepInput is a step as the editor sends it.
type StepInput struct {
	Text     string  `json:"text"`
	PhotoKey *string `json:"photo_key"`
}

// VersionInput is a version as the editor sends it. Nutrition fields are not
// here on purpose: whatever the caller sends about КБЖУ is ignored, because it
// is computed from the catalogue.
type VersionInput struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	PhotoKey    *string           `json:"photo_key"`
	CookMinutes int               `json:"cook_minutes"`
	Complexity  string            `json:"complexity"`
	Servings    int               `json:"servings"`
	YieldGrams  *float64          `json:"yield_grams"`
	MealTypes   []string          `json:"meal_types"`
	Tags        []string          `json:"tags"`
	Allergens   []string          `json:"allergens"`
	Ingredients []IngredientInput `json:"ingredients"`
	Steps       []StepInput       `json:"steps"`
}

// FoodRef names a catalogue product or a recipe in a restrictions answer.
type FoodRef struct {
	FoodID string `json:"food_id"`
	Name   string `json:"name"`
}

// RecipeRef names a recipe in a restrictions answer.
type RecipeRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// FoodRestrictions is a client's restrictions.
type FoodRestrictions struct {
	Allergens       []string    `json:"allergens"`
	ExcludedFoods   []FoodRef   `json:"excluded_foods"`
	RejectedRecipes []RecipeRef `json:"rejected_recipes"`
	HiddenRecipes   []RecipeRef `json:"hidden_recipes,omitempty"`
}

// RestrictionsInput is what the client or their curator saves.
type RestrictionsInput struct {
	Allergens       []string `json:"allergens"`
	ExcludedFoodIDs []FlexID `json:"excluded_food_ids"`
}

// ListQuery is a page of a list with its filters.
type ListQuery struct {
	Q        string
	State    string
	MealType string
	Limit    int
	Offset   int
}
