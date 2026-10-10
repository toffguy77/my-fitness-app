//go:build integration

package mealplan

import (
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/recipes"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/migrations"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-diary-logging: блюдо плана — запись дневника. Всё на настоящей базе:
// блокировка строки, SET NULL при удалении записи и соединение с дневником на
// sqlmock не проверить.

type diaryEntry struct {
	date, meal, portionType, foodID, foodName, time string
	grams, kcal, protein, fat, carbs                float64
}

func (f *fixture) entry(t *testing.T, id string) diaryEntry {
	t.Helper()
	var e diaryEntry
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		SELECT date::text, meal_type, portion_type, food_id::text, food_name, time,
		       portion_amount::float8, calories::float8, protein::float8, fat::float8, carbs::float8
		FROM food_entries WHERE id = $1`, id).Scan(
		&e.date, &e.meal, &e.portionType, &e.foodID, &e.foodName, &e.time,
		&e.grams, &e.kcal, &e.protein, &e.fat, &e.carbs))
	return e
}

func (f *fixture) productOf(t *testing.T, versionID string) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(f.ctx, `SELECT recipe_product_id($1)::text`, versionID).Scan(&id))
	return id
}

func (f *fixture) newVersion(t *testing.T, recipeID, name string, meals []string, food string, grams float64) {
	t.Helper()
	in := recipes.VersionInput{Name: name, Description: "Описание", Servings: 1, CookMinutes: 10,
		Complexity: "easy", MealTypes: meals, Steps: []recipes.StepInput{{Text: "Иначе"}}}
	id := f.foods[food]
	in.Ingredients = []recipes.IngredientInput{{FoodID: recipes.FlexID{Value: &id}, Grams: &grams}}
	_, err := f.recipes.SaveDraft(f.ctx, f.team, recipeID, in)
	require.NoError(t, err)
	_, err = f.recipes.Submit(f.ctx, recipeID)
	require.NoError(t, err)
	_, err = f.recipes.Approve(f.ctx, f.curator, recipeID, nil)
	require.NoError(t, err)
}

func grams(g float64) *float64 { return &g }

// Задача 1.2: up повторяем (вместе с заполнением), down снимает связь,
// функцию и продукты без записей, up после down возвращает те же продукты.
func TestMigration094UpIsRepeatableAndDownReverts(t *testing.T) {
	f := setup(t, "diary_migration")
	up, err := migrations.FS.ReadFile("094_plan_diary_logging_up.sql")
	require.NoError(t, err)
	down, err := migrations.FS.ReadFile("094_plan_diary_logging_down.sql")
	require.NoError(t, err)

	products := func() int {
		return f.count(t, `SELECT COUNT(*) FROM food_items WHERE source = 'recipe'`)
	}
	approved := f.count(t, `SELECT COUNT(*) FROM recipe_versions WHERE state IN ('approved', 'superseded')`)
	require.Positive(t, approved)
	require.Equal(t, approved, products(), "every approved version has its product")

	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err, "second up must be a no-op")
	assert.Equal(t, approved, products())

	_, err = f.db.ExecContext(f.ctx, string(down))
	require.NoError(t, err)
	assert.Zero(t, products())
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'meal_plan_items' AND column_name = 'food_entry_id'`))
	_, err = f.db.ExecContext(f.ctx, `INSERT INTO food_items (name, category, calories_per_100, source)
		VALUES ('x', 'test', 1, 'recipe')`)
	assert.Error(t, err, "down restores the narrower source constraint")

	// Заполнение при развёртывании: версии, одобренные до миграции, получают
	// продукт с тем же идентификатором, что дало бы одобрение.
	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err)
	assert.Equal(t, approved, products())
	assert.Equal(t, approved, f.count(t, `SELECT COUNT(*) FROM recipe_versions v
		JOIN food_items fi ON fi.id = recipe_product_id(v.id) WHERE v.state IN ('approved', 'superseded')`))
}

// Down с записью дневника о блюде: запись не трогается, её продукт остаётся,
// а с ним и расширенное ограничение.
func TestMigration094DownKeepsEatenProducts(t *testing.T) {
	f := setup(t, "diary_migration_eaten")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)

	down, err := migrations.FS.ReadFile("094_plan_diary_logging_down.sql")
	require.NoError(t, err)
	_, err = f.db.ExecContext(f.ctx, string(down))
	require.NoError(t, err)
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE id = $1`, res.EntryID))
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_items WHERE source = 'recipe'`))
}

// Сценарий «Одобрение создаёт продукт».
func TestApprovalCreatesProduct(t *testing.T) {
	f := setup(t, "diary_product")
	var versionID string
	var kcal, protein, fat, carbs, portion float64
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		SELECT id::text, kcal_100::float8, protein_100::float8, fat_100::float8, carbs_100::float8,
		       portion_grams::float8
		FROM recipe_versions WHERE recipe_id = $1 AND state = 'approved'`, f.ids["Курица с рисом"]).
		Scan(&versionID, &kcal, &protein, &fat, &carbs, &portion))

	id := f.productOf(t, versionID)
	parsed, err := uuid.Parse(id)
	require.NoError(t, err)
	assert.Equal(t, uuid.Version(3), parsed.Version(), "md5-based, RFC 4122 version bits")
	assert.Equal(t, uuid.RFC4122, parsed.Variant())
	assert.Equal(t, id, f.productOf(t, versionID), "derived, not random")

	var name, category, source, unit string
	var verified, searchable bool
	var gotKcal, gotProtein, gotFat, gotCarbs, serving, defaultWeight float64
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		SELECT name, category, source, serving_unit, verified, search_vector IS NOT NULL,
		       calories_per_100::float8, protein_per_100::float8, fat_per_100::float8, carbs_per_100::float8,
		       serving_size::float8, default_weight::float8
		FROM food_items WHERE id = $1`, id).Scan(&name, &category, &source, &unit, &verified, &searchable,
		&gotKcal, &gotProtein, &gotFat, &gotCarbs, &serving, &defaultWeight))
	assert.Equal(t, "Курица с рисом", name)
	assert.Equal(t, recipes.ProductCategory, category)
	assert.Equal(t, "recipe", source)
	assert.Equal(t, "g", unit)
	assert.True(t, verified)
	assert.True(t, searchable, "the generated search vector covers recipe products")
	assert.Equal(t, []float64{kcal, protein, fat, carbs}, []float64{gotKcal, gotProtein, gotFat, gotCarbs})
	assert.Equal(t, portion, serving)
	assert.Equal(t, portion, defaultWeight)
}

// Сценарий «Запись с весом плана»: запись в приёме блюда на дату плана, весом
// плана, неотличимая от записи того же продукта, сделанной в дневнике.
func TestEatWithPlanWeight(t *testing.T) {
	f := setup(t, "diary_eat")
	moscow, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	f.svc.now = func() time.Time { return time.Date(2026, 10, 10, 15, 30, 0, 0, moscow) }

	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")
	before := item(t, plan, "dinner")

	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)
	assert.True(t, res.Created)
	e := f.entry(t, res.EntryID)
	assert.Equal(t, today, e.date)
	assert.Equal(t, "lunch", e.meal)
	assert.Equal(t, "grams", e.portionType)
	assert.Equal(t, float64(lunch.Grams), e.grams)
	assert.Equal(t, "15:30", e.time, "today: the client's current time")
	assert.Equal(t, f.productOf(t, lunch.RecipeVersionID), e.foodID)

	// Та же запись руками в дневнике — те же название и КБЖУ.
	manual, err := f.diary.CreateEntry(f.ctx, f.client, &foodtracker.CreateEntryRequest{
		FoodID: e.foodID, MealType: "snack", PortionType: "grams", PortionAmount: e.grams,
		Time: "09:00", Date: "2026-10-09"})
	require.NoError(t, err)
	assert.Equal(t, manual.FoodName, e.foodName)
	assert.Equal(t, []float64{manual.Calories, manual.Protein, manual.Fat, manual.Carbs},
		[]float64{e.kcal, e.protein, e.fat, e.carbs})

	got := item(t, res.Plan, "lunch")
	assert.True(t, got.Eaten)
	require.NotNil(t, got.EatenGrams)
	assert.Equal(t, e.grams, *got.EatenGrams)
	require.NotNil(t, got.FoodEntryID)
	assert.Equal(t, res.EntryID, *got.FoodEntryID)
	assert.Equal(t, before.Grams, item(t, res.Plan, "dinner").Grams)
	assert.False(t, item(t, res.Plan, "dinner").Eaten)
	assert.Nil(t, item(t, res.Plan, "dinner").EatenGrams)

	// Прошлый день: 12:00.
	_, err = f.svc.Get(f.ctx, f.client, "2026-10-08")
	require.NoError(t, err)
	past, err := f.svc.Eat(f.ctx, f.client, "2026-10-08", "dinner", EatRequest{})
	require.NoError(t, err)
	assert.Equal(t, DefaultPastTime, f.entry(t, past.EntryID).time)
	assert.Equal(t, "2026-10-08", f.entry(t, past.EntryID).date)
}

// Сценарий «Запись с поправленным весом» и границы веса и времени.
func TestEatWithCorrectedWeight(t *testing.T) {
	f := setup(t, "diary_eat_grams")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	for _, bad := range []EatRequest{{Grams: grams(0)}, {Grams: grams(-5)}, {Grams: grams(2000.5)},
		{Time: strp("25:00")}, {Time: strp("9:00")}} {
		_, err := f.svc.Eat(f.ctx, f.client, today, "lunch", bad)
		assert.ErrorIs(t, err, apperrors.ErrValidation, "%+v", bad)
	}
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE user_id = $1`, f.client))

	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{Grams: grams(280), Time: strp("13:05")})
	require.NoError(t, err)
	e := f.entry(t, res.EntryID)
	assert.Equal(t, 280.0, e.grams)
	assert.Equal(t, "13:05", e.time)
	lunch := item(t, res.Plan, "lunch")
	assert.Equal(t, 280.0, *lunch.EatenGrams)
	assert.NotEqual(t, 280, lunch.Grams, "the plan's own weight is kept")
}

func strp(s string) *string { return &s }

// Сценарий «Двойное нажатие» подряд: вторая запись не создаётся, возвращается
// первая.
func TestEatTwice(t *testing.T) {
	f := setup(t, "diary_twice")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	first, err := f.svc.Eat(f.ctx, f.client, today, "breakfast", EatRequest{})
	require.NoError(t, err)
	second, err := f.svc.Eat(f.ctx, f.client, today, "breakfast", EatRequest{Grams: grams(500)})
	require.NoError(t, err)
	assert.True(t, first.Created)
	assert.False(t, second.Created)
	assert.Equal(t, first.EntryID, second.EntryID)
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE user_id = $1`, f.client))
}

// Сценарий «Двойное нажатие» одновременно: блокировка строки плана — одна
// запись, и все видят её.
func TestConcurrentEats(t *testing.T) {
	f := setup(t, "diary_race")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	const n = 8
	results := make([]*EatResult, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
		}(i)
	}
	close(start)
	wg.Wait()

	created := 0
	for i := 0; i < n; i++ {
		require.NoError(t, errs[i])
		assert.Equal(t, results[0].EntryID, results[i].EntryID)
		if results[i].Created {
			created++
		}
	}
	assert.Equal(t, 1, created)
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE user_id = $1`, f.client))
}

// Сценарий «Пустой приём пищи»: 404; нет плана — тоже 404, и план не
// собирается.
func TestEatEmptyMeal(t *testing.T) {
	f := setup(t, "diary_empty")
	_, err := f.svc.SetSettings(f.ctx, f.client, Settings{MealTypes: []string{"breakfast", "lunch"}})
	require.NoError(t, err)
	_, err = f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	_, err = f.svc.Eat(f.ctx, f.client, today, "dinner", EatRequest{})
	assert.ErrorIs(t, err, apperrors.ErrNotFound)
	_, err = f.svc.Eat(f.ctx, f.client, today, "brunch", EatRequest{})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	_, err = f.svc.Eat(f.ctx, f.client, "2026-10-12", "lunch", EatRequest{})
	assert.ErrorIs(t, err, apperrors.ErrNotFound)
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1 AND date = '2026-10-12'`, f.client))
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE user_id = $1`, f.client))
}

// Сценарий «Плана нет»: чтение для дневника план не создаёт.
func TestFindDoesNotAssemble(t *testing.T) {
	f := setup(t, "diary_find")
	plan, err := f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Nil(t, plan)
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, f.client))

	built, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	found, err := f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, built, found)

	_, err = f.svc.Find(f.ctx, f.client, "2026-13-01")
	assert.ErrorIs(t, err, apperrors.ErrValidation)
}

// Сценарий «Удаление из дневника»: блюдо снова несъеденное, и его можно
// записать заново.
func TestDeletedEntryUneats(t *testing.T) {
	f := setup(t, "diary_delete")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	first, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)

	require.NoError(t, f.diary.DeleteEntry(f.ctx, f.client, first.EntryID))
	plan, err := f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")
	assert.False(t, lunch.Eaten)
	assert.Nil(t, lunch.EatenGrams)
	assert.Nil(t, lunch.FoodEntryID)

	again, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)
	assert.True(t, again.Created)
	assert.NotEqual(t, first.EntryID, again.EntryID)
	assert.True(t, item(t, again.Plan, "lunch").Eaten)
}

// Сценарий «Запись перенесена в другой приём пищи» (и на другую дату): обед
// снова несъеденный, запись остаётся там, куда её перенесли; повторное «Съел»
// создаёт новую запись и перезаписывает связь.
func TestMovedEntryUneats(t *testing.T) {
	f := setup(t, "diary_moved")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	first, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)

	dinner := foodtracker.MealDinner
	_, err = f.diary.UpdateEntry(f.ctx, f.client, first.EntryID, &foodtracker.UpdateEntryRequest{MealType: &dinner})
	require.NoError(t, err)
	plan, err := f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.False(t, item(t, plan, "lunch").Eaten)
	assert.False(t, item(t, plan, "dinner").Eaten, "a moved entry eats no other dish either")
	assert.Equal(t, "dinner", f.entry(t, first.EntryID).meal)

	second, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{})
	require.NoError(t, err)
	assert.True(t, second.Created)
	assert.NotEqual(t, first.EntryID, second.EntryID)
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_entries WHERE id = $1`, first.EntryID))
	assert.Equal(t, second.EntryID, *item(t, second.Plan, "lunch").FoodEntryID)

	// Другая дата — дневник переносит запись так же.
	_, err = f.db.ExecContext(f.ctx, `UPDATE food_entries SET date = '2026-10-09' WHERE id = $1`, second.EntryID)
	require.NoError(t, err)
	plan, err = f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.False(t, item(t, plan, "lunch").Eaten)
}

// Сценарий «Правка веса в дневнике»: план показывает съеденный вес из записи,
// и итоги дня считаются по нему.
func TestEditedWeightReflected(t *testing.T) {
	f := setup(t, "diary_weight")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{Grams: grams(340)})
	require.NoError(t, err)

	_, err = f.diary.UpdateEntry(f.ctx, f.client, res.EntryID, &foodtracker.UpdateEntryRequest{PortionAmount: grams(300)})
	require.NoError(t, err)
	plan, err := f.svc.Find(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")
	require.True(t, lunch.Eaten)
	assert.Equal(t, 300.0, *lunch.EatenGrams)

	var per100 float64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT kcal_100::float8 FROM recipe_versions WHERE id = $1`, lunch.RecipeVersionID).Scan(&per100))
	// Блюдо целиком — по весу записи, а не плана: КБЖУ и проценты от цели.
	assert.InDelta(t, per100*3, lunch.Nutrition.Kcal, 0.06)
	assert.Equal(t, int(math.Round(per100*3/plan.Target.Kcal*100)), lunch.PercentOfTarget.Kcal)
	assert.NotEqual(t, 300, lunch.Grams, "the plan's weight differs, so the check means something")
	sum := 0.0
	for _, it := range plan.Items {
		sum += it.Nutrition.Kcal
	}
	assert.InDelta(t, sum, plan.Totals.Kcal, 0.3, "totals use the eaten weight")
}

// Сценарии «Подгонка после переедания» и «Запись не двигает план».
func TestRefitAfterOvereating(t *testing.T) {
	f := setup(t, "diary_refit")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")
	free := map[string]int{}
	for _, it := range plan.Items {
		if it.MealType != "lunch" {
			free[it.MealType] = it.Grams
		}
	}

	over := float64(lunch.Grams) * 1.6
	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{Grams: &over})
	require.NoError(t, err)
	for _, it := range res.Plan.Items {
		if it.MealType != "lunch" {
			assert.Equal(t, free[it.MealType], it.Grams, "logging must not move %s", it.MealType)
		}
	}
	assert.Greater(t, res.Plan.Totals.Kcal, plan.Totals.Kcal)

	refitted, err := f.svc.Refit(f.ctx, f.client, today)
	require.NoError(t, err)
	got := item(t, refitted, "lunch")
	assert.True(t, got.Eaten)
	assert.Equal(t, over, *got.EatenGrams, "the eaten lunch is not changed")
	assert.Equal(t, lunch.Grams, got.Grams)
	freeKcal := func(p *MealPlan) float64 {
		k := 0.0
		for _, it := range p.Items {
			if !it.Eaten {
				k += it.Nutrition.Kcal
			}
		}
		return k
	}
	assert.Less(t, freeKcal(refitted), freeKcal(res.Plan), "the rest of the day shrinks")
	assert.Less(t, refitted.Totals.Kcal, res.Plan.Totals.Kcal)
	for _, it := range refitted.Items {
		if it.MealType != "lunch" {
			assert.LessOrEqual(t, it.Grams, free[it.MealType], it.MealType)
		}
	}

	_, err = f.svc.Refit(f.ctx, f.client, "2026-10-12")
	assert.ErrorIs(t, err, apperrors.ErrNotFound)
}

// Сценарий «Замена съеденного»: 409. Закрепить можно; правка другого блюда
// сохраняет связь.
func TestEatenDishIsAFact(t *testing.T) {
	f := setup(t, "diary_conflict")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	res, err := f.svc.Eat(f.ctx, f.client, today, "dinner", EatRequest{})
	require.NoError(t, err)

	other := f.ids["Гречка с курицей"]
	if item(t, plan, "dinner").RecipeID == other {
		other = f.ids["Курица с рисом"]
	}
	for _, in := range []ItemUpdate{{RecipeID: &other}, {Grams: grams(200)}, {ResetGrams: true}} {
		_, err := f.svc.UpdateItem(f.ctx, f.client, today, "dinner", in)
		assert.ErrorIs(t, err, apperrors.ErrConflict, "%+v", in)
		var missing *TargetMissingError
		assert.False(t, errors.As(err, &missing))
	}
	locked := true
	after, err := f.svc.UpdateItem(f.ctx, f.client, today, "dinner", ItemUpdate{Locked: &locked})
	require.NoError(t, err)
	assert.True(t, item(t, after, "dinner").Eaten)

	after, err = f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{Locked: &locked})
	require.NoError(t, err)
	dinner := item(t, after, "dinner")
	assert.True(t, dinner.Eaten, "rewriting the day keeps the link")
	assert.Equal(t, res.EntryID, *dinner.FoodEntryID)
}

// Пересборка оставляет съеденное на месте: та же версия, та же запись, вес
// записи — даже если приём убран из настроек.
func TestRegenerateKeepsEaten(t *testing.T) {
	f := setup(t, "diary_regen")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")
	res, err := f.svc.Eat(f.ctx, f.client, today, "lunch", EatRequest{Grams: grams(410)})
	require.NoError(t, err)
	_, err = f.svc.SetSettings(f.ctx, f.client, Settings{MealTypes: []string{"breakfast", "dinner"}})
	require.NoError(t, err)

	for seed := int64(1); seed <= 3; seed++ {
		f.svc.newSeed = func() int64 { return seed }
		after, err := f.svc.Regenerate(f.ctx, f.client, today)
		require.NoError(t, err)
		got := item(t, after, "lunch")
		assert.Equal(t, lunch.RecipeID, got.RecipeID)
		assert.Equal(t, lunch.RecipeVersionID, got.RecipeVersionID)
		assert.True(t, got.Eaten)
		assert.Equal(t, 410.0, *got.EatenGrams)
		assert.Equal(t, res.EntryID, *got.FoodEntryID)
		assert.Contains(t, after.MealTypes, "lunch")
	}
}

// Сценарий «Новая версия не меняет старые записи»: запись хранит КБЖУ версии
// 1, у версии 2 — свой продукт.
func TestNewVersionKeepsOldEntries(t *testing.T) {
	f := setup(t, "diary_versions")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	b := item(t, plan, "breakfast")
	res, err := f.svc.Eat(f.ctx, f.client, today, "breakfast", EatRequest{})
	require.NoError(t, err)
	before := f.entry(t, res.EntryID)

	f.newVersion(t, b.RecipeID, b.Name, []string{"breakfast"}, "oil", 50)
	after := f.entry(t, res.EntryID)
	assert.Equal(t, before, after)

	var v2 string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT id::text FROM recipe_versions WHERE recipe_id = $1 AND state = 'approved'`, b.RecipeID).Scan(&v2))
	require.NotEqual(t, b.RecipeVersionID, v2)
	var kcal float64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT calories_per_100::float8 FROM food_items WHERE id = $1`, f.productOf(t, v2)).Scan(&kcal))
	assert.InDelta(t, 884, kcal, 0.01, "version 2 is its own product")
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM food_items WHERE id = $1`, before.foodID),
		"version 1's product stays for its entries")
}

// ---------------------------------------------------------------------------
// Поиск дневника
// ---------------------------------------------------------------------------

func (f *fixture) search(t *testing.T, q string) []foodtracker.FoodItem {
	t.Helper()
	res, err := f.diary.SearchFoods(f.ctx, f.client, q, 50, 0)
	require.NoError(t, err)
	return res.Foods
}

// recipeHits are the recipe products in the results named exactly name: the
// full-text search matches neighbours too ("Творог" finds "Яблоко с творогом").
func recipeHits(foods []foodtracker.FoodItem, name string) []foodtracker.FoodItem {
	out := []foodtracker.FoodItem{}
	for _, it := range foods {
		if it.Source == foodtracker.SourceRecipe && it.Name == name {
			out = append(out, it)
		}
	}
	return out
}

// Сценарий «Доступный рецепт»: в выдаче с признаком recipe, идентификатором
// рецепта и продуктом текущей версии; запись найденного — обычная запись.
func TestSearchFindsAvailableRecipe(t *testing.T) {
	f := setup(t, "diary_search")
	hits := recipeHits(f.search(t, "Гречка с курицей"), "Гречка с курицей")
	require.Len(t, hits, 1, "exactly once: the generic branch does not repeat it")
	hit := hits[0]
	require.NotNil(t, hit.RecipeID)
	assert.Equal(t, f.ids["Гречка с курицей"], *hit.RecipeID)
	assert.Equal(t, "Гречка с курицей", hit.Name)
	assert.True(t, hit.Verified)
	assert.Positive(t, hit.NutritionPer100.Calories)

	var version string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT id::text FROM recipe_versions WHERE recipe_id = $1 AND state = 'approved'`, *hit.RecipeID).Scan(&version))
	assert.Equal(t, f.productOf(t, version), hit.ID)
	assert.Equal(t, hit.ServingSize, func() float64 {
		var p float64
		require.NoError(t, f.db.QueryRowContext(f.ctx,
			`SELECT portion_grams::float8 FROM recipe_versions WHERE id = $1`, version).Scan(&p))
		return p
	}())

	for _, it := range f.search(t, "курица") {
		if it.Source != foodtracker.SourceRecipe {
			assert.Nil(t, it.RecipeID, it.Name)
		}
	}

	entry, err := f.diary.CreateEntry(f.ctx, f.client, &foodtracker.CreateEntryRequest{
		FoodID: hit.ID, MealType: "dinner", PortionType: "grams", PortionAmount: 250,
		Time: "19:00", Date: today})
	require.NoError(t, err)
	assert.Equal(t, hit.ID, entry.FoodID)
	assert.InDelta(t, hit.NutritionPer100.Calories*2.5, entry.Calories, 0.06)
}

// Сценарий «Скрытый рецепт»: скрытый куратором, отклонённый клиентом и с
// аллергеном клиента — не в выдаче.
func TestSearchHidesUnavailableRecipes(t *testing.T) {
	f := setup(t, "diary_search_hidden")
	require.Len(t, recipeHits(f.search(t, "Гречка с курицей"), "Гречка с курицей"), 1)
	require.NoError(t, f.recipes.Hide(f.ctx, f.curator, f.client, f.ids["Гречка с курицей"]))
	assert.Empty(t, recipeHits(f.search(t, "Гречка с курицей"), "Гречка с курицей"))

	require.Len(t, recipeHits(f.search(t, "Сырники"), "Сырники"), 1)
	_, err := f.recipes.SetRestrictions(f.ctx, f.client, recipes.RestrictionsInput{Allergens: []string{"lactose"}}, false)
	require.NoError(t, err)
	assert.Empty(t, recipeHits(f.search(t, "Сырники"), "Сырники"))

	_, err = f.recipes.SetStatus(f.ctx, f.ids["Омлет"], "unpublished")
	require.NoError(t, err)
	assert.Empty(t, recipeHits(f.search(t, "Омлет"), "Омлет"))

	// Другому клиенту скрытое у первого по-прежнему видно.
	other := f.user(t, "other@example.test", "client")
	res, err := f.diary.SearchFoods(f.ctx, other, "Гречка с курицей", 50, 0)
	require.NoError(t, err)
	assert.Len(t, recipeHits(res.Foods, "Гречка с курицей"), 1)
}

// Сценарий «Устаревшая версия»: продукт версии 1 в выдаче не появляется — ни
// веткой рецептов, ни общей веткой каталога.
func TestSearchShowsOnlyCurrentVersion(t *testing.T) {
	f := setup(t, "diary_search_version")
	recipeID := f.ids["Творог"]
	hits := recipeHits(f.search(t, "Творог"), "Творог")
	require.Len(t, hits, 1)
	v1 := hits[0].ID

	f.newVersion(t, recipeID, "Творог", []string{"snack"}, "cottage", 250)
	for _, it := range f.search(t, "Творог") {
		assert.NotEqual(t, v1, it.ID, "superseded product %s leaked as %s", v1, it.Source)
	}
	hits = recipeHits(f.search(t, "Творог"), "Творог")
	require.Len(t, hits, 1)
	assert.NotEqual(t, v1, hits[0].ID)
	assert.Equal(t, recipeID, *hits[0].RecipeID)
}

// Продукт рецепта — не ингредиент: каталог рецептов и исключения клиента его
// не видят.
func TestRecipeProductIsNotAnIngredient(t *testing.T) {
	f := setup(t, "diary_catalogue")
	hit := recipeHits(f.search(t, "Гречка с курицей"), "Гречка с курицей")
	require.Len(t, hit, 1)

	found, err := f.diary.SearchCatalogue(f.ctx, "Гречка с курицей", 50)
	require.NoError(t, err)
	for _, it := range found {
		assert.NotEqual(t, hit[0].ID, it.FoodID)
	}
	_, err = f.diary.EnsureCatalogueFood(f.ctx, hit[0].ID)
	assert.ErrorIs(t, err, foodtracker.ErrNotCatalogueFood)
}
