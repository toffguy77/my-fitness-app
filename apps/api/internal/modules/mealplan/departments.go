package mealplan

import "strings"

// Отделы магазина в том порядке, в каком их показывает список покупок.
const (
	DeptVegetables = "Овощи и зелень"
	DeptFruits     = "Фрукты и ягоды"
	DeptMeat       = "Мясо и птица"
	DeptFish       = "Рыба и морепродукты"
	DeptDairy      = "Молочное и яйца"
	DeptGrains     = "Крупы, макароны, бобовые"
	DeptBread      = "Хлеб и выпечка"
	DeptPantry     = "Масла, соусы, специи"
	DeptNuts       = "Орехи и сухофрукты"
	DeptFrozen     = "Замороженное"
	DeptDrinks     = "Напитки"
	DeptOther      = "Прочее"
)

// Departments is the fixed order of the list; «Прочее» is last.
var Departments = []string{
	DeptVegetables, DeptFruits, DeptMeat, DeptFish, DeptDairy, DeptGrains,
	DeptBread, DeptPantry, DeptNuts, DeptFrozen, DeptDrinks, DeptOther,
}

// departmentRule sends a category containing any of the substrings to a
// department. The category is lower-cased and padded with spaces, so a
// substring starting with a space matches only at the start of a word:
// « рис» is rice, not «ирис».
type departmentRule struct {
	department string
	substrings []string
}

// departmentRules are tried in order; the first match wins. The order is not
// the display order: the narrower rules come first, so that «Замороженные
// овощи» are frozen, «Сухофрукты» are nuts and dried fruit, «Масло
// сливочное» is dairy, and «Соевая продукция вместо мяса» is not meat.
//
// Categories come from the shared catalogue (health-diet, ВкусВилл, Глобус,
// the `categories` table) and from openfoodfacts imports (`food_items.category`
// text). TestDepartmentsCoverTheCatalogue keeps the «Прочее» share in check on
// a snapshot of the real category names.
var departmentRules = []departmentRule{
	// Не отдел, хотя слова совпадают с отделом: заменители и сладости.
	{DeptOther, []string{"вместо мяса", "вместо молока", "заменители мяса", "шоколадн", "конфет"}},
	{DeptFrozen, []string{
		"заморож", "заморозк", "zamorozh", "мороженое", "пельмен", "вареник", "хинкали", "манты",
	}},
	{DeptNuts, []string{"сухофрукт", "орех", "семечк", "семена", "урбеч", "orekhi"}},
	{DeptDrinks, []string{
		"напит", "napitk", "вода", " сок", "смузи", "морс", "компот", "квас", "комбуч",
		"чай", "chay", "кофе", "какао", "цикори", "тоник", "лимонад", "коктейл",
		"вино", "пиво", "алкогол", "alkogol", "водка", "виски", "коньяк", " ром,",
		"ликёр", "шампанск", "сидр", "медовух",
	}},
	{DeptFish, []string{"рыб", "морепродукт", " икр", "краб", "морская капуста", "морской капуст", "ryba", "seafood"}},
	{DeptMeat, []string{
		"мяс", "myaso", "птиц", "курица", "индейк", "говядин", "телятин", "свинин", "баранин",
		"кролик", "дичь", "колбас", "kolbasa", "сосиск", "сардельк", "ветчин", "деликатес",
		"субпродукт", "шашлык", "фарш",
	}},
	{DeptDairy, []string{
		"молоч", "molochn", "молок", "сгущ", "сыр", "syry", "творог", "творож", "кефир",
		"йогурт", "сметан", "сливк", "сливоч", "ряженк", "простокваш", "мацони", "яйц",
		"lacteos", "dairy",
	}},
	{DeptVegetables, []string{
		"овощ", "ovoshch", "зелень", "салат", "гриб", "картоф", "капуст", "кабачк", "баклажан",
		"лук,", "чеснок", "корнеплод", "огурц", "помидор", "соленья", "оливки", "маслины",
		"vegetable",
	}},
	{DeptFruits, []string{
		"фрукт", "ягод", "цитрус", "яблок", "груш", "банан", "манго", "авокадо", "персик",
		"абрикос", "fruit",
	}},
	{DeptGrains, []string{
		"круп", "krupy", "макарон", " рис", "бобов", " мук", "хлопья", "каш",
		"гречн", "лапша", "мюсли", "гранол", "отруб", "бакалея", "завтрак",
	}},
	{DeptBread, []string{
		"хлеб", "khleb", "пекарн", "выпечк", "vypechka", "булоч", "сдоб", "багет", "чиабатт", "лаваш",
		"лепёш", "сушки", "сухар", "круассан", "слойк", "пирог", "пирож", "тесто", "печенье",
		"крекер", "вафл", "кекс", "пряник", "торт", "bread",
	}},
	{DeptPantry, []string{
		"масл", "masla", "жиры", "соус", "специ", "spetsii", "приправ", "трав", "кетчуп",
		"томатная паста", "майонез", "горчиц", "хрен", "аджик", "уксус", "маринад", " соль",
		"сахар", "мёд", "мед ", "сироп", "варенье", "джем", "кулинарные ингредиенты",
	}},
}

// DepartmentOf maps a catalogue category to a store department; a category
// nothing matches, or none at all, is «Прочее».
func DepartmentOf(category string) string {
	c := " " + strings.ToLower(strings.Join(strings.Fields(category), " ")) + " "
	if strings.TrimSpace(c) == "" {
		return DeptOther
	}
	for _, rule := range departmentRules {
		for _, s := range rule.substrings {
			if strings.Contains(c, s) {
				return rule.department
			}
		}
	}
	return DeptOther
}
