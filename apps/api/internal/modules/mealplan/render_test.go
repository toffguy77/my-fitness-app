package mealplan

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/mealplan/generator"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fixedTargets struct {
	t *nutritioncalc.CalculatedTargets
}

func (f fixedTargets) RecalculateForDate(context.Context, int64, time.Time) (*nutritioncalc.CalculatedTargets, error) {
	return f.t, nil
}

func (f fixedTargets) MissingInputsFor(context.Context, int64, time.Time) (*nutritioncalc.MissingInputs, error) {
	return &nutritioncalc.MissingInputs{Weight: true}, nil
}

func renderOne(t *testing.T, current *nutritioncalc.CalculatedTargets, p *storedPlan) *MealPlan {
	t.Helper()
	s := NewService(nil, logger.New(), fixedTargets{current}, nil)
	out, err := s.render(context.Background(), 1, day{key: "2026-10-10"}, p)
	require.NoError(t, err)
	return out
}

// Сценарий «Проценты»: цель белка 120 г, в плане 102 г — 85% и остаток 18 г.
func TestPercentAndRemaining(t *testing.T) {
	p := &storedPlan{
		mealTypes: []string{"breakfast", "snack"},
		target:    target{kcal: 2000, protein: 120, fat: 70, carbs: 220},
		items: map[string]*storedItem{
			// 300 g × 34 g/100 g = 102 g protein.
			"breakfast": {mealType: "breakfast", grams: 300, versionID: "v",
				recipe: generator.Recipe{ID: "r", PortionGrams: 250,
					Per100: generator.Nutrition{Kcal: 400, Protein: 34, Fat: 15, Carbs: 30}}},
		},
	}
	out := renderOne(t, &nutritioncalc.CalculatedTargets{Calories: 2000.4, Protein: 119.6, Fat: 70, Carbs: 220}, p)

	assert.Equal(t, 102.0, out.Totals.Protein)
	assert.Equal(t, 85, out.PercentOfTarget.Protein)
	assert.Equal(t, 18.0, out.Remaining.Protein)
	assert.Equal(t, 85, out.Items[0].PercentOfTarget.Protein)
	assert.Equal(t, 1200.0, out.Totals.Kcal)
	assert.Equal(t, 800.0, out.Remaining.Kcal)

	// Calorie split sums to exactly 100.
	sp := out.CalorieSplit
	assert.Equal(t, 100, sp.Protein+sp.Fat+sp.Carbs)

	// The snack has no dish: empty with a reason.
	assert.Equal(t, []EmptySlot{{MealType: "snack", Reason: ReasonNoRecipes}}, out.Empty)

	// Rounded current target equals the stored one: not changed.
	assert.False(t, out.TargetChanged)
	// Out of tolerance: reported.
	assert.NotEmpty(t, out.Deviations)
}

func TestTargetChangedComparesRoundedTargets(t *testing.T) {
	p := &storedPlan{mealTypes: []string{"lunch"}, target: target{kcal: 2000, protein: 120, fat: 70, carbs: 220},
		items: map[string]*storedItem{}}
	assert.True(t, renderOne(t, &nutritioncalc.CalculatedTargets{Calories: 1800, Protein: 120, Fat: 70, Carbs: 220}, p).TargetChanged)
	// A target that cannot be calculated now is nothing to compare with.
	assert.False(t, renderOne(t, nil, p).TargetChanged)
}

func TestCalorieSplitSumsTo100(t *testing.T) {
	for _, n := range []generator.Nutrition{
		{Protein: 1, Fat: 1, Carbs: 1},
		{Protein: 33.3, Fat: 14.8, Carbs: 33.3},
		{Protein: 120, Fat: 70, Carbs: 220},
		{Protein: 0, Fat: 0, Carbs: 10},
		{Protein: 17.77, Fat: 3.21, Carbs: 91.13},
	} {
		sp := calorieSplit(n)
		assert.Equal(t, 100, sp.Protein+sp.Fat+sp.Carbs, "%+v", n)
	}
	assert.Equal(t, CalorieSplit{}, calorieSplit(generator.Nutrition{}))
	// 4/9/4 kcal per gram: 25 g protein, 0 fat, 75 g carbs → 25/0/75.
	assert.Equal(t, CalorieSplit{Protein: 25, Fat: 0, Carbs: 75}, calorieSplit(generator.Nutrition{Protein: 25, Carbs: 75}))
}

func TestInitialSeedIsStable(t *testing.T) {
	assert.Equal(t, initialSeed(5, "2026-10-10"), initialSeed(5, "2026-10-10"))
	assert.NotEqual(t, initialSeed(5, "2026-10-10"), initialSeed(5, "2026-10-11"))
	assert.NotEqual(t, initialSeed(5, "2026-10-10"), initialSeed(6, "2026-10-10"))
	assert.GreaterOrEqual(t, initialSeed(5, "2026-10-10"), int64(0))
}
