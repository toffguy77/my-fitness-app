// Package recipeaccess is the one implementation of "may this client be shown
// this recipe".
//
// The rule is used by the catalogue and the recipe card now, and by plan
// assembly (meal-day-plan) and diary search (plan-diary-logging) later. Written
// out in each of them it would drift: a place that forgot the exclusions would
// offer a client the dish they said they cannot eat.
//
// The package is plain SQL over six tables and imports no module on purpose.
// recipes calls food-tracker (product normalisation, catalogue search), and
// food-tracker will filter recipes in diary search; owning the rule in either
// of them would be an import cycle.
package recipeaccess

import "fmt"

// Join is the FROM fragment pairing a recipe with its approved version, the
// only version a client ever sees. Use with Available and the same aliases.
func Join(recipe, version string) string {
	return fmt.Sprintf(
		"recipes %[1]s JOIN recipe_versions %[2]s ON %[2]s.recipe_id = %[1]s.id AND %[2]s.state = 'approved'",
		recipe, version)
}

// Available is a boolean SQL expression: the recipe aliased recipe, with its
// approved version aliased version, is available to the user whose id is bound
// at userParam (e.g. "$1").
//
// Available means: published, has an approved version, not hidden from this
// client by a curator, not rejected by the client, carries none of the
// client's allergens, and no ingredient of the approved version is among the
// client's excluded foods.
func Available(recipe, version, userParam string) string {
	return fmt.Sprintf(`(
	%[1]s.status = 'published'
	AND %[2]s.state = 'approved'
	AND NOT EXISTS (SELECT 1 FROM client_hidden_recipes ra_h
	                WHERE ra_h.client_id = %[3]s AND ra_h.recipe_id = %[1]s.id)
	AND NOT EXISTS (SELECT 1 FROM user_rejected_recipes ra_r
	                WHERE ra_r.user_id = %[3]s AND ra_r.recipe_id = %[1]s.id)
	AND NOT (%[2]s.allergens && COALESCE(
	        (SELECT ra_f.allergens FROM user_food_restrictions ra_f WHERE ra_f.user_id = %[3]s),
	        '{}'::TEXT[]))
	AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ra_i
	                JOIN user_excluded_foods ra_e ON ra_e.food_id = ra_i.food_id
	                WHERE ra_i.version_id = %[2]s.id AND ra_e.user_id = %[3]s)
)`, recipe, version, userParam)
}
