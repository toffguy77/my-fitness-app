package recipes

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/recipeaccess"
	"github.com/google/uuid"
)

// FoodCatalogue is the part of food-tracker the catalogue needs.
type FoodCatalogue interface {
	EnsureCatalogueFood(ctx context.Context, foodID string) (*foodtracker.CatalogueFood, error)
	SearchCatalogue(ctx context.Context, query string, limit int) ([]foodtracker.CatalogueFood, error)
}

// PhotoStore is the public content bucket.
type PhotoStore interface {
	UploadPublicFile(ctx context.Context, key string, data io.Reader, contentType string, fileSize int64) (string, error)
	PublicURL(key string) string
}

// Service is the recipe catalogue.
type Service struct {
	db     *database.DB
	log    *logger.Logger
	foods  FoodCatalogue
	photos PhotoStore
	vv     *VkusvillClient
	cache  *recipeCache
	// fetchImage downloads a source photo; replaced in tests.
	fetchImage func(ctx context.Context, url string) ([]byte, error)
}

// NewService builds the service. photos and vv may be nil: the capabilities
// that need them answer 503.
func NewService(db *database.DB, log *logger.Logger, foods FoodCatalogue, photos PhotoStore, vv *VkusvillClient) *Service {
	return &Service{
		db: db, log: log, foods: foods, photos: photos, vv: vv,
		cache:      newRecipeCache(30 * time.Minute),
		fetchImage: fetchVkusvillImage,
	}
}

// MissingFieldsError lists what a version lacks to go to review.
type MissingFieldsError struct{ Missing []string }

func (e *MissingFieldsError) Error() string {
	return "recipe is incomplete: " + strings.Join(e.Missing, ", ")
}

// Unwrap makes it an ErrValidation for errors.Is.
func (e *MissingFieldsError) Unwrap() error { return apperrors.ErrValidation }

func validation(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{apperrors.ErrValidation}, args...)...)
}

var (
	errRecipeNotFound = fmt.Errorf("%w: recipe", apperrors.ErrNotFound)
	errWrongState     = fmt.Errorf("%w: version is not in the required state", apperrors.ErrConflict)
	errPhotosOff      = fmt.Errorf("%w: recipe photo storage is not configured", apperrors.ErrFeatureUnavailable)
	errImportOff      = fmt.Errorf("%w: recipe import is not configured", apperrors.ErrFeatureUnavailable)
)

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// ---------------------------------------------------------------------------
// Preparing a version for storage
// ---------------------------------------------------------------------------

type preparedIngredient struct {
	FoodID          *string
	SourceName      *string
	Grams           *float64
	DisplayQuantity *string
	ToTaste         bool
	Per100          Nutrition
	Candidates      []Candidate
}

type preparedStep struct {
	Text     string
	PhotoKey *string
}

type preparedVersion struct {
	Name, Description string
	PhotoKey          *string
	CookMinutes       int
	Complexity        string
	Servings          int
	YieldGrams        *float64
	MealTypes         []string
	Tags              []string
	Allergens         []string
	Ingredients       []preparedIngredient
	Steps             []preparedStep
	Nutrition         NutritionResult
}

func trimmedPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func validPhotoKey(key *string) (*string, error) {
	key = trimmedPtr(key)
	if key == nil {
		return nil, nil
	}
	// Только наши ключи: фото рецепта — объект публичного хранилища, и чужая
	// строка здесь превратилась бы в ссылку куда угодно.
	if !strings.HasPrefix(*key, PhotoPrefix) || strings.Contains(*key, "..") {
		return nil, validation("photo_key must be a recipe photo")
	}
	return key, nil
}

func uniqueStrings(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// prepare validates the input, normalises every food id through the catalogue
// and computes nutrition. Nothing the caller says about КБЖУ is read: there is
// no such field to read.
func (s *Service) prepare(ctx context.Context, in VersionInput) (*preparedVersion, error) {
	v := &preparedVersion{
		Name:        strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description),
		CookMinutes: in.CookMinutes,
		Complexity:  in.Complexity,
		Servings:    in.Servings,
		YieldGrams:  in.YieldGrams,
		MealTypes:   uniqueStrings(in.MealTypes),
		Tags:        uniqueStrings(in.Tags),
		Allergens:   uniqueStrings(in.Allergens),
	}
	if v.Complexity == "" {
		v.Complexity = "easy"
	}
	if !contains(Complexities, v.Complexity) {
		return nil, validation("unknown complexity %q", v.Complexity)
	}
	if v.Servings == 0 {
		v.Servings = 1
	}
	if v.Servings < 1 {
		return nil, validation("servings must be at least 1")
	}
	if v.CookMinutes < 0 {
		return nil, validation("cook_minutes must not be negative")
	}
	if v.YieldGrams != nil && *v.YieldGrams <= 0 {
		v.YieldGrams = nil
	}
	for _, m := range v.MealTypes {
		if !contains(MealTypes, m) {
			return nil, validation("unknown meal type %q", m)
		}
	}
	for _, a := range v.Allergens {
		if !contains(Allergens, a) {
			return nil, validation("unknown allergen %q", a)
		}
	}
	var err error
	if v.PhotoKey, err = validPhotoKey(in.PhotoKey); err != nil {
		return nil, err
	}

	for _, st := range in.Steps {
		text := strings.TrimSpace(st.Text)
		key, err := validPhotoKey(st.PhotoKey)
		if err != nil {
			return nil, err
		}
		if text == "" && key == nil {
			continue
		}
		v.Steps = append(v.Steps, preparedStep{Text: text, PhotoKey: key})
	}

	var calc []NutritionIngredient
	for _, ing := range in.Ingredients {
		p := preparedIngredient{
			SourceName:      trimmedPtr(ing.SourceName),
			DisplayQuantity: trimmedPtr(ing.DisplayQuantity),
			ToTaste:         ing.ToTaste,
			Grams:           ing.Grams,
		}
		if p.ToTaste {
			p.Grams = nil
		} else if p.Grams != nil && *p.Grams <= 0 {
			return nil, validation("ingredient grams must be positive")
		}
		if ing.FoodID.Value != nil {
			food, err := s.foods.EnsureCatalogueFood(ctx, *ing.FoodID.Value)
			if err != nil {
				if errors.Is(err, apperrors.ErrValidation) {
					return nil, validation("product %s is not in the catalogue", *ing.FoodID.Value)
				}
				return nil, err
			}
			id := food.FoodID
			p.FoodID = &id
			p.Per100 = Nutrition{Kcal: food.Kcal100, Protein: food.Protein100, Fat: food.Fat100, Carbs: food.Carbs100}
		} else if p.SourceName == nil {
			return nil, validation("ingredient needs a product or a source name")
		}
		if p.FoodID != nil && p.Grams != nil {
			calc = append(calc, NutritionIngredient{Per100: p.Per100, Grams: *p.Grams})
		}
		v.Ingredients = append(v.Ingredients, p)
	}

	v.Nutrition = ComputeNutrition(calc, v.YieldGrams, v.Servings)
	return v, nil
}

// missingFields is what stops a version from going to review.
func missingFields(v *RecipeVersion) []string {
	var missing []string
	if strings.TrimSpace(v.Name) == "" {
		missing = append(missing, "name")
	}
	if len(v.Ingredients) == 0 {
		missing = append(missing, "ingredients")
	}
	if len(v.Steps) == 0 {
		missing = append(missing, "steps")
	}
	if len(v.MealTypes) == 0 {
		missing = append(missing, "meal_types")
	}
	unconfirmed, unweighed := false, false
	for _, ing := range v.Ingredients {
		if ing.FoodID == nil {
			unconfirmed = true
		} else if !ing.ToTaste && ing.Grams == nil {
			unweighed = true
		}
	}
	if unconfirmed {
		missing = append(missing, "ingredients.food_id")
	}
	if unweighed {
		missing = append(missing, "ingredients.grams")
	}
	return missing
}

// writeVersion stores content into a version that is still in work. The state
// guard sits in the UPDATE itself: an approved or superseded version is never
// changed, whoever asks.
func writeVersion(ctx context.Context, tx *sql.Tx, versionID string, userID int64, v *preparedVersion) error {
	res, err := tx.ExecContext(ctx, `
		UPDATE recipe_versions SET
			name = $2, description = $3, photo_key = $4, cook_minutes = $5, complexity = $6,
			servings = $7, yield_grams = $8, meal_types = $9, tags = $10, allergens = $11,
			kcal_100 = $12, protein_100 = $13, fat_100 = $14, carbs_100 = $15,
			total_grams = $16, portion_grams = $17, approximate = $18,
			edited_by = $19, updated_at = NOW()
		WHERE id = $1 AND state IN ('draft', 'review')`,
		versionID, v.Name, v.Description, v.PhotoKey, v.CookMinutes, v.Complexity,
		v.Servings, v.YieldGrams, nonNil(v.MealTypes), nonNil(v.Tags), nonNil(v.Allergens),
		v.Nutrition.Per100.Kcal, v.Nutrition.Per100.Protein, v.Nutrition.Per100.Fat, v.Nutrition.Per100.Carbs,
		v.Nutrition.TotalGrams, v.Nutrition.PortionGrams, v.Nutrition.Approximate, nullableUser(userID))
	if err != nil {
		return fmt.Errorf("update version: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errWrongState
	}

	// Кандидаты из импорта переживают сохранение, пока ингредиент с тем же
	// исходным названием не подтверждён: редактор их не присылает.
	candidates := map[string][]byte{}
	rows, err := tx.QueryContext(ctx,
		`SELECT source_name, candidates::text FROM recipe_ingredients
		 WHERE version_id = $1 AND source_name IS NOT NULL AND candidates IS NOT NULL`, versionID)
	if err != nil {
		return fmt.Errorf("read candidates: %w", err)
	}
	for rows.Next() {
		var name, raw string
		if err := rows.Scan(&name, &raw); err != nil {
			_ = rows.Close()
			return err
		}
		candidates[name] = []byte(raw)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_ingredients WHERE version_id = $1`, versionID); err != nil {
		return fmt.Errorf("clear ingredients: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_steps WHERE version_id = $1`, versionID); err != nil {
		return fmt.Errorf("clear steps: %w", err)
	}

	for i, ing := range v.Ingredients {
		var cand any
		if ing.FoodID == nil {
			if len(ing.Candidates) > 0 {
				raw, err := json.Marshal(ing.Candidates)
				if err != nil {
					return err
				}
				cand = string(raw)
			} else if ing.SourceName != nil {
				if raw, ok := candidates[*ing.SourceName]; ok {
					cand = string(raw)
				}
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO recipe_ingredients
				(version_id, position, food_id, source_name, grams, display_quantity, to_taste, candidates)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
			versionID, i+1, ing.FoodID, ing.SourceName, ing.Grams, ing.DisplayQuantity, ing.ToTaste, cand); err != nil {
			return fmt.Errorf("insert ingredient: %w", err)
		}
	}
	for i, st := range v.Steps {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO recipe_steps (version_id, position, text, photo_key) VALUES ($1, $2, $3, $4)`,
			versionID, i+1, st.Text, st.PhotoKey); err != nil {
			return fmt.Errorf("insert step: %w", err)
		}
	}
	return nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func nullableUser(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

func (s *Service) photoURL(key *string) *string {
	if key == nil || s.photos == nil {
		return nil
	}
	url := s.photos.PublicURL(*key)
	return &url
}

func decodeStrings(raw []byte) []string {
	out := []string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	if out == nil {
		out = []string{}
	}
	return out
}

const versionColumns = `
	v.id::text, v.recipe_id::text, v.version, v.state, v.name, v.description, v.photo_key,
	v.cook_minutes, v.complexity, v.servings, v.yield_grams::float8, v.total_grams::float8,
	v.portion_grams::float8, v.approximate, to_json(v.meal_types)::text, to_json(v.tags)::text,
	to_json(v.allergens)::text, v.kcal_100::float8, v.protein_100::float8, v.fat_100::float8,
	v.carbs_100::float8, v.review_comment, v.approved_at, v.created_at`

func (s *Service) scanVersion(row interface{ Scan(...any) error }) (*RecipeVersion, error) {
	var v RecipeVersion
	var meals, tags, allergens string
	if err := row.Scan(&v.ID, &v.RecipeID, &v.Version, &v.State, &v.Name, &v.Description, &v.PhotoKey,
		&v.CookMinutes, &v.Complexity, &v.Servings, &v.YieldGrams, &v.TotalGrams,
		&v.PortionGrams, &v.Approximate, &meals, &tags, &allergens,
		&v.Per100g.Kcal, &v.Per100g.Protein, &v.Per100g.Fat, &v.Per100g.Carbs,
		&v.ReviewComment, &v.ApprovedAt, &v.CreatedAt); err != nil {
		return nil, err
	}
	v.MealTypes = decodeStrings([]byte(meals))
	v.Tags = decodeStrings([]byte(tags))
	v.Allergens = decodeStrings([]byte(allergens))
	v.PerPortion = portion(v.Per100g, v.PortionGrams)
	v.PhotoURL = s.photoURL(v.PhotoKey)
	return &v, nil
}

// loadVersion reads one version with its ingredients and steps; nil when the
// condition matches nothing.
func (s *Service) loadVersion(ctx context.Context, q queryer, where string, args ...any) (*RecipeVersion, error) {
	v, err := s.scanVersion(q.QueryRowContext(ctx,
		`SELECT `+versionColumns+` FROM recipe_versions v WHERE `+where, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load version: %w", err)
	}

	rows, err := q.QueryContext(ctx, `
		SELECT i.position, i.food_id::text, f.name, i.source_name, i.grams::float8,
		       i.display_quantity, i.to_taste, i.candidates::text
		FROM recipe_ingredients i
		LEFT JOIN food_items f ON f.id = i.food_id
		WHERE i.version_id = $1 ORDER BY i.position`, v.ID)
	if err != nil {
		return nil, fmt.Errorf("load ingredients: %w", err)
	}
	v.Ingredients = []Ingredient{}
	for rows.Next() {
		var ing Ingredient
		var cand *string
		if err := rows.Scan(&ing.Position, &ing.FoodID, &ing.FoodName, &ing.SourceName, &ing.Grams,
			&ing.DisplayQuantity, &ing.ToTaste, &cand); err != nil {
			_ = rows.Close()
			return nil, err
		}
		if cand != nil && ing.FoodID == nil {
			_ = json.Unmarshal([]byte(*cand), &ing.Candidates)
		}
		v.Ingredients = append(v.Ingredients, ing)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = q.QueryContext(ctx,
		`SELECT position, text, photo_key FROM recipe_steps WHERE version_id = $1 ORDER BY position`, v.ID)
	if err != nil {
		return nil, fmt.Errorf("load steps: %w", err)
	}
	defer func() { _ = rows.Close() }()
	v.Steps = []Step{}
	for rows.Next() {
		var st Step
		if err := rows.Scan(&st.Position, &st.Text, &st.PhotoKey); err != nil {
			return nil, err
		}
		st.PhotoURL = s.photoURL(st.PhotoKey)
		v.Steps = append(v.Steps, st)
	}
	return v, rows.Err()
}

// summaryColumns read a summary from recipe r and its display version v.
const summaryColumns = `
	r.id::text, r.status, r.source, v.name, v.photo_key, v.cook_minutes, v.complexity,
	to_json(v.meal_types)::text, v.portion_grams::float8, v.kcal_100::float8,
	v.protein_100::float8, v.fat_100::float8, v.carbs_100::float8, v.approximate,
	(SELECT a.version FROM recipe_versions a WHERE a.recipe_id = r.id AND a.state = 'approved'),
	(SELECT w.state FROM recipe_versions w WHERE w.recipe_id = r.id AND w.state IN ('draft', 'review')),
	COUNT(*) OVER ()`

// latestVersion joins each recipe with its newest version: the working one
// when there is one, the approved one otherwise.
const latestVersion = `recipes r JOIN LATERAL (
	SELECT * FROM recipe_versions x WHERE x.recipe_id = r.id ORDER BY x.version DESC LIMIT 1
) v ON true`

func (s *Service) scanSummaries(rows *sql.Rows) ([]RecipeSummary, int, error) {
	defer func() { _ = rows.Close() }()
	items := []RecipeSummary{}
	total := 0
	for rows.Next() {
		var r RecipeSummary
		var meals string
		var per100 Nutrition
		if err := rows.Scan(&r.ID, &r.Status, &r.Source, &r.Name, &r.PhotoKey, &r.CookMinutes,
			&r.Complexity, &meals, &r.PortionGrams, &per100.Kcal, &per100.Protein, &per100.Fat,
			&per100.Carbs, &r.Approximate, &r.ApprovedVersion, &r.WorkingState, &total); err != nil {
			return nil, 0, err
		}
		r.MealTypes = decodeStrings([]byte(meals))
		r.PerPortion = portion(per100, r.PortionGrams)
		r.PhotoURL = s.photoURL(r.PhotoKey)
		items = append(items, r)
	}
	return items, total, rows.Err()
}

func (s *Service) summary(ctx context.Context, q queryer, recipeID string) (*RecipeSummary, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+latestVersion+` WHERE r.id = $1`, recipeID)
	if err != nil {
		return nil, fmt.Errorf("load summary: %w", err)
	}
	items, _, err := s.scanSummaries(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errRecipeNotFound
	}
	return &items[0], nil
}

func validRecipeID(id string) bool {
	_, err := uuid.Parse(id)
	return err == nil
}

// ---------------------------------------------------------------------------
// Team: create, edit, submit, publish
// ---------------------------------------------------------------------------

// ListAdmin lists every recipe by its newest version. state is one of
// draft|review (working version state) or published|unpublished (status).
func (s *Service) ListAdmin(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error) {
	switch q.State {
	case "", StateDraft, StateReview, StatusPublished, StatusUnpublished:
	default:
		return nil, 0, validation("unknown state %q", q.State)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+latestVersion+`
		WHERE ($1 = '' OR v.name ILIKE '%' || $1 || '%')
		  AND ($4 = ''
		       OR ($4 IN ('draft', 'review') AND EXISTS (
		              SELECT 1 FROM recipe_versions w WHERE w.recipe_id = r.id AND w.state = $4))
		       OR ($4 IN ('published', 'unpublished') AND r.status = $4))
		ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
		strings.TrimSpace(q.Q), q.Limit, q.Offset, q.State)
	if err != nil {
		return nil, 0, fmt.Errorf("list recipes: %w", err)
	}
	return s.scanSummaries(rows)
}

// Create makes a recipe with version 1 as a draft.
func (s *Service) Create(ctx context.Context, userID int64, in VersionInput) (*RecipeSummary, *RecipeVersion, error) {
	prepared, err := s.prepare(ctx, in)
	if err != nil {
		return nil, nil, err
	}
	recipeID, versionID, err := s.insertRecipe(ctx, userID, SourceManual, nil, prepared)
	if err != nil {
		return nil, nil, err
	}
	_ = recipeID
	version, err := s.loadVersion(ctx, s.db, `v.id = $1`, versionID)
	if err != nil {
		return nil, nil, err
	}
	sum, err := s.summary(ctx, s.db, version.RecipeID)
	if err != nil {
		return nil, nil, err
	}
	return sum, version, nil
}

// insertRecipe stores a new recipe and its first version in one transaction.
// A clash on source_ref (two imports of one VkusVill recipe at once) comes back
// as ErrConflict.
func (s *Service) insertRecipe(ctx context.Context, userID int64, source string, sourceRef *string, v *preparedVersion) (string, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer func() { _ = tx.Rollback() }()

	var recipeID, versionID string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO recipes (source, source_ref, created_by) VALUES ($1, $2, $3)
		 ON CONFLICT (source_ref) DO NOTHING RETURNING id::text`,
		source, sourceRef, nullableUser(userID)).Scan(&recipeID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", fmt.Errorf("%w: recipe with this source already exists", apperrors.ErrConflict)
	}
	if err != nil {
		return "", "", fmt.Errorf("insert recipe: %w", err)
	}
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO recipe_versions (recipe_id, version, state) VALUES ($1, 1, 'draft') RETURNING id::text`,
		recipeID).Scan(&versionID); err != nil {
		return "", "", fmt.Errorf("insert version: %w", err)
	}
	if err := writeVersion(ctx, tx, versionID, userID, v); err != nil {
		return "", "", err
	}
	return recipeID, versionID, tx.Commit()
}

// Detail returns the recipe with its approved and working versions.
func (s *Service) Detail(ctx context.Context, recipeID string) (*RecipeDetail, error) {
	if !validRecipeID(recipeID) {
		return nil, errRecipeNotFound
	}
	sum, err := s.summary(ctx, s.db, recipeID)
	if err != nil {
		return nil, err
	}
	approved, err := s.loadVersion(ctx, s.db, `v.recipe_id = $1 AND v.state = 'approved'`, recipeID)
	if err != nil {
		return nil, err
	}
	working, err := s.loadVersion(ctx, s.db, `v.recipe_id = $1 AND v.state IN ('draft', 'review')`, recipeID)
	if err != nil {
		return nil, err
	}
	return &RecipeDetail{Recipe: *sum, Approved: approved, Working: working}, nil
}

// lockRecipe serialises changes to one recipe's versions.
func lockRecipe(ctx context.Context, tx *sql.Tx, recipeID string) error {
	if !validRecipeID(recipeID) {
		return errRecipeNotFound
	}
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id::text FROM recipes WHERE id = $1 FOR UPDATE`, recipeID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return errRecipeNotFound
	}
	return err
}

func workingVersion(ctx context.Context, tx *sql.Tx, recipeID string) (id, state string, err error) {
	err = tx.QueryRowContext(ctx,
		`SELECT id::text, state FROM recipe_versions WHERE recipe_id = $1 AND state IN ('draft', 'review')`,
		recipeID).Scan(&id, &state)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return id, state, err
}

// SaveDraft edits the working version, or starts one from the approved version.
//
// There is at most one version in work: editing a recipe whose version is
// already in draft or review edits that one. A version under review goes back
// to draft — what the curator reviews must be what they approve. An approved
// version is never touched; a new one is created instead, so clients keep
// seeing the approved one until the new one is approved.
func (s *Service) SaveDraft(ctx context.Context, userID int64, recipeID string, in VersionInput) (*RecipeVersion, error) {
	prepared, err := s.prepare(ctx, in)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := lockRecipe(ctx, tx, recipeID); err != nil {
		return nil, err
	}
	versionID, _, err := workingVersion(ctx, tx, recipeID)
	if err != nil {
		return nil, err
	}
	if versionID == "" {
		if err := tx.QueryRowContext(ctx, `
			INSERT INTO recipe_versions (recipe_id, version, state)
			SELECT $1, COALESCE(MAX(version), 0) + 1, 'draft' FROM recipe_versions WHERE recipe_id = $1
			RETURNING id::text`, recipeID).Scan(&versionID); err != nil {
			return nil, fmt.Errorf("start new version: %w", err)
		}
	} else if _, err := tx.ExecContext(ctx,
		`UPDATE recipe_versions SET state = 'draft' WHERE id = $1 AND state = 'review'`, versionID); err != nil {
		return nil, err
	}
	if err := writeVersion(ctx, tx, versionID, userID, prepared); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET updated_at = NOW() WHERE id = $1`, recipeID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.loadVersion(ctx, s.db, `v.id = $1`, versionID)
}

// Submit sends the working draft to review, if it is complete.
func (s *Service) Submit(ctx context.Context, recipeID string) (*RecipeVersion, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := lockRecipe(ctx, tx, recipeID); err != nil {
		return nil, err
	}
	version, err := s.loadVersion(ctx, tx, `v.recipe_id = $1 AND v.state = 'draft'`, recipeID)
	if err != nil {
		return nil, err
	}
	if version == nil {
		return nil, errWrongState
	}
	if missing := missingFields(version); len(missing) > 0 {
		return nil, &MissingFieldsError{Missing: missing}
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE recipe_versions SET state = 'review', review_comment = NULL, updated_at = NOW()
		 WHERE id = $1 AND state = 'draft'`, version.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.loadVersion(ctx, s.db, `v.id = $1`, version.ID)
}

// SetStatus publishes or unpublishes a recipe. Versions are kept either way.
func (s *Service) SetStatus(ctx context.Context, recipeID, status string) (*RecipeSummary, error) {
	if !validRecipeID(recipeID) {
		return nil, errRecipeNotFound
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE recipes SET status = $2, updated_at = NOW() WHERE id = $1`, recipeID, status)
	if err != nil {
		return nil, fmt.Errorf("set status: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errRecipeNotFound
	}
	return s.summary(ctx, s.db, recipeID)
}

// SearchCatalogue proposes products for an ingredient — shared catalogue only.
func (s *Service) SearchCatalogue(ctx context.Context, q string) ([]foodtracker.CatalogueFood, error) {
	return s.foods.SearchCatalogue(ctx, q, 20)
}

// ---------------------------------------------------------------------------
// Curator: review queue, approval, return
// ---------------------------------------------------------------------------

// ListReview is the queue: recipes whose working version is in review.
func (s *Service) ListReview(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+latestVersion+
		` WHERE v.state = 'review' ORDER BY v.updated_at LIMIT $1 OFFSET $2`, q.Limit, q.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list review queue: %w", err)
	}
	return s.scanSummaries(rows)
}

// ListPublished lists published recipes by their approved version — what a
// curator picks from to hide a recipe from a client.
func (s *Service) ListPublished(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+recipeaccess.Join("r", "v")+`
		WHERE r.status = 'published' AND ($1 = '' OR v.name ILIKE '%' || $1 || '%')
		ORDER BY v.name LIMIT $2 OFFSET $3`, strings.TrimSpace(q.Q), q.Limit, q.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list published: %w", err)
	}
	return s.scanSummaries(rows)
}

// Approve approves the version under review, optionally applying the curator's
// edits first. The previous approved version becomes superseded in the same
// transaction — demoted first, because the unique index allows one approved
// version per recipe at any moment.
func (s *Service) Approve(ctx context.Context, curatorID int64, recipeID string, edits *VersionInput) (*RecipeVersion, error) {
	var prepared *preparedVersion
	if edits != nil {
		var err error
		if prepared, err = s.prepare(ctx, *edits); err != nil {
			return nil, err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := lockRecipe(ctx, tx, recipeID); err != nil {
		return nil, err
	}
	versionID, state, err := workingVersion(ctx, tx, recipeID)
	if err != nil {
		return nil, err
	}
	if state != StateReview {
		return nil, errWrongState
	}
	if prepared != nil {
		if err := writeVersion(ctx, tx, versionID, curatorID, prepared); err != nil {
			return nil, err
		}
		edited, err := s.loadVersion(ctx, tx, `v.id = $1`, versionID)
		if err != nil {
			return nil, err
		}
		if missing := missingFields(edited); len(missing) > 0 {
			return nil, &MissingFieldsError{Missing: missing}
		}
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE recipe_versions SET state = 'superseded', updated_at = NOW()
		 WHERE recipe_id = $1 AND state = 'approved'`, recipeID); err != nil {
		return nil, fmt.Errorf("supersede previous version: %w", err)
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE recipe_versions SET state = 'approved', approved_by = $2, approved_at = NOW(),
		        review_comment = NULL, updated_at = NOW()
		 WHERE id = $1 AND state = 'review'`, versionID, curatorID)
	if err != nil {
		return nil, fmt.Errorf("approve version: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errWrongState
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.loadVersion(ctx, s.db, `v.id = $1`, versionID)
}

// Return sends the version under review back to the team with a comment.
func (s *Service) Return(ctx context.Context, curatorID int64, recipeID, comment string) (*RecipeVersion, error) {
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return nil, validation("a comment is required to return a recipe")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := lockRecipe(ctx, tx, recipeID); err != nil {
		return nil, err
	}
	versionID, state, err := workingVersion(ctx, tx, recipeID)
	if err != nil {
		return nil, err
	}
	if state != StateReview {
		return nil, errWrongState
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE recipe_versions SET state = 'draft', review_comment = $2, updated_at = NOW()
		 WHERE id = $1 AND state = 'review'`, versionID, comment); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	_ = curatorID
	return s.loadVersion(ctx, s.db, `v.id = $1`, versionID)
}

// ---------------------------------------------------------------------------
// Client: catalogue, card, rejection
// ---------------------------------------------------------------------------

// ListAvailable is the client's catalogue: only what recipeaccess allows.
func (s *Service) ListAvailable(ctx context.Context, userID int64, q ListQuery) ([]RecipeSummary, int, error) {
	if q.MealType != "" && !contains(MealTypes, q.MealType) {
		return nil, 0, validation("unknown meal type %q", q.MealType)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+recipeaccess.Join("r", "v")+`
		WHERE `+recipeaccess.Available("r", "v", "$1")+`
		  AND ($2 = '' OR v.name ILIKE '%' || $2 || '%')
		  AND ($3 = '' OR $3 = ANY(v.meal_types))
		ORDER BY v.approved_at DESC NULLS LAST, v.name LIMIT $4 OFFSET $5`,
		userID, strings.TrimSpace(q.Q), q.MealType, q.Limit, q.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list available recipes: %w", err)
	}
	items, total, err := s.scanSummaries(rows)
	for i := range items {
		// Состояние работы команды клиенту ни к чему.
		items[i].WorkingState = nil
	}
	return items, total, err
}

// GetAvailable is the client's card: the approved version, or not found when
// the recipe is not available to this client for any reason.
func (s *Service) GetAvailable(ctx context.Context, userID int64, recipeID string) (*RecipeVersion, error) {
	if !validRecipeID(recipeID) {
		return nil, errRecipeNotFound
	}
	var versionID string
	err := s.db.QueryRowContext(ctx, `SELECT v.id::text FROM `+recipeaccess.Join("r", "v")+`
		WHERE r.id = $2 AND `+recipeaccess.Available("r", "v", "$1"), userID, recipeID).Scan(&versionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errRecipeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load available recipe: %w", err)
	}
	v, err := s.loadVersion(ctx, s.db, `v.id = $1`, versionID)
	if err != nil {
		return nil, err
	}
	for i := range v.Ingredients {
		v.Ingredients[i].Candidates = nil
	}
	v.ReviewComment = nil
	return v, nil
}

// recipeExists answers whether a recipe is one a client could ever be shown:
// published, with an approved version. Drafts and unpublished recipes answer
// "not found" — otherwise rejecting or hiding by id would tell a client which
// unreleased recipes exist.
func (s *Service) recipeExists(ctx context.Context, recipeID string) error {
	if !validRecipeID(recipeID) {
		return errRecipeNotFound
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS (
		     SELECT 1 FROM recipes r
		     JOIN recipe_versions v ON v.recipe_id = r.id AND v.state = 'approved'
		     WHERE r.id = $1 AND r.status = 'published')`, recipeID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return errRecipeNotFound
	}
	return nil
}

// Reject hides a recipe from the client at their own request.
func (s *Service) Reject(ctx context.Context, userID int64, recipeID string) error {
	if err := s.recipeExists(ctx, recipeID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO user_rejected_recipes (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, recipeID)
	return err
}

// Unreject brings a rejected recipe back. Idempotent.
func (s *Service) Unreject(ctx context.Context, userID int64, recipeID string) error {
	if !validRecipeID(recipeID) {
		return errRecipeNotFound
	}
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM user_rejected_recipes WHERE user_id = $1 AND recipe_id = $2`, userID, recipeID)
	return err
}

// ---------------------------------------------------------------------------
// Restrictions and curator hiding
// ---------------------------------------------------------------------------

func recipeRefs(ctx context.Context, q queryer, table, column string, userID int64) ([]RecipeRef, error) {
	rows, err := q.QueryContext(ctx, fmt.Sprintf(`
		SELECT r.id::text, v.name FROM %s x
		JOIN recipes r ON r.id = x.recipe_id
		JOIN LATERAL (SELECT name FROM recipe_versions lv WHERE lv.recipe_id = r.id
		              ORDER BY lv.version DESC LIMIT 1) v ON true
		WHERE x.%s = $1 ORDER BY v.name`, table, column), userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []RecipeRef{}
	for rows.Next() {
		var ref RecipeRef
		if err := rows.Scan(&ref.ID, &ref.Name); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

// Restrictions reads a client's restrictions. The client sees what they
// rejected; their curator sees what was hidden from them.
func (s *Service) Restrictions(ctx context.Context, userID int64, forCurator bool) (*FoodRestrictions, error) {
	out := &FoodRestrictions{Allergens: []string{}, ExcludedFoods: []FoodRef{}, RejectedRecipes: []RecipeRef{}}

	var raw string
	err := s.db.QueryRowContext(ctx,
		`SELECT to_json(allergens)::text FROM user_food_restrictions WHERE user_id = $1`, userID).Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("load allergens: %w", err)
	}
	out.Allergens = decodeStrings([]byte(raw))

	rows, err := s.db.QueryContext(ctx, `
		SELECT f.id::text, f.name FROM user_excluded_foods e JOIN food_items f ON f.id = e.food_id
		WHERE e.user_id = $1 ORDER BY f.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("load excluded foods: %w", err)
	}
	for rows.Next() {
		var f FoodRef
		if err := rows.Scan(&f.FoodID, &f.Name); err != nil {
			_ = rows.Close()
			return nil, err
		}
		out.ExcludedFoods = append(out.ExcludedFoods, f)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if forCurator {
		if out.HiddenRecipes, err = recipeRefs(ctx, s.db, "client_hidden_recipes", "client_id", userID); err != nil {
			return nil, fmt.Errorf("load hidden recipes: %w", err)
		}
		return out, nil
	}
	if out.RejectedRecipes, err = recipeRefs(ctx, s.db, "user_rejected_recipes", "user_id", userID); err != nil {
		return nil, fmt.Errorf("load rejected recipes: %w", err)
	}
	return out, nil
}

// SetRestrictions replaces a client's allergens and excluded foods.
func (s *Service) SetRestrictions(ctx context.Context, userID int64, in RestrictionsInput, forCurator bool) (*FoodRestrictions, error) {
	allergens := uniqueStrings(in.Allergens)
	for _, a := range allergens {
		if !contains(Allergens, a) {
			return nil, validation("unknown allergen %q", a)
		}
	}
	var foodIDs []string
	seen := map[string]bool{}
	for _, raw := range in.ExcludedFoodIDs {
		if raw.Value == nil {
			continue
		}
		food, err := s.foods.EnsureCatalogueFood(ctx, *raw.Value)
		if err != nil {
			if errors.Is(err, apperrors.ErrValidation) {
				return nil, validation("product %s is not in the catalogue", *raw.Value)
			}
			return nil, err
		}
		if !seen[food.FoodID] {
			seen[food.FoodID] = true
			foodIDs = append(foodIDs, food.FoodID)
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_food_restrictions (user_id, allergens, updated_at) VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE SET allergens = EXCLUDED.allergens, updated_at = NOW()`,
		userID, allergens); err != nil {
		return nil, fmt.Errorf("save allergens: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_excluded_foods WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	for _, id := range foodIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO user_excluded_foods (user_id, food_id) VALUES ($1, $2)`, userID, id); err != nil {
			return nil, fmt.Errorf("save excluded food: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Restrictions(ctx, userID, forCurator)
}

// ListHidden lists recipes a curator hid from a client.
func (s *Service) ListHidden(ctx context.Context, clientID int64) ([]RecipeSummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+summaryColumns+` FROM `+latestVersion+`
		JOIN client_hidden_recipes h ON h.recipe_id = r.id AND h.client_id = $1
		ORDER BY v.name`, clientID)
	if err != nil {
		return nil, fmt.Errorf("list hidden recipes: %w", err)
	}
	items, _, err := s.scanSummaries(rows)
	return items, err
}

// Hide hides a recipe from one client.
func (s *Service) Hide(ctx context.Context, curatorID, clientID int64, recipeID string) error {
	if err := s.recipeExists(ctx, recipeID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO client_hidden_recipes (client_id, recipe_id, hidden_by) VALUES ($1, $2, $3)
		ON CONFLICT (client_id, recipe_id) DO NOTHING`, clientID, recipeID, curatorID)
	return err
}

// Unhide returns a hidden recipe to the client. Idempotent.
func (s *Service) Unhide(ctx context.Context, clientID int64, recipeID string) error {
	if !validRecipeID(recipeID) {
		return errRecipeNotFound
	}
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM client_hidden_recipes WHERE client_id = $1 AND recipe_id = $2`, clientID, recipeID)
	return err
}
