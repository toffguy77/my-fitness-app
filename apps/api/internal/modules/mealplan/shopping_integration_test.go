//go:build integration

package mealplan

import (
	"errors"
	"strconv"
	"testing"

	"github.com/burcev/api/internal/modules/recipes"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Список покупок — на настоящей базе: чтение планов без сборки, номер
// категории вместо названия у продуктов из общего каталога и изоляция по
// владельцу на подменённой базе не проверить.

type shopFixture struct {
	*fixture
	chicken, rice, egg, salt, apple string
	stew, bowl, omelette, salad     string // recipe ids
}

func setupShopping(t *testing.T, prefix string) *shopFixture {
	t.Helper()
	f := &shopFixture{fixture: setup(t, prefix)}

	// «Птица» — категория общего каталога: продукт, перенесённый из products,
	// хранит в food_items её номер, а не название.
	var poultry int64
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		INSERT INTO categories (name, slug, type, source_url) VALUES ('Птица', 'ptitsa-test', 'food', 'test')
		RETURNING id`).Scan(&poultry))
	f.chicken = f.catalogueFood(t, "Филе куриное", poultry, nil)
	f.rice = f.namedFood(t, "Рис круглозёрный", "Рис", nil)
	weight := 55.0
	f.egg = f.namedFood(t, "Яйцо куриное", "Яйца", &weight)
	f.salt = f.namedFood(t, "Соль", "Специи и приправы", nil)
	f.apple = f.namedFood(t, "Ингредиент X", "Неведомая категория", nil)

	yield := 1020.0
	f.stew = f.publish(t, f.recipe("Рагу из курицы", &yield,
		f.ing(f.chicken, 600, ""), f.ing(f.rice, 420, ""), f.pinch(f.salt)))
	f.bowl = f.publish(t, f.recipe("Курица с рисом в миске", nil,
		f.ing(f.chicken, 300, ""), f.ing(f.rice, 300, ""), f.pinch(f.salt)))
	f.omelette = f.publish(t, f.recipe("Омлет на троих", nil,
		f.ing(f.egg, 165, "3 шт."), f.pinch(f.salt)))
	f.salad = f.publish(t, f.recipe("Яблочный салат", nil, f.ing(f.apple, 200, "")))
	return f
}

func (f *shopFixture) namedFood(t *testing.T, name, category string, pieceWeight *float64) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
		                        default_weight)
		VALUES ($1, $2, 100, 10, 5, 5, $3) RETURNING id::text`, name, category, pieceWeight).Scan(&id))
	return id
}

func (f *shopFixture) catalogueFood(t *testing.T, name string, category int64, pieceWeight *float64) string {
	t.Helper()
	return f.namedFood(t, name, strconv.FormatInt(category, 10), pieceWeight)
}

func (f *shopFixture) ing(food string, grams float64, label string) recipes.IngredientInput {
	in := recipes.IngredientInput{FoodID: recipes.FlexID{Value: &food}, Grams: &grams}
	if label != "" {
		in.DisplayQuantity = &label
	}
	return in
}

func (f *shopFixture) pinch(food string) recipes.IngredientInput {
	label := "по вкусу"
	return recipes.IngredientInput{FoodID: recipes.FlexID{Value: &food}, ToTaste: true, DisplayQuantity: &label}
}

func (f *shopFixture) recipe(name string, yield *float64, ings ...recipes.IngredientInput) recipes.VersionInput {
	return recipes.VersionInput{
		Name: name, Description: "Описание", CookMinutes: 20, Complexity: "easy", Servings: 3,
		YieldGrams: yield, MealTypes: []string{"lunch", "dinner"}, Ingredients: ings,
		Steps: []recipes.StepInput{{Text: "Приготовить"}},
	}
}

// plan stores a plan as the plan module would, without assembling it:
// meal → (recipe, grams).
func (f *shopFixture) plan(t *testing.T, userID int64, date string, items map[string]struct {
	recipe string
	grams  int
}) {
	t.Helper()
	var planID string
	require.NoError(t, f.db.QueryRowContext(f.ctx, `
		INSERT INTO meal_plans (id, user_id, date, seed, meal_types, target_kcal, target_protein, target_fat, target_carbs)
		VALUES (gen_random_uuid(), $1, $2::date, 1, ARRAY['lunch','dinner'], 2000, 120, 60, 200)
		RETURNING id::text`, userID, date).Scan(&planID))
	for meal, it := range items {
		_, err := f.db.ExecContext(f.ctx, `
			INSERT INTO meal_plan_items (plan_id, meal_type, recipe_id, recipe_version_id, grams, locked, manual_grams)
			SELECT $1, $2, r.id, v.id, $4, false, false
			FROM recipes r JOIN recipe_versions v ON v.recipe_id = r.id AND v.state = 'approved'
			WHERE r.id = $3`, planID, meal, it.recipe, it.grams)
		require.NoError(t, err)
	}
}

type dish = struct {
	recipe string
	grams  int
}

func findItem(l *ShoppingList, foodID string) (string, *ShoppingItem) {
	for _, d := range l.Departments {
		for i := range d.Items {
			if d.Items[i].FoodID == foodID {
				return d.Name, &d.Items[i]
			}
		}
	}
	return "", nil
}

// Сценарии «Пересчёт под вес порции», «Сложение из разных блюд», «День без
// плана», «Соль в нескольких блюдах», «Известная/Неизвестная категория»,
// «Штуки» — одним списком за три дня, средний без плана.
func TestShoppingListAddsUpPlansWithoutBuildingThem(t *testing.T) {
	f := setupShopping(t, "shop_sum")
	// Понедельник: 340 г рагу (1020 г готового, 600 г курицы) → 200 г курицы.
	f.plan(t, f.client, "2026-10-12", map[string]dish{"lunch": {f.stew, 340}})
	// Среда: миска целиком (600 г без выхода — сумма ингредиентов) → 300 г
	// курицы; омлет 165 г → 3 яйца по весу, салат.
	f.plan(t, f.client, "2026-10-14", map[string]dish{
		"lunch": {f.bowl, 600}, "dinner": {f.omelette, 210},
	})
	f.plan(t, f.client, "2026-10-15", map[string]dish{"lunch": {f.salad, 123}})

	l, err := f.svc.ShoppingList(f.ctx, f.client, "2026-10-12", "2026-10-14")
	require.NoError(t, err)
	assert.Equal(t, "2026-10-12", l.From)
	assert.Equal(t, "2026-10-14", l.To)
	assert.True(t, l.HasPlans)

	dept, chicken := findItem(l, f.chicken)
	require.NotNil(t, chicken, "%+v", l)
	assert.Equal(t, DeptMeat, dept, "category number resolves through categories")
	assert.Equal(t, 500, chicken.Grams)
	assert.Equal(t, "500 г", chicken.QuantityText)

	dept, rice := findItem(l, f.rice)
	require.NotNil(t, rice)
	assert.Equal(t, DeptGrains, dept)
	assert.Equal(t, 440, rice.Grams) // 140 + 300

	dept, egg := findItem(l, f.egg)
	require.NotNil(t, egg)
	assert.Equal(t, DeptDairy, dept)
	require.NotNil(t, egg.Pieces)
	assert.Equal(t, 4, *egg.Pieces) // 210 г ÷ 55 г
	assert.Equal(t, "4 шт. (≈220 г)", egg.QuantityText)

	_, apple := findItem(l, f.apple)
	assert.Nil(t, apple, "15 October is outside the range")

	assert.Equal(t, []string{"Соль"}, l.AtHome, "salt in three dishes is one line")
	_, salt := findItem(l, f.salt)
	assert.Nil(t, salt)

	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1 AND date = '2026-10-13'`, f.client),
		"a day without a plan stays without one")

	// Ни категория, ни название не дают отдела — «Прочее», округление 123 → 130.
	l, err = f.svc.ShoppingList(f.ctx, f.client, "2026-10-15", "2026-10-15")
	require.NoError(t, err)
	dept, apple = findItem(l, f.apple)
	require.NotNil(t, apple)
	assert.Equal(t, DeptOther, dept)
	assert.Equal(t, 130, apple.Grams)
}

// Сценарий «Пустой диапазон» и изоляция: чужие планы в список не попадают.
func TestShoppingListIsTheCallersOwn(t *testing.T) {
	f := setupShopping(t, "shop_own")
	other := f.user(t, "other@example.test", "client")
	f.plan(t, other, "2026-10-12", map[string]dish{"lunch": {f.stew, 340}})

	l, err := f.svc.ShoppingList(f.ctx, f.client, "2026-10-12", "2026-10-12")
	require.NoError(t, err)
	assert.False(t, l.HasPlans)
	assert.Empty(t, l.Departments)
	assert.Empty(t, l.AtHome)
	assert.Zero(t, f.count(t, `SELECT COUNT(*) FROM meal_plans WHERE user_id = $1`, f.client))
}

// Значение по умолчанию: с сегодняшнего дня клиента до последнего плана в
// пределах недели; без планов — один сегодняшний день.
func TestShoppingListDefaultRange(t *testing.T) {
	f := setupShopping(t, "shop_default")
	l, err := f.svc.ShoppingList(f.ctx, f.client, "", "")
	require.NoError(t, err)
	assert.Equal(t, today, l.From)
	assert.Equal(t, today, l.To)
	assert.False(t, l.HasPlans)

	f.plan(t, f.client, "2026-10-12", map[string]dish{"lunch": {f.stew, 340}})
	f.plan(t, f.client, "2026-10-16", map[string]dish{"lunch": {f.bowl, 300}})
	f.plan(t, f.client, "2026-10-17", map[string]dish{"lunch": {f.bowl, 300}}) // восьмой день
	f.plan(t, f.client, "2026-10-09", map[string]dish{"lunch": {f.bowl, 300}}) // вчера
	l, err = f.svc.ShoppingList(f.ctx, f.client, "", "")
	require.NoError(t, err)
	assert.Equal(t, today, l.From)
	assert.Equal(t, "2026-10-16", l.To)
	assert.True(t, l.HasPlans)
}

// Сценарии «Слишком длинный диапазон» и «Конец раньше начала».
func TestShoppingListRangeValidation(t *testing.T) {
	f := setupShopping(t, "shop_range")
	for _, r := range [][2]string{
		{"2026-10-01", "2026-10-20"}, // 20 дней
		{"2026-10-01", "2026-10-15"}, // 15 дней
		{"2026-10-15", "2026-10-14"},
		{"2026-10-15", ""},
		{"", "2026-10-15"},
		{"2026-10-1", "2026-10-15"},
		{"2026-02-30", "2026-03-01"},
	} {
		_, err := f.svc.ShoppingList(f.ctx, f.client, r[0], r[1])
		assert.True(t, errors.Is(err, apperrors.ErrValidation), "%v: %v", r, err)
	}
	l, err := f.svc.ShoppingList(f.ctx, f.client, "2026-10-01", "2026-10-14") // ровно 14
	require.NoError(t, err)
	assert.Equal(t, "2026-10-14", l.To)
}

// Сценарий «Изменение плана»: замена блюда сразу видна в списке.
func TestShoppingListFollowsThePlan(t *testing.T) {
	f := setupShopping(t, "shop_change")
	p, err := f.svc.Get(f.ctx, f.client, today)
	require.NoError(t, err)
	// Новое блюдо — то, которого сейчас в обеде нет; его продукт есть только в нём.
	next, food := f.salad, f.apple
	if item(t, p, "lunch").RecipeID == f.salad {
		next, food = f.omelette, f.egg
	}
	grams := func() int {
		l, err := f.svc.ShoppingList(f.ctx, f.client, today, today)
		require.NoError(t, err)
		require.True(t, l.HasPlans)
		if _, it := findItem(l, food); it != nil {
			return it.Grams
		}
		return 0
	}

	before := grams()
	_, err = f.svc.UpdateItem(f.ctx, f.client, today, "lunch", ItemUpdate{RecipeID: &next})
	require.NoError(t, err)
	assert.Greater(t, grams(), before, "the new dish is in the list")
}
