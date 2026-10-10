package mealplan

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func weighed(food, name, category string, factor, grams float64) shoppingLine {
	return shoppingLine{foodID: food, name: name, category: category, factor: factor, grams: grams}
}

func toTaste(food, name string) shoppingLine {
	return shoppingLine{foodID: food, name: name, category: "Специи и приправы", toTaste: true, label: "по вкусу"}
}

func onlyItem(t *testing.T, l ShoppingList) ShoppingItem {
	t.Helper()
	require.Len(t, l.Departments, 1)
	require.Len(t, l.Departments[0].Items, 1)
	return l.Departments[0].Items[0]
}

// Сценарий «Пересчёт под вес порции»: 340 г блюда из 1020 г с 600 г курицы.
func TestShoppingScalesToPlannedWeight(t *testing.T) {
	l := buildShoppingList("2026-10-13", "2026-10-13", true,
		[]shoppingLine{weighed("chicken", "Курица", "Птица", 340.0/1020.0, 600)})
	it := onlyItem(t, l)
	assert.Equal(t, 200, it.Grams)
	assert.Equal(t, "200 г", it.QuantityText)
	assert.Nil(t, it.Pieces)
	assert.Nil(t, it.PieceGrams)
	assert.Equal(t, DeptMeat, l.Departments[0].Name)
}

// Сценарий «Сложение из разных блюд»: 200 г в понедельник и 300 г во вторник.
func TestShoppingAddsUpTheSameProduct(t *testing.T) {
	l := buildShoppingList("2026-10-13", "2026-10-14", true, []shoppingLine{
		weighed("chicken", "Курица", "Птица", 0.5, 400),
		weighed("chicken", "Курица", "Птица", 1, 300),
	})
	assert.Equal(t, 500, onlyItem(t, l).Grams)
}

// Сценарии «Округление» и «Крупное округление».
func TestShoppingRoundsUp(t *testing.T) {
	cases := map[float64]int{
		123: 130, 120: 120, 1: 10, 499.5: 500, 500: 500, 500.4: 550, 501: 550, 612: 650, 650: 650,
		// 340/1020 × 600 даёт 199,999… или 200,000…01 — шум не стоит шага.
		340.0 / 1020.0 * 600: 200,
	}
	for in, want := range cases {
		assert.Equal(t, want, roundUpGrams(in), "%v", in)
	}
}

// Сценарий «Штуки»: 210 г яиц, в рецепте штуками, штука 55 г.
func TestShoppingPieces(t *testing.T) {
	egg := weighed("egg", "Яйцо куриное", "Яйца", 1, 210)
	egg.label, egg.defaultWeight = "3 шт.", 55
	it := onlyItem(t, buildShoppingList("a", "b", true, []shoppingLine{egg}))
	require.NotNil(t, it.Pieces)
	require.NotNil(t, it.PieceGrams)
	assert.Equal(t, 4, *it.Pieces)
	assert.Equal(t, 220, *it.PieceGrams)
	assert.Equal(t, 210, it.Grams)
	assert.Equal(t, "4 шт. (≈220 г)", it.QuantityText)

	// Одно вхождение штуками достаточно; второе — граммами.
	inGrams := weighed("egg", "Яйцо куриное", "Яйца", 1, 50)
	inGrams.label, inGrams.defaultWeight = "50 г", 55
	it = onlyItem(t, buildShoppingList("a", "b", true, []shoppingLine{egg, inGrams}))
	assert.Equal(t, "5 шт. (≈275 г)", it.QuantityText)

	// Вес штуки неизвестен — граммы.
	egg.defaultWeight = 0
	it = onlyItem(t, buildShoppingList("a", "b", true, []shoppingLine{egg}))
	assert.Nil(t, it.Pieces)
	assert.Equal(t, "210 г", it.QuantityText)
}

func TestCountedInPieces(t *testing.T) {
	for label, want := range map[string]bool{
		"3 шт.": true, "3 шт": true, "1/2 ШТ.": true, "2 крупных шт.": true,
		"50 г": false, "": false, "по вкусу": false, "2 шт. крупных": false,
	} {
		assert.Equal(t, want, countedInPieces(label), label)
	}
}

// Сценарий «Соль в нескольких блюдах» и поглощение «по вкусу» строкой с весом.
func TestShoppingToTaste(t *testing.T) {
	l := buildShoppingList("a", "b", true, []shoppingLine{
		toTaste("salt", "Соль"), toTaste("salt", "Соль"), toTaste("salt", "Соль"),
		toTaste("pepper", "Перец чёрный молотый"),
		toTaste("oil", "Масло оливковое"),
		weighed("oil", "Масло оливковое", "Оливковое масло", 1, 15),
		toTaste("dill", "Ёлочная зелень"),
	})
	assert.Equal(t, []string{"Ёлочная зелень", "Перец чёрный молотый", "Соль"}, l.AtHome)
	require.Len(t, l.Departments, 1)
	assert.Equal(t, DeptPantry, l.Departments[0].Name)
	assert.Equal(t, "Масло оливковое", l.Departments[0].Items[0].Name)
	assert.Equal(t, 20, l.Departments[0].Items[0].Grams)
}

// Порядок отделов фиксирован, «Прочее» последним, строки по названию.
func TestShoppingGroupsAndOrders(t *testing.T) {
	l := buildShoppingList("a", "b", true, []shoppingLine{
		weighed("x", "Нечто", "Шоколадные плитки", 1, 10),
		weighed("r", "Рис", "Рис", 1, 100),
		weighed("t", "Томаты", "Овощи и зелень", 1, 100),
		weighed("c", "Огурцы", "Овощи и зелень", 1, 100),
		weighed("ё", "ёжевика", "Ягоды", 1, 100),
		weighed("e", "Ежевика садовая", "Ягоды", 1, 100),
	})
	var names []string
	for _, d := range l.Departments {
		names = append(names, d.Name)
	}
	assert.Equal(t, []string{DeptVegetables, DeptFruits, DeptGrains, DeptOther}, names)
	assert.Equal(t, "Огурцы", l.Departments[0].Items[0].Name)
	assert.Equal(t, "ёжевика", l.Departments[1].Items[0].Name)
}

// Сценарий «Пустой диапазон»: пустые массивы, не null.
func TestShoppingEmpty(t *testing.T) {
	l := buildShoppingList("2026-10-13", "2026-10-13", false, nil)
	assert.False(t, l.HasPlans)
	assert.NotNil(t, l.Departments)
	assert.NotNil(t, l.AtHome)
	assert.Empty(t, l.Departments)
}

// Сценарии «Известная категория» и «Неизвестная категория».
func TestDepartmentOf(t *testing.T) {
	for category, want := range map[string]string{
		"Птица":  DeptMeat,
		"Курица": DeptMeat,
		"Мясо и мясные продукты":    DeptMeat,
		"Говядина и телятина":       DeptMeat,
		"Рыба и морепродукты":       DeptFish,
		"Икра и деликатесы":         DeptFish,
		"Молочная продукция":        DeptDairy,
		"Масло сливочное, маргарин": DeptDairy,
		"Яйца":                             DeptDairy,
		"Овощи и зелень":                   DeptVegetables,
		"Фрукты и ягоды":                   DeptFruits,
		"Сухофрукты и цукаты":              DeptNuts,
		"Рис":                              DeptGrains,
		"Крупы, мука, макароны":            DeptGrains,
		"Хлеб и выпечка":                   DeptBread,
		"Оливковое масло":                  DeptPantry,
		"Специи и приправы":                DeptPantry,
		"Сахар и сахарозаменители":         DeptPantry,
		"Замороженные овощи, смеси, грибы": DeptFrozen,
		"Мороженое":                        DeptFrozen,
		"Соки, нектары, смузи":             DeptDrinks,
		"Растительные напитки":             DeptDrinks,
		"Ирис, драже, помадка":             DeptOther,
		"Соевая продукция вместо мяса, полуфабрикаты": DeptOther,
		"Шоколадные яйца, фигурки":                    DeptOther,
		"Макдоналдс (McDonalds)":                      DeptOther,
		"":                                            DeptOther,
		"124":                                         DeptOther,
		"Что-то совсем другое":                        DeptOther,
	} {
		assert.Equal(t, want, DepartmentOf(category), category)
	}
}

// Задача 1.4: на снимке настоящих категорий общего каталога (откуда рецепты
// берут продукты) в «Прочее» уходит меньше 30% продуктов. Категории с
// названием «Прочее» не считаются: о них нечего сказать никаким правилом.
func TestDepartmentsCoverTheCatalogue(t *testing.T) {
	f, err := os.Open("testdata/catalogue_categories.tsv")
	require.NoError(t, err)
	defer func() { _ = f.Close() }()

	var total, other, distinct, distinctOther int
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		name, count, ok := strings.Cut(line, "\t")
		require.True(t, ok, line)
		n, err := strconv.Atoi(count)
		require.NoError(t, err, line)
		if name == DeptOther {
			continue
		}
		total += n
		distinct++
		if DepartmentOf(name) == DeptOther {
			other += n
			distinctOther++
		}
	}
	require.NoError(t, sc.Err())
	require.Greater(t, distinct, 300, "fixture must hold the real catalogue")
	share := float64(other) / float64(total)
	t.Logf("«Прочее»: %.1f%% продуктов, %d из %d категорий", share*100, distinctOther, distinct)
	assert.Less(t, share, 0.30)
}
