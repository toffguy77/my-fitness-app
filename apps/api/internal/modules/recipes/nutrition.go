package recipes

import "math"

// NutritionIngredient is one ingredient as the calculation sees it: the
// catalogue's КБЖУ per 100 g and the weight in the recipe.
type NutritionIngredient struct {
	Per100  Nutrition
	Grams   float64
	ToTaste bool
}

// NutritionResult is what a version stores and shows.
type NutritionResult struct {
	Per100       Nutrition
	PerPortion   Nutrition
	TotalGrams   float64
	PortionGrams float64
	// Approximate: the finished weight is unknown, so the sum of ingredient
	// weights stands in for it — cooking loses or gains water, and the
	// per-100 g figure is off by exactly that.
	Approximate bool
}

// ComputeNutrition is the only way a version's КБЖУ comes about.
//
// Sum of each ingredient's catalogue values per 100 g times its weight, divided
// by the finished weight. Without a finished weight the ingredients' total is
// used and the result is marked approximate. "To taste" ingredients have no
// weight and take no part. Portion weight is the finished weight divided by the
// number of servings.
func ComputeNutrition(ingredients []NutritionIngredient, yieldGrams *float64, servings int) NutritionResult {
	if servings < 1 {
		servings = 1
	}

	var sum Nutrition
	var ingredientsWeight float64
	for _, ing := range ingredients {
		if ing.ToTaste || ing.Grams <= 0 {
			continue
		}
		k := ing.Grams / 100
		sum.Kcal += ing.Per100.Kcal * k
		sum.Protein += ing.Per100.Protein * k
		sum.Fat += ing.Per100.Fat * k
		sum.Carbs += ing.Per100.Carbs * k
		ingredientsWeight += ing.Grams
	}

	result := NutritionResult{TotalGrams: ingredientsWeight, Approximate: true}
	if yieldGrams != nil && *yieldGrams > 0 {
		result.TotalGrams = *yieldGrams
		result.Approximate = false
	}
	if result.TotalGrams <= 0 {
		return result
	}

	scale := 100 / result.TotalGrams
	per100 := Nutrition{
		Kcal: sum.Kcal * scale, Protein: sum.Protein * scale,
		Fat: sum.Fat * scale, Carbs: sum.Carbs * scale,
	}
	result.PortionGrams = result.TotalGrams / float64(servings)
	result.Per100 = round(per100)
	result.PerPortion = portion(per100, result.PortionGrams)
	result.TotalGrams = round1(result.TotalGrams)
	result.PortionGrams = round1(result.PortionGrams)
	return result
}

// portion scales per-100 g values to a portion weight.
func portion(per100 Nutrition, grams float64) Nutrition {
	k := grams / 100
	return round(Nutrition{
		Kcal: per100.Kcal * k, Protein: per100.Protein * k,
		Fat: per100.Fat * k, Carbs: per100.Carbs * k,
	})
}

func round(n Nutrition) Nutrition {
	return Nutrition{Kcal: round1(n.Kcal), Protein: round1(n.Protein), Fat: round1(n.Fat), Carbs: round1(n.Carbs)}
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
