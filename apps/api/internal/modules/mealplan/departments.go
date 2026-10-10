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
	{DeptFish, []string{"рыб", "морепродукт", " икр", "краб", "морская капуста", "морской капуст", "ryba", "seafood", "треск", "лосос", "сёмг", "семг", "форел", "тунец", "тунц", "скумбри", "сельдь", "минтай", "хек", "горбуш", "креветк", "кальмар", "мидии", "пангасиус"}},
	{DeptMeat, []string{
		"мяс", "myaso", "птиц", "курица", "индейк", "говядин", "телятин", "свинин", "баранин",
		"кролик", "дичь", "колбас", "kolbasa", "сосиск", "сардельк", "ветчин", "деликатес",
		"субпродукт", "шашлык", "фарш", "курин", "цыпл", "грудк", "бедр", "окороч", "голен", "говяж", "свин", "бекон",
	}},
	{DeptDairy, []string{
		"молоч", "molochn", "молок", "сгущ", "сыр", "syry", "творог", "творож", "кефир",
		"йогурт", "сметан", "сливк", "сливоч", "ряженк", "простокваш", "мацони", "яйц",
		"lacteos", "dairy", "брынз", "моцарел", "рикотт", "маскарпон",
	}},
	{DeptVegetables, []string{
		"овощ", "ovoshch", "зелень", "салат", "гриб", "картоф", "капуст", "кабачк", "баклажан",
		"лук,", "чеснок", "корнеплод", "огурц", "помидор", "соленья", "оливки", "маслины",
		"vegetable", "брокколи", "морков", "свекл", "томаты", "огурец", "шпинат", "сельдер", "тыкв", "редис", "спарж", "руккол", "петрушк", "укроп", "базилик", "кинз",
	}},
	{DeptFruits, []string{
		"фрукт", "ягод", "цитрус", "яблок", "груш", "банан", "манго", "авокадо", "персик",
		"абрикос", "fruit", "лимон", "лайм", "апельсин", "мандарин", "грейпфрут", "киви", "ананас", "виноград", "вишн", "черешн", "клубник", "малин", "черник", "голубик", "смородин", "гранат", "хурм",
	}},
	{DeptGrains, []string{
		"круп", "krupy", "макарон", " рис", "бобов", " мук", "хлопья", "каш",
		"гречн", "лапша", "мюсли", "гранол", "отруб", "бакалея", "завтрак", "гречк", "овсян", "булгур", "киноа", "перлов", "пшен", "кускус", "спагетти", "фасол", "чечевиц", " нут ",
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
	dept, _ := matchDepartment(departmentRules, category)
	return dept
}

// nameRules are tried on a product name. Eggs come first: «Яйцо куриное»
// would otherwise match «курин» and land among the meat.
var nameRules = append([]departmentRule{{DeptDairy, []string{"яйц", "яйко"}}}, departmentRules...)

// DepartmentFor is the department of an ingredient: by its category, and by
// its name when the category says nothing.
//
// The name is not a fallback for rare cases. In the shared catalogue the
// category is often a shop or a brand — «Пятерочка», «Бондюэль» — and
// openfoodfacts imports bring «Прочее»: on dev, plain chicken, cod, cottage
// cheese and buckwheat all went to «Прочее» by category alone.
func DepartmentFor(category, name string) string {
	if dept, matched := matchDepartment(departmentRules, category); matched {
		return dept
	}
	dept, _ := matchDepartment(nameRules, name)
	return dept
}

// matchDepartment reports the first rule that matches, and whether any did:
// an explicit «Прочее» (a meat substitute, sweets) is a decision, an unknown
// category is not.
func matchDepartment(rules []departmentRule, text string) (string, bool) {
	c := " " + strings.ToLower(strings.Join(strings.Fields(text), " ")) + " "
	if strings.TrimSpace(c) == "" {
		return DeptOther, false
	}
	for _, rule := range rules {
		for _, s := range rule.substrings {
			if strings.Contains(c, s) {
				return rule.department, true
			}
		}
	}
	return DeptOther, false
}
