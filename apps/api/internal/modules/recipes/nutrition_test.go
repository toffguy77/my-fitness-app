package recipes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func ptr[T any](v T) *T { return &v }

func TestComputeNutrition(t *testing.T) {
	tests := []struct {
		name        string
		ingredients []NutritionIngredient
		yield       *float64
		servings    int
		want        NutritionResult
	}{
		{
			// Сценарий «Расчёт с весом готового блюда».
			name: "with finished weight",
			ingredients: []NutritionIngredient{
				{Per100: Nutrition{Kcal: 100, Protein: 20}, Grams: 300},
			},
			yield:    ptr(250.0),
			servings: 2,
			want: NutritionResult{
				Per100:       Nutrition{Kcal: 120, Protein: 24},
				PerPortion:   Nutrition{Kcal: 150, Protein: 30},
				TotalGrams:   250,
				PortionGrams: 125,
				Approximate:  false,
			},
		},
		{
			// Сценарий «Вес готового блюда не задан»: расчёт от 300 г,
			// версия приблизительная.
			name: "without finished weight",
			ingredients: []NutritionIngredient{
				{Per100: Nutrition{Kcal: 150, Protein: 10, Fat: 5, Carbs: 20}, Grams: 200},
				{Per100: Nutrition{Kcal: 60, Protein: 1, Fat: 0, Carbs: 14}, Grams: 100},
			},
			servings: 3,
			want: NutritionResult{
				// (300 + 60) / 300 * 100 = 120; (20 + 1) / 3 = 7; 10/3 = 3.3; (40 + 14) / 3 = 18
				Per100:       Nutrition{Kcal: 120, Protein: 7, Fat: 3.3, Carbs: 18},
				PerPortion:   Nutrition{Kcal: 120, Protein: 7, Fat: 3.3, Carbs: 18},
				TotalGrams:   300,
				PortionGrams: 100,
				Approximate:  true,
			},
		},
		{
			// Сценарий «Ингредиент по вкусу»: не участвует ни в весе, ни в КБЖУ.
			name: "to taste ingredient is ignored",
			ingredients: []NutritionIngredient{
				{Per100: Nutrition{Kcal: 100, Protein: 20}, Grams: 300},
				{Per100: Nutrition{Kcal: 900, Fat: 100}, ToTaste: true},
			},
			servings: 1,
			want: NutritionResult{
				Per100:       Nutrition{Kcal: 100, Protein: 20},
				PerPortion:   Nutrition{Kcal: 300, Protein: 60},
				TotalGrams:   300,
				PortionGrams: 300,
				Approximate:  true,
			},
		},
		{
			name:     "nothing weighed yet",
			servings: 2,
			want:     NutritionResult{Approximate: true},
		},
		{
			name: "zero servings counts as one",
			ingredients: []NutritionIngredient{
				{Per100: Nutrition{Kcal: 100}, Grams: 200},
			},
			servings: 0,
			want: NutritionResult{
				Per100: Nutrition{Kcal: 100}, PerPortion: Nutrition{Kcal: 200},
				TotalGrams: 200, PortionGrams: 200, Approximate: true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, ComputeNutrition(tt.ingredients, tt.yield, tt.servings))
		})
	}
}
