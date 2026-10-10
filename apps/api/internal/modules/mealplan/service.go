package mealplan

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"slices"
	"time"

	"github.com/burcev/api/internal/modules/mealplan/generator"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/recipeaccess"
	"github.com/google/uuid"
)

// Targets is the part of nutrition-calc the plan needs: the same target the
// diary shows, curator's weekly plan included.
type Targets interface {
	TargetForDate(ctx context.Context, userID int64, date time.Time) (*nutritioncalc.CalculatedTargets, error)
	MissingInputsFor(ctx context.Context, userID int64, date time.Time) (*nutritioncalc.MissingInputs, error)
}

// PhotoURLs turns a recipe photo key into a public address.
type PhotoURLs interface {
	PublicURL(key string) string
}

// Service is the day plan.
type Service struct {
	db      *database.DB
	log     *logger.Logger
	targets Targets
	photos  PhotoURLs
	// now and newSeed are replaced in tests.
	now     func() time.Time
	newSeed func() int64
}

// NewService builds the service. photos may be nil: photo_url is then null.
func NewService(db *database.DB, log *logger.Logger, targets Targets, photos PhotoURLs) *Service {
	return &Service{db: db, log: log, targets: targets, photos: photos, now: time.Now, newSeed: randomSeed}
}

func randomSeed() int64 {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return int64(binary.LittleEndian.Uint64(b[:]) >> 1)
}

// initialSeed is a hash of (user, date): the first assembly of a date is the
// same whoever, whenever asks — the plan is stored anyway, but a lost race or
// a rebuilt test gets the same day.
func initialSeed(userID int64, date string) int64 {
	h := fnv.New64a()
	_, _ = fmt.Fprintf(h, "%d:%s", userID, date)
	return int64(h.Sum64() >> 1)
}

var errPlanNotFound = fmt.Errorf("%w: meal plan", apperrors.ErrNotFound)

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// ---------------------------------------------------------------------------
// Dates and targets
// ---------------------------------------------------------------------------

// day is a validated plan date in the client's timezone.
type day struct {
	key string    // YYYY-MM-DD
	at  time.Time // midnight in the client's timezone
}

// parseDate accepts YYYY-MM-DD within WindowDays of the client's today — the
// same timezone the diary resolves dates in.
func (s *Service) parseDate(ctx context.Context, userID int64, raw string) (day, error) {
	loc := middleware.GetUserTimezone(ctx, s.db, userID)
	at, err := time.ParseInLocation("2006-01-02", raw, loc)
	if err != nil || len(raw) != len("2006-01-02") {
		return day{}, validation("date must be YYYY-MM-DD")
	}
	now := s.now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	d := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, time.UTC)
	if diff := d.Sub(today).Hours() / 24; math.Abs(diff) > WindowDays {
		return day{}, validation("date must be within %d days of today", WindowDays)
	}
	return day{key: raw, at: at}, nil
}

// target is a plan target in whole units: stored that way, compared that way,
// so recalculation jitter never reads as a changed target.
type target struct{ kcal, protein, fat, carbs int }

func (t target) nutrition() generator.Nutrition {
	return generator.Nutrition{Kcal: float64(t.kcal), Protein: float64(t.protein),
		Fat: float64(t.fat), Carbs: float64(t.carbs)}
}

// currentTarget is the day's target now, or nil when it cannot be calculated.
func (s *Service) currentTarget(ctx context.Context, userID int64, d day) (*target, error) {
	t, err := s.targets.TargetForDate(ctx, userID, d.at)
	if err != nil {
		return nil, fmt.Errorf("calculate target: %w", err)
	}
	if t == nil {
		return nil, nil
	}
	return &target{
		kcal: int(math.Round(t.Calories)), protein: int(math.Round(t.Protein)),
		fat: int(math.Round(t.Fat)), carbs: int(math.Round(t.Carbs)),
	}, nil
}

// requireTarget is currentTarget, or a TargetMissingError naming what is missing.
func (s *Service) requireTarget(ctx context.Context, userID int64, d day) (*target, error) {
	t, err := s.currentTarget(ctx, userID, d)
	if err != nil || t != nil {
		return t, err
	}
	missing, err := s.targets.MissingInputsFor(ctx, userID, d.at)
	if err != nil {
		return nil, fmt.Errorf("missing inputs: %w", err)
	}
	out := []string{}
	if missing != nil && missing.Profile {
		out = append(out, "profile")
	}
	if missing != nil && missing.Weight {
		out = append(out, "weight")
	}
	return nil, &TargetMissingError{Missing: out}
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

func decodeStrings(raw string) []string {
	out := []string{}
	_ = json.Unmarshal([]byte(raw), &out)
	if out == nil {
		out = []string{}
	}
	return out
}

// canonical orders meal types as a plan lists them.
func canonical(in []string) []string {
	out := []string{}
	for _, m := range generator.MealTypes {
		if slices.Contains(in, m) {
			out = append(out, m)
		}
	}
	return out
}

func (s *Service) mealTypes(ctx context.Context, q queryer, userID int64) ([]string, error) {
	var raw string
	err := q.QueryRowContext(ctx,
		`SELECT to_json(meal_types)::text FROM meal_plan_settings WHERE user_id = $1`, userID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return append([]string(nil), generator.MealTypes...), nil
	}
	if err != nil {
		return nil, fmt.Errorf("load settings: %w", err)
	}
	return canonical(decodeStrings(raw)), nil
}

// GetSettings returns the meals the client plans; all four by default.
func (s *Service) GetSettings(ctx context.Context, userID int64) (*Settings, error) {
	m, err := s.mealTypes(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	return &Settings{MealTypes: m}, nil
}

// SetSettings saves the meals the client plans. Plans already built keep
// theirs; the new choice applies at the next assembly or regeneration.
func (s *Service) SetSettings(ctx context.Context, userID int64, in Settings) (*Settings, error) {
	for _, m := range in.MealTypes {
		if !slices.Contains(generator.MealTypes, m) {
			return nil, validation("unknown meal type %q", m)
		}
	}
	m := canonical(in.MealTypes)
	if len(m) == 0 {
		return nil, validation("at least one meal type must be selected")
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO meal_plan_settings (user_id, meal_types, updated_at) VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE SET meal_types = EXCLUDED.meal_types, updated_at = NOW()`,
		userID, m); err != nil {
		return nil, fmt.Errorf("save settings: %w", err)
	}
	return &Settings{MealTypes: m}, nil
}

// ---------------------------------------------------------------------------
// Candidates and history
// ---------------------------------------------------------------------------

// candidate is an available recipe at its current approved version.
type candidate struct {
	recipe    generator.Recipe
	versionID string
	name      string
	photoKey  *string
	mealTypes []string
}

// catalogue is what the client may be offered, by meal type and by id.
type catalogue struct {
	byMeal map[string][]generator.Recipe
	byID   map[string]candidate
}

func (c catalogue) suits(recipeID, mealType string) bool {
	cand, ok := c.byID[recipeID]
	return ok && slices.Contains(cand.mealTypes, mealType)
}

// candidates loads every recipe available to the client — by recipeaccess,
// the one place that rule lives.
func (s *Service) candidates(ctx context.Context, q queryer, userID int64) (catalogue, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT r.id::text, v.id::text, v.name, v.photo_key, v.portion_grams::float8,
		       v.kcal_100::float8, v.protein_100::float8, v.fat_100::float8, v.carbs_100::float8,
		       to_json(v.meal_types)::text
		FROM `+recipeaccess.Join("r", "v")+`
		WHERE `+recipeaccess.Available("r", "v", "$1")+`
		ORDER BY r.id`, userID)
	if err != nil {
		return catalogue{}, fmt.Errorf("load candidates: %w", err)
	}
	defer func() { _ = rows.Close() }()
	c := catalogue{byMeal: map[string][]generator.Recipe{}, byID: map[string]candidate{}}
	for rows.Next() {
		var cand candidate
		var meals string
		r := &cand.recipe
		if err := rows.Scan(&r.ID, &cand.versionID, &cand.name, &cand.photoKey, &r.PortionGrams,
			&r.Per100.Kcal, &r.Per100.Protein, &r.Per100.Fat, &r.Per100.Carbs, &meals); err != nil {
			return catalogue{}, err
		}
		cand.mealTypes = decodeStrings(meals)
		if !r.Usable() {
			continue
		}
		c.byID[r.ID] = cand
		for _, m := range cand.mealTypes {
			c.byMeal[m] = append(c.byMeal[m], *r)
		}
	}
	return c, rows.Err()
}

// recent are the recipes planned during the 7 days before the date.
func (s *Service) recent(ctx context.Context, q queryer, userID int64, d day) (map[string]bool, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT DISTINCT i.recipe_id::text
		FROM meal_plan_items i JOIN meal_plans p ON p.id = i.plan_id
		WHERE p.user_id = $1 AND p.date >= $2::date - 7 AND p.date < $2::date`, userID, d.key)
	if err != nil {
		return nil, fmt.Errorf("load recent recipes: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Stored plans
// ---------------------------------------------------------------------------

type storedPlan struct {
	id        string
	seed      int64
	mealTypes []string
	target    target
	items     map[string]*storedItem
}

type storedItem struct {
	mealType    string
	recipe      generator.Recipe // nutrition of the stored version
	versionID   string
	name        string
	photoKey    *string
	grams       int
	locked      bool
	manual      bool
	unavailable bool
}

// loadPlan reads the client's plan for the date, nil when there is none.
// forUpdate locks the plan row for the rest of the transaction.
func (s *Service) loadPlan(ctx context.Context, q queryer, userID int64, d day, forUpdate bool) (*storedPlan, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	var p storedPlan
	var meals string
	err := q.QueryRowContext(ctx, `
		SELECT id::text, seed, to_json(meal_types)::text,
		       target_kcal, target_protein, target_fat, target_carbs
		FROM meal_plans WHERE user_id = $1 AND date = $2::date`+lock, userID, d.key).
		Scan(&p.id, &p.seed, &meals, &p.target.kcal, &p.target.protein, &p.target.fat, &p.target.carbs)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load plan: %w", err)
	}
	p.mealTypes = canonical(decodeStrings(meals))

	// Блюдо показывается по сохранённой версии: план на прошлую дату не
	// меняется от одобрения новой. Доступность — по правилу recipeaccess для
	// рецепта, а не версии: новая одобренная версия блюдо не «снимает».
	rows, err := q.QueryContext(ctx, `
		SELECT i.meal_type, i.recipe_id::text, i.recipe_version_id::text, i.grams, i.locked, i.manual_grams,
		       v.name, v.photo_key, v.portion_grams::float8,
		       v.kcal_100::float8, v.protein_100::float8, v.fat_100::float8, v.carbs_100::float8,
		       NOT EXISTS (SELECT 1 FROM `+recipeaccess.Join("pr", "pv")+`
		                   WHERE pr.id = i.recipe_id AND `+recipeaccess.Available("pr", "pv", "$2")+`)
		FROM meal_plan_items i JOIN recipe_versions v ON v.id = i.recipe_version_id
		WHERE i.plan_id = $1`, p.id, userID)
	if err != nil {
		return nil, fmt.Errorf("load plan items: %w", err)
	}
	defer func() { _ = rows.Close() }()
	p.items = map[string]*storedItem{}
	for rows.Next() {
		var it storedItem
		r := &it.recipe
		if err := rows.Scan(&it.mealType, &r.ID, &it.versionID, &it.grams, &it.locked, &it.manual,
			&it.name, &it.photoKey, &r.PortionGrams,
			&r.Per100.Kcal, &r.Per100.Protein, &r.Per100.Fat, &r.Per100.Carbs, &it.unavailable); err != nil {
			return nil, err
		}
		p.items[it.mealType] = &it
	}
	return &p, rows.Err()
}

func (s *Service) writeItems(ctx context.Context, tx *sql.Tx, planID string, items map[string]*storedItem) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM meal_plan_items WHERE plan_id = $1`, planID); err != nil {
		return fmt.Errorf("clear plan items: %w", err)
	}
	for _, m := range generator.MealTypes {
		it := items[m]
		if it == nil {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO meal_plan_items
				(plan_id, meal_type, recipe_id, recipe_version_id, grams, locked, manual_grams)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			planID, m, it.recipe.ID, it.versionID, it.grams, it.locked, it.manual); err != nil {
			return fmt.Errorf("write plan item: %w", err)
		}
	}
	return nil
}

// itemsFrom turns an assembled day into stored items at the candidates'
// current approved versions; flags come from keep (the dishes carried over).
func itemsFrom(plan generator.Plan, cat catalogue, keep map[string]*storedItem) map[string]*storedItem {
	out := map[string]*storedItem{}
	for _, it := range plan.Items {
		cand := cat.byID[it.Recipe.ID]
		si := &storedItem{
			mealType: it.MealType, recipe: it.Recipe, versionID: cand.versionID,
			name: cand.name, photoKey: cand.photoKey, grams: it.Grams, manual: it.Manual,
		}
		if k := keep[it.MealType]; k != nil && k.recipe.ID == it.Recipe.ID {
			si.locked = k.locked
		}
		out[it.MealType] = si
	}
	return out
}

// ---------------------------------------------------------------------------
// Get: assemble on first open
// ---------------------------------------------------------------------------

// Get returns the plan for the date, assembling and storing it on first open.
// Opening it again reads what was stored.
func (s *Service) Get(ctx context.Context, userID int64, rawDate string) (*MealPlan, error) {
	d, err := s.parseDate(ctx, userID, rawDate)
	if err != nil {
		return nil, err
	}
	p, err := s.ensure(ctx, userID, d)
	if err != nil {
		return nil, err
	}
	return s.render(ctx, userID, d, p)
}

// ensure returns the stored plan, assembling it first when there is none.
func (s *Service) ensure(ctx context.Context, userID int64, d day) (*storedPlan, error) {
	p, err := s.loadPlan(ctx, s.db, userID, d, false)
	if err != nil || p != nil {
		return p, err
	}

	t, err := s.requireTarget(ctx, userID, d)
	if err != nil {
		return nil, err
	}
	meals, err := s.mealTypes(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	cat, err := s.candidates(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	recent, err := s.recent(ctx, s.db, userID, d)
	if err != nil {
		return nil, err
	}
	seed := initialSeed(userID, d.key)
	in := generator.Input{Target: t.nutrition(), Recent: recent, Seed: seed}
	for _, m := range meals {
		in.Slots = append(in.Slots, generator.Slot{MealType: m, Candidates: cat.byMeal[m]})
	}
	items := itemsFrom(generator.Build(in), cat, nil)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin plan: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Два первых открытия одновременно: оба собрали день, вставит один.
	// Проигравший ждёт фиксации победителя на уникальном ключе и перечитывает
	// его план — с блюдами, потому что они вставлены в той же транзакции.
	var planID string
	err = tx.QueryRowContext(ctx, `
		INSERT INTO meal_plans (id, user_id, date, seed, meal_types,
		                        target_kcal, target_protein, target_fat, target_carbs)
		VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (user_id, date) DO NOTHING
		RETURNING id::text`,
		uuid.NewString(), userID, d.key, seed, meals, t.kcal, t.protein, t.fat, t.carbs).Scan(&planID)
	if errors.Is(err, sql.ErrNoRows) {
		_ = tx.Rollback()
		p, err := s.loadPlan(ctx, s.db, userID, d, false)
		if err == nil && p == nil {
			err = errPlanNotFound
		}
		return p, err
	}
	if err != nil {
		return nil, fmt.Errorf("insert plan: %w", err)
	}
	if err := s.writeItems(ctx, tx, planID, items); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit plan: %w", err)
	}
	return s.loadPlan(ctx, s.db, userID, d, false)
}

// ---------------------------------------------------------------------------
// Regenerate
// ---------------------------------------------------------------------------

// Regenerate assembles the day again with a new seed, the current settings and
// the current target. Locked and manual dishes stay unless they became
// unavailable; the day just shown loses to any other.
func (s *Service) Regenerate(ctx context.Context, userID int64, rawDate string) (*MealPlan, error) {
	d, err := s.parseDate(ctx, userID, rawDate)
	if err != nil {
		return nil, err
	}
	if _, err := s.ensure(ctx, userID, d); err != nil {
		return nil, err
	}
	t, err := s.requireTarget(ctx, userID, d)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin regenerate: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	p, err := s.loadPlan(ctx, tx, userID, d, true)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errPlanNotFound
	}
	meals, err := s.mealTypes(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	cat, err := s.candidates(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	recent, err := s.recent(ctx, tx, userID, d)
	if err != nil {
		return nil, err
	}

	seed := s.newSeed()
	in := generator.Input{Target: t.nutrition(), Recent: recent, Seed: seed, Avoid: map[string]string{}}
	for _, it := range p.items {
		in.Avoid[it.mealType] = it.recipe.ID
	}
	for _, m := range meals {
		slot := generator.Slot{MealType: m, Candidates: cat.byMeal[m]}
		// Закреплённое и ручное блюдо остаются — по текущей одобренной версии,
		// если рецепт всё ещё доступен и подходит к приёму. Недоступное
		// вытесняется даже закреплённым.
		if it := p.items[m]; it != nil && (it.locked || it.manual) && cat.suits(it.recipe.ID, m) {
			r := cat.byID[it.recipe.ID].recipe
			slot.Recipe = &r
			if it.manual {
				slot.Grams = it.grams
			}
		}
		in.Slots = append(in.Slots, slot)
	}
	items := itemsFrom(generator.Build(in), cat, p.items)

	if _, err := tx.ExecContext(ctx, `
		UPDATE meal_plans SET seed = $2, meal_types = $3, target_kcal = $4, target_protein = $5,
		       target_fat = $6, target_carbs = $7, updated_at = NOW()
		WHERE id = $1`, p.id, seed, meals, t.kcal, t.protein, t.fat, t.carbs); err != nil {
		return nil, fmt.Errorf("update plan: %w", err)
	}
	if err := s.writeItems(ctx, tx, p.id, items); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit regenerate: %w", err)
	}
	return s.reload(ctx, userID, d)
}

func (s *Service) reload(ctx context.Context, userID int64, d day) (*MealPlan, error) {
	p, err := s.loadPlan(ctx, s.db, userID, d, false)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errPlanNotFound
	}
	return s.render(ctx, userID, d, p)
}

// ---------------------------------------------------------------------------
// Editing one dish
// ---------------------------------------------------------------------------

func validMealType(m string) error {
	if !slices.Contains(generator.MealTypes, m) {
		return validation("unknown meal type %q", m)
	}
	return nil
}

// fixedSlots are the plan's meals with every dish fixed and free weights
// refitted — the shape of "keep the dishes, fit the weights".
func fixedSlots(p *storedPlan) []generator.Slot {
	out := []generator.Slot{}
	for _, m := range p.mealTypes {
		slot := generator.Slot{MealType: m}
		if it := p.items[m]; it != nil {
			r := it.recipe
			slot.Recipe = &r
			if it.manual {
				slot.Grams = it.grams
			}
		}
		out = append(out, slot)
	}
	return out
}

// UpdateItem replaces, locks or weighs one dish and refits the free weights
// of the day to the plan's target.
func (s *Service) UpdateItem(ctx context.Context, userID int64, rawDate, mealType string, in ItemUpdate) (*MealPlan, error) {
	d, err := s.parseDate(ctx, userID, rawDate)
	if err != nil {
		return nil, err
	}
	if err := validMealType(mealType); err != nil {
		return nil, err
	}
	grams := 0
	if in.Grams != nil {
		g := math.Round(*in.Grams)
		if g <= 0 || g > MaxManualGrams {
			return nil, validation("grams must be between 1 and %d", MaxManualGrams)
		}
		grams = int(g)
	}
	if _, err := s.ensure(ctx, userID, d); err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	p, err := s.loadPlan(ctx, tx, userID, d, true)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errPlanNotFound
	}
	if !slices.Contains(p.mealTypes, mealType) {
		return nil, validation("meal %q is not in this plan", mealType)
	}

	it := p.items[mealType]
	if in.RecipeID != nil {
		cat, err := s.candidates(ctx, tx, userID)
		if err != nil {
			return nil, err
		}
		cand, ok := cat.byID[*in.RecipeID]
		if !ok {
			return nil, validation("recipe is not available")
		}
		if !slices.Contains(cand.mealTypes, mealType) {
			return nil, validation("recipe does not suit %s", mealType)
		}
		replaced := &storedItem{
			mealType: mealType, recipe: cand.recipe, versionID: cand.versionID,
			name: cand.name, photoKey: cand.photoKey,
		}
		if it != nil {
			replaced.locked = it.locked
		}
		it = replaced
		p.items[mealType] = it
	}
	if it == nil {
		return nil, validation("meal %q has no dish to change", mealType)
	}
	if in.Grams != nil {
		it.grams, it.manual = grams, true
	}
	if in.ResetGrams {
		it.manual = false
	}
	if in.Locked != nil {
		it.locked = *in.Locked
	}

	plan := generator.Build(generator.Input{Target: p.target.nutrition(), Slots: fixedSlots(p)})
	for _, fitted := range plan.Items {
		p.items[fitted.MealType].grams = fitted.Grams
	}
	if _, err := tx.ExecContext(ctx, `UPDATE meal_plans SET updated_at = NOW() WHERE id = $1`, p.id); err != nil {
		return nil, fmt.Errorf("touch plan: %w", err)
	}
	if err := s.writeItems(ctx, tx, p.id, p.items); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update: %w", err)
	}
	return s.reload(ctx, userID, d)
}

// Alternatives offers up to five replacements for one dish, each with the
// weights of the day's free dishes refitted.
func (s *Service) Alternatives(ctx context.Context, userID int64, rawDate, mealType string) ([]Alternative, error) {
	d, err := s.parseDate(ctx, userID, rawDate)
	if err != nil {
		return nil, err
	}
	if err := validMealType(mealType); err != nil {
		return nil, err
	}
	p, err := s.ensure(ctx, userID, d)
	if err != nil {
		return nil, err
	}
	if !slices.Contains(p.mealTypes, mealType) {
		return nil, validation("meal %q is not in this plan", mealType)
	}
	cat, err := s.candidates(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	recent, err := s.recent(ctx, s.db, userID, d)
	if err != nil {
		return nil, err
	}

	slots := fixedSlots(p)
	for i := range slots {
		if slots[i].MealType == mealType {
			slots[i].Candidates = cat.byMeal[mealType]
		}
	}
	alts := generator.Alternatives(generator.Input{Target: p.target.nutrition(), Slots: slots, Recent: recent},
		mealType, generator.AlternativesLimit)
	out := make([]Alternative, 0, len(alts))
	for _, a := range alts {
		cand := cat.byID[a.Recipe.ID]
		out = append(out, Alternative{
			RecipeID: a.Recipe.ID, Name: cand.name, PhotoURL: s.photoURL(cand.photoKey),
			Grams: a.Grams, Nutrition: rounded(a.Nutrition), DayTotals: rounded(a.DayTotals),
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

func (s *Service) photoURL(key *string) *string {
	if key == nil || s.photos == nil {
		return nil
	}
	u := s.photos.PublicURL(*key)
	return &u
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

func rounded(n generator.Nutrition) Nutrition {
	return Nutrition{Kcal: round1(n.Kcal), Protein: round1(n.Protein), Fat: round1(n.Fat), Carbs: round1(n.Carbs)}
}

func pct(v, of float64) int {
	if of <= 0 {
		return 0
	}
	return int(math.Round(v / of * 100))
}

func percentOf(n, t generator.Nutrition) Percent {
	return Percent{Kcal: pct(n.Kcal, t.Kcal), Protein: pct(n.Protein, t.Protein),
		Fat: pct(n.Fat, t.Fat), Carbs: pct(n.Carbs, t.Carbs)}
}

// calorieSplit is the share of calories from protein, fat and carbs (4/9/4
// kcal per gram), in whole percent summing to exactly 100: largest remainder.
func calorieSplit(n generator.Nutrition) CalorieSplit {
	parts := [3]float64{4 * n.Protein, 9 * n.Fat, 4 * n.Carbs}
	total := parts[0] + parts[1] + parts[2]
	if total <= 0 {
		return CalorieSplit{}
	}
	var whole [3]int
	type rem struct {
		i int
		r float64
	}
	rems := make([]rem, 3)
	sum := 0
	for i, p := range parts {
		exact := p / total * 100
		whole[i] = int(math.Floor(exact))
		sum += whole[i]
		rems[i] = rem{i, exact - float64(whole[i])}
	}
	slices.SortStableFunc(rems, func(a, b rem) int {
		switch {
		case a.r > b.r:
			return -1
		case a.r < b.r:
			return 1
		}
		return a.i - b.i
	})
	for k := 0; sum < 100; k++ {
		whole[rems[k%3].i]++
		sum++
	}
	return CalorieSplit{Protein: whole[0], Fat: whole[1], Carbs: whole[2]}
}

// render builds the answer: dishes, totals against the plan's target, and
// whether the target has moved since the plan was built.
func (s *Service) render(ctx context.Context, userID int64, d day, p *storedPlan) (*MealPlan, error) {
	tgt := p.target.nutrition()
	out := &MealPlan{
		Date: d.key, MealTypes: p.mealTypes, Target: rounded(tgt),
		Items: []PlanItem{}, Empty: []EmptySlot{}, Deviations: []Deviation{},
	}

	// Цель могла измениться после сборки. План от этого не меняется; ответ
	// только помечает. Нельзя посчитать сейчас — не с чем сравнить.
	current, err := s.currentTarget(ctx, userID, d)
	if err != nil {
		return nil, err
	}
	out.TargetChanged = current != nil && *current != p.target

	var totals generator.Nutrition
	for _, m := range p.mealTypes {
		it := p.items[m]
		if it == nil {
			out.Empty = append(out.Empty, EmptySlot{MealType: m, Reason: ReasonNoRecipes})
			continue
		}
		n := generator.For(it.recipe.Per100, it.grams)
		totals = generator.Nutrition{Kcal: totals.Kcal + n.Kcal, Protein: totals.Protein + n.Protein,
			Fat: totals.Fat + n.Fat, Carbs: totals.Carbs + n.Carbs}
		out.Items = append(out.Items, PlanItem{
			MealType: m, RecipeID: it.recipe.ID, RecipeVersionID: it.versionID, Name: it.name,
			PhotoURL: s.photoURL(it.photoKey), Grams: it.grams, PortionGrams: it.recipe.PortionGrams,
			Nutrition: rounded(n), PercentOfTarget: percentOf(n, tgt),
			Locked: it.locked, ManualGrams: it.manual, Unavailable: it.unavailable,
		})
	}
	out.Totals = rounded(totals)
	out.PercentOfTarget = percentOf(totals, tgt)
	out.Remaining = rounded(generator.Nutrition{Kcal: tgt.Kcal - totals.Kcal, Protein: tgt.Protein - totals.Protein,
		Fat: tgt.Fat - totals.Fat, Carbs: tgt.Carbs - totals.Carbs})
	out.CalorieSplit = calorieSplit(totals)
	for _, dv := range generator.Deviations(tgt, totals) {
		out.Deviations = append(out.Deviations, Deviation{Nutrient: dv.Nutrient, Delta: dv.Delta})
	}
	return out, nil
}
