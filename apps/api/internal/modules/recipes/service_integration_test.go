//go:build integration

package recipes

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/account"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Всё, что касается SQL, — на настоящей базе: sqlmock принимает запрос с
// несуществующей колонкой и пропустил так три живых дефекта.

type fixture struct {
	db      *database.DB
	svc     *Service
	store   *memoryStore
	team    int64
	curator int64
	clientA int64
	clientB int64
	rice    string // food_items UUID: 100 kcal, 20 g protein per 100 g
	oil     string
	ctx     context.Context
}

func setup(t *testing.T, prefix string) *fixture {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	f := &fixture{db: db, store: newMemoryStore(), ctx: context.Background()}
	f.svc = NewService(db, logger.New(), foodtracker.NewService(db, logger.New()), f.store, nil)

	f.team = f.user(t, "team@example.test", "super_admin")
	f.curator = f.user(t, "curator@example.test", "coordinator")
	f.clientA = f.user(t, "a@example.test", "client")
	f.clientB = f.user(t, "b@example.test", "client")
	f.rice = f.food(t, "Рис отварной", 100, 20)
	f.oil = f.food(t, "Масло оливковое", 900, 0)
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

func (f *fixture) food(t *testing.T, name string, kcal, protein float64) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'test', $2, $3, 0, 0) RETURNING id::text`, name, kcal, protein).Scan(&id))
	return id
}

func s(v string) *string { return &v }

func (f *fixture) input(name string, meals []string, foodID string, grams float64) VersionInput {
	return VersionInput{
		Name: name, Description: "Описание", CookMinutes: 30, Complexity: "easy", Servings: 2,
		MealTypes: meals,
		Ingredients: []IngredientInput{
			{FoodID: FlexID{Value: s(foodID)}, Grams: &grams, DisplayQuantity: s("300 г")},
			{FoodID: FlexID{Value: s(f.oil)}, ToTaste: true},
		},
		Steps: []StepInput{{Text: "Сварить"}},
	}
}

// published creates, submits and approves a recipe; returns its id.
func (f *fixture) published(t *testing.T, name string, meals []string, allergens []string, foodID string) string {
	t.Helper()
	in := f.input(name, meals, foodID, 300)
	in.Allergens = allergens
	sum, _, err := f.svc.Create(f.ctx, f.team, in)
	require.NoError(t, err)
	_, err = f.svc.Submit(f.ctx, sum.ID)
	require.NoError(t, err)
	_, err = f.svc.Approve(f.ctx, f.curator, sum.ID, nil)
	require.NoError(t, err)
	return sum.ID
}

func (f *fixture) catalogue(t *testing.T, userID int64, q ListQuery) []string {
	t.Helper()
	if q.Limit == 0 {
		q.Limit = 100
	}
	items, total, err := f.svc.ListAvailable(f.ctx, userID, q)
	require.NoError(t, err)
	assert.Equal(t, len(items), total)
	names := []string{}
	for _, it := range items {
		names = append(names, it.Name)
	}
	sort.Strings(names)
	return names
}

func (f *fixture) versionCount(t *testing.T, recipeID string) int {
	t.Helper()
	var n int
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT COUNT(*) FROM recipe_versions WHERE recipe_id = $1`, recipeID).Scan(&n))
	return n
}

// Задача 1.2: up повторяем, down снимает всё, up после down снова работает.
func TestMigration092UpIsRepeatableAndDownReverts(t *testing.T) {
	f := setup(t, "recipes_migration")
	up, err := migrations.FS.ReadFile("092_recipe_catalogue_up.sql")
	require.NoError(t, err)
	down, err := migrations.FS.ReadFile("092_recipe_catalogue_down.sql")
	require.NoError(t, err)

	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err, "second up must be a no-op")

	// Откат идёт в обратном порядке: сначала снимаются миграции, ссылающиеся
	// на рецепты (093 — блюда плана питания), иначе DROP TABLE recipes упрётся
	// во внешний ключ — как упёрся бы и настоящий откат.
	for _, later := range []string{"093_meal_plans_down.sql"} {
		laterDown, err := migrations.FS.ReadFile(later)
		require.NoError(t, err)
		_, err = f.db.ExecContext(f.ctx, string(laterDown))
		require.NoError(t, err, later)
	}

	_, err = f.db.ExecContext(f.ctx, string(down))
	require.NoError(t, err)
	var left int
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema()
		AND table_name IN ('recipes','recipe_versions','recipe_steps','recipe_ingredients',
		  'user_food_restrictions','user_excluded_foods','user_rejected_recipes','client_hidden_recipes')`).Scan(&left))
	assert.Zero(t, left)

	_, err = f.db.ExecContext(f.ctx, string(up))
	require.NoError(t, err)
}

// Сценарий «Расчёт с весом готового блюда» на пути сохранения, и «Попытка
// передать КБЖУ вручную»: присланные поля не читаются, хранится вычисленное.
func TestSavedNutritionIsComputedFromCatalogue(t *testing.T) {
	f := setup(t, "recipes_nutrition")

	in := f.input("Рис", []string{"lunch"}, f.rice, 300)
	in.YieldGrams = ptr(250.0)
	_, version, err := f.svc.Create(f.ctx, f.team, in)
	require.NoError(t, err)

	assert.Equal(t, Nutrition{Kcal: 120, Protein: 24}, version.Per100g)
	assert.Equal(t, 125.0, version.PortionGrams)
	assert.False(t, version.Approximate)
	assert.Equal(t, Nutrition{Kcal: 150, Protein: 30}, version.PerPortion)

	// То же через HTTP: тело с полями КБЖУ.
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", f.team) })
	r.PUT("/admin/recipes/:id/draft", NewHandler(&config.Config{Features: allOn}, logger.New(), f.svc).AdminSaveDraft)
	body := `{"name":"Рис","servings":2,"yield_grams":250,"meal_types":["lunch"],
	  "kcal_100":9999,"protein_100":9999,"per_100g":{"kcal":9999,"protein":9999},
	  "per_portion":{"kcal":1},"approximate":false,"total_grams":1,
	  "ingredients":[{"food_id":"` + f.rice + `","grams":300,"kcal":5000}],
	  "steps":[{"text":"Сварить"}]}`
	w, decoded := do(r, http.MethodPut, "/admin/recipes/"+version.RecipeID+"/draft", body)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	data := decoded["data"].(map[string]any)
	assert.Equal(t, map[string]any{"kcal": 120.0, "protein": 24.0, "fat": 0.0, "carbs": 0.0}, data["per_100g"])

	var kcal float64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT kcal_100 FROM recipe_versions WHERE recipe_id = $1`, version.RecipeID).Scan(&kcal))
	assert.Equal(t, 120.0, kcal)
}

// Сценарий «Ингредиент без продукта каталога»: 422, и ничего не создано.
func TestIngredientOutsideCatalogueIsRefused(t *testing.T) {
	f := setup(t, "recipes_bad_food")

	for _, id := range []string{"00000000-0000-0000-0000-000000000001", "987654321"} {
		_, _, err := f.svc.Create(f.ctx, f.team, f.input("Плохой", []string{"lunch"}, id, 100))
		assert.True(t, errors.Is(err, apperrors.ErrValidation), "id %s: %v", id, err)
	}

	// Личный продукт сотрудника — тоже не каталог.
	var personal string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO user_foods (user_id, name, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'Мой суп', 50, 2, 1, 5) RETURNING id::text`, f.team).Scan(&personal))
	_, _, err := f.svc.Create(f.ctx, f.team, f.input("Плохой", []string{"lunch"}, personal, 100))
	assert.True(t, errors.Is(err, apperrors.ErrValidation), "%v", err)

	var n int
	require.NoError(t, f.db.QueryRowContext(f.ctx, `SELECT COUNT(*) FROM recipes`).Scan(&n))
	assert.Zero(t, n)
}

// Числовой идентификатор products нормализуется в UUID food_items — тот же
// путь, что у записей дневника.
func TestProductsIDIsNormalised(t *testing.T) {
	f := setup(t, "recipes_products_id")
	var categoryID int64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO categories (name, slug, type, source_url) VALUES ('Крупы', 'k', 'food', 'https://e.test/k') RETURNING id`).Scan(&categoryID))
	_, err := f.db.ExecContext(f.ctx,
		`INSERT INTO products (id, category_id, name, calories, proteins, fats, carbs) VALUES (555, $1, 'Гречка', 330, 12, 3, 62)`, categoryID)
	require.NoError(t, err)

	_, version, err := f.svc.Create(f.ctx, f.team, f.input("Гречка", []string{"lunch"}, "555", 100))
	require.NoError(t, err)
	require.NotNil(t, version.Ingredients[0].FoodID)
	assert.Len(t, *version.Ingredients[0].FoodID, 36)
	assert.Equal(t, "Гречка", *version.Ingredients[0].FoodName)
	assert.Equal(t, 330.0, version.Per100g.Kcal)
}

// Сценарий «Ингредиент по вкусу»: веса нет, в расчёт не входит.
func TestToTasteIngredientHasNoWeight(t *testing.T) {
	f := setup(t, "recipes_to_taste")
	in := f.input("Рис", []string{"lunch"}, f.rice, 300)
	g := 50.0
	in.Ingredients[1].Grams = &g // «по вкусу» с весом — вес отбрасывается
	_, version, err := f.svc.Create(f.ctx, f.team, in)
	require.NoError(t, err)

	require.Len(t, version.Ingredients, 2)
	assert.True(t, version.Ingredients[1].ToTaste)
	assert.Nil(t, version.Ingredients[1].Grams)
	assert.Equal(t, 300.0, version.TotalGrams)
	assert.Equal(t, 100.0, version.Per100g.Kcal, "900 kcal oil must not count")
	assert.True(t, version.Approximate)
}

// Жизненный цикл целиком: «Один черновик на рецепт», «Отправка неполного»,
// «Одобрение версии не на проверке», «Возврат без комментария», «Куратор
// одобряет как есть», «Правка одобренного рецепта», «Куратор правит и
// одобряет», «Одобрение новой версии», «Попытка изменить одобренную версию».
func TestVersionLifecycle(t *testing.T) {
	f := setup(t, "recipes_lifecycle")

	incomplete := VersionInput{Name: "Суп", Servings: 2}
	sum, v1, err := f.svc.Create(f.ctx, f.team, incomplete)
	require.NoError(t, err)
	id := sum.ID
	assert.Equal(t, StateDraft, v1.State)
	assert.Equal(t, 1, v1.Version)

	// Неполный: 422 с перечнем, версия остаётся черновиком.
	_, err = f.svc.Submit(f.ctx, id)
	var missing *MissingFieldsError
	require.True(t, errors.As(err, &missing), "%v", err)
	assert.Equal(t, []string{"ingredients", "steps", "meal_types"}, missing.Missing)
	detail, err := f.svc.Detail(f.ctx, id)
	require.NoError(t, err)
	assert.Equal(t, StateDraft, detail.Working.State)

	// Одобрить черновик нельзя.
	_, err = f.svc.Approve(f.ctx, f.curator, id, nil)
	assert.True(t, errors.Is(err, apperrors.ErrConflict), "%v", err)

	// Один черновик: повторная правка правит ту же версию.
	_, err = f.svc.SaveDraft(f.ctx, f.team, id, f.input("Суп", []string{"lunch"}, f.rice, 300))
	require.NoError(t, err)
	assert.Equal(t, 1, f.versionCount(t, id))

	_, err = f.svc.Submit(f.ctx, id)
	require.NoError(t, err)

	// Возврат без комментария — 422; с комментарием — черновик с комментарием.
	_, err = f.svc.Return(f.ctx, f.curator, id, "  ")
	assert.True(t, errors.Is(err, apperrors.ErrValidation))
	returned, err := f.svc.Return(f.ctx, f.curator, id, "Добавьте фото")
	require.NoError(t, err)
	assert.Equal(t, StateDraft, returned.State)
	require.NotNil(t, returned.ReviewComment)
	assert.Equal(t, "Добавьте фото", *returned.ReviewComment)

	_, err = f.svc.Submit(f.ctx, id)
	require.NoError(t, err)
	// Правка версии на проверке возвращает её в черновик, вторая не создаётся.
	_, err = f.svc.SaveDraft(f.ctx, f.team, id, f.input("Суп", []string{"lunch"}, f.rice, 300))
	require.NoError(t, err)
	assert.Equal(t, 1, f.versionCount(t, id))
	_, err = f.svc.Submit(f.ctx, id)
	require.NoError(t, err)

	// Одобрение как есть: одобривший и время сохранены.
	approved, err := f.svc.Approve(f.ctx, f.curator, id, nil)
	require.NoError(t, err)
	assert.Equal(t, StateApproved, approved.State)
	assert.NotNil(t, approved.ApprovedAt)
	var approvedBy int64
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`SELECT approved_by FROM recipe_versions WHERE id = $1`, approved.ID).Scan(&approvedBy))
	assert.Equal(t, f.curator, approvedBy)
	assert.Equal(t, []string{"Суп"}, f.catalogue(t, f.clientA, ListQuery{}))

	// Правка одобренного рецепта создаёт версию 2, клиенты видят версию 1.
	v2, err := f.svc.SaveDraft(f.ctx, f.team, id, f.input("Суп новый", []string{"lunch"}, f.rice, 300))
	require.NoError(t, err)
	assert.Equal(t, 2, v2.Version)
	assert.Equal(t, StateDraft, v2.State)
	card, err := f.svc.GetAvailable(f.ctx, f.clientA, id)
	require.NoError(t, err)
	assert.Equal(t, 1, card.Version)
	assert.Equal(t, "Суп", card.Name)

	// Попытка изменить одобренную версию: охрана в самом UPDATE.
	tx, err := f.db.BeginTx(f.ctx, nil)
	require.NoError(t, err)
	prepared, err := f.svc.prepare(f.ctx, f.input("Взлом", []string{"lunch"}, f.rice, 1))
	require.NoError(t, err)
	err = writeVersion(f.ctx, tx, approved.ID, f.team, prepared)
	_ = tx.Rollback()
	assert.True(t, errors.Is(err, apperrors.ErrConflict), "%v", err)

	// Куратор правит граммовку и одобряет: новая граммовка, пересчитанное КБЖУ.
	_, err = f.svc.Submit(f.ctx, id)
	require.NoError(t, err)
	edited := f.input("Суп новый", []string{"lunch"}, f.rice, 500)
	edited.YieldGrams = ptr(400.0)
	v2approved, err := f.svc.Approve(f.ctx, f.curator, id, &edited)
	require.NoError(t, err)
	assert.Equal(t, 500.0, *v2approved.Ingredients[0].Grams)
	assert.Equal(t, 125.0, v2approved.Per100g.Kcal) // 500 kcal / 400 g
	assert.Equal(t, 200.0, v2approved.PortionGrams)

	// Одобрение новой версии: 2 — approved, 1 — superseded, клиенты видят 2.
	states := map[int]string{}
	rows, err := f.db.QueryContext(f.ctx, `SELECT version, state FROM recipe_versions WHERE recipe_id = $1`, id)
	require.NoError(t, err)
	for rows.Next() {
		var n int
		var st string
		require.NoError(t, rows.Scan(&n, &st))
		states[n] = st
	}
	_ = rows.Close()
	assert.Equal(t, map[int]string{1: StateSuperseded, 2: StateApproved}, states)
	card, err = f.svc.GetAvailable(f.ctx, f.clientA, id)
	require.NoError(t, err)
	assert.Equal(t, 2, card.Version)
}

// Сценарии «Рецепт без одобренной версии», «Снятый рецепт», «Фильтр по
// приёму пищи».
func TestClientCatalogueVisibility(t *testing.T) {
	f := setup(t, "recipes_visibility")

	breakfast := f.published(t, "Омлет", []string{"breakfast"}, nil, f.rice)
	f.published(t, "Плов", []string{"lunch", "dinner"}, nil, f.rice)

	draftOnly, _, err := f.svc.Create(f.ctx, f.team, f.input("Черновик", []string{"lunch"}, f.rice, 100))
	require.NoError(t, err)
	inReview, _, err := f.svc.Create(f.ctx, f.team, f.input("На проверке", []string{"lunch"}, f.rice, 100))
	require.NoError(t, err)
	_, err = f.svc.Submit(f.ctx, inReview.ID)
	require.NoError(t, err)

	assert.Equal(t, []string{"Омлет", "Плов"}, f.catalogue(t, f.clientA, ListQuery{}))
	for _, id := range []string{draftOnly.ID, inReview.ID} {
		_, err := f.svc.GetAvailable(f.ctx, f.clientA, id)
		assert.True(t, errors.Is(err, apperrors.ErrNotFound))
	}

	assert.Equal(t, []string{"Омлет"}, f.catalogue(t, f.clientA, ListQuery{MealType: "breakfast"}))
	assert.Equal(t, []string{"Плов"}, f.catalogue(t, f.clientA, ListQuery{MealType: "dinner"}))
	assert.Equal(t, []string{"Плов"}, f.catalogue(t, f.clientA, ListQuery{Q: "пло"}))
	_, _, err = f.svc.ListAvailable(f.ctx, f.clientA, ListQuery{MealType: "brunch", Limit: 10})
	assert.True(t, errors.Is(err, apperrors.ErrValidation))

	// Снятый рецепт: нет в каталоге, карточка — 404; версии сохранены.
	_, err = f.svc.SetStatus(f.ctx, breakfast, StatusUnpublished)
	require.NoError(t, err)
	assert.Equal(t, []string{"Плов"}, f.catalogue(t, f.clientA, ListQuery{}))
	_, err = f.svc.GetAvailable(f.ctx, f.clientA, breakfast)
	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
	assert.Equal(t, 1, f.versionCount(t, breakfast))
	_, err = f.svc.SetStatus(f.ctx, breakfast, StatusPublished)
	require.NoError(t, err)
	assert.Equal(t, []string{"Омлет", "Плов"}, f.catalogue(t, f.clientA, ListQuery{}))

	// Фильтр команды по состоянию и статусу.
	adminNames := func(state string) []string {
		items, _, err := f.svc.ListAdmin(f.ctx, ListQuery{State: state, Limit: 50})
		require.NoError(t, err)
		var names []string
		for _, it := range items {
			names = append(names, it.Name)
		}
		sort.Strings(names)
		return names
	}
	assert.Equal(t, []string{"Черновик"}, adminNames("draft"))
	assert.Equal(t, []string{"На проверке"}, adminNames("review"))
	assert.Len(t, adminNames(""), 4)
	_, err = f.svc.SetStatus(f.ctx, breakfast, StatusUnpublished)
	require.NoError(t, err)
	assert.Equal(t, []string{"Омлет"}, adminNames("unpublished"))
	assert.Len(t, adminNames("published"), 3)
	_, _, err = f.svc.ListAdmin(f.ctx, ListQuery{State: "approved", Limit: 10})
	assert.True(t, errors.Is(err, apperrors.ErrValidation))

	// Очередь куратора и список опубликованных для скрытия.
	queue, _, err := f.svc.ListReview(f.ctx, ListQuery{Limit: 10})
	require.NoError(t, err)
	require.Len(t, queue, 1)
	assert.Equal(t, "На проверке", queue[0].Name)
	assert.Equal(t, StateReview, *queue[0].WorkingState)
	published, _, err := f.svc.ListPublished(f.ctx, ListQuery{Limit: 10})
	require.NoError(t, err)
	require.Len(t, published, 1)
	assert.Equal(t, "Плов", published[0].Name)
}

// Сценарии «Клиент добавляет аллерген», «Неизвестный аллерген»,
// «Продукт-исключение», «Отклонение и возврат», «Скрытие для одного клиента»,
// «Недоступный клиенту рецепт по прямой ссылке».
func TestRestrictions(t *testing.T) {
	f := setup(t, "recipes_restrictions")
	mushrooms := f.food(t, "Грибы", 30, 3)

	f.published(t, "Ореховый", []string{"lunch"}, []string{"nuts"}, f.rice)
	withMushrooms := f.published(t, "Грибной", []string{"lunch"}, nil, mushrooms)
	plain := f.published(t, "Простой", []string{"lunch"}, nil, f.rice)
	all := []string{"Грибной", "Ореховый", "Простой"}
	require.Equal(t, all, f.catalogue(t, f.clientA, ListQuery{}))

	// Аллерген.
	_, err := f.svc.SetRestrictions(f.ctx, f.clientA, RestrictionsInput{Allergens: []string{"nuts"}}, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"Грибной", "Простой"}, f.catalogue(t, f.clientA, ListQuery{}))

	_, err = f.svc.SetRestrictions(f.ctx, f.clientA, RestrictionsInput{Allergens: []string{"chocolate"}}, false)
	assert.True(t, errors.Is(err, apperrors.ErrValidation))

	// Продукт-исключение.
	out, err := f.svc.SetRestrictions(f.ctx, f.clientA, RestrictionsInput{
		Allergens:       []string{"nuts"},
		ExcludedFoodIDs: []FlexID{{Value: s(mushrooms)}},
	}, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"nuts"}, out.Allergens)
	assert.Equal(t, []FoodRef{{FoodID: mushrooms, Name: "Грибы"}}, out.ExcludedFoods)
	assert.Equal(t, []string{"Простой"}, f.catalogue(t, f.clientA, ListQuery{}))
	_, err = f.svc.GetAvailable(f.ctx, f.clientA, withMushrooms)
	assert.True(t, errors.Is(err, apperrors.ErrNotFound))

	// Отклонение и возврат.
	require.NoError(t, f.svc.Reject(f.ctx, f.clientA, plain))
	assert.Equal(t, []string{}, f.catalogue(t, f.clientA, ListQuery{}))
	mine, err := f.svc.Restrictions(f.ctx, f.clientA, false)
	require.NoError(t, err)
	assert.Equal(t, []RecipeRef{{ID: plain, Name: "Простой"}}, mine.RejectedRecipes)
	require.NoError(t, f.svc.Unreject(f.ctx, f.clientA, plain))
	assert.Equal(t, []string{"Простой"}, f.catalogue(t, f.clientA, ListQuery{}))

	// Скрытие куратором: клиент А не видит, клиент Б того же куратора видит.
	require.NoError(t, f.svc.Hide(f.ctx, f.curator, f.clientA, plain))
	assert.Equal(t, []string{}, f.catalogue(t, f.clientA, ListQuery{}))
	_, err = f.svc.GetAvailable(f.ctx, f.clientA, plain)
	assert.True(t, errors.Is(err, apperrors.ErrNotFound), "hidden recipe by direct link must be 404")
	assert.Equal(t, all, f.catalogue(t, f.clientB, ListQuery{}))
	hidden, err := f.svc.ListHidden(f.ctx, f.clientA)
	require.NoError(t, err)
	require.Len(t, hidden, 1)
	assert.Equal(t, plain, hidden[0].ID)
	forCurator, err := f.svc.Restrictions(f.ctx, f.clientA, true)
	require.NoError(t, err)
	assert.Equal(t, []RecipeRef{{ID: plain, Name: "Простой"}}, forCurator.HiddenRecipes)

	require.NoError(t, f.svc.Unhide(f.ctx, f.clientA, plain))
	assert.Equal(t, []string{"Простой"}, f.catalogue(t, f.clientA, ListQuery{}))

	assert.True(t, errors.Is(f.svc.Hide(f.ctx, f.curator, f.clientA, "00000000-0000-0000-0000-000000000009"),
		apperrors.ErrNotFound))

	// Черновик по id нельзя ни отклонить, ни скрыть: ответ не должен выдавать,
	// что такой рецепт существует.
	draft, _, err := f.svc.Create(f.ctx, f.team, f.input("Неизданный", []string{"lunch"}, f.rice, 100))
	require.NoError(t, err)
	assert.True(t, errors.Is(f.svc.Reject(f.ctx, f.clientA, draft.ID), apperrors.ErrNotFound))
	assert.True(t, errors.Is(f.svc.Hide(f.ctx, f.curator, f.clientA, draft.ID), apperrors.ErrNotFound))
}

// Сценарии «Удаление клиента» и «Удаление куратора» через настоящее стирание.
func TestErasure(t *testing.T) {
	f := setup(t, "recipes_erasure")
	mushrooms := f.food(t, "Грибы", 30, 3)
	recipe := f.published(t, "Простой", []string{"lunch"}, nil, f.rice)
	other := f.published(t, "Второй", []string{"lunch"}, nil, f.rice)

	_, err := f.svc.SetRestrictions(f.ctx, f.clientA, RestrictionsInput{
		Allergens: []string{"nuts"}, ExcludedFoodIDs: []FlexID{{Value: s(mushrooms)}},
	}, false)
	require.NoError(t, err)
	require.NoError(t, f.svc.Reject(f.ctx, f.clientA, recipe))
	require.NoError(t, f.svc.Hide(f.ctx, f.curator, f.clientA, other))
	require.NoError(t, f.svc.Hide(f.ctx, f.curator, f.clientB, other))

	erasure := account.NewService(f.db, logger.New(), nil)
	require.NoError(t, erasure.Erase(f.ctx, f.clientA))

	for _, q := range []string{
		`SELECT COUNT(*) FROM user_food_restrictions WHERE user_id = $1`,
		`SELECT COUNT(*) FROM user_excluded_foods WHERE user_id = $1`,
		`SELECT COUNT(*) FROM user_rejected_recipes WHERE user_id = $1`,
		`SELECT COUNT(*) FROM client_hidden_recipes WHERE client_id = $1`,
	} {
		var n int
		require.NoError(t, f.db.QueryRowContext(f.ctx, q, f.clientA).Scan(&n))
		assert.Zero(t, n, q)
	}

	// Удаление куратора, одобрившего рецепт: рецепт и версия на месте, клиенту
	// доступны; скрытие для клиента Б продолжает действовать.
	require.NoError(t, erasure.Erase(f.ctx, f.curator))
	card, err := f.svc.GetAvailable(f.ctx, f.clientB, recipe)
	require.NoError(t, err)
	assert.Equal(t, StateApproved, card.State)
	assert.Equal(t, []string{"Простой"}, f.catalogue(t, f.clientB, ListQuery{}))

	// И удаление сотрудника команды не трогает рецепт.
	require.NoError(t, erasure.Erase(f.ctx, f.team))
	_, err = f.svc.GetAvailable(f.ctx, f.clientB, recipe)
	require.NoError(t, err)
}

// --- VkusVill import ---

func vkusvillFixture(t *testing.T, f *fixture) (*atomic.Int32, *httptest.Server) {
	t.Helper()
	body, err := os.ReadFile("testdata/vkusvill_recipes_syrniki.json")
	require.NoError(t, err)
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)

	f.svc.vv = NewVkusvillClient(srv.URL)
	img := pngBytes(t)
	f.svc.fetchImage = func(_ context.Context, url string) ([]byte, error) {
		if !strings.HasPrefix(url, "https://vkusvill.ru/") {
			return nil, errors.New("unexpected photo address " + url)
		}
		return img, nil
	}

	// Каталог для кандидатов.
	var weighted string
	require.NoError(t, f.db.QueryRowContext(f.ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, default_weight)
		 VALUES ('Яйцо куриное С1', 'eggs', 157, 12.7, 11.5, 0.7, 55) RETURNING id::text`).Scan(&weighted))
	f.food(t, "Творог высокобелковый 2%", 100, 20)
	return &calls, srv
}

// Сценарии «Импорт создаёт черновик», «Повторный импорт», «Граммовка из
// подписи»; способность включена (vv и хранилище заданы).
func TestImportVkusvill(t *testing.T) {
	f := setup(t, "recipes_import")
	calls, _ := vkusvillFixture(t, f)

	results, err := f.svc.SearchVkusvill(f.ctx, "сырники", 1)
	require.NoError(t, err)
	require.Len(t, results.Items, 10)
	assert.True(t, results.HasMore)
	first := results.Items[0]
	assert.Equal(t, "5776208", first.SourceRef)
	assert.Equal(t, 7, first.IngredientsCount)
	assert.Nil(t, first.ImportedRecipeID)

	recipeID, existing, err := f.svc.ImportVkusvill(f.ctx, f.team, "5776208", "")
	require.NoError(t, err, "taken from the search cache, no q needed")
	assert.False(t, existing)
	assert.Equal(t, int32(1), calls.Load(), "the cache answered the import")

	detail, err := f.svc.Detail(f.ctx, recipeID)
	require.NoError(t, err)
	assert.Equal(t, SourceVkusvill, detail.Recipe.Source)
	var ref string
	require.NoError(t, f.db.QueryRowContext(f.ctx, `SELECT source_ref FROM recipes WHERE id = $1`, recipeID).Scan(&ref))
	assert.Equal(t, "5776208", ref)

	v := detail.Working
	require.NotNil(t, v)
	assert.Nil(t, detail.Approved)
	assert.Equal(t, StateDraft, v.State)
	assert.Equal(t, "Пирожки с яйцом и творогом", v.Name)
	assert.Equal(t, 2, v.Servings)
	assert.Equal(t, 40, v.CookMinutes)
	assert.Equal(t, "easy", v.Complexity)
	assert.Equal(t, []string{"breakfast"}, v.MealTypes)
	assert.Equal(t, []string{"gluten", "lactose", "eggs"}, v.Allergens)
	assert.Equal(t, 0.0, v.Per100g.Kcal, "their nutrition is not carried over")

	// Фото — из нашего хранилища.
	require.NotNil(t, v.PhotoKey)
	assert.True(t, strings.HasPrefix(*v.PhotoKey, PhotoPrefix))
	assert.Equal(t, store(f).PublicURL(*v.PhotoKey), *v.PhotoURL)
	require.Len(t, v.Steps, 4)
	for _, st := range v.Steps {
		require.NotNil(t, st.PhotoKey)
		assert.Contains(t, store(f).files, *st.PhotoKey)
		assert.NotContains(t, *st.PhotoURL, "vkusvill.ru")
	}
	assert.Len(t, store(f).files, 5)

	// Ингредиенты: подпись, граммовка из подписи, кандидаты, без продукта.
	byName := map[string]Ingredient{}
	for _, ing := range v.Ingredients {
		assert.Nil(t, ing.FoodID)
		byName[*ing.SourceName] = ing
	}
	require.Len(t, byName, 7)
	tvorog := byName["Творог высокобелковый"]
	assert.Equal(t, "200 г", *tvorog.DisplayQuantity)
	require.NotNil(t, tvorog.Grams)
	assert.Equal(t, 200.0, *tvorog.Grams)
	require.NotEmpty(t, tvorog.Candidates)
	assert.Equal(t, "Творог высокобелковый 2%", tvorog.Candidates[0].Name)
	eggs := byName["Яйцо куриное"]
	require.NotNil(t, eggs.Grams, "4 шт. × 55 г from the first candidate's piece weight")
	assert.Equal(t, 220.0, *eggs.Grams)
	assert.True(t, byName["Соль"].ToTaste)
	assert.Nil(t, byName["Масло подсолнечное раф."].Grams, "spoons give no weight")

	// Отправить нельзя, пока продукты не подтверждены.
	_, err = f.svc.Submit(f.ctx, recipeID)
	var missing *MissingFieldsError
	require.True(t, errors.As(err, &missing))
	assert.Contains(t, missing.Missing, "ingredients.food_id")

	// Кандидаты переживают сохранение черновика, пока ингредиент не подтверждён.
	in := VersionInput{Name: v.Name, Servings: 2, MealTypes: v.MealTypes, Steps: []StepInput{{Text: "Шаг"}}}
	for _, ing := range v.Ingredients {
		in.Ingredients = append(in.Ingredients, IngredientInput{SourceName: ing.SourceName, Grams: ing.Grams,
			DisplayQuantity: ing.DisplayQuantity, ToTaste: ing.ToTaste})
	}
	saved, err := f.svc.SaveDraft(f.ctx, f.team, recipeID, in)
	require.NoError(t, err)
	assert.NotEmpty(t, saved.Ingredients[0].Candidates)

	// Повторный импорт: тот же рецепт, второго не появилось.
	again, existing, err := f.svc.ImportVkusvill(f.ctx, f.team, "5776208", "")
	require.NoError(t, err)
	assert.True(t, existing)
	assert.Equal(t, recipeID, again)
	var n int
	require.NoError(t, f.db.QueryRowContext(f.ctx, `SELECT COUNT(*) FROM recipes`).Scan(&n))
	assert.Equal(t, 1, n)

	results, err = f.svc.SearchVkusvill(f.ctx, "сырники", 1)
	require.NoError(t, err)
	require.NotNil(t, results.Items[0].ImportedRecipeID)
	assert.Equal(t, recipeID, *results.Items[0].ImportedRecipeID)
}

// Промах кэша (рестарт, прошло время): рецепт ищется заново по q.
func TestImportVkusvillCacheMissSearchesByName(t *testing.T) {
	f := setup(t, "recipes_import_miss")
	calls, _ := vkusvillFixture(t, f)

	_, _, err := f.svc.ImportVkusvill(f.ctx, f.team, "669444", "")
	assert.True(t, errors.Is(err, apperrors.ErrNotFound), "no cache, no q: %v", err)
	assert.Zero(t, calls.Load())

	id, existing, err := f.svc.ImportVkusvill(f.ctx, f.team, "669444", "Пышные творожные сырники")
	require.NoError(t, err)
	assert.False(t, existing)
	assert.NotEmpty(t, id)

	_, _, err = f.svc.ImportVkusvill(f.ctx, f.team, "1", "сырники")
	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
}

// Сценарий «ВкусВилл недоступен»: импорт отвечает ошибкой источника, ничего не
// создаётся, остальной каталог работает.
func TestImportVkusvillUnavailable(t *testing.T) {
	f := setup(t, "recipes_import_down")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)
	f.svc.vv = NewVkusvillClient(srv.URL)

	_, err := f.svc.SearchVkusvill(f.ctx, "сырники", 1)
	assert.True(t, errors.Is(err, ErrUpstream))
	_, _, err = f.svc.ImportVkusvill(f.ctx, f.team, "5776208", "сырники")
	assert.True(t, errors.Is(err, ErrUpstream))

	f.published(t, "Простой", []string{"lunch"}, nil, f.rice)
	assert.Equal(t, []string{"Простой"}, f.catalogue(t, f.clientA, ListQuery{}))
}

func TestImportIsOffWithoutClientOrStorage(t *testing.T) {
	f := setup(t, "recipes_import_off")
	_, err := f.svc.SearchVkusvill(f.ctx, "сырники", 1)
	assert.True(t, errors.Is(err, apperrors.ErrFeatureUnavailable))
	_, _, err = f.svc.ImportVkusvill(f.ctx, f.team, "1", "x")
	assert.True(t, errors.Is(err, apperrors.ErrFeatureUnavailable))
}

func store(f *fixture) *memoryStore { return f.store }
