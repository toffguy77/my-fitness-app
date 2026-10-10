// Package generator assembles a day of meals that hits a nutrition target.
//
// It is pure on purpose: no database, no clock, no global random source. The
// same input and seed give the same plan, which is what lets a plan be
// rebuilt in a test exactly as it was built for a client, and what makes
// "open the plan again and see the same thing" a property of the code rather
// than of the storage.
//
// The algorithm (design.md §2):
//
//  1. Preselection: per meal, at most 12 recipes whose protein/fat/carbs
//     calorie split is closest (cosine) to the day's target split.
//  2. Combinations: all of them when there are at most 600, otherwise 600
//     drawn with the seed. Locked and manual meals are fixed.
//  3. Weights: portion multipliers in [0.5, 2] of the free meals fitted by
//     projected gradient descent on a weighted sum of squared relative
//     deviations (kcal ×4, protein ×3 below target and ×1 above, fat ×1,
//     carbs ×1); then rounded to 10 g and every ±10 g neighbour checked.
//  4. Score: the objective plus 0.05 per recipe that was in a plan during the
//     previous 7 days. Lowest wins; ties go to the smaller recipe ids.
package generator

import (
	"math"
	"math/rand/v2"
	"sort"
	"strings"
)

// Meal types in display order.
const (
	Breakfast = "breakfast"
	Lunch     = "lunch"
	Dinner    = "dinner"
	Snack     = "snack"
)

// MealTypes is every meal type, in the order a plan lists them.
var MealTypes = []string{Breakfast, Lunch, Dinner, Snack}

// Tunables of the search. Exported so the service and the tests speak about
// the same numbers.
const (
	MinPortion       = 0.5
	MaxPortion       = 2.0
	GramStep         = 10
	MaxGrams         = 2000
	PreselectPerSlot = 12
	MaxCombinations  = 600
	RepeatPenalty    = 0.05
	// AlternativesLimit is how many alternatives are offered for a meal.
	AlternativesLimit = 5

	fitIterations = 200
	// duplicatePenalty discourages the same recipe twice in one day without
	// forbidding it: when one recipe is the only one suiting two meals, a day
	// with it twice is still better than a day with a hole.
	duplicatePenalty = 1.0
	// avoidPenalty pushes the combination being regenerated away, so
	// "regenerate" gives another day whenever there is another day to give.
	avoidPenalty = 10.0
)

// Tolerances of the spec: kcal ±5%, protein at least 90%, fat and carbs ±15%.
const (
	KcalTolerance       = 0.05
	ProteinMinimumShare = 0.90
	MacroTolerance      = 0.15
)

// shares split the day between meals; unselected meals' shares are spread
// over the selected ones in proportion to theirs.
var shares = map[string]float64{Breakfast: 0.25, Lunch: 0.35, Dinner: 0.30, Snack: 0.10}

// Shares returns the fraction of the day's target for each selected meal.
// Unknown meal types are ignored; the result sums to 1 when anything is
// selected.
func Shares(mealTypes []string) map[string]float64 {
	total := 0.0
	seen := map[string]bool{}
	for _, m := range mealTypes {
		if s, ok := shares[m]; ok && !seen[m] {
			seen[m] = true
			total += s
		}
	}
	out := make(map[string]float64, len(seen))
	if total == 0 {
		return out
	}
	for m := range seen {
		out[m] = shares[m] / total
	}
	return out
}

// Nutrition is КБЖУ: kcal and grams of protein, fat and carbs.
type Nutrition struct {
	Kcal    float64
	Protein float64
	Fat     float64
	Carbs   float64
}

func (n Nutrition) add(o Nutrition) Nutrition {
	return Nutrition{n.Kcal + o.Kcal, n.Protein + o.Protein, n.Fat + o.Fat, n.Carbs + o.Carbs}
}

func (n Nutrition) scale(k float64) Nutrition {
	return Nutrition{n.Kcal * k, n.Protein * k, n.Fat * k, n.Carbs * k}
}

func (n Nutrition) vec() [4]float64 { return [4]float64{n.Kcal, n.Protein, n.Fat, n.Carbs} }

// For returns the nutrition of grams of a recipe with per100 per 100 g.
func For(per100 Nutrition, grams int) Nutrition { return per100.scale(float64(grams) / 100) }

// Recipe is a candidate: its id, nutrition per 100 g and standard portion.
type Recipe struct {
	ID           string
	Per100       Nutrition
	PortionGrams float64
}

// Bounds are the gram limits of a recipe in an assembled plan: 0.5 to 2
// portions, on the 10 g grid, never above MaxGrams. ok is false when the
// portion is too small for the grid to hold a single value.
func (r Recipe) Bounds() (lo, hi int, ok bool) {
	lo = int(math.Ceil(MinPortion*r.PortionGrams/GramStep-1e-9)) * GramStep
	hi = int(math.Floor(MaxPortion*r.PortionGrams/GramStep+1e-9)) * GramStep
	if hi > MaxGrams {
		hi = MaxGrams
	}
	if lo < GramStep {
		lo = GramStep
	}
	return lo, hi, r.PortionGrams > 0 && lo <= hi
}

// Usable reports whether the recipe can be planned at all.
func (r Recipe) Usable() bool {
	_, _, ok := r.Bounds()
	return ok
}

// Slot is one selected meal.
//
// Recipe set means the dish is fixed (locked, manual, or the current dish
// when only weights are refitted); Grams > 0 additionally fixes its weight.
// Otherwise the dish is chosen from Candidates.
type Slot struct {
	MealType   string
	Candidates []Recipe
	Recipe     *Recipe
	Grams      int
}

// Input is everything a day is assembled from.
type Input struct {
	Target Nutrition
	// Slots are the selected meals; their order is the plan's order.
	Slots []Slot
	// Recent are recipe ids planned during the previous 7 days.
	Recent map[string]bool
	// Avoid maps meal type to recipe id: the day being regenerated. The
	// exact same combination loses to any other.
	Avoid map[string]string
	Seed  int64
}

// Item is one planned dish.
type Item struct {
	MealType  string
	Recipe    Recipe
	Grams     int
	Nutrition Nutrition
	// Manual is true when the weight was fixed by the client.
	Manual bool
}

// Deviation is a nutrient outside its tolerance: Delta = total − target in
// the nutrient's own units (>0 over, <0 under).
type Deviation struct {
	Nutrient string
	Delta    float64
}

// Plan is an assembled day.
type Plan struct {
	Items []Item
	// Empty are the selected meals no recipe could fill.
	Empty      []string
	Totals     Nutrition
	Deviations []Deviation
	Score      float64
}

// Alternative is a candidate replacement for one meal with the day it makes.
type Alternative struct {
	Recipe    Recipe
	Grams     int
	Nutrition Nutrition
	DayTotals Nutrition
	Score     float64
}

// Deviations lists the nutrients of totals outside the tolerances of target.
func Deviations(target, totals Nutrition) []Deviation {
	out := []Deviation{}
	check := func(name string, t, v float64, under, over float64) {
		if t <= 0 {
			return
		}
		if v < t*(1-under) || v > t*(1+over) {
			out = append(out, Deviation{Nutrient: name, Delta: round1(v - t)})
		}
	}
	check("kcal", target.Kcal, totals.Kcal, KcalTolerance, KcalTolerance)
	check("protein", target.Protein, totals.Protein, 1-ProteinMinimumShare, math.Inf(1))
	check("fat", target.Fat, totals.Fat, MacroTolerance, MacroTolerance)
	check("carbs", target.Carbs, totals.Carbs, MacroTolerance, MacroTolerance)
	return out
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// ---------------------------------------------------------------------------
// Objective
// ---------------------------------------------------------------------------

var weights = [4]float64{4, 3, 1, 1} // kcal, protein (under), fat, carbs

const proteinOverWeight = 1.0

// term is one nutrient's contribution at relative deviation d, and its
// derivative by d.
func term(j int, d float64) (value, slope float64) {
	w := weights[j]
	if j == 1 && d > 0 {
		w = proteinOverWeight
	}
	return w * d * d, 2 * w * d
}

// objective is the weighted sum of squared relative deviations of totals.
func objective(target, totals [4]float64) float64 {
	f := 0.0
	for j := 0; j < 4; j++ {
		if target[j] <= 0 {
			continue
		}
		v, _ := term(j, (totals[j]-target[j])/target[j])
		f += v
	}
	return f
}

// ---------------------------------------------------------------------------
// Fitting one combination
// ---------------------------------------------------------------------------

// combo is one choice of recipe per active slot, with the fixed weights.
type combo struct {
	recipes []Recipe
	fixed   []int // grams; 0 = free
}

type fitted struct {
	grams []int
	score float64
	obj   float64
}

// fitter holds the per-day constants.
type fitter struct {
	target [4]float64
	shares []float64 // per active slot
}

// fit finds the weights of a combination and returns them rounded to the grid.
func (ft *fitter) fit(c combo) fitted {
	n := len(c.recipes)
	base := [4]float64{}
	var free []int
	unit := make([][4]float64, n) // nutrition of one portion
	for i, r := range c.recipes {
		if c.fixed[i] > 0 {
			v := For(r.Per100, c.fixed[i]).vec()
			for j := range base {
				base[j] += v[j]
			}
			continue
		}
		free = append(free, i)
		unit[i] = r.Per100.scale(r.PortionGrams / 100).vec()
	}

	grams := make([]int, n)
	copy(grams, c.fixed)
	if len(free) == 0 {
		return fitted{grams: grams, obj: objective(ft.target, base)}
	}

	// Projected gradient with Nesterov momentum over portion multipliers.
	x := make([]float64, n)
	lipschitz := 0.0
	for _, i := range free {
		k := unit[i][0]
		if k > 0 {
			x[i] = clamp(ft.shares[i]*ft.target[0]/k, MinPortion, MaxPortion)
		} else {
			x[i] = 1
		}
		for j := 0; j < 4; j++ {
			if ft.target[j] > 0 {
				a := unit[i][j] / ft.target[j]
				lipschitz += 2 * weights[j] * a * a
			}
		}
	}
	if lipschitz > 0 {
		step := 1 / lipschitz
		y := make([]float64, n)
		prev := make([]float64, n)
		copy(y, x)
		copy(prev, x)
		t := 1.0
		for it := 0; it < fitIterations; it++ {
			totals := base
			for _, i := range free {
				for j := 0; j < 4; j++ {
					totals[j] += y[i] * unit[i][j]
				}
			}
			var coef [4]float64
			for j := 0; j < 4; j++ {
				if ft.target[j] <= 0 {
					continue
				}
				_, slope := term(j, (totals[j]-ft.target[j])/ft.target[j])
				coef[j] = slope / ft.target[j]
			}
			tNext := (1 + math.Sqrt(1+4*t*t)) / 2
			momentum := (t - 1) / tNext
			for _, i := range free {
				g := 0.0
				for j := 0; j < 4; j++ {
					g += coef[j] * unit[i][j]
				}
				xi := clamp(y[i]-step*g, MinPortion, MaxPortion)
				prev[i], x[i] = x[i], xi
				y[i] = clamp(xi+momentum*(xi-prev[i]), MinPortion, MaxPortion)
			}
			t = tNext
		}
	}

	// Round to the grid, then check every ±10 g neighbour of every free dish.
	lo := make([]int, n)
	hi := make([]int, n)
	for _, i := range free {
		r := c.recipes[i]
		l, h, _ := r.Bounds()
		if h < l {
			h = l
		}
		lo[i], hi[i] = l, h
		g := int(math.Round(x[i]*r.PortionGrams/GramStep)) * GramStep
		grams[i] = clampInt(g, l, h)
	}

	objAt := func(gs []int) float64 {
		totals := base
		for _, i := range free {
			k := float64(gs[i]) / 100
			p := c.recipes[i].Per100
			totals[0] += p.Kcal * k
			totals[1] += p.Protein * k
			totals[2] += p.Fat * k
			totals[3] += p.Carbs * k
		}
		return objective(ft.target, totals)
	}

	best := append([]int(nil), grams...)
	bestObj := objAt(best)
	trial := make([]int, n)
	combos := 1
	for range free {
		combos *= 3
	}
	for code := 0; code < combos; code++ {
		copy(trial, grams)
		rest := code
		valid := true
		changed := false
		for _, i := range free {
			off := rest%3 - 1
			rest /= 3
			if off == 0 {
				continue
			}
			changed = true
			g := grams[i] + off*GramStep
			if g < lo[i] || g > hi[i] {
				valid = false
				break
			}
			trial[i] = g
		}
		if !valid || !changed {
			continue
		}
		if o := objAt(trial); o < bestObj-1e-12 {
			bestObj = o
			copy(best, trial)
		}
	}
	return fitted{grams: best, obj: bestObj}
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

// active is a slot that takes part in the search.
type active struct {
	slot    Slot
	options []Recipe // one element when fixed
	fixed   int
}

func (in Input) prepare() (act []active, empty []string, ft *fitter) {
	sh := Shares(mealTypesOf(in.Slots))
	ft = &fitter{target: in.Target.vec()}
	for _, s := range in.Slots {
		switch {
		case s.Recipe != nil:
			act = append(act, active{slot: s, options: []Recipe{*s.Recipe}, fixed: s.Grams})
		default:
			opts := preselect(usable(s.Candidates), in.Target, PreselectPerSlot)
			if len(opts) == 0 {
				empty = append(empty, s.MealType)
				continue
			}
			act = append(act, active{slot: s, options: opts})
		}
		ft.shares = append(ft.shares, sh[s.MealType])
	}
	return act, empty, ft
}

func mealTypesOf(slots []Slot) []string {
	out := make([]string, len(slots))
	for i, s := range slots {
		out[i] = s.MealType
	}
	return out
}

func usable(rs []Recipe) []Recipe {
	out := make([]Recipe, 0, len(rs))
	for _, r := range rs {
		if r.Usable() {
			out = append(out, r)
		}
	}
	return out
}

// split is a recipe's or target's calorie split by protein, fat and carbs.
func split(n Nutrition) [3]float64 { return [3]float64{4 * n.Protein, 9 * n.Fat, 4 * n.Carbs} }

func cosine(a, b [3]float64) float64 {
	dot, na, nb := 0.0, 0.0, 0.0
	for i := range a {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / math.Sqrt(na*nb)
}

// preselect keeps the limit recipes closest to the target's macro split.
//
// Closest by cosine, but half from each side of the target's protein share.
// Cosine alone picks one cluster: when the nearest dozen all carry a little
// less protein than the target, no combination of them reaches 90% protein,
// however many better-suited recipes the catalogue holds. Taking the nearest
// on either side keeps the target inside what the candidates can mix to.
func preselect(rs []Recipe, target Nutrition, limit int) []Recipe {
	t := split(target)
	tShare := share(t)
	type scored struct {
		r   Recipe
		sim float64
	}
	var rich, lean []scored
	for _, r := range rs {
		sp := split(r.Per100)
		s := scored{r, cosine(sp, t)}
		if share(sp) >= tShare {
			rich = append(rich, s)
		} else {
			lean = append(lean, s)
		}
	}
	byCloseness := func(list []scored) {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].sim != list[j].sim {
				return list[i].sim > list[j].sim
			}
			return list[i].r.ID < list[j].r.ID
		})
	}
	byCloseness(rich)
	byCloseness(lean)
	nRich := min(len(rich), (limit+1)/2)
	nLean := min(len(lean), limit-nRich)
	nRich = min(len(rich), limit-nLean)
	all := append(append([]scored{}, rich[:nRich]...), lean[:nLean]...)
	byCloseness(all)
	out := make([]Recipe, len(all))
	for i, s := range all {
		out[i] = s.r
	}
	return out
}

// share is the protein part of a calorie split.
func share(sp [3]float64) float64 {
	total := sp[0] + sp[1] + sp[2]
	if total == 0 {
		return 0
	}
	return sp[0] / total
}

// penalty is what a combination pays beyond the objective.
func (in Input) penalty(act []active, recipes []Recipe) float64 {
	p := 0.0
	seen := make(map[string]bool, len(recipes))
	avoided := len(in.Avoid) > 0
	for i, r := range recipes {
		fixed := act[i].slot.Recipe != nil
		if !fixed && in.Recent[r.ID] {
			p += RepeatPenalty
		}
		if seen[r.ID] {
			p += duplicatePenalty
		}
		seen[r.ID] = true
		if avoided && in.Avoid[act[i].slot.MealType] != r.ID {
			avoided = false
		}
	}
	if avoided && len(in.Avoid) == len(recipes) {
		p += avoidPenalty
	}
	return p
}

// less orders two scored combinations: lower score, then smaller ids.
func less(scoreA float64, a []Recipe, scoreB float64, b []Recipe) bool {
	if scoreA != scoreB {
		return scoreA < scoreB
	}
	for i := range a {
		if c := strings.Compare(a[i].ID, b[i].ID); c != 0 {
			return c < 0
		}
	}
	return false
}

// Build assembles the day.
func Build(in Input) Plan {
	act, empty, ft := in.prepare()
	if len(act) == 0 {
		return in.result(nil, nil, nil, empty, 0)
	}

	total := 1
	for _, a := range act {
		total *= len(a.options)
		if total > MaxCombinations {
			break
		}
	}

	var bestRecipes []Recipe
	var best fitted
	bestScore := math.Inf(1)
	recipes := make([]Recipe, len(act))
	fixed := make([]int, len(act))
	for i, a := range act {
		fixed[i] = a.fixed
	}
	try := func(idx []int) {
		for i, a := range act {
			recipes[i] = a.options[idx[i]]
		}
		f := ft.fit(combo{recipes: recipes, fixed: fixed})
		score := f.obj + in.penalty(act, recipes)
		if bestRecipes == nil || less(score, recipes, bestScore, bestRecipes) {
			bestScore = score
			best = f
			bestRecipes = append([]Recipe(nil), recipes...)
		}
	}

	idx := make([]int, len(act))
	if total <= MaxCombinations {
		for {
			try(idx)
			k := len(act) - 1
			for k >= 0 {
				idx[k]++
				if idx[k] < len(act[k].options) {
					break
				}
				idx[k] = 0
				k--
			}
			if k < 0 {
				break
			}
		}
	} else {
		rng := rand.New(rand.NewPCG(uint64(in.Seed), 0x9e3779b97f4a7c15))
		// The best-matching option of every meal is always among those tried,
		// so a large catalogue never does worse than its own first choices.
		try(idx)
		for n := 1; n < MaxCombinations; n++ {
			for i, a := range act {
				idx[i] = rng.IntN(len(a.options))
			}
			try(idx)
		}
	}
	return in.result(act, bestRecipes, best.grams, empty, bestScore)
}

func (in Input) result(act []active, recipes []Recipe, grams []int, empty []string, score float64) Plan {
	p := Plan{Items: []Item{}, Empty: empty, Score: score}
	if p.Empty == nil {
		p.Empty = []string{}
	}
	for i, r := range recipes {
		n := For(r.Per100, grams[i])
		p.Items = append(p.Items, Item{
			MealType: act[i].slot.MealType, Recipe: r, Grams: grams[i], Nutrition: n,
			Manual: act[i].fixed > 0,
		})
		p.Totals = p.Totals.add(n)
	}
	p.Deviations = Deviations(in.Target, p.Totals)
	return p
}

// Alternatives returns up to limit replacements for the dish of mealType,
// best first, each with the weights of all free dishes refitted. Every other
// slot must already have its Recipe set (the current day); the replaced
// slot's current recipe, when set, is excluded. Replacing a dish drops its
// manual weight.
func Alternatives(in Input, mealType string, limit int) []Alternative {
	k := -1
	for i, s := range in.Slots {
		if s.MealType == mealType {
			k = i
		}
	}
	if k < 0 {
		return []Alternative{}
	}
	current := ""
	if in.Slots[k].Recipe != nil {
		current = in.Slots[k].Recipe.ID
	}

	type scored struct {
		alt     Alternative
		recipes []Recipe
	}
	var all []scored
	for _, cand := range usable(in.Slots[k].Candidates) {
		if cand.ID == current {
			continue
		}
		trial := in
		trial.Slots = append([]Slot(nil), in.Slots...)
		c := cand
		trial.Slots[k] = Slot{MealType: mealType, Recipe: &c}
		act, empty, ft := trial.prepare()
		recipes := make([]Recipe, len(act))
		fixed := make([]int, len(act))
		pos := -1
		for i, a := range act {
			recipes[i] = a.options[0]
			fixed[i] = a.fixed
			if a.slot.MealType == mealType {
				pos = i
			}
		}
		f := ft.fit(combo{recipes: recipes, fixed: fixed})
		// The penalty counts the candidate as a choice, not as fixed.
		score := f.obj
		if in.Recent[cand.ID] {
			score += RepeatPenalty
		}
		for i, r := range recipes {
			if i != pos && r.ID == cand.ID {
				score += duplicatePenalty
			}
		}
		plan := trial.result(act, recipes, f.grams, empty, score)
		all = append(all, scored{
			alt: Alternative{
				Recipe: cand, Grams: f.grams[pos], Nutrition: plan.Items[pos].Nutrition,
				DayTotals: plan.Totals, Score: score,
			},
			recipes: []Recipe{cand},
		})
	}
	sort.SliceStable(all, func(i, j int) bool {
		return less(all[i].alt.Score, all[i].recipes, all[j].alt.Score, all[j].recipes)
	})
	if len(all) > limit {
		all = all[:limit]
	}
	out := make([]Alternative, len(all))
	for i, s := range all {
		out[i] = s.alt
	}
	return out
}
