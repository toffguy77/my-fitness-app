package generator

import (
	"fmt"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recipe builds a recipe from its calorie split (percent of kcal from protein
// and fat; carbs are the rest), energy density and portion.
func recipe(id string, proteinPct, fatPct, density, portion float64) Recipe {
	carbsPct := 100 - proteinPct - fatPct
	return Recipe{
		ID: id,
		Per100: Nutrition{
			Kcal:    density,
			Protein: density * proteinPct / 100 / 4,
			Fat:     density * fatPct / 100 / 9,
			Carbs:   density * carbsPct / 100 / 4,
		},
		PortionGrams: portion,
	}
}

// profiles of the synthetic catalogue: protein% and fat% of kcal.
var profiles = [10][2]float64{
	{15, 25}, {20, 35}, {25, 20}, {30, 30}, {35, 15},
	{40, 25}, {45, 20}, {20, 45}, {30, 40}, {50, 15},
}

// catalogue is 40 recipes, 10 per meal, with spread-out macro splits.
func catalogue() map[string][]Recipe {
	type meal struct {
		density, step, portion float64
	}
	meals := map[string]meal{
		Breakfast: {150, 6, 250},
		Lunch:     {130, 6, 350},
		Dinner:    {120, 6, 320},
		Snack:     {200, 15, 120},
	}
	out := map[string][]Recipe{}
	for _, m := range MealTypes {
		cfg := meals[m]
		for i, p := range profiles {
			out[m] = append(out[m], recipe(fmt.Sprintf("%s-%02d", m, i),
				p[0], p[1], cfg.density+cfg.step*float64(i), cfg.portion))
		}
	}
	return out
}

func target(kcal, proteinPct, fatPct float64) Nutrition {
	return Nutrition{
		Kcal:    kcal,
		Protein: kcal * proteinPct / 100 / 4,
		Fat:     kcal * fatPct / 100 / 9,
		Carbs:   kcal * (100 - proteinPct - fatPct) / 100 / 4,
	}
}

func slots(cat map[string][]Recipe, meals ...string) []Slot {
	if len(meals) == 0 {
		meals = MealTypes
	}
	out := []Slot{}
	for _, m := range meals {
		out = append(out, Slot{MealType: m, Candidates: cat[m]})
	}
	return out
}

func targets20() []Nutrition {
	pcts := [][2]float64{{20, 30}, {25, 25}, {30, 30}, {25, 35}, {20, 25}}
	out := []Nutrition{}
	for i := 0; i < 20; i++ {
		p := pcts[i%len(pcts)]
		out = append(out, target(1400+float64(i)*80, p[0], p[1]))
	}
	return out
}

func assertWithinTolerance(t *testing.T, tgt, totals Nutrition, label string) {
	t.Helper()
	assert.InDelta(t, tgt.Kcal, totals.Kcal, tgt.Kcal*KcalTolerance, "%s: kcal", label)
	assert.GreaterOrEqual(t, totals.Protein, tgt.Protein*ProteinMinimumShare, "%s: protein", label)
	assert.InDelta(t, tgt.Fat, totals.Fat, tgt.Fat*MacroTolerance, "%s: fat", label)
	assert.InDelta(t, tgt.Carbs, totals.Carbs, tgt.Carbs*MacroTolerance, "%s: carbs", label)
}

// Сценарий «Достаточный каталог»: на 40 рецептах и 20 разных целях каждый
// собранный день в допуске, и отклонений в ответе нет.
func TestSufficientCatalogueHitsEveryTarget(t *testing.T) {
	cat := catalogue()
	for i, tgt := range targets20() {
		label := fmt.Sprintf("target %d (%.0f kcal)", i, tgt.Kcal)
		plan := Build(Input{Target: tgt, Slots: slots(cat), Seed: int64(i)})
		require.Len(t, plan.Items, 4, label)
		assertWithinTolerance(t, tgt, plan.Totals, label)
		assert.Empty(t, plan.Deviations, label)
	}
}

// Сценарий «Границы порций»: вес кратен 10 г и в пределах 0,5–2 порций.
func TestPortionBounds(t *testing.T) {
	cat := catalogue()
	// Extreme targets push weights to both edges.
	for _, tgt := range append(targets20(), target(600, 20, 30), target(6000, 20, 30)) {
		plan := Build(Input{Target: tgt, Slots: slots(cat)})
		for _, it := range plan.Items {
			assert.Zero(t, it.Grams%GramStep, "%s %d g", it.MealType, it.Grams)
			assert.GreaterOrEqual(t, float64(it.Grams), MinPortion*it.Recipe.PortionGrams, it.MealType)
			assert.LessOrEqual(t, float64(it.Grams), MaxPortion*it.Recipe.PortionGrams, it.MealType)
		}
	}
}

// Bounds stay on the grid inside 0.5–2 portions even for awkward portions.
func TestBoundsOnTheGrid(t *testing.T) {
	for _, portion := range []float64{15, 33, 125, 255, 999, 1500} {
		lo, hi, ok := Recipe{PortionGrams: portion}.Bounds()
		require.True(t, ok, "%v", portion)
		assert.Zero(t, lo%GramStep)
		assert.Zero(t, hi%GramStep)
		assert.GreaterOrEqual(t, float64(lo), MinPortion*portion)
		assert.LessOrEqual(t, float64(hi), MaxPortion*portion)
		assert.LessOrEqual(t, hi, MaxGrams)
	}
	_, _, ok := Recipe{PortionGrams: 0}.Bounds()
	assert.False(t, ok, "a recipe without a portion cannot be planned")
	_, _, ok = Recipe{PortionGrams: 4}.Bounds()
	assert.False(t, ok, "no multiple of 10 lies within 2–8 g")
}

// Подбор детерминирован: два прогона с одним входом и зерном совпадают — и
// на полном переборе, и на выборке по зерну.
func TestDeterministic(t *testing.T) {
	big := bigCatalogue(200)
	for _, cat := range []map[string][]Recipe{catalogue(), big} {
		in := Input{Target: target(2100, 25, 30), Slots: slots(cat), Seed: 42,
			Recent: map[string]bool{"lunch-03": true}}
		assert.Equal(t, Build(in), Build(in))
	}
}

// Сценарий «Разнообразие»: из двух одинаково подходящих рецептов вчерашний
// проигрывает.
func TestRecentRecipeLosesATie(t *testing.T) {
	cat := catalogue()
	twinA := recipe("dinner-twin-a", 30, 30, 150, 300)
	twinB := recipe("dinner-twin-b", 30, 30, 150, 300)
	s := slots(cat, Breakfast, Lunch, Snack)
	s = append(s, Slot{MealType: Dinner, Candidates: []Recipe{twinA, twinB}})
	tgt := target(2000, 25, 30)

	// Without history the smaller id wins the tie.
	plan := Build(Input{Target: tgt, Slots: s})
	assert.Equal(t, "dinner-twin-a", item(t, plan, Dinner).Recipe.ID)

	plan = Build(Input{Target: tgt, Slots: s, Recent: map[string]bool{"dinner-twin-a": true}})
	assert.Equal(t, "dinner-twin-b", item(t, plan, Dinner).Recipe.ID)
}

func item(t *testing.T, p Plan, meal string) Item {
	t.Helper()
	for _, it := range p.Items {
		if it.MealType == meal {
			return it
		}
	}
	t.Fatalf("no %s in plan", meal)
	return Item{}
}

// Сценарий «Недобор белка»: рецепты без белка — лучший вариант и недобор
// белка в граммах.
func TestProteinShortfallIsReported(t *testing.T) {
	low := map[string][]Recipe{}
	for _, m := range MealTypes {
		low[m] = []Recipe{recipe(m+"-low-a", 5, 30, 150, 300), recipe(m+"-low-b", 8, 25, 160, 300)}
	}
	tgt := target(2000, 30, 30)
	plan := Build(Input{Target: tgt, Slots: slots(low)})
	require.Len(t, plan.Items, 4)

	var protein *Deviation
	for i, d := range plan.Deviations {
		if d.Nutrient == "protein" {
			protein = &plan.Deviations[i]
		}
	}
	require.NotNil(t, protein, "protein shortfall must be reported: %+v", plan.Deviations)
	assert.Less(t, protein.Delta, 0.0)
	assert.InDelta(t, plan.Totals.Protein-tgt.Protein, protein.Delta, 0.1)
}

// Сценарий «Нет рецептов для перекуса»: перекус пуст с причиной, остальные
// собраны.
func TestEmptySnack(t *testing.T) {
	cat := catalogue()
	s := slots(cat)
	s[3].Candidates = nil
	plan := Build(Input{Target: target(2000, 25, 30), Slots: s})
	assert.Equal(t, []string{Snack}, plan.Empty)
	require.Len(t, plan.Items, 3)
	for _, it := range plan.Items {
		assert.NotEqual(t, Snack, it.MealType)
	}
}

// Сценарий «Без перекуса»: доли 25/90, 35/90, 30/90.
func TestSharesWithoutSnack(t *testing.T) {
	sh := Shares([]string{Breakfast, Lunch, Dinner})
	assert.InDelta(t, 25.0/90, sh[Breakfast], 1e-12)
	assert.InDelta(t, 35.0/90, sh[Lunch], 1e-12)
	assert.InDelta(t, 30.0/90, sh[Dinner], 1e-12)
	_, hasSnack := sh[Snack]
	assert.False(t, hasSnack)

	all := Shares(MealTypes)
	assert.InDelta(t, 0.25, all[Breakfast], 1e-12)
	assert.InDelta(t, 0.10, all[Snack], 1e-12)

	assert.InDelta(t, 1.0, Shares([]string{Snack})[Snack], 1e-12)
	assert.Empty(t, Shares(nil))
}

// A plan without the snack is still fitted to the whole day.
func TestPlanWithoutSnackHitsTarget(t *testing.T) {
	cat := catalogue()
	tgt := target(2000, 25, 30)
	plan := Build(Input{Target: tgt, Slots: slots(cat, Breakfast, Lunch, Dinner)})
	require.Len(t, plan.Items, 3)
	assertWithinTolerance(t, tgt, plan.Totals, "without snack")
}

// Сценарий «Ручной вес»: завтрак 200 г, остальные пересчитаны под оставшуюся
// цель.
func TestManualGrams(t *testing.T) {
	cat := catalogue()
	tgt := target(2200, 25, 30)
	first := Build(Input{Target: tgt, Slots: slots(cat)})

	current := fixedSlots(cat, first)
	current[0].Grams = 200
	refit := Build(Input{Target: tgt, Slots: current})

	b := item(t, refit, Breakfast)
	assert.Equal(t, 200, b.Grams)
	assert.True(t, b.Manual)
	assert.Equal(t, item(t, first, Breakfast).Recipe.ID, b.Recipe.ID)
	// The other dishes moved to make up for the breakfast.
	changed := false
	for _, m := range []string{Lunch, Dinner, Snack} {
		assert.Equal(t, item(t, first, m).Recipe.ID, item(t, refit, m).Recipe.ID, m)
		if item(t, first, m).Grams != item(t, refit, m).Grams {
			changed = true
		}
	}
	assert.True(t, changed, "the free dishes must be refitted")
	assert.InDelta(t, tgt.Kcal, refit.Totals.Kcal, tgt.Kcal*KcalTolerance)
}

// Manual grams outside 0.5–2 portions are honoured as given.
func TestManualGramsBypassPortionBounds(t *testing.T) {
	cat := catalogue()
	current := fixedSlots(cat, Build(Input{Target: target(2000, 25, 30), Slots: slots(cat)}))
	current[3].Grams = 15
	plan := Build(Input{Target: target(2000, 25, 30), Slots: current})
	assert.Equal(t, 15, item(t, plan, Snack).Grams)
}

// fixedSlots turns a plan into slots with the dishes fixed and weights free.
func fixedSlots(cat map[string][]Recipe, p Plan) []Slot {
	out := []Slot{}
	for _, it := range p.Items {
		r := it.Recipe
		out = append(out, Slot{MealType: it.MealType, Candidates: cat[it.MealType], Recipe: &r})
	}
	return out
}

// Сценарий «Пересборка с закреплённым блюдом»: обед остаётся тем же, день
// другой.
func TestRegenerateKeepsLockedDish(t *testing.T) {
	cat := catalogue()
	tgt := target(2000, 25, 30)
	first := Build(Input{Target: tgt, Slots: slots(cat), Seed: 1})
	lunch := item(t, first, Lunch).Recipe

	s := slots(cat)
	s[1].Recipe = &lunch
	avoid := map[string]string{}
	for _, it := range first.Items {
		avoid[it.MealType] = it.Recipe.ID
	}
	second := Build(Input{Target: tgt, Slots: s, Seed: 2, Avoid: avoid})

	assert.Equal(t, lunch.ID, item(t, second, Lunch).Recipe.ID)
	differs := false
	for _, it := range second.Items {
		if avoid[it.MealType] != it.Recipe.ID {
			differs = true
		}
	}
	assert.True(t, differs, "regenerating must give another day")
}

// When there is no other day to give, regenerating gives the same one.
func TestRegenerateWithSingleOption(t *testing.T) {
	one := map[string][]Recipe{}
	for _, m := range MealTypes {
		one[m] = []Recipe{recipe(m+"-only", 25, 30, 150, 300)}
	}
	first := Build(Input{Target: target(2000, 25, 30), Slots: slots(one)})
	avoid := map[string]string{}
	for _, it := range first.Items {
		avoid[it.MealType] = it.Recipe.ID
	}
	second := Build(Input{Target: target(2000, 25, 30), Slots: slots(one), Avoid: avoid})
	assert.Equal(t, len(first.Items), len(second.Items))
}

// Сценарий «Альтернативы»: от 3 до 5, без текущего, с весом и КБЖУ, лучшие
// первыми.
func TestAlternatives(t *testing.T) {
	cat := catalogue()
	tgt := target(2000, 25, 30)
	plan := Build(Input{Target: tgt, Slots: slots(cat)})
	current := fixedSlots(cat, plan)
	dinner := item(t, plan, Dinner).Recipe.ID

	alts := Alternatives(Input{Target: tgt, Slots: current}, Dinner, AlternativesLimit)
	require.Len(t, alts, AlternativesLimit)
	for i, a := range alts {
		assert.NotEqual(t, dinner, a.Recipe.ID)
		assert.Positive(t, a.Grams)
		assert.Zero(t, a.Grams%GramStep)
		assert.Positive(t, a.Nutrition.Kcal)
		assert.Greater(t, a.DayTotals.Kcal, a.Nutrition.Kcal)
		if i > 0 {
			assert.LessOrEqual(t, alts[i-1].Score, a.Score)
		}
	}

	// Fewer candidates than the limit: all of them.
	few := fixedSlots(cat, plan)
	few[2].Candidates = cat[Dinner][:3]
	few[2].Recipe = &cat[Dinner][0]
	assert.Len(t, Alternatives(Input{Target: tgt, Slots: few}, Dinner, AlternativesLimit), 2)

	assert.Empty(t, Alternatives(Input{Target: tgt, Slots: current}, "brunch", AlternativesLimit))
}

// Сценарий «Замена блюда»: выбранная альтернатива встаёт на место, веса
// остальных подогнаны — и совпадают с тем, что альтернатива обещала.
func TestReplacementMatchesAlternative(t *testing.T) {
	cat := catalogue()
	tgt := target(2000, 25, 30)
	current := fixedSlots(cat, Build(Input{Target: tgt, Slots: slots(cat)}))
	alt := Alternatives(Input{Target: tgt, Slots: current}, Dinner, AlternativesLimit)[0]

	current[2].Recipe = &alt.Recipe
	plan := Build(Input{Target: tgt, Slots: current})
	assert.Equal(t, alt.Recipe.ID, item(t, plan, Dinner).Recipe.ID)
	assert.Equal(t, alt.Grams, item(t, plan, Dinner).Grams)
	assert.InDelta(t, alt.DayTotals.Kcal, plan.Totals.Kcal, 1e-9)
}

func TestDeviations(t *testing.T) {
	tgt := Nutrition{Kcal: 2000, Protein: 120, Fat: 70, Carbs: 220}
	assert.Empty(t, Deviations(tgt, Nutrition{Kcal: 2099, Protein: 108, Fat: 80, Carbs: 188}))
	// Protein over target is never a deviation.
	assert.Empty(t, Deviations(tgt, Nutrition{Kcal: 2000, Protein: 300, Fat: 70, Carbs: 220}))

	got := Deviations(tgt, Nutrition{Kcal: 2200, Protein: 102, Fat: 50, Carbs: 260})
	assert.Equal(t, []Deviation{
		{"kcal", 200}, {"protein", -18}, {"fat", -20}, {"carbs", 40},
	}, got)
}

// The same recipe twice in a day loses to two different ones.
func TestNoDuplicateWhenAvoidable(t *testing.T) {
	shared := recipe("shared", 25, 30, 150, 300)
	other := recipe("other", 25, 30, 150, 300)
	s := []Slot{
		{MealType: Breakfast, Candidates: []Recipe{shared}},
		{MealType: Lunch, Candidates: []Recipe{other, shared}},
	}
	plan := Build(Input{Target: target(1200, 25, 30), Slots: s})
	assert.Equal(t, "shared", item(t, plan, Breakfast).Recipe.ID)
	assert.Equal(t, "other", item(t, plan, Lunch).Recipe.ID)
}

func TestNothingToPlan(t *testing.T) {
	plan := Build(Input{Target: target(2000, 25, 30), Slots: slots(map[string][]Recipe{})})
	assert.Empty(t, plan.Items)
	assert.Equal(t, MealTypes, plan.Empty)
	assert.NotEmpty(t, plan.Deviations)
}

// bigCatalogue spreads n recipes over the meals with varied splits.
func bigCatalogue(n int) map[string][]Recipe {
	out := map[string][]Recipe{}
	for i := 0; i < n; i++ {
		m := MealTypes[i%4]
		p := profiles[(i/4)%len(profiles)]
		density := 110 + float64((i*37)%180)
		portion := 150 + float64((i*53)%250)
		r := recipe(fmt.Sprintf("r%04d", i), p[0]+float64(i%3), p[1]-float64(i%4), density, portion)
		out[m] = append(out[m], r)
		// Every fifth recipe also suits the snack.
		if i%5 == 0 && m != Snack {
			out[Snack] = append(out[Snack], r)
		}
	}
	return out
}

// A large catalogue goes through the seeded sample and still hits.
func TestLargeCatalogueHitsTargets(t *testing.T) {
	cat := bigCatalogue(500)
	for i, tgt := range targets20() {
		plan := Build(Input{Target: tgt, Slots: slots(cat), Seed: int64(i)})
		require.Len(t, plan.Items, 4)
		assertWithinTolerance(t, tgt, plan.Totals, fmt.Sprintf("target %d", i))
	}
}

// Задача 2.4: сборка дня на каталоге из 500 рецептов — меньше 50 мс.
func BenchmarkBuild500(b *testing.B) {
	cat := bigCatalogue(500)
	in := Input{Target: target(2100, 25, 30), Slots: slots(cat), Seed: 7}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		in.Seed = int64(i)
		Build(in)
	}
}

func BenchmarkAlternatives500(b *testing.B) {
	cat := bigCatalogue(500)
	tgt := target(2100, 25, 30)
	current := fixedSlots(cat, Build(Input{Target: tgt, Slots: slots(cat)}))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Alternatives(Input{Target: tgt, Slots: current}, Dinner, AlternativesLimit)
	}
}

var _ = math.Abs
