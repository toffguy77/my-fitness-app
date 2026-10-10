package mealplan

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/middleware"
)

// MaxShoppingDays is the longest range a shopping list covers, both ends
// included.
const MaxShoppingDays = 14

// DefaultShoppingDays is how far ahead the default range looks for plans.
const DefaultShoppingDays = 7

// ShoppingItem is one product to buy.
type ShoppingItem struct {
	FoodID string `json:"food_id"`
	Name   string `json:"name"`
	// Grams is the sum rounded up: to 10 g, above 500 g to 50 g.
	Grams int `json:"grams"`
	// Pieces is set when the product is counted in pieces in a recipe and its
	// piece weight is known; PieceGrams is Pieces × that weight.
	Pieces       *int   `json:"pieces"`
	PieceGrams   *int   `json:"piece_grams"`
	QuantityText string `json:"quantity_text"`
}

// ShoppingDepartment is a store department with its products by name.
type ShoppingDepartment struct {
	Name  string         `json:"name"`
	Items []ShoppingItem `json:"items"`
}

// ShoppingList is what to buy to cook the planned dishes of a date range.
// It is computed from the plans every time and never stored.
type ShoppingList struct {
	From        string               `json:"from"`
	To          string               `json:"to"`
	HasPlans    bool                 `json:"has_plans"`
	Departments []ShoppingDepartment `json:"departments"`
	AtHome      []string             `json:"at_home"`
}

// ---------------------------------------------------------------------------
// Assembly — pure
// ---------------------------------------------------------------------------

// shoppingLine is one ingredient of one planned dish, as read from the plan.
type shoppingLine struct {
	foodID        string
	name          string
	category      string  // resolved to a name: numeric catalogue ids are looked up
	defaultWeight float64 // piece weight, 0 when unknown
	factor        float64 // planned grams ÷ finished weight of the version
	grams         float64 // ingredient grams in the recipe, 0 for «по вкусу»
	label         string  // display_quantity
	toTaste       bool
}

// countedInPieces: the recipe gives the ingredient as «3 шт.». Only the end of
// the label is looked at — «2 шт. крупных» is not a count, «2 крупных шт.» is.
func countedInPieces(label string) bool {
	l := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(label)), ".")
	return strings.HasSuffix(l, "шт")
}

// roundUpGrams rounds a sum up to 10 g, and above 500 g to 50 g. A hair of
// float noise above a whole number (340/1020 × 600) does not cost a step.
func roundUpGrams(g float64) int {
	step := 10.0
	if g > 500+1e-6 {
		step = 50
	}
	return int(math.Ceil(g/step-1e-6) * step)
}

func ceilCount(v float64) int { return int(math.Ceil(v - 1e-6)) }

// sortKey orders Russian names as a person would: case-insensitive, «ё» with «е».
func sortKey(s string) string {
	return strings.ReplaceAll(strings.ToLower(s), "ё", "е")
}

// buildShoppingList adds up the lines by product and groups them.
//
// A product needed with a weight anywhere swallows its «по вкусу» mentions;
// a product only ever «по вкусу» goes to at_home, once.
func buildShoppingList(from, to string, hasPlans bool, lines []shoppingLine) ShoppingList {
	type acc struct {
		line   shoppingLine
		grams  float64
		weight bool
		pieces bool
	}
	byFood := map[string]*acc{}
	order := []string{}
	for _, l := range lines {
		a := byFood[l.foodID]
		if a == nil {
			a = &acc{line: l}
			byFood[l.foodID] = a
			order = append(order, l.foodID)
		}
		if l.toTaste || l.grams <= 0 {
			continue
		}
		a.weight = true
		a.grams += l.grams * l.factor
		if countedInPieces(l.label) {
			a.pieces = true
		}
	}

	byDept := map[string][]ShoppingItem{}
	atHome := []string{}
	seenAtHome := map[string]bool{}
	for _, id := range order {
		a := byFood[id]
		if !a.weight {
			if k := sortKey(a.line.name); !seenAtHome[k] {
				seenAtHome[k] = true
				atHome = append(atHome, a.line.name)
			}
			continue
		}
		it := ShoppingItem{FoodID: id, Name: a.line.name, Grams: roundUpGrams(a.grams)}
		it.QuantityText = fmt.Sprintf("%d г", it.Grams)
		if a.pieces && a.line.defaultWeight > 0 {
			n := ceilCount(a.grams / a.line.defaultWeight)
			g := int(math.Round(float64(n) * a.line.defaultWeight))
			it.Pieces, it.PieceGrams = &n, &g
			it.QuantityText = fmt.Sprintf("%d шт. (≈%d г)", n, g)
		}
		dept := DepartmentFor(a.line.category, a.line.name)
		byDept[dept] = append(byDept[dept], it)
	}

	out := ShoppingList{From: from, To: to, HasPlans: hasPlans,
		Departments: []ShoppingDepartment{}, AtHome: atHome}
	for _, name := range Departments {
		items := byDept[name]
		if len(items) == 0 {
			continue
		}
		sort.SliceStable(items, func(i, j int) bool { return sortKey(items[i].Name) < sortKey(items[j].Name) })
		out.Departments = append(out.Departments, ShoppingDepartment{Name: name, Items: items})
	}
	sort.SliceStable(out.AtHome, func(i, j int) bool { return sortKey(out.AtHome[i]) < sortKey(out.AtHome[j]) })
	return out
}

// ---------------------------------------------------------------------------
// Reading plans — never assembling them
// ---------------------------------------------------------------------------

// shoppingRange validates from/to, or picks the default: from today (the
// client's timezone, as for plans) to the last planned date within a week.
func (s *Service) shoppingRange(ctx context.Context, userID int64, from, to string) (string, string, error) {
	if (from == "") != (to == "") {
		return "", "", validation("from and to go together")
	}
	if from == "" {
		loc := middleware.GetUserTimezone(ctx, s.db, userID)
		now := s.now().In(loc)
		from = now.Format("2006-01-02")
		var last *string
		if err := s.db.QueryRowContext(ctx, `
			SELECT to_char(MAX(date), 'YYYY-MM-DD') FROM meal_plans
			WHERE user_id = $1 AND date BETWEEN $2::date AND $2::date + $3::int`,
			userID, from, DefaultShoppingDays-1).Scan(&last); err != nil {
			return "", "", fmt.Errorf("last planned date: %w", err)
		}
		to = from
		if last != nil {
			to = *last
		}
		return from, to, nil
	}
	f, err := parseDay(from)
	if err != nil {
		return "", "", validation("from must be YYYY-MM-DD")
	}
	t, err := parseDay(to)
	if err != nil {
		return "", "", validation("to must be YYYY-MM-DD")
	}
	if t.Before(f) {
		return "", "", validation("to must not be before from")
	}
	if days := int(t.Sub(f).Hours()/24) + 1; days > MaxShoppingDays {
		return "", "", validation("range must not exceed %d days", MaxShoppingDays)
	}
	return from, to, nil
}

func parseDay(raw string) (time.Time, error) {
	if len(raw) != len("2006-01-02") {
		return time.Time{}, fmt.Errorf("bad date %q", raw)
	}
	return time.Parse("2006-01-02", raw)
}

// ShoppingList adds up the ingredients of the client's planned dishes in the
// range. Plans are only read: a date without a plan is skipped, not built.
// Eaten dishes count too — the list is what the plan needed, not what is left.
func (s *Service) ShoppingList(ctx context.Context, userID int64, from, to string) (*ShoppingList, error) {
	from, to, err := s.shoppingRange(ctx, userID, from, to)
	if err != nil {
		return nil, err
	}

	var hasPlans bool
	if err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS (SELECT 1 FROM meal_plans WHERE user_id = $1 AND date BETWEEN $2::date AND $3::date)`,
		userID, from, to).Scan(&hasPlans); err != nil {
		return nil, fmt.Errorf("find plans: %w", err)
	}

	// Продукт из общего каталога переносится в food_items с номером категории
	// вместо названия (ensureFoodItemExists): название берётся из categories.
	// У одобренной версии у каждого ингредиента есть продукт и либо вес, либо
	// «по вкусу»; строки без того и другого отбрасываются на всякий случай.
	rows, err := s.db.QueryContext(ctx, `
		SELECT ri.food_id::text, f.name,
		       COALESCE(c.name, f.category, ''),
		       COALESCE(f.default_weight, 0)::float8,
		       i.grams::float8 / v.total_grams::float8,
		       COALESCE(ri.grams, 0)::float8,
		       COALESCE(ri.display_quantity, ''),
		       ri.to_taste
		FROM meal_plans p
		JOIN meal_plan_items i ON i.plan_id = p.id
		JOIN recipe_versions v ON v.id = i.recipe_version_id
		JOIN recipe_ingredients ri ON ri.version_id = v.id
		JOIN food_items f ON f.id = ri.food_id
		LEFT JOIN categories c
		       ON c.id = CASE WHEN f.category ~ '^[0-9]{1,18}$' THEN f.category::bigint END
		WHERE p.user_id = $1 AND p.date BETWEEN $2::date AND $3::date
		  AND v.total_grams > 0
		  AND (ri.to_taste OR ri.grams IS NOT NULL)
		ORDER BY p.date, i.meal_type, ri.position`, userID, from, to)
	if err != nil {
		return nil, fmt.Errorf("load shopping lines: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var lines []shoppingLine
	for rows.Next() {
		var l shoppingLine
		if err := rows.Scan(&l.foodID, &l.name, &l.category, &l.defaultWeight, &l.factor,
			&l.grams, &l.label, &l.toTaste); err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	list := buildShoppingList(from, to, hasPlans, lines)
	return &list, nil
}
