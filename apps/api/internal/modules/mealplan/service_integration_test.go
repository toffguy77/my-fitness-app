//go:build integration

package mealplan

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/account"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/mealplan/generator"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/modules/recipes"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Всё, что касается SQL, — на настоящей базе: правило доступности, гонка
// первых открытий и каскад удаления на sqlmock не проверить.

const today = "2026-10-10"

type fixture struct {
	ctx     context.Context
	db      *database.DB
	svc     *Service
	recipes *recipes.Service
	team    int64
	curator int64
	client  int64
	foods   map[string]string
	ids     map[string]string // recipe name → id
}

func setup(t *testing.T, prefix string) *fixture {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	log := logger.New()
	f := &fixture{
		ctx: context.Background(), db: db,
		svc:     NewService(db, log, nutritioncalc.NewService(db, log), nil),
		recipes: recipes.NewService(db, log, foodtracker.NewService(db, log), nil, nil),
		foods:   map[string]string{}, ids: map[string]string{},
	}
	moscow, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	f.svc.now = func() time.Time { return time.Date(2026, 10, 10, 12, 0, 0, 0, moscow) }

	f.team = f.user(t, "team@example.test", "super_admin")
	f.curator = f.user(t, "curator@example.test", "coordinator")
	f.client = f.user(t, "client@example.test", "client")
	f.profile(t, f.client)
	f.weight(t, f.client, "2026-10-01", 80)

	for name, n := range map[string][4]float64{
		"chicken":   {165, 31, 3.6, 0},
		"rice":      {130, 2.7, 0.3, 28},
		"oats":      {370, 13, 7, 62},
		"cottage":   {120, 17, 5, 3},
		"salmon":    {200, 22, 12, 0},
		"apple":     {52, 0.3, 0.2, 14},
		"egg":       {155, 13, 11, 1.1},
		"oil":       {884, 0, 100, 0},
		"buckwheat": {110, 4, 1, 21},
	} {
		f.foods[name] = f.food(t, name, n)
	}

	type ing struct {
		food  string
		grams float64
	}
	for _, r := range []struct {
		name      string
		meals     []string
		allergens []string
		ings      []ing
	}{
		{"Овсянка с творогом", []string{"breakfast"}, nil, []ing{{"oats", 60}, {"cottage", 150}}},
		{"Омлет", []string{"breakfast"}, []string{"eggs"}, []ing{{"egg", 150}, {"oil", 5}}},
		{"Сырники", []string{"breakfast", "snack"}, []string{"lactose"}, []ing{{"cottage", 200}, {"oats", 30}}},
		{"Курица с рисом", []string{"lunch", "dinner"}, nil, []ing{{"chicken", 150}, {"rice", 200}}},
		{"Гречка с курицей", []string{"lunch", "dinner"}, nil, []ing{{"chicken", 150}, {"buckwheat", 200}}},
		{"Лосось с рисом", []string{"lunch", "dinner"}, []string{"fish"}, []ing{{"salmon", 150}, {"rice", 150}}},
		{"Лосось с гречкой", []string{"dinner"}, []string{"fish"}, []ing{{"salmon", 150}, {"buckwheat", 150}}},
		{"Курица с гречкой и маслом", []string{"dinner"}, nil, []ing{{"chicken", 120}, {"buckwheat", 150}, {"oil", 10}}},
		{"Курица с овсянкой", []string{"lunch"}, nil, []ing{{"chicken", 180}, {"oats", 50}}},
		{"Яблоко с творогом", []string{"snack"}, nil, []ing{{"apple", 150}, {"cottage", 100}}},
		{"Творог", []string{"snack"}, nil, []ing{{"cottage", 200}}},
		{"Рыбный перекус", []string{"snack"}, []string{"fish"}, []ing{{"salmon", 80}}},
	} {
		in := recipes.VersionInput{
			Name: r.name, Description: "Описание", CookMinutes: 20, Complexity: "easy", Servings: 1,
			MealTypes: r.meals, Allergens: r.allergens,
			Steps: []recipes.StepInput{{Text: "Приготовить"}},
		}
		for _, i := range r.ings {
			id, grams := f.foods[i.food], i.grams
			in.Ingredients = append(in.Ingredients,
				recipes.IngredientInput{FoodID: recipes.FlexID{Value: &id}, Grams: &grams})
		}
		f.ids[r.name] = f.publish(t, in)
	}
	return f
}

func (f *fixture) user(t *testing.T, email, role string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $1, $2) RETURNING id`,
		email, role).Scan(&id))
	return id
}

func (f *fixture) profile(t *testing.T, userID int64) {
	t.Helper()
	_, err := f.db.ExecContext(f.ctx, `
		INSERT INTO user_settings (user_id, birth_date, biological_sex, height, activity_level, fitness_goal)
		VALUES ($1, '1990-01-01', 'male', 180, 'moderate', 'maintain')`, userID)
	require.NoError(t, err)
}

func (f *fixture) weight(t *testing.T, userID int64, date string, kg float64) {
	t.Helper()
	_, err := f.db.ExecContext(f.ctx,
		`INSERT INTO daily_metrics (user_id, date, weight) VALUES ($1, $2, $3)`, userID, date, kg)
	require.NoError(t, err)
}

func (f *fixture) food(t *testing.T, name string, n [4]float64) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'test', $2, $3, $4, $5) RETURNING id::text`, name, n[0], n[1], n[2], n[3]).Scan(&id))
	return id
}

func (f *fixture) publish(t *testing.T, in recipes.VersionInput) string {
	t.Helper()
	sum, _, err := f.recipes.Create(f.ctx, f.team, in)
	require.NoError(t, err)
	_, err = f.recipes.Submit(f.ctx, sum.ID)
	require.NoError(t, err)
	_, err = f.recipes.Approve(f.ctx, f.curator, sum.ID, nil)
	require.NoError(t, err)
	return sum.ID
}

func (f *fixture) weeklyPlan(t *testing.T, userID int64, kcal int) {
	t.Helper()
	_, err := f.db.ExecContext(f.ctx, `
		INSERT INTO weekly_plans (user_id, curator_id, created_by, calories_goal, protein_goal, fat_goal, carbs_goal,
		                          start_date, end_date, is_active)
		VALUES ($1, $2, $2, $3, 120, 60, 180, '2026-10-05', '2026-10-18', true)`, userID, f.curator, kcal)
	require.NoError(t, err)
}

func (f *fixture) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, f.db.QueryRowContext(f.ctx, query, args...).Scan(&n))
	return n
}

func item(t *testing.T, p *MealPlan, meal string) PlanItem {
	t.Helper()
	for _, it := range p.Items {
		if it.MealType == meal {
			return it
		}
	}
	t.Fatalf("no %s in plan %+v", meal, p.Items)
	return PlanItem{}
}

func dishes(p *MealPlan) map[string]string {
	out := map[string]string{}
	for _, it := range p.Items {
		out[it.MealType] = it.RecipeID
	}
	return out
}

// Задача 1.2: up повторяем, down снимает всё, up после down снова работает.
func TestMigration093UpIsRepeatableAndDownReverts(t *testing.T) {
	f := setup(t, "mealplan_migration")
	up, err := migrations.FS.ReadFile("093_meal_plans_up.sql")
	require.NoError(t, err)
	down, err := migrations.FS.ReadFile("093_meal_plans_down.sql")
	require.NoError(t, err)

	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err, "second up must be a no-op")
	_, err = f.db.ExecContext(f.ctx, string(down))
	require.NoError(t, err)
	for _, table := range []string{"meal_plans", "meal_plan_items", "meal_plan_settings"} {
		assert.Zero(t, f.count(t,
			`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
			table), table)
	}
	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err)
}

// Сценарии «Повторное открытие» и «Границы порций»: первое открытие собирает
// и сохраняет, второе показывает те же блюда и веса.
func TestFirstOpenBuildsAndReopenReadsTheSame(t *testing.T) {
	f := setup(t, "mealplan_reopen")
	first, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	require.Len(t, first.Items, 4)
	assert.Empty(t, first.Empty)
	assert.Equal(t, generator.MealTypes, first.MealTypes)
	assert.False(t, first.TargetChanged)
	assert.Positive(t, first.Target.Kcal)
	for _, it := range first.Items {
		assert.Zero(t, it.Grams%10, it.MealType)
		assert.GreaterOrEqual(t, float64(it.Grams), 0.5*it.PortionGrams, it.MealType)
		assert.LessOrEqual(t, float64(it.Grams), 2*it.PortionGrams, it.MealType)
		assert.False(t, it.Unavailable)
		assert.NotEmpty(t, it.Name)
		assert.NotEmpty(t, it.RecipeVersionID)
	}
	sp := first.CalorieSplit
	assert.Equal(t, 100, sp.Protein+sp.Fat+sp.Carbs)

	second, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, first, second)
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, f.client))
}

// Гонка двух первых открытий: план один, и все видят его целиком.
func TestConcurrentFirstOpens(t *testing.T) {
	f := setup(t, "mealplan_race")
	const n = 8
	plans := make([]*MealPlan, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			plans[i], errs[i] = f.svc.Get(f.ctx, f.client, "2026-10-12")
		}(i)
	}
	close(start)
	wg.Wait()
	for i := 0; i < n; i++ {
		require.NoError(t, errs[i])
		assert.Equal(t, plans[0], plans[i])
		assert.Len(t, plans[i].Items, 4)
	}
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, f.client))
	assert.Equal(t, 4, f.count(t, `SELECT COUNT(*) FROM meal_plan_items`))
}

// Сценарий «Нет веса»: 409 с недостающим весом, плана нет.
func TestNoWeightNoPlan(t *testing.T) {
	f := setup(t, "mealplan_noweight")
	noWeight := f.user(t, "noweight@example.test", "client")
	f.profile(t, noWeight)

	_, err := f.svc.Get(f.ctx, noWeight, today)
	var missing *TargetMissingError
	require.ErrorAs(t, err, &missing)
	assert.Equal(t, []string{"weight"}, missing.Missing)
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, noWeight))

	nothing := f.user(t, "nothing@example.test", "client")
	_, err = f.svc.Get(f.ctx, nothing, today)
	require.ErrorAs(t, err, &missing)
	assert.Equal(t, []string{"profile", "weight"}, missing.Missing)
}

// Сценарий «Недельный план куратора»: цель плана — 1800 ккал.
func TestCuratorWeeklyPlanIsTheTarget(t *testing.T) {
	f := setup(t, "mealplan_weekly")
	f.weeklyPlan(t, f.client, 1800)
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, 1800.0, plan.Target.Kcal)
	assert.Equal(t, 120.0, plan.Target.Protein)
}

// Открытие плана ничего не пишет в daily_calculated_targets: прошлая дата
// берёт ту цель, что дневник показывает за неё, а будущая не оставляет строки,
// которую дневник потом отдал бы как есть.
func TestOpeningPlanLeavesStoredTargetsAlone(t *testing.T) {
	f := setup(t, "mealplan_targets_readonly")
	const past = "2026-10-05"
	_, err := f.db.ExecContext(f.ctx, `
		INSERT INTO daily_calculated_targets
			(user_id, date, calories, protein, fat, carbs, bmr, tdee, workout_bonus, weight_used, source)
		VALUES ($1, $2, 1700, 110, 55, 190, 1500, 2000, 0, 70, 'calculated')`, f.client, past)
	require.NoError(t, err)

	plan, err := f.svc.Get(f.ctx, f.client, past)
	require.NoError(t, err)
	assert.Equal(t, 1700.0, plan.Target.Kcal, "a past day keeps the target the diary shows for it")
	assert.Equal(t, 1, f.count(t,
		`SELECT COUNT(*) FROM daily_calculated_targets WHERE user_id = $1 AND date = $2 AND calories = 1700`,
		f.client, past))

	const future = "2026-10-20"
	_, err = f.svc.Get(f.ctx, f.client, future)
	require.NoError(t, err)
	assert.Zero(t, f.count(t,
		`SELECT COUNT(*) FROM daily_calculated_targets WHERE user_id = $1 AND date = $2`, f.client, future))
}

// Сценарий «Куратор поменял цель»: план тот же, target_changed = true;
// пересборка собирает под новую цель и снимает пометку.
func TestCuratorChangedTarget(t *testing.T) {
	f := setup(t, "mealplan_changed")
	before, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	f.weeklyPlan(t, f.client, 1500)
	after, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.True(t, after.TargetChanged)
	assert.Equal(t, before.Target, after.Target)
	assert.Equal(t, before.Items, after.Items)

	regenerated, err := f.svc.Regenerate(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.False(t, regenerated.TargetChanged)
	assert.Equal(t, 1500.0, regenerated.Target.Kcal)
}

// Сценарий «Рецепт снят с публикации»: блюдо помечено недоступным, план не
// меняется сам; пересборка вытесняет его, даже закреплённое.
func TestUnpublishedDish(t *testing.T) {
	f := setup(t, "mealplan_unpublished")
	const tomorrow = "2026-10-11"
	plan, err := f.svc.Get(f.ctx, f.client, tomorrow)
	require.NoError(t, err)
	lunch := item(t, plan, "lunch")

	locked := true
	_, err = f.svc.UpdateItem(f.ctx, f.client, tomorrow, "lunch", ItemUpdate{Locked: &locked})
	require.NoError(t, err)

	_, err = f.recipes.SetStatus(f.ctx, lunch.RecipeID, recipes.StatusUnpublished)
	require.NoError(t, err)

	plan, err = f.svc.Get(f.ctx, f.client, tomorrow)
	require.NoError(t, err)
	got := item(t, plan, "lunch")
	assert.Equal(t, lunch.RecipeID, got.RecipeID)
	assert.True(t, got.Unavailable)
	for _, it := range plan.Items {
		if it.MealType != "lunch" && it.RecipeID != lunch.RecipeID {
			assert.False(t, it.Unavailable, it.MealType)
		}
	}

	plan, err = f.svc.Regenerate(f.ctx, f.client, tomorrow)
	require.NoError(t, err)
	for _, it := range plan.Items {
		assert.NotEqual(t, lunch.RecipeID, it.RecipeID, it.MealType)
		assert.False(t, it.Unavailable)
	}
}

// A newly approved version does not touch a stored plan: the dish shows the
// version it was planned with, and stays available.
func TestNewVersionDoesNotChangeStoredPlan(t *testing.T) {
	f := setup(t, "mealplan_version")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	b := item(t, plan, "breakfast")

	in := recipes.VersionInput{Name: b.Name + " новый", Description: "Описание", Servings: 1,
		MealTypes: []string{"breakfast"}, Steps: []recipes.StepInput{{Text: "Иначе"}}}
	id, grams := f.foods["oats"], 100.0
	in.Ingredients = []recipes.IngredientInput{{FoodID: recipes.FlexID{Value: &id}, Grams: &grams}}
	_, err = f.recipes.SaveDraft(f.ctx, f.team, b.RecipeID, in)
	require.NoError(t, err)
	_, err = f.recipes.Submit(f.ctx, b.RecipeID)
	require.NoError(t, err)
	_, err = f.recipes.Approve(f.ctx, f.curator, b.RecipeID, nil)
	require.NoError(t, err)

	again, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	got := item(t, again, "breakfast")
	assert.Equal(t, b.RecipeVersionID, got.RecipeVersionID)
	assert.Equal(t, b.Name, got.Name)
	assert.False(t, got.Unavailable)
}

// Сценарий «Доступность»: у клиента с аллергеном fish ни одного рыбного
// блюда — ни в плане, ни в альтернативах.
func TestAllergenNeverPlanned(t *testing.T) {
	f := setup(t, "mealplan_allergen")
	_, err := f.recipes.SetRestrictions(f.ctx, f.client, recipes.RestrictionsInput{Allergens: []string{"fish"}}, false)
	require.NoError(t, err)
	fish := []string{f.ids["Лосось с рисом"], f.ids["Лосось с гречкой"], f.ids["Рыбный перекус"]}

	for _, date := range []string{"2026-10-08", today, "2026-10-12", "2026-10-15"} {
		plan, err := f.svc.Get(f.ctx, f.client, date)
		require.NoError(t, err)
		for _, it := range plan.Items {
			assert.NotContains(t, fish, it.RecipeID, "%s %s", date, it.MealType)
		}
		for _, meal := range []string{"lunch", "dinner", "snack"} {
			alts, err := f.svc.Alternatives(f.ctx, f.client, date, meal)
			require.NoError(t, err)
			for _, a := range alts {
				assert.NotContains(t, fish, a.RecipeID, "%s %s alternative", date, meal)
			}
		}
	}
}

// Сценарий «Пересборка с закреплённым блюдом».
func TestRegenerateKeepsLockedLunch(t *testing.T) {
	f := setup(t, "mealplan_regen")
	before, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	lunch := item(t, before, "lunch")

	locked := true
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "lunch", ItemUpdate{Locked: &locked})
	require.NoError(t, err)

	f.svc.newSeed = func() int64 { return 12345 }
	after, err := f.svc.Regenerate(f.ctx, f.client, today)
	require.NoError(t, err)
	got := item(t, after, "lunch")
	assert.Equal(t, lunch.RecipeID, got.RecipeID)
	assert.True(t, got.Locked)
	assert.NotEqual(t, dishes(before), dishes(after), "regenerating must give another day")
	assert.Equal(t, 12345, f.count(t, `SELECT seed FROM meal_plans WHERE user_id = $1`, f.client))
}

// Сценарии «Альтернативы» и «Замена блюда».
func TestAlternativesAndReplacement(t *testing.T) {
	f := setup(t, "mealplan_alternatives")
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	dinner := item(t, plan, "dinner")

	alts, err := f.svc.Alternatives(f.ctx, f.client, today, "dinner")
	require.NoError(t, err)
	// Five recipes suit dinner; without the current one — four.
	require.Len(t, alts, 4)
	for _, a := range alts {
		assert.NotEqual(t, dinner.RecipeID, a.RecipeID)
		assert.NotEmpty(t, a.Name)
		assert.Positive(t, a.Grams)
		assert.Positive(t, a.Nutrition.Kcal)
		assert.Greater(t, a.DayTotals.Kcal, a.Nutrition.Kcal)
	}

	chosen := alts[0]
	replaced, err := f.svc.UpdateItem(f.ctx, f.client, today, "dinner", ItemUpdate{RecipeID: &chosen.RecipeID})
	require.NoError(t, err)
	got := item(t, replaced, "dinner")
	assert.Equal(t, chosen.RecipeID, got.RecipeID)
	assert.Equal(t, chosen.Grams, got.Grams)
	assert.Equal(t, chosen.DayTotals, replaced.Totals)
}

// Сценарии «Ручной вес» и «Ручной вес вне диапазона».
func TestManualGrams(t *testing.T) {
	f := setup(t, "mealplan_manual")
	before, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	grams := 200.0
	after, err := f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{Grams: &grams})
	require.NoError(t, err)
	b := item(t, after, "breakfast")
	assert.Equal(t, 200, b.Grams)
	assert.True(t, b.ManualGrams)
	assert.Equal(t, dishes(before), dishes(after), "only weights change")

	// A regeneration keeps the manual dish and its weight.
	regenerated, err := f.svc.Regenerate(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, 200, item(t, regenerated, "breakfast").Grams)

	reset, err := f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{ResetGrams: true})
	require.NoError(t, err)
	assert.False(t, item(t, reset, "breakfast").ManualGrams)

	for _, g := range []float64{0, -10, 2001} {
		_, err := f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{Grams: &g})
		assert.ErrorIs(t, err, apperrors.ErrValidation, "%v g", g)
	}
}

func TestReplacementValidation(t *testing.T) {
	f := setup(t, "mealplan_replace_invalid")
	_, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	// Does not suit breakfast.
	id := f.ids["Курица с рисом"]
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{RecipeID: &id})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	// Unavailable: rejected by the client.
	id = f.ids["Сырники"]
	require.NoError(t, f.recipes.Reject(f.ctx, f.client, id))
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{RecipeID: &id})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	bogus := "00000000-0000-0000-0000-000000000000"
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "breakfast", ItemUpdate{RecipeID: &bogus})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "brunch", ItemUpdate{})
	assert.ErrorIs(t, err, apperrors.ErrValidation)
	_, err = f.svc.Alternatives(f.ctx, f.client, today, "brunch")
	assert.ErrorIs(t, err, apperrors.ErrValidation)
}

// Сценарии «Ничего не выбрано» и «Без перекуса»; смена настроек не трогает
// собранный план.
func TestSettings(t *testing.T) {
	f := setup(t, "mealplan_settings")
	s, err := f.svc.GetSettings(f.ctx, f.client)
	require.NoError(t, err)
	assert.Equal(t, generator.MealTypes, s.MealTypes)

	built, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)

	_, err = f.svc.SetSettings(f.ctx, f.client, Settings{MealTypes: []string{}})
	assert.ErrorIs(t, err, apperrors.ErrValidation)
	_, err = f.svc.SetSettings(f.ctx, f.client, Settings{MealTypes: []string{"lunch", "brunch"}})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	s, err = f.svc.SetSettings(f.ctx, f.client, Settings{MealTypes: []string{"dinner", "breakfast", "lunch", "lunch"}})
	require.NoError(t, err)
	assert.Equal(t, []string{"breakfast", "lunch", "dinner"}, s.MealTypes)

	same, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, built, same)

	next, err := f.svc.Get(f.ctx, f.client, "2026-10-12")
	require.NoError(t, err)
	assert.Equal(t, []string{"breakfast", "lunch", "dinner"}, next.MealTypes)
	assert.Len(t, next.Items, 3)

	// A meal outside the plan cannot be edited.
	_, err = f.svc.UpdateItem(f.ctx, f.client, "2026-10-12", "snack", ItemUpdate{})
	assert.ErrorIs(t, err, apperrors.ErrValidation)

	// Regenerating today applies the new settings.
	regenerated, err := f.svc.Regenerate(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, []string{"breakfast", "lunch", "dinner"}, regenerated.MealTypes)
}

// Сценарий «Дата за пределами окна» и формат даты.
func TestDateWindow(t *testing.T) {
	f := setup(t, "mealplan_dates")
	// The target of a past date needs a weight on or before it.
	f.weight(t, f.client, "2026-09-01", 81)
	for _, d := range []string{"2026-11-19", "2026-09-09", "2026-10-1", "10.10.2026", "завтра", "2026-02-30"} {
		_, err := f.svc.Get(f.ctx, f.client, d)
		assert.ErrorIs(t, err, apperrors.ErrValidation, d)
	}
	for _, d := range []string{"2026-11-09", "2026-09-10"} {
		_, err := f.svc.Get(f.ctx, f.client, d)
		assert.NoError(t, err, d)
	}
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE date NOT IN ('2026-11-09', '2026-09-10')`))
}

// "Today" is the client's: just after midnight in Vladivostok it is already
// the next day there while Moscow is still on the previous one.
func TestTodayIsTheClientsDay(t *testing.T) {
	f := setup(t, "mealplan_timezone")
	_, err := f.db.ExecContext(f.ctx, `UPDATE user_settings SET timezone = 'Asia/Vladivostok' WHERE user_id = $1`, f.client)
	require.NoError(t, err)
	// 2026-10-10 15:30 UTC is 2026-10-11 01:30 in Vladivostok.
	f.svc.now = func() time.Time { return time.Date(2026, 10, 10, 15, 30, 0, 0, time.UTC) }
	_, err = f.svc.Get(f.ctx, f.client, "2026-11-10")
	assert.NoError(t, err, "30 days after the client's today")
	_, err = f.svc.Get(f.ctx, f.client, "2026-09-10")
	assert.ErrorIs(t, err, apperrors.ErrValidation, "31 days before the client's today")
}

// Сценарий «Разнообразие» на настоящей базе: блюдо вчерашнего плана
// проигрывает равному.
func TestYesterdaysDishIsPenalised(t *testing.T) {
	f := setup(t, "mealplan_recent")
	recent, err := f.svc.recent(f.ctx, f.db, f.client, day{key: today})
	require.NoError(t, err)
	assert.Empty(t, recent)

	yesterday, err := f.svc.Get(f.ctx, f.client, "2026-10-09")
	require.NoError(t, err)
	_, err = f.svc.Get(f.ctx, f.client, "2026-10-01") // eight days before: outside the window
	require.NoError(t, err)

	recent, err = f.svc.recent(f.ctx, f.db, f.client, day{key: today})
	require.NoError(t, err)
	want := map[string]bool{}
	for _, it := range yesterday.Items {
		want[it.RecipeID] = true
	}
	assert.Equal(t, want, recent)
}

// Сценарий «Удаление клиента с планами»: ни планов, ни блюд, ни настроек.
func TestErasureRemovesPlans(t *testing.T) {
	f := setup(t, "mealplan_erasure")
	other := f.user(t, "other@example.test", "client")
	f.profile(t, other)
	f.weight(t, other, "2026-10-01", 70)
	for _, u := range []int64{f.client, other} {
		_, err := f.svc.Get(f.ctx, u, today)
		require.NoError(t, err)
		_, err = f.svc.Get(f.ctx, u, "2026-10-11")
		require.NoError(t, err)
		_, err = f.svc.SetSettings(f.ctx, u, Settings{MealTypes: []string{"lunch", "dinner"}})
		require.NoError(t, err)
	}

	require.NoError(t, account.NewService(f.db, logger.New(), nil).Erase(f.ctx, f.client))

	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, f.client))
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plan_settings WHERE user_id = $1`, f.client))
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plan_items i
		WHERE NOT EXISTS (SELECT 1 FROM meal_plans p WHERE p.id = i.plan_id)`))
	// The neighbour keeps theirs.
	assert.Equal(t, 2, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, other))
	assert.Equal(t, 8, f.count(t, `SELECT COUNT(*) FROM meal_plan_items`))
	assert.Equal(t, 1, f.count(t, `SELECT COUNT(*) FROM meal_plan_settings`))
}

// An empty meal: no recipe the client may see suits the snack.
func TestEmptySnackOnRealCatalogue(t *testing.T) {
	f := setup(t, "mealplan_empty")
	for _, name := range []string{"Сырники", "Яблоко с творогом", "Творог", "Рыбный перекус"} {
		require.NoError(t, f.recipes.Reject(f.ctx, f.client, f.ids[name]))
	}
	plan, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	assert.Equal(t, []EmptySlot{{MealType: "snack", Reason: ReasonNoRecipes}}, plan.Empty)
	assert.Len(t, plan.Items, 3)
	assert.False(t, slices.ContainsFunc(plan.Items, func(it PlanItem) bool { return it.MealType == "snack" }))

	// Nothing to change in an empty meal without naming a recipe.
	locked := true
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "snack", ItemUpdate{Locked: &locked})
	assert.ErrorIs(t, err, apperrors.ErrValidation)
}
