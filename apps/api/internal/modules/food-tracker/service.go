package foodtracker

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/openfoodfacts"
	"github.com/google/uuid"
)

// Service handles food tracker business logic
type Service struct {
	db        *database.DB
	log       *logger.Logger
	offClient *openfoodfacts.Client
}

// NewService creates a new food tracker service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{
		db:        db,
		log:       log,
		offClient: openfoodfacts.NewClient(),
	}
}

// ============================================================================
// Food Entries
// ============================================================================

// GetEntriesByDate retrieves food entries for a user on a specific date
// Returns entries grouped by meal type
func (s *Service) GetEntriesByDate(ctx context.Context, userID int64, date time.Time) (*GetEntriesResponse, error) {
	startTime := time.Now()

	// Format date as YYYY-MM-DD
	dateStr := date.Format("2006-01-02")

	query := `
		SELECT id, user_id, food_id, food_name, meal_type, portion_type, portion_amount,
		       calories, protein, fat, carbs, time, date, created_at, updated_at
		FROM food_entries
		WHERE user_id = $1 AND date = $2
		ORDER BY time ASC
	`

	rows, err := s.db.QueryContext(ctx, query, userID, dateStr)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    dateStr,
		})
		return nil, fmt.Errorf("ошибка при получении записей: %w", err)
	}
	defer rows.Close()

	// Initialize entries map with all meal types
	entries := map[MealType][]FoodEntry{
		MealBreakfast: {},
		MealLunch:     {},
		MealDinner:    {},
		MealSnack:     {},
	}

	for rows.Next() {
		var entry FoodEntry
		err := rows.Scan(
			&entry.ID,
			&entry.UserID,
			&entry.FoodID,
			&entry.FoodName,
			&entry.MealType,
			&entry.PortionType,
			&entry.PortionAmount,
			&entry.Calories,
			&entry.Protein,
			&entry.Fat,
			&entry.Carbs,
			&entry.Time,
			&entry.Date,
			&entry.CreatedAt,
			&entry.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan food entry", "error", err)
			return nil, fmt.Errorf("ошибка при чтении записи: %w", err)
		}

		// Populate Nutrition from individual fields
		entry.PopulateNutrition()

		// Add to appropriate meal type
		entries[entry.MealType] = append(entries[entry.MealType], entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке записей: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"date":    dateStr,
	})

	// Calculate daily totals
	dailyTotals := s.calculateTotalsFromEntries(entries)

	// Get user goals
	targetGoals, err := s.GetUserGoals(ctx, userID)
	if err != nil {
		s.log.Warn("Failed to get user goals", "error", err, "user_id", userID)
		// Continue without goals - not a critical error
	}

	return &GetEntriesResponse{
		Entries:     entries,
		DailyTotals: dailyTotals,
		TargetGoals: targetGoals,
	}, nil
}

// CreateEntry creates a new food entry with КБЖУ calculation
func (s *Service) CreateEntry(ctx context.Context, userID int64, req *CreateEntryRequest) (*FoodEntry, error) {
	startTime := time.Now()

	// Validate request
	if err := req.Validate(); err != nil {
		return nil, err
	}

	// Look up food item to get nutrition data
	foodItem, err := s.getFoodItemByID(ctx, req.FoodID)
	if err != nil {
		return nil, err
	}

	// Ensure food item exists in food_items table (copies from products table if needed)
	foodItemID, err := s.ensureFoodItemExists(ctx, req.FoodID, foodItem)
	if err != nil {
		return nil, err
	}

	// Use overrides if provided, otherwise calculate from DB
	foodName := foodItem.Name
	if req.FoodName != nil {
		foodName = *req.FoodName
	}

	nutrition := s.CalculateKBZHU(foodItem.NutritionPer100, req.PortionAmount)
	if req.Calories != nil {
		nutrition.Calories = *req.Calories
	}
	if req.Protein != nil {
		nutrition.Protein = *req.Protein
	}
	if req.Fat != nil {
		nutrition.Fat = *req.Fat
	}
	if req.Carbs != nil {
		nutrition.Carbs = *req.Carbs
	}

	// Generate UUID for new entry
	entryID := uuid.New().String()

	// Insert entry
	query := `
		INSERT INTO food_entries (
			id, user_id, food_id, food_name, meal_type, portion_type, portion_amount,
			calories, protein, fat, carbs, time, date, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
		RETURNING id, user_id, food_id, food_name, meal_type, portion_type, portion_amount,
		          calories, protein, fat, carbs, time, date, created_at, updated_at
	`

	var entry FoodEntry
	err = s.db.QueryRowContext(
		ctx,
		query,
		entryID,
		userID,
		foodItemID,
		foodName,
		req.MealType,
		req.PortionType,
		req.PortionAmount,
		nutrition.Calories,
		nutrition.Protein,
		nutrition.Fat,
		nutrition.Carbs,
		req.Time,
		req.Date,
	).Scan(
		&entry.ID,
		&entry.UserID,
		&entry.FoodID,
		&entry.FoodName,
		&entry.MealType,
		&entry.PortionType,
		&entry.PortionAmount,
		&entry.Calories,
		&entry.Protein,
		&entry.Fat,
		&entry.Carbs,
		&entry.Time,
		&entry.Date,
		&entry.CreatedAt,
		&entry.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"food_id": req.FoodID,
		})
		return nil, fmt.Errorf("ошибка при создании записи: %w", err)
	}

	// Populate Nutrition from individual fields
	entry.PopulateNutrition()

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":  userID,
		"entry_id": entry.ID,
		"food_id":  req.FoodID,
	})

	s.log.LogBusinessEvent("food_entry_created", map[string]interface{}{
		"entry_id":  entry.ID,
		"user_id":   userID,
		"food_id":   req.FoodID,
		"meal_type": req.MealType,
		"calories":  nutrition.Calories,
	})

	return &entry, nil
}

// UpdateEntry updates an existing food entry with validation and ownership check
func (s *Service) UpdateEntry(ctx context.Context, userID int64, entryID string, req *UpdateEntryRequest) (*FoodEntry, error) {
	startTime := time.Now()

	// Validate request
	if err := req.Validate(); err != nil {
		return nil, err
	}

	// Get existing entry and verify ownership
	existing, err := s.getEntryByID(ctx, entryID)
	if err != nil {
		return nil, err
	}

	// Verify ownership
	if existing.UserID != userID {
		return nil, fmt.Errorf("нет доступа к этой записи")
	}

	// Apply updates
	if req.MealType != nil {
		existing.MealType = *req.MealType
	}
	if req.PortionType != nil {
		existing.PortionType = *req.PortionType
	}
	if req.Time != nil {
		existing.Time = *req.Time
	}
	if req.FoodName != nil {
		existing.FoodName = *req.FoodName
	}

	// Handle nutrition: direct overrides take priority, otherwise recalculate if portion changed
	if req.Calories != nil || req.Protein != nil || req.Fat != nil || req.Carbs != nil {
		// Direct nutrition overrides
		if req.Calories != nil {
			existing.Calories = *req.Calories
		}
		if req.Protein != nil {
			existing.Protein = *req.Protein
		}
		if req.Fat != nil {
			existing.Fat = *req.Fat
		}
		if req.Carbs != nil {
			existing.Carbs = *req.Carbs
		}
		if req.PortionAmount != nil {
			existing.PortionAmount = *req.PortionAmount
		}
	} else if req.PortionAmount != nil && *req.PortionAmount != existing.PortionAmount {
		// No direct overrides — recalculate from DB if portion changed
		existing.PortionAmount = *req.PortionAmount

		// Get food item to recalculate nutrition
		foodItem, err := s.getFoodItemByID(ctx, existing.FoodID)
		if err != nil {
			return nil, err
		}

		// Recalculate КБЖУ
		nutrition := s.CalculateKBZHU(foodItem.NutritionPer100, existing.PortionAmount)
		existing.Calories = nutrition.Calories
		existing.Protein = nutrition.Protein
		existing.Fat = nutrition.Fat
		existing.Carbs = nutrition.Carbs
	}

	// Update entry
	query := `
		UPDATE food_entries
		SET meal_type = $1, portion_type = $2, portion_amount = $3,
		    calories = $4, protein = $5, fat = $6, carbs = $7, time = $8, food_name = $9, updated_at = NOW()
		WHERE id = $10 AND user_id = $11
		RETURNING id, user_id, food_id, food_name, meal_type, portion_type, portion_amount,
		          calories, protein, fat, carbs, time, date, created_at, updated_at
	`

	var entry FoodEntry
	err = s.db.QueryRowContext(
		ctx,
		query,
		existing.MealType,
		existing.PortionType,
		existing.PortionAmount,
		existing.Calories,
		existing.Protein,
		existing.Fat,
		existing.Carbs,
		existing.Time,
		existing.FoodName,
		entryID,
		userID,
	).Scan(
		&entry.ID,
		&entry.UserID,
		&entry.FoodID,
		&entry.FoodName,
		&entry.MealType,
		&entry.PortionType,
		&entry.PortionAmount,
		&entry.Calories,
		&entry.Protein,
		&entry.Fat,
		&entry.Carbs,
		&entry.Time,
		&entry.Date,
		&entry.CreatedAt,
		&entry.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":  userID,
			"entry_id": entryID,
		})
		return nil, fmt.Errorf("ошибка при обновлении записи: %w", err)
	}

	// Populate Nutrition from individual fields
	entry.PopulateNutrition()

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":  userID,
		"entry_id": entryID,
	})

	s.log.LogBusinessEvent("food_entry_updated", map[string]interface{}{
		"entry_id": entry.ID,
		"user_id":  userID,
	})

	return &entry, nil
}

// DeleteEntry deletes a food entry with ownership check
func (s *Service) DeleteEntry(ctx context.Context, userID int64, entryID string) error {
	startTime := time.Now()

	// Validate entry ID
	if _, err := uuid.Parse(entryID); err != nil {
		return fmt.Errorf("неверный формат идентификатора записи")
	}

	// Delete entry with ownership check
	query := `
		DELETE FROM food_entries
		WHERE id = $1 AND user_id = $2
	`

	result, err := s.db.ExecContext(ctx, query, entryID, userID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":  userID,
			"entry_id": entryID,
		})
		return fmt.Errorf("ошибка при удалении записи: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("ошибка при проверке удаления: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("запись не найдена")
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":  userID,
		"entry_id": entryID,
	})

	s.log.LogBusinessEvent("food_entry_deleted", map[string]interface{}{
		"entry_id": entryID,
		"user_id":  userID,
	})

	return nil
}

// ============================================================================
// КБЖУ Calculations
// ============================================================================

// CalculateKBZHU calculates КБЖУ values based on portion amount
// Formula: calculatedKBZHU = (nutritionPer100 * portionAmount) / 100
func (s *Service) CalculateKBZHU(nutritionPer100 KBZHU, portionAmount float64) KBZHU {
	return KBZHU{
		Calories: roundToOneDecimal((nutritionPer100.Calories * portionAmount) / 100),
		Protein:  roundToOneDecimal((nutritionPer100.Protein * portionAmount) / 100),
		Fat:      roundToOneDecimal((nutritionPer100.Fat * portionAmount) / 100),
		Carbs:    roundToOneDecimal((nutritionPer100.Carbs * portionAmount) / 100),
	}
}

// CalculateDailyTotals calculates total КБЖУ for all entries on a given date
func (s *Service) CalculateDailyTotals(ctx context.Context, userID int64, date time.Time) (*KBZHU, error) {
	startTime := time.Now()

	dateStr := date.Format("2006-01-02")

	query := `
		SELECT COALESCE(SUM(calories), 0), COALESCE(SUM(protein), 0),
		       COALESCE(SUM(fat), 0), COALESCE(SUM(carbs), 0)
		FROM food_entries
		WHERE user_id = $1 AND date = $2
	`

	var totals KBZHU
	err := s.db.QueryRowContext(ctx, query, userID, dateStr).Scan(
		&totals.Calories,
		&totals.Protein,
		&totals.Fat,
		&totals.Carbs,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    dateStr,
		})
		return nil, fmt.Errorf("ошибка при расчёте дневных итогов: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":  userID,
		"date":     dateStr,
		"calories": totals.Calories,
	})

	return &totals, nil
}

// GetUserGoals retrieves user's target КБЖУ goals
// Returns goals from active weekly plan or default values
func (s *Service) GetUserGoals(ctx context.Context, userID int64) (*KBZHU, error) {
	startTime := time.Now()

	// Try to get goals from active weekly plan
	query := `
		SELECT calories_goal, protein_goal, fat_goal, carbs_goal
		FROM weekly_plans
		WHERE user_id = $1 AND is_active = true AND end_date >= CURRENT_DATE
		ORDER BY start_date DESC
		LIMIT 1
	`

	var caloriesGoal int
	var proteinGoal int
	var fatGoal *int
	var carbsGoal *int

	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&caloriesGoal,
		&proteinGoal,
		&fatGoal,
		&carbsGoal,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// No active plan - return nil (no goals set)
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"user_id": userID,
				"found":   false,
			})
			return nil, nil
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("ошибка при получении целей: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"found":   true,
	})

	goals := &KBZHU{
		Calories: float64(caloriesGoal),
		Protein:  float64(proteinGoal),
	}

	if fatGoal != nil {
		goals.Fat = float64(*fatGoal)
	}
	if carbsGoal != nil {
		goals.Carbs = float64(*carbsGoal)
	}

	return goals, nil
}

// ============================================================================
// Helper Methods
// ============================================================================

// getFoodItemByID retrieves a food item by ID.
// Checks food_items (UUID) first, then falls back to products table (integer ID).
func (s *Service) getFoodItemByID(ctx context.Context, foodID string) (*FoodItem, error) {
	startTime := time.Now()

	// Try food_items table first (UUID IDs)
	if _, err := uuid.Parse(foodID); err == nil {
		query := `
			SELECT id, name, brand, category, serving_size, serving_unit,
			       calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			       fiber_per_100, sugar_per_100, sodium_per_100, barcode, source, verified,
			       created_at, updated_at
			FROM food_items
			WHERE id = $1
		`

		var item FoodItem
		err := s.db.QueryRowContext(ctx, query, foodID).Scan(
			&item.ID, &item.Name, &item.Brand, &item.Category,
			&item.ServingSize, &item.ServingUnit,
			&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
			&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
			&item.Barcode, &item.Source, &item.Verified,
			&item.CreatedAt, &item.UpdatedAt,
		)

		if err == nil {
			item.PopulateNutrition()
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"food_id": foodID, "found": true, "table": "food_items",
			})
			return &item, nil
		}
		if err != sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"food_id": foodID,
			})
			return nil, fmt.Errorf("ошибка при получении продукта: %w", err)
		}
		// Not found in food_items — fall through to products
	}

	// Try products table (integer IDs)
	query := `
		SELECT id::text, name, brand,
		       COALESCE(category_id::text, '') AS category,
		       100.0 AS serving_size, 'г' AS serving_unit,
		       COALESCE(calories, 0), COALESCE(proteins, 0),
		       COALESCE(fats, 0), COALESCE(carbs, 0),
		       fiber, NULL::numeric, NULL::numeric,
		       vendor_code, COALESCE(source, 'database'), false,
		       COALESCE(created_at, NOW()), COALESCE(created_at, NOW())
		FROM products
		WHERE id::text = $1
	`

	var item FoodItem
	err := s.db.QueryRowContext(ctx, query, foodID).Scan(
		&item.ID, &item.Name, &item.Brand, &item.Category,
		&item.ServingSize, &item.ServingUnit,
		&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
		&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
		&item.Barcode, &item.Source, &item.Verified,
		&item.CreatedAt, &item.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"food_id": foodID,
			})
			return nil, fmt.Errorf("продукт не найден")
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"food_id": foodID,
		})
		return nil, fmt.Errorf("ошибка при получении продукта: %w", err)
	}

	item.PopulateNutrition()

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"food_id": foodID, "found": true, "table": "products",
	})

	return &item, nil
}

// ensureFoodItemExists ensures the food item exists in food_items table.
// For products table items (non-UUID IDs), copies them to food_items with a deterministic UUID.
// Returns the food_items UUID to use for food_entries.
func (s *Service) ensureFoodItemExists(ctx context.Context, foodID string, item *FoodItem) (string, error) {
	// If already a valid UUID, it's already in food_items
	if _, err := uuid.Parse(foodID); err == nil {
		return foodID, nil
	}

	// Generate deterministic UUID from product ID so the same product always gets the same UUID
	newUUID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte("product:"+foodID)).String()

	query := `
		INSERT INTO food_items (
			id, name, brand, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			fiber_per_100, sugar_per_100, sodium_per_100, barcode, source, verified,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`

	_, err := s.db.ExecContext(ctx, query,
		newUUID,
		item.Name,
		item.Brand,
		item.Category,
		item.ServingSize,
		item.ServingUnit,
		item.CaloriesPer100,
		item.ProteinPer100,
		item.FatPer100,
		item.CarbsPer100,
		item.FiberPer100,
		item.SugarPer100,
		item.SodiumPer100,
		item.Barcode,
		item.Source,
		item.Verified,
	)
	if err != nil {
		return "", fmt.Errorf("ошибка при копировании продукта в food_items: %w", err)
	}

	s.log.LogBusinessEvent("product_copied_to_food_items", map[string]interface{}{
		"product_id":    foodID,
		"food_item_id":  newUUID,
	})

	return newUUID, nil
}

// getEntryByID retrieves a food entry by ID
func (s *Service) getEntryByID(ctx context.Context, entryID string) (*FoodEntry, error) {
	startTime := time.Now()

	// Validate entry ID
	if _, err := uuid.Parse(entryID); err != nil {
		return nil, fmt.Errorf("неверный формат идентификатора записи")
	}

	query := `
		SELECT id, user_id, food_id, food_name, meal_type, portion_type, portion_amount,
		       calories, protein, fat, carbs, time, date, created_at, updated_at
		FROM food_entries
		WHERE id = $1
	`

	var entry FoodEntry
	err := s.db.QueryRowContext(ctx, query, entryID).Scan(
		&entry.ID,
		&entry.UserID,
		&entry.FoodID,
		&entry.FoodName,
		&entry.MealType,
		&entry.PortionType,
		&entry.PortionAmount,
		&entry.Calories,
		&entry.Protein,
		&entry.Fat,
		&entry.Carbs,
		&entry.Time,
		&entry.Date,
		&entry.CreatedAt,
		&entry.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"entry_id": entryID,
			})
			return nil, fmt.Errorf("запись не найдена")
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"entry_id": entryID,
		})
		return nil, fmt.Errorf("ошибка при получении записи: %w", err)
	}

	// Populate Nutrition from individual fields
	entry.PopulateNutrition()

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"entry_id": entryID,
		"found":    true,
	})

	return &entry, nil
}

// calculateTotalsFromEntries calculates daily totals from entries map
func (s *Service) calculateTotalsFromEntries(entries map[MealType][]FoodEntry) KBZHU {
	var totals KBZHU

	for _, mealEntries := range entries {
		for _, entry := range mealEntries {
			totals.Calories += entry.Calories
			totals.Protein += entry.Protein
			totals.Fat += entry.Fat
			totals.Carbs += entry.Carbs
		}
	}

	// Round to one decimal place
	totals.Calories = roundToOneDecimal(totals.Calories)
	totals.Protein = roundToOneDecimal(totals.Protein)
	totals.Fat = roundToOneDecimal(totals.Fat)
	totals.Carbs = roundToOneDecimal(totals.Carbs)

	return totals
}

// roundToOneDecimal rounds a float64 to one decimal place
func roundToOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

// ============================================================================
// Food Search
// ============================================================================

// SearchFoods searches for food items with fuzzy matching (Russian language support)
func (s *Service) SearchFoods(ctx context.Context, query string, limit int, offset int) (*SearchFoodsResponse, error) {
	startTime := time.Now()

	// Validate query
	if len(query) < 2 {
		return nil, fmt.Errorf("поисковый запрос должен содержать минимум 2 символа")
	}

	// Default and max limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Search the products table (main food database) with FTS + ILIKE on name/brand
	sqlQuery := `
		WITH matched AS (
			SELECT id::text AS id, name, brand,
			       COALESCE(category_id::text, '') AS category,
			       100.0 AS serving_size, 'г' AS serving_unit,
			       COALESCE(calories, 0) AS calories_per_100,
			       COALESCE(proteins, 0) AS protein_per_100,
			       COALESCE(fats, 0) AS fat_per_100,
			       COALESCE(carbs, 0) AS carbs_per_100,
			       fiber AS fiber_per_100,
			       NULL::numeric AS sugar_per_100,
			       NULL::numeric AS sodium_per_100,
			       vendor_code AS barcode,
			       COALESCE(source, 'database') AS source,
			       false AS verified,
			       COALESCE(created_at, NOW()) AS created_at,
			       COALESCE(created_at, NOW()) AS updated_at,
			       ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) AS rank
			FROM products
			WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			   OR name ILIKE '%' || $1 || '%'
			   OR brand ILIKE '%' || $1 || '%'
		)
		SELECT *, COUNT(*) OVER() AS total_count
		FROM matched
		ORDER BY
			CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END,
			rank DESC,
			name ASC
		LIMIT $2 OFFSET $3
	`

	rows, err := s.db.QueryContext(ctx, sqlQuery, query, limit, offset)
	if err != nil {
		s.log.LogDatabaseQuery(sqlQuery, time.Since(startTime), err, map[string]interface{}{
			"query":  query,
			"limit":  limit,
			"offset": offset,
		})
		return nil, fmt.Errorf("ошибка при поиске продуктов: %w", err)
	}
	defer rows.Close()

	foods := make([]FoodItem, 0)
	var totalCount int
	for rows.Next() {
		var item FoodItem
		var rank float64
		err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Brand,
			&item.Category,
			&item.ServingSize,
			&item.ServingUnit,
			&item.CaloriesPer100,
			&item.ProteinPer100,
			&item.FatPer100,
			&item.CarbsPer100,
			&item.FiberPer100,
			&item.SugarPer100,
			&item.SodiumPer100,
			&item.Barcode,
			&item.Source,
			&item.Verified,
			&item.CreatedAt,
			&item.UpdatedAt,
			&rank,
			&totalCount,
		)
		if err != nil {
			s.log.Error("Failed to scan food item", "error", err)
			continue
		}
		item.PopulateNutrition()
		foods = append(foods, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке результатов поиска: %w", err)
	}

	s.log.LogDatabaseQuery(sqlQuery, time.Since(startTime), nil, map[string]interface{}{
		"query":   query,
		"limit":   limit,
		"offset":  offset,
		"results": len(foods),
		"total":   totalCount,
	})

	return &SearchFoodsResponse{
		Foods: foods,
		Total: totalCount,
	}, nil
}

// LookupBarcode looks up a food item by barcode with cascade:
// local DB → cache (with sliding TTL) → OpenFoodFacts API
func (s *Service) LookupBarcode(ctx context.Context, barcode string) (*BarcodeResponse, error) {
	if barcode == "" {
		return nil, fmt.Errorf("штрих-код обязателен")
	}

	// 1. Check local food_items table
	food, err := s.getFoodByBarcode(ctx, barcode)
	if err == nil {
		return &BarcodeResponse{Found: true, Food: food, Cached: false}, nil
	}

	// 2. Check barcode_cache with sliding TTL
	cacheQuery := `
		SELECT food_data FROM barcode_cache
		WHERE barcode = $1 AND expires_at > NOW()
	`
	var foodData string
	err = s.db.QueryRowContext(ctx, cacheQuery, barcode).Scan(&foodData)
	if err == nil {
		// Cache hit — extend TTL (sliding expiration)
		extendQuery := `UPDATE barcode_cache SET expires_at = NOW() + INTERVAL '90 days' WHERE barcode = $1`
		_, _ = s.db.ExecContext(ctx, extendQuery, barcode)

		// Try to get the food item (cache stores reference, item was saved to food_items)
		food, err := s.getFoodByBarcode(ctx, barcode)
		if err == nil {
			return &BarcodeResponse{Found: true, Food: food, Cached: true}, nil
		}
	}

	// 3. Call OpenFoodFacts API
	product, err := s.offClient.LookupBarcode(ctx, barcode)
	if err != nil {
		s.log.Warn("OpenFoodFacts lookup failed", "error", err, "barcode", barcode)
	}
	if product != nil {
		// Save to food_items + cache
		foodItem := s.saveOFFProduct(ctx, barcode, product)
		if foodItem != nil {
			s.cacheBarcode(ctx, barcode, foodItem)
			return &BarcodeResponse{Found: true, Food: foodItem, Cached: false}, nil
		}
	}

	// Not found anywhere
	message := "Продукт не найден. Попробуйте ввести вручную."
	return &BarcodeResponse{Found: false, Cached: false, Message: &message}, nil
}

// saveOFFProduct saves an OpenFoodFacts product to the food_items table
func (s *Service) saveOFFProduct(ctx context.Context, barcode string, product *openfoodfacts.Product) *FoodItem {
	id := uuid.New().String()
	query := `
		INSERT INTO food_items (id, name, brand, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			barcode, source, verified, created_at, updated_at)
		VALUES ($1, $2, $3, 'imported', 100, 'г', $4, $5, $6, $7, $8, 'openfoodfacts', false, NOW(), NOW())
		ON CONFLICT (barcode) DO UPDATE SET
			name = EXCLUDED.name, brand = EXCLUDED.brand,
			calories_per_100 = EXCLUDED.calories_per_100, protein_per_100 = EXCLUDED.protein_per_100,
			fat_per_100 = EXCLUDED.fat_per_100, carbs_per_100 = EXCLUDED.carbs_per_100,
			updated_at = NOW()
		RETURNING id, name, brand, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			fiber_per_100, sugar_per_100, sodium_per_100, barcode, source, verified,
			created_at, updated_at
	`
	var item FoodItem
	err := s.db.QueryRowContext(ctx, query,
		id, product.Name, product.Brand,
		product.Calories, product.Protein, product.Fat, product.Carbs,
		barcode,
	).Scan(
		&item.ID, &item.Name, &item.Brand, &item.Category,
		&item.ServingSize, &item.ServingUnit,
		&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
		&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
		&item.Barcode, &item.Source, &item.Verified,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		s.log.Warn("Failed to save OFF product", "error", err, "barcode", barcode)
		return nil
	}
	item.PopulateNutrition()
	return &item
}

// getFoodByBarcode retrieves a food item by barcode
func (s *Service) getFoodByBarcode(ctx context.Context, barcode string) (*FoodItem, error) {
	startTime := time.Now()

	// Try food_items table first
	query := `
		SELECT id, name, brand, category, serving_size, serving_unit,
		       calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
		       fiber_per_100, sugar_per_100, sodium_per_100, barcode, source, verified,
		       created_at, updated_at
		FROM food_items
		WHERE barcode = $1
	`

	var item FoodItem
	err := s.db.QueryRowContext(ctx, query, barcode).Scan(
		&item.ID, &item.Name, &item.Brand, &item.Category,
		&item.ServingSize, &item.ServingUnit,
		&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
		&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
		&item.Barcode, &item.Source, &item.Verified,
		&item.CreatedAt, &item.UpdatedAt,
	)

	if err == nil {
		item.PopulateNutrition()
		s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
			"barcode": barcode, "found": true, "table": "food_items",
		})
		return &item, nil
	}
	if err != sql.ErrNoRows {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"barcode": barcode,
		})
		return nil, fmt.Errorf("ошибка при поиске по штрих-коду: %w", err)
	}

	// Fallback to products table (vendor_code = barcode)
	pQuery := `
		SELECT id::text, name, brand,
		       COALESCE(category_id::text, '') AS category,
		       100.0 AS serving_size, 'г' AS serving_unit,
		       COALESCE(calories, 0), COALESCE(proteins, 0),
		       COALESCE(fats, 0), COALESCE(carbs, 0),
		       fiber, NULL::numeric, NULL::numeric,
		       vendor_code, COALESCE(source, 'database'), false,
		       COALESCE(created_at, NOW()), COALESCE(created_at, NOW())
		FROM products
		WHERE vendor_code = $1
		LIMIT 1
	`

	err = s.db.QueryRowContext(ctx, pQuery, barcode).Scan(
		&item.ID, &item.Name, &item.Brand, &item.Category,
		&item.ServingSize, &item.ServingUnit,
		&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
		&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
		&item.Barcode, &item.Source, &item.Verified,
		&item.CreatedAt, &item.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(pQuery, time.Since(startTime), err, map[string]interface{}{
				"barcode": barcode,
			})
			return nil, fmt.Errorf("продукт не найден")
		}
		s.log.LogDatabaseQuery(pQuery, time.Since(startTime), err, map[string]interface{}{
			"barcode": barcode,
		})
		return nil, fmt.Errorf("ошибка при поиске по штрих-коду: %w", err)
	}

	item.PopulateNutrition()

	s.log.LogDatabaseQuery(pQuery, time.Since(startTime), nil, map[string]interface{}{
		"barcode": barcode, "found": true, "table": "products",
	})

	return &item, nil
}

// cacheBarcode caches a barcode lookup result
func (s *Service) cacheBarcode(ctx context.Context, barcode string, food *FoodItem) {
	// Cache for 90 days
	query := `
		INSERT INTO barcode_cache (barcode, food_data, source, cached_at, expires_at)
		VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '90 days')
		ON CONFLICT (barcode) DO UPDATE
		SET food_data = $2, source = $3, cached_at = NOW(), expires_at = NOW() + INTERVAL '90 days'
	`

	// Simplified food data - in real implementation would serialize to JSON
	foodData := fmt.Sprintf(`{"id":"%s","name":"%s"}`, food.ID, food.Name)

	_, err := s.db.ExecContext(ctx, query, barcode, foodData, food.Source)
	if err != nil {
		s.log.Warn("Failed to cache barcode", "error", err, "barcode", barcode)
	}
}

// GetRecentFoods retrieves recently used foods for a user
func (s *Service) GetRecentFoods(ctx context.Context, userID int64, limit int) (*GetRecentFoodsResponse, error) {
	startTime := time.Now()

	// Default and max limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	// Get distinct foods from recent entries via food_items table
	// All food_entries.food_id values are UUIDs referencing food_items
	query := `
		WITH recent AS (
			SELECT DISTINCT ON (fe.food_id) fe.food_id, fe.created_at AS last_used
			FROM food_entries fe
			WHERE fe.user_id = $1
			ORDER BY fe.food_id, fe.created_at DESC
		)
		SELECT
			fi.id,
			fi.name,
			fi.brand,
			fi.category,
			fi.serving_size,
			fi.serving_unit,
			fi.calories_per_100,
			fi.protein_per_100,
			fi.fat_per_100,
			fi.carbs_per_100,
			fi.fiber_per_100,
			fi.sugar_per_100,
			fi.sodium_per_100,
			fi.barcode,
			fi.source,
			fi.verified,
			fi.created_at,
			fi.updated_at
		FROM recent r
		JOIN food_items fi ON r.food_id = fi.id
		ORDER BY r.last_used DESC
		LIMIT $2
	`

	rows, err := s.db.QueryContext(ctx, query, userID, limit)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"limit":   limit,
		})
		return nil, fmt.Errorf("ошибка при получении недавних продуктов: %w", err)
	}
	defer rows.Close()

	var foods []FoodItem
	for rows.Next() {
		var item FoodItem
		err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Brand,
			&item.Category,
			&item.ServingSize,
			&item.ServingUnit,
			&item.CaloriesPer100,
			&item.ProteinPer100,
			&item.FatPer100,
			&item.CarbsPer100,
			&item.FiberPer100,
			&item.SugarPer100,
			&item.SodiumPer100,
			&item.Barcode,
			&item.Source,
			&item.Verified,
			&item.CreatedAt,
			&item.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan food item", "error", err)
			continue
		}
		item.PopulateNutrition()
		foods = append(foods, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке недавних продуктов: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"limit":   limit,
		"results": len(foods),
	})

	return &GetRecentFoodsResponse{
		Foods: foods,
	}, nil
}

// GetFavoriteFoods retrieves favorite foods for a user
func (s *Service) GetFavoriteFoods(ctx context.Context, userID int64, limit int) (*GetFavoriteFoodsResponse, error) {
	startTime := time.Now()

	// Default and max limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	query := `
		SELECT
			fi.id,
			fi.name,
			fi.brand,
			fi.category,
			fi.serving_size,
			fi.serving_unit,
			fi.calories_per_100,
			fi.protein_per_100,
			fi.fat_per_100,
			fi.carbs_per_100,
			fi.fiber_per_100,
			fi.sugar_per_100,
			fi.sodium_per_100,
			fi.barcode,
			fi.source,
			fi.verified,
			fi.created_at,
			fi.updated_at
		FROM user_favorite_foods uff
		JOIN food_items fi ON uff.food_id = fi.id
		WHERE uff.user_id = $1
		ORDER BY uff.created_at DESC
		LIMIT $2
	`

	rows, err := s.db.QueryContext(ctx, query, userID, limit)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"limit":   limit,
		})
		return nil, fmt.Errorf("ошибка при получении избранных продуктов: %w", err)
	}
	defer rows.Close()

	var foods []FoodItem
	for rows.Next() {
		var item FoodItem
		err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Brand,
			&item.Category,
			&item.ServingSize,
			&item.ServingUnit,
			&item.CaloriesPer100,
			&item.ProteinPer100,
			&item.FatPer100,
			&item.CarbsPer100,
			&item.FiberPer100,
			&item.SugarPer100,
			&item.SodiumPer100,
			&item.Barcode,
			&item.Source,
			&item.Verified,
			&item.CreatedAt,
			&item.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan food item", "error", err)
			continue
		}
		item.PopulateNutrition()
		foods = append(foods, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке избранных продуктов: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"limit":   limit,
		"results": len(foods),
	})

	return &GetFavoriteFoodsResponse{
		Foods: foods,
	}, nil
}

// AddToFavorites adds a food item to user's favorites
func (s *Service) AddToFavorites(ctx context.Context, userID int64, foodID string) error {
	startTime := time.Now()

	// Validate food ID
	if _, err := uuid.Parse(foodID); err != nil {
		return fmt.Errorf("неверный формат идентификатора продукта")
	}

	query := `
		INSERT INTO user_favorite_foods (user_id, food_id, added_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id, food_id) DO NOTHING
	`

	_, err := s.db.ExecContext(ctx, query, userID, foodID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"food_id": foodID,
		})
		return fmt.Errorf("ошибка при добавлении в избранное: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"food_id": foodID,
	})

	s.log.LogBusinessEvent("food_added_to_favorites", map[string]interface{}{
		"user_id": userID,
		"food_id": foodID,
	})

	return nil
}

// RemoveFromFavorites removes a food item from user's favorites
func (s *Service) RemoveFromFavorites(ctx context.Context, userID int64, foodID string) error {
	startTime := time.Now()

	// Validate food ID
	if _, err := uuid.Parse(foodID); err != nil {
		return fmt.Errorf("неверный формат идентификатора продукта")
	}

	query := `
		DELETE FROM user_favorite_foods
		WHERE user_id = $1 AND food_id = $2
	`

	result, err := s.db.ExecContext(ctx, query, userID, foodID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"food_id": foodID,
		})
		return fmt.Errorf("ошибка при удалении из избранного: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("продукт не найден в избранном")
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"food_id": foodID,
	})

	s.log.LogBusinessEvent("food_removed_from_favorites", map[string]interface{}{
		"user_id": userID,
		"food_id": foodID,
	})

	return nil
}

// ============================================================================
// Water Tracking
// ============================================================================

// GetWaterIntake retrieves water intake for a user on a specific date
// Returns default values if no record exists for the date
func (s *Service) GetWaterIntake(ctx context.Context, userID int64, date time.Time) (*WaterLog, error) {
	startTime := time.Now()

	dateStr := date.Format("2006-01-02")

	query := `
		SELECT id, user_id, date, glasses, goal, glass_size, updated_at
		FROM water_logs
		WHERE user_id = $1 AND date = $2
	`

	var waterLog WaterLog
	err := s.db.QueryRowContext(ctx, query, userID, dateStr).Scan(
		&waterLog.ID,
		&waterLog.UserID,
		&waterLog.Date,
		&waterLog.Glasses,
		&waterLog.Goal,
		&waterLog.GlassSize,
		&waterLog.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// No record exists - return default values
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"user_id": userID,
				"date":    dateStr,
				"found":   false,
			})

			// Return default water log with 0 glasses
			return &WaterLog{
				UserID:    userID,
				Date:      dateStr,
				Glasses:   0,
				Goal:      8,   // Default goal: 8 glasses
				GlassSize: 250, // Default glass size: 250ml
				UpdatedAt: time.Now(),
			}, nil
		}

		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    dateStr,
		})
		return nil, fmt.Errorf("ошибка при получении данных о воде: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"date":    dateStr,
		"glasses": waterLog.Glasses,
	})

	return &waterLog, nil
}

// AddWater adds water intake for a user on a specific date
// Creates a new record if none exists, otherwise increments the glasses count
func (s *Service) AddWater(ctx context.Context, userID int64, date time.Time, glasses int) (*WaterLog, error) {
	startTime := time.Now()

	dateStr := date.Format("2006-01-02")

	// Validate glasses
	if glasses <= 0 {
		glasses = 1
	}

	// Use UPSERT to create or update water log
	// If record exists, increment glasses; otherwise create with default goal and glass size
	query := `
		INSERT INTO water_logs (id, user_id, date, glasses, goal, glass_size, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, 8, 250, NOW())
		ON CONFLICT (user_id, date) DO UPDATE
		SET glasses = water_logs.glasses + $3, updated_at = NOW()
		RETURNING id, user_id, date, glasses, goal, glass_size, updated_at
	`

	var waterLog WaterLog
	err := s.db.QueryRowContext(ctx, query, userID, dateStr, glasses).Scan(
		&waterLog.ID,
		&waterLog.UserID,
		&waterLog.Date,
		&waterLog.Glasses,
		&waterLog.Goal,
		&waterLog.GlassSize,
		&waterLog.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    dateStr,
			"glasses": glasses,
		})
		return nil, fmt.Errorf("ошибка при добавлении воды: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":       userID,
		"date":          dateStr,
		"glasses_added": glasses,
		"total_glasses": waterLog.Glasses,
	})

	s.log.LogBusinessEvent("water_intake_added", map[string]interface{}{
		"user_id":       userID,
		"date":          dateStr,
		"glasses_added": glasses,
		"total_glasses": waterLog.Glasses,
	})

	return &waterLog, nil
}

// ============================================================================
// Recommendations
// ============================================================================

// GetRecommendations retrieves nutrient recommendations for a user
// Returns daily recommendations grouped by category, weekly recommendations, and custom recommendations
// Requirements: 11.1, 11.2, 11.3, 11.4, 15.1, 15.2
func (s *Service) GetRecommendations(ctx context.Context, userID int64) (*GetRecommendationsResponse, error) {
	startTime := time.Now()

	// Get daily recommendations with user preferences
	dailyQuery := `
		SELECT nr.id, nr.name, nr.category, nr.daily_target, nr.unit, nr.is_weekly,
		       nr.description, nr.benefits, nr.effects, nr.min_recommendation, nr.optimal_recommendation,
		       COALESCE(unp.is_tracked, true) as is_tracked
		FROM nutrient_recommendations nr
		LEFT JOIN user_nutrient_preferences unp ON nr.id = unp.nutrient_id AND unp.user_id = $1
		WHERE nr.is_weekly = false
		ORDER BY nr.category, nr.name
	`

	rows, err := s.db.QueryContext(ctx, dailyQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(dailyQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("ошибка при получении рекомендаций: %w", err)
	}
	defer rows.Close()

	// Initialize daily recommendations map
	daily := make(map[NutrientCategory][]NutrientRecommendationWithProgress)
	for _, cat := range []NutrientCategory{
		NutrientCategoryVitamins,
		NutrientCategoryMinerals,
		NutrientCategoryLipids,
		NutrientCategoryFiber,
		NutrientCategoryPlant,
	} {
		daily[cat] = []NutrientRecommendationWithProgress{}
	}

	// Calculate today's actual intake from food entries
	today := time.Now()
	dailyTotals, err := s.CalculateDailyTotals(ctx, userID, today)
	if err != nil {
		s.log.Warn("Failed to calculate daily totals for recommendations", "error", err)
		dailyTotals = &KBZHU{}
	}
	if dailyTotals == nil {
		dailyTotals = &KBZHU{}
	}

	// Map nutrient names to actual intake values
	nutrientIntakeMap := map[string]float64{
		"Белок":    dailyTotals.Protein,
		"Жиры":     dailyTotals.Fat,
		"Углеводы": dailyTotals.Carbs,
		"Калории":  dailyTotals.Calories,
	}

	for rows.Next() {
		var rec NutrientRecommendation
		var isTracked bool
		err := rows.Scan(
			&rec.ID,
			&rec.Name,
			&rec.Category,
			&rec.DailyTarget,
			&rec.Unit,
			&rec.IsWeekly,
			&rec.Description,
			&rec.Benefits,
			&rec.Effects,
			&rec.MinRecommendation,
			&rec.OptimalRecommendation,
			&isTracked,
		)
		if err != nil {
			s.log.Error("Failed to scan nutrient recommendation", "error", err)
			continue
		}

		// Only include tracked nutrients
		if !isTracked {
			continue
		}

		// Get actual intake from today's food entries
		currentIntake := 0.0
		if val, ok := nutrientIntakeMap[rec.Name]; ok {
			currentIntake = val
		}
		percentage := 0.0
		if rec.DailyTarget > 0 {
			percentage = roundToOneDecimal((currentIntake / rec.DailyTarget) * 100)
		}

		recWithProgress := NutrientRecommendationWithProgress{
			NutrientRecommendation: rec,
			CurrentIntake:          currentIntake,
			Percentage:             percentage,
		}

		daily[rec.Category] = append(daily[rec.Category], recWithProgress)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке рекомендаций: %w", err)
	}

	s.log.LogDatabaseQuery(dailyQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
	})

	// Get weekly recommendations
	weeklyQuery := `
		SELECT nr.id, nr.name, nr.category, nr.daily_target, nr.unit, nr.is_weekly,
		       nr.description, nr.benefits, nr.effects, nr.min_recommendation, nr.optimal_recommendation
		FROM nutrient_recommendations nr
		LEFT JOIN user_nutrient_preferences unp ON nr.id = unp.nutrient_id AND unp.user_id = $1
		WHERE nr.is_weekly = true AND COALESCE(unp.is_tracked, true) = true
		ORDER BY nr.name
	`

	weeklyRows, err := s.db.QueryContext(ctx, weeklyQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(weeklyQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("ошибка при получении недельных рекомендаций: %w", err)
	}
	defer weeklyRows.Close()

	var weekly []NutrientRecommendationWithProgress
	for weeklyRows.Next() {
		var rec NutrientRecommendation
		err := weeklyRows.Scan(
			&rec.ID,
			&rec.Name,
			&rec.Category,
			&rec.DailyTarget,
			&rec.Unit,
			&rec.IsWeekly,
			&rec.Description,
			&rec.Benefits,
			&rec.Effects,
			&rec.MinRecommendation,
			&rec.OptimalRecommendation,
		)
		if err != nil {
			s.log.Error("Failed to scan weekly recommendation", "error", err)
			continue
		}

		// Get actual intake from today's food entries
		currentIntake := 0.0
		if val, ok := nutrientIntakeMap[rec.Name]; ok {
			currentIntake = val
		}
		percentage := 0.0
		if rec.DailyTarget > 0 {
			percentage = roundToOneDecimal((currentIntake / rec.DailyTarget) * 100)
		}

		weekly = append(weekly, NutrientRecommendationWithProgress{
			NutrientRecommendation: rec,
			CurrentIntake:          currentIntake,
			Percentage:             percentage,
		})
	}

	s.log.LogDatabaseQuery(weeklyQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
	})

	// Get custom recommendations
	customQuery := `
		SELECT id, user_id, name, daily_target, unit, created_at
		FROM user_custom_recommendations
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	customRows, err := s.db.QueryContext(ctx, customQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(customQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("ошибка при получении пользовательских рекомендаций: %w", err)
	}
	defer customRows.Close()

	var custom []UserCustomRecommendation
	for customRows.Next() {
		var rec UserCustomRecommendation
		err := customRows.Scan(
			&rec.ID,
			&rec.UserID,
			&rec.Name,
			&rec.DailyTarget,
			&rec.Unit,
			&rec.CreatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan custom recommendation", "error", err)
			continue
		}
		custom = append(custom, rec)
	}

	s.log.LogDatabaseQuery(customQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"custom":  len(custom),
	})

	return &GetRecommendationsResponse{
		Daily:  daily,
		Weekly: weekly,
		Custom: custom,
	}, nil
}

// GetRecommendationDetail retrieves detailed information about a specific nutrient
// Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
func (s *Service) GetRecommendationDetail(ctx context.Context, nutrientID string, userID int64) (*NutrientDetailResponse, error) {
	startTime := time.Now()

	// Validate nutrient ID
	if _, err := uuid.Parse(nutrientID); err != nil {
		return nil, fmt.Errorf("неверный формат идентификатора нутриента")
	}

	// Get nutrient recommendation details
	query := `
		SELECT id, name, category, daily_target, unit, is_weekly,
		       description, benefits, effects, min_recommendation, optimal_recommendation
		FROM nutrient_recommendations
		WHERE id = $1
	`

	var rec NutrientRecommendation
	err := s.db.QueryRowContext(ctx, query, nutrientID).Scan(
		&rec.ID,
		&rec.Name,
		&rec.Category,
		&rec.DailyTarget,
		&rec.Unit,
		&rec.IsWeekly,
		&rec.Description,
		&rec.Benefits,
		&rec.Effects,
		&rec.MinRecommendation,
		&rec.OptimalRecommendation,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"nutrient_id": nutrientID,
			})
			return nil, fmt.Errorf("рекомендация не найдена")
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"nutrient_id": nutrientID,
		})
		return nil, fmt.Errorf("ошибка при получении рекомендации: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"nutrient_id": nutrientID,
		"found":       true,
	})

	// Get food sources from user's diet (placeholder - would need actual nutrient tracking per food)
	// For now, return empty sources
	sources := []FoodSourceInDiet{}

	// Calculate current intake (placeholder)
	currentIntake := 0.0

	return &NutrientDetailResponse{
		NutrientRecommendation: rec,
		CurrentIntake:          currentIntake,
		Sources:                sources,
	}, nil
}

// UpdateNutrientPreferences updates user's nutrient tracking preferences
// Requirements: 13.1, 13.3, 13.4, 13.6, 13.7
func (s *Service) UpdateNutrientPreferences(ctx context.Context, userID int64, nutrientIDs []string) error {
	startTime := time.Now()

	// Validate nutrient IDs
	for _, id := range nutrientIDs {
		if _, err := uuid.Parse(id); err != nil {
			return fmt.Errorf("неверный формат идентификатора нутриента: %s", id)
		}
	}

	// Start transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("ошибка при начале транзакции: %w", err)
	}
	defer tx.Rollback()

	// First, set all preferences to not tracked
	resetQuery := `
		UPDATE user_nutrient_preferences
		SET is_tracked = false
		WHERE user_id = $1
	`
	_, err = tx.ExecContext(ctx, resetQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(resetQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return fmt.Errorf("ошибка при сбросе настроек: %w", err)
	}

	// Then, upsert preferences for selected nutrients
	if len(nutrientIDs) > 0 {
		upsertQuery := `
			INSERT INTO user_nutrient_preferences (user_id, nutrient_id, is_tracked)
			VALUES ($1, $2, true)
			ON CONFLICT (user_id, nutrient_id) DO UPDATE
			SET is_tracked = true
		`

		for _, nutrientID := range nutrientIDs {
			_, err = tx.ExecContext(ctx, upsertQuery, userID, nutrientID)
			if err != nil {
				s.log.LogDatabaseQuery(upsertQuery, time.Since(startTime), err, map[string]interface{}{
					"user_id":     userID,
					"nutrient_id": nutrientID,
				})
				return fmt.Errorf("ошибка при обновлении настроек: %w", err)
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("ошибка при сохранении настроек: %w", err)
	}

	s.log.LogBusinessEvent("nutrient_preferences_updated", map[string]interface{}{
		"user_id":       userID,
		"nutrients_set": len(nutrientIDs),
	})

	return nil
}

// CreateCustomRecommendation creates a custom nutrient recommendation for a user
// Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
func (s *Service) CreateCustomRecommendation(ctx context.Context, userID int64, req *CreateCustomRecommendationRequest) (*UserCustomRecommendation, error) {
	startTime := time.Now()

	// Validate request
	if err := req.Validate(); err != nil {
		return nil, err
	}

	// Generate UUID for new recommendation
	recID := uuid.New().String()

	// Insert custom recommendation
	query := `
		INSERT INTO user_custom_recommendations (id, user_id, name, daily_target, unit, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING id, user_id, name, daily_target, unit, created_at
	`

	var rec UserCustomRecommendation
	err := s.db.QueryRowContext(
		ctx,
		query,
		recID,
		userID,
		req.Name,
		req.DailyTarget,
		req.Unit,
	).Scan(
		&rec.ID,
		&rec.UserID,
		&rec.Name,
		&rec.DailyTarget,
		&rec.Unit,
		&rec.CreatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"name":    req.Name,
		})
		return nil, fmt.Errorf("ошибка при создании рекомендации: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"rec_id":  rec.ID,
		"name":    req.Name,
	})

	s.log.LogBusinessEvent("custom_recommendation_created", map[string]interface{}{
		"user_id":      userID,
		"rec_id":       rec.ID,
		"name":         req.Name,
		"daily_target": req.DailyTarget,
		"unit":         req.Unit,
	})

	return &rec, nil
}
