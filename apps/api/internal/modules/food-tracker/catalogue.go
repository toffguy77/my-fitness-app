package foodtracker

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/google/uuid"
)

// CatalogueFood is a product of the shared catalogue, as other modules see it:
// the recipe catalogue takes ingredients and exclusions from here.
type CatalogueFood struct {
	// FoodID is in the form search returns it: the products number as a
	// string, or a food_items UUID. EnsureCatalogueFood always returns a UUID.
	FoodID        string   `json:"food_id"`
	Name          string   `json:"name"`
	Kcal100       float64  `json:"kcal_100"`
	Protein100    float64  `json:"protein_100"`
	Fat100        float64  `json:"fat_100"`
	Carbs100      float64  `json:"carbs_100"`
	DefaultWeight *float64 `json:"default_weight"`
}

// ErrNotCatalogueFood: the id names nothing in the shared catalogue — it does
// not exist, or it is somebody's personal food. Wraps ErrValidation, because
// for the caller it is bad input, not a missing resource of theirs.
var ErrNotCatalogueFood = fmt.Errorf("%w: not a catalogue food", apperrors.ErrValidation)

// EnsureCatalogueFood normalises an id from catalogue search into a food_items
// UUID, copying a products row over if needed — the same path diary entries
// take through ensureFoodItemExists, so there is no second way of matching.
//
// Unlike getFoodItemByID it refuses personal foods: neither user_foods nor
// food_items with source 'user' may become an ingredient of a recipe everyone
// sees, or a client's exclusion that a recipe can match.
func (s *Service) EnsureCatalogueFood(ctx context.Context, foodID string) (*CatalogueFood, error) {
	foodID = strings.TrimSpace(foodID)
	if _, err := uuid.Parse(foodID); err == nil {
		food := CatalogueFood{FoodID: foodID}
		err := s.db.QueryRowContext(ctx, `
			SELECT name, COALESCE(calories_per_100, 0), COALESCE(protein_per_100, 0),
			       COALESCE(fat_per_100, 0), COALESCE(carbs_per_100, 0), default_weight
			FROM food_items
			WHERE id = $1 AND COALESCE(source, 'database') <> 'user'`, foodID).Scan(
			&food.Name, &food.Kcal100, &food.Protein100, &food.Fat100, &food.Carbs100, &food.DefaultWeight)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotCatalogueFood
		}
		if err != nil {
			return nil, fmt.Errorf("look up catalogue food: %w", err)
		}
		return &food, nil
	}

	if _, err := strconv.ParseInt(foodID, 10, 64); err != nil {
		return nil, ErrNotCatalogueFood
	}

	var item FoodItem
	var defaultWeight *float64
	err := s.db.QueryRowContext(ctx, `
		SELECT name, brand, COALESCE(category_id::text, ''),
		       COALESCE(calories, 0), COALESCE(proteins, 0), COALESCE(fats, 0), COALESCE(carbs, 0),
		       fiber, vendor_code, default_weight
		FROM products WHERE id = $1`, foodID).Scan(
		&item.Name, &item.Brand, &item.Category,
		&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
		&item.FiberPer100, &item.Barcode, &defaultWeight)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotCatalogueFood
	}
	if err != nil {
		return nil, fmt.Errorf("look up catalogue product: %w", err)
	}
	item.ServingSize = 100
	item.ServingUnit = "g"

	id, err := s.ensureFoodItemExists(ctx, foodID, &item)
	if err != nil {
		return nil, err
	}
	// ensureFoodItemExists не переносит вес штуки, а он нужен граммовке «N шт.».
	if defaultWeight != nil {
		if _, err := s.db.ExecContext(ctx,
			`UPDATE food_items SET default_weight = $2 WHERE id = $1 AND default_weight IS NULL`,
			id, *defaultWeight); err != nil {
			return nil, fmt.Errorf("copy default weight: %w", err)
		}
	}

	return &CatalogueFood{
		FoodID: id, Name: item.Name,
		Kcal100: item.CaloriesPer100, Protein100: item.ProteinPer100,
		Fat100: item.FatPer100, Carbs100: item.CarbsPer100,
		DefaultWeight: defaultWeight,
	}, nil
}

// SearchCatalogue searches the shared catalogue only: products and food_items
// whose source is not 'user'.
//
// SearchFoods mixes in the caller's user_foods, and falls back to other
// people's — right for a diary, wrong for a recipe: a staff member's personal
// food must not become an ingredient of a recipe for everyone.
func (s *Service) SearchCatalogue(ctx context.Context, query string, limit int) ([]CatalogueFood, error) {
	query = strings.TrimSpace(query)
	if len([]rune(query)) < 2 {
		return []CatalogueFood{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := s.db.QueryContext(ctx, `
		WITH matched AS (
			(SELECT id::text AS id, name,
			        COALESCE(calories, 0) AS kcal, COALESCE(proteins, 0) AS protein,
			        COALESCE(fats, 0) AS fat, COALESCE(carbs, 0) AS carbs,
			        default_weight,
			        ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			                plainto_tsquery('russian', $1)) AS rank,
			        CASE WHEN source = 'database' THEN 1 ELSE 2 END AS priority
			 FROM products
			 WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			    OR name ILIKE '%' || $1 || '%'
			 ORDER BY rank DESC
			 LIMIT 100)
			UNION ALL
			(SELECT id::text, name,
			        COALESCE(calories_per_100, 0), COALESCE(protein_per_100, 0),
			        COALESCE(fat_per_100, 0), COALESCE(carbs_per_100, 0),
			        default_weight,
			        ts_rank(search_vector, plainto_tsquery('russian', $1)),
			        CASE WHEN verified = true THEN 0 WHEN source = 'database' THEN 1 ELSE 2 END
			 FROM food_items
			 WHERE search_vector @@ plainto_tsquery('russian', $1)
			   AND COALESCE(source, 'database') <> 'user'
			 ORDER BY ts_rank(search_vector, plainto_tsquery('russian', $1)) DESC
			 LIMIT 100)
		)
		SELECT id, name, kcal, protein, fat, carbs, default_weight
		FROM matched
		ORDER BY CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END, priority, rank DESC, name
		LIMIT $2`, query, limit)
	if err != nil {
		return nil, fmt.Errorf("search catalogue: %w", err)
	}
	defer func() { _ = rows.Close() }()

	foods := []CatalogueFood{}
	for rows.Next() {
		var f CatalogueFood
		if err := rows.Scan(&f.FoodID, &f.Name, &f.Kcal100, &f.Protein100, &f.Fat100, &f.Carbs100,
			&f.DefaultWeight); err != nil {
			return nil, fmt.Errorf("scan catalogue food: %w", err)
		}
		foods = append(foods, f)
	}
	return foods, rows.Err()
}
