# User Foods Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add manual food entry with per-user persistence, clone-from-global, and integrated search with priority ordering.

**Architecture:** New `user_foods` table + CRUD service methods + search UNION modification. Frontend: persist ManualEntryForm to backend, add "manual" tab, add clone button on search results.

**Tech Stack:** Go/Gin, PostgreSQL (GIN FTS), Next.js/React, Zustand, Tailwind CSS v4

**Design doc:** `docs/plans/2026-03-04-user-foods-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `apps/api/migrations/028_user_foods_up.sql`

**Step 1: Write migration**

```sql
-- 028_user_foods_up.sql
CREATE TABLE user_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    calories_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    serving_size NUMERIC(8,2) NOT NULL DEFAULT 100,
    serving_unit VARCHAR(50) NOT NULL DEFAULT 'г',
    source_food_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_foods_user_id ON user_foods(user_id);
CREATE INDEX idx_user_foods_name_fts ON user_foods
    USING gin(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
```

**Step 2: Verify migration file exists and SQL is valid**

Run: `cat apps/api/migrations/028_user_foods_up.sql`

**Step 3: Commit**

```bash
git add apps/api/migrations/028_user_foods_up.sql
git commit -m "feat: add user_foods table migration"
```

---

### Task 2: Update Go Types

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/types.go`

The `UserFood` struct (lines 302-340) exists but is missing `Brand`, `SourceFoodID`, `UpdatedAt` fields. The `CreateUserFoodRequest` struct (lines 634-669) is missing `Brand`. Need to add a `CloneUserFoodRequest` type.

**Step 1: Update `UserFood` struct** (types.go:302-314)

Replace the current struct with:

```go
type UserFood struct {
	ID             string    `json:"id" db:"id"`
	UserID         int64     `json:"user_id" db:"user_id"`
	Name           string    `json:"name" db:"name"`
	Brand          *string   `json:"brand,omitempty" db:"brand"`
	CaloriesPer100 float64   `json:"calories_per_100" db:"calories_per_100"`
	ProteinPer100  float64   `json:"protein_per_100" db:"protein_per_100"`
	FatPer100      float64   `json:"fat_per_100" db:"fat_per_100"`
	CarbsPer100    float64   `json:"carbs_per_100" db:"carbs_per_100"`
	ServingSize    float64   `json:"serving_size" db:"serving_size"`
	ServingUnit    string    `json:"serving_unit" db:"serving_unit"`
	SourceFoodID   *string   `json:"source_food_id,omitempty" db:"source_food_id"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}
```

**Step 2: Update `CreateUserFoodRequest` struct** (types.go:634-643)

Add `Brand` field:

```go
type CreateUserFoodRequest struct {
	Name           string  `json:"name" binding:"required,max=255"`
	Brand          string  `json:"brand" binding:"omitempty,max=255"`
	CaloriesPer100 float64 `json:"calories_per_100" binding:"required,min=0"`
	ProteinPer100  float64 `json:"protein_per_100" binding:"omitempty,min=0"`
	FatPer100      float64 `json:"fat_per_100" binding:"omitempty,min=0"`
	CarbsPer100    float64 `json:"carbs_per_100" binding:"omitempty,min=0"`
	ServingSize    float64 `json:"serving_size" binding:"omitempty,gt=0"`
	ServingUnit    string  `json:"serving_unit" binding:"omitempty"`
}
```

**Step 3: Add `CloneUserFoodRequest` type** (after `CreateUserFoodRequest`)

```go
// CloneUserFoodRequest represents the request to clone a food from global DB
type CloneUserFoodRequest struct {
	SourceFoodID   string  `json:"source_food_id" binding:"required"`
	Name           string  `json:"name" binding:"omitempty,max=255"`
	CaloriesPer100 float64 `json:"calories_per_100" binding:"omitempty,min=0"`
	ProteinPer100  float64 `json:"protein_per_100" binding:"omitempty,min=0"`
	FatPer100      float64 `json:"fat_per_100" binding:"omitempty,min=0"`
	CarbsPer100    float64 `json:"carbs_per_100" binding:"omitempty,min=0"`
}

func (r *CloneUserFoodRequest) Validate() error {
	if r.SourceFoodID == "" {
		return fmt.Errorf("идентификатор исходного продукта обязателен")
	}
	return nil
}
```

**Step 4: Add `UpdateUserFoodRequest` type** (after `CloneUserFoodRequest`)

```go
// UpdateUserFoodRequest represents the request to update a user food
type UpdateUserFoodRequest struct {
	Name           *string  `json:"name" binding:"omitempty,max=255"`
	Brand          *string  `json:"brand" binding:"omitempty,max=255"`
	CaloriesPer100 *float64 `json:"calories_per_100" binding:"omitempty,min=0"`
	ProteinPer100  *float64 `json:"protein_per_100" binding:"omitempty,min=0"`
	FatPer100      *float64 `json:"fat_per_100" binding:"omitempty,min=0"`
	CarbsPer100    *float64 `json:"carbs_per_100" binding:"omitempty,min=0"`
	ServingSize    *float64 `json:"serving_size" binding:"omitempty,gt=0"`
	ServingUnit    *string  `json:"serving_unit" binding:"omitempty"`
}
```

**Step 5: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: clean build

**Step 6: Commit**

```bash
git add apps/api/internal/modules/food-tracker/types.go
git commit -m "feat: update UserFood types, add Clone/Update request types"
```

---

### Task 3: Backend Service — User Foods CRUD

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/service.go` (add methods at end)
- Modify: `apps/api/internal/modules/food-tracker/handler.go` (update `ServiceInterface`, lines 18-42)

**Step 1: Add new methods to `ServiceInterface`** (handler.go:18-42)

Add these lines inside the interface, after the `RemoveFromFavorites` line (line 31):

```go
	// User foods
	CreateUserFood(ctx context.Context, userID int64, req *CreateUserFoodRequest) (*UserFood, error)
	CloneUserFood(ctx context.Context, userID int64, req *CloneUserFoodRequest) (*UserFood, error)
	GetUserFoods(ctx context.Context, userID int64) ([]UserFood, error)
	UpdateUserFood(ctx context.Context, userID int64, foodID string, req *UpdateUserFoodRequest) (*UserFood, error)
	DeleteUserFood(ctx context.Context, userID int64, foodID string) error
```

**Step 2: Implement `CreateUserFood`** (service.go, append after SearchFoods method ~line 987)

```go
// ============================================================================
// User Foods CRUD
// ============================================================================

func (s *Service) CreateUserFood(ctx context.Context, userID int64, req *CreateUserFoodRequest) (*UserFood, error) {
	servingSize := req.ServingSize
	if servingSize <= 0 {
		servingSize = 100
	}
	servingUnit := req.ServingUnit
	if servingUnit == "" {
		servingUnit = "г"
	}

	var brand *string
	if req.Brand != "" {
		brand = &req.Brand
	}

	var food UserFood
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO user_foods (user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, serving_size, serving_unit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, serving_size, serving_unit, source_food_id, created_at, updated_at
	`, userID, req.Name, brand, req.CaloriesPer100, req.ProteinPer100, req.FatPer100, req.CarbsPer100, servingSize, servingUnit).Scan(
		&food.ID, &food.UserID, &food.Name, &food.Brand,
		&food.CaloriesPer100, &food.ProteinPer100, &food.FatPer100, &food.CarbsPer100,
		&food.ServingSize, &food.ServingUnit, &food.SourceFoodID,
		&food.CreatedAt, &food.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при создании пользовательского продукта: %w", err)
	}
	return &food, nil
}
```

**Step 3: Implement `CloneUserFood`**

```go
func (s *Service) CloneUserFood(ctx context.Context, userID int64, req *CloneUserFoodRequest) (*UserFood, error) {
	// Look up source food to copy brand and fill defaults
	var sourceName string
	var sourceBrand *string
	var sourceCal, sourceProt, sourceFat, sourceCarbs float64

	err := s.db.QueryRowContext(ctx, `
		SELECT name, brand, COALESCE(calories_per_100, 0), COALESCE(protein_per_100, 0),
		       COALESCE(fat_per_100, 0), COALESCE(carbs_per_100, 0)
		FROM food_items WHERE id = $1
	`, req.SourceFoodID).Scan(&sourceName, &sourceBrand, &sourceCal, &sourceProt, &sourceFat, &sourceCarbs)
	if err != nil {
		return nil, fmt.Errorf("исходный продукт не найден: %w", err)
	}

	// Use overrides from request, fall back to source values
	name := req.Name
	if name == "" {
		name = sourceName
	}
	cal := req.CaloriesPer100
	if cal == 0 {
		cal = sourceCal
	}
	prot := req.ProteinPer100
	if prot == 0 {
		prot = sourceProt
	}
	fat := req.FatPer100
	if fat == 0 {
		fat = sourceFat
	}
	carbs := req.CarbsPer100
	if carbs == 0 {
		carbs = sourceCarbs
	}

	var food UserFood
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO user_foods (user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, source_food_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, serving_size, serving_unit, source_food_id, created_at, updated_at
	`, userID, name, sourceBrand, cal, prot, fat, carbs, req.SourceFoodID).Scan(
		&food.ID, &food.UserID, &food.Name, &food.Brand,
		&food.CaloriesPer100, &food.ProteinPer100, &food.FatPer100, &food.CarbsPer100,
		&food.ServingSize, &food.ServingUnit, &food.SourceFoodID,
		&food.CreatedAt, &food.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при клонировании продукта: %w", err)
	}
	return &food, nil
}
```

**Step 4: Implement `GetUserFoods`**

```go
func (s *Service) GetUserFoods(ctx context.Context, userID int64) ([]UserFood, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
		       serving_size, serving_unit, source_food_id, created_at, updated_at
		FROM user_foods
		WHERE user_id = $1
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении пользовательских продуктов: %w", err)
	}
	defer rows.Close()

	var foods []UserFood
	for rows.Next() {
		var f UserFood
		if err := rows.Scan(
			&f.ID, &f.UserID, &f.Name, &f.Brand,
			&f.CaloriesPer100, &f.ProteinPer100, &f.FatPer100, &f.CarbsPer100,
			&f.ServingSize, &f.ServingUnit, &f.SourceFoodID,
			&f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			s.log.Error("Failed to scan user food", "error", err)
			continue
		}
		foods = append(foods, f)
	}
	return foods, rows.Err()
}
```

**Step 5: Implement `UpdateUserFood`**

```go
func (s *Service) UpdateUserFood(ctx context.Context, userID int64, foodID string, req *UpdateUserFoodRequest) (*UserFood, error) {
	var food UserFood
	err := s.db.QueryRowContext(ctx, `
		UPDATE user_foods
		SET name = COALESCE($3, name),
		    brand = COALESCE($4, brand),
		    calories_per_100 = COALESCE($5, calories_per_100),
		    protein_per_100 = COALESCE($6, protein_per_100),
		    fat_per_100 = COALESCE($7, fat_per_100),
		    carbs_per_100 = COALESCE($8, carbs_per_100),
		    serving_size = COALESCE($9, serving_size),
		    serving_unit = COALESCE($10, serving_unit),
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, name, brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
		          serving_size, serving_unit, source_food_id, created_at, updated_at
	`, foodID, userID, req.Name, req.Brand, req.CaloriesPer100, req.ProteinPer100,
		req.FatPer100, req.CarbsPer100, req.ServingSize, req.ServingUnit).Scan(
		&food.ID, &food.UserID, &food.Name, &food.Brand,
		&food.CaloriesPer100, &food.ProteinPer100, &food.FatPer100, &food.CarbsPer100,
		&food.ServingSize, &food.ServingUnit, &food.SourceFoodID,
		&food.CreatedAt, &food.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении пользовательского продукта: %w", err)
	}
	return &food, nil
}
```

**Step 6: Implement `DeleteUserFood`**

```go
func (s *Service) DeleteUserFood(ctx context.Context, userID int64, foodID string) error {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM user_foods WHERE id = $1 AND user_id = $2
	`, foodID, userID)
	if err != nil {
		return fmt.Errorf("ошибка при удалении пользовательского продукта: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("продукт не найден")
	}
	return nil
}
```

**Step 7: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: clean build

**Step 8: Commit**

```bash
git add apps/api/internal/modules/food-tracker/service.go apps/api/internal/modules/food-tracker/handler.go
git commit -m "feat: add user foods CRUD service methods"
```

---

### Task 4: Backend Service — Search Modification

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/handler.go` (update `ServiceInterface`)
- Modify: `apps/api/internal/modules/food-tracker/service.go` (modify `SearchFoods`)
- Modify: `apps/api/internal/modules/food-tracker/search_handler.go` (pass userID)

**Step 1: Update `SearchFoods` signature in `ServiceInterface`** (handler.go:26)

Change:
```go
SearchFoods(ctx context.Context, query string, limit int, offset int) (*SearchFoodsResponse, error)
```
To:
```go
SearchFoods(ctx context.Context, userID int64, query string, limit int, offset int) (*SearchFoodsResponse, error)
```

**Step 2: Update `SearchFoods` handler** (search_handler.go:24-62)

Add `getUserID` call and pass userID to service. Replace lines 24-62 of `search_handler.go`:

```go
func (h *Handler) SearchFoods(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req SearchFoodsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}

	result, err := h.service.SearchFoods(c.Request.Context(), userID, req.Query, limit, req.Offset)
	if err != nil {
		h.log.Errorw("Не удалось выполнить поиск", "error", err, "query", req.Query)

		errMsg := err.Error()
		if strings.Contains(errMsg, "минимум 3 символа") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось выполнить поиск продуктов")
		return
	}

	response.Success(c, http.StatusOK, result)
}
```

**Step 3: Update `SearchFoods` service method** (service.go:823-987)

Change signature from:
```go
func (s *Service) SearchFoods(ctx context.Context, query string, limit int, offset int) (*SearchFoodsResponse, error) {
```
To:
```go
func (s *Service) SearchFoods(ctx context.Context, userID int64, query string, limit int, offset int) (*SearchFoodsResponse, error) {
```

Add user_foods subquery at the top of the WITH matched CTE (before the products subquery). The new SQL (replacing the current `sqlQuery` variable, lines 846-913):

```go
	sqlQuery := `
		WITH matched AS (
			-- User's own foods (highest priority)
			(SELECT id::text AS id, name, brand,
			       'user' AS category,
			       serving_size, serving_unit,
			       calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			       NULL::numeric AS fiber_per_100,
			       NULL::numeric AS sugar_per_100,
			       NULL::numeric AS sodium_per_100,
			       NULL::text AS barcode,
			       'user' AS source,
			       false AS verified,
			       created_at,
			       updated_at,
			       ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) AS rank,
			       -1 AS source_priority
			FROM user_foods
			WHERE user_id = $4
			  AND to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			ORDER BY rank DESC
			LIMIT 50)

			UNION ALL

			-- Products table (small, ILIKE is acceptable)
			(SELECT id::text AS id, name, brand,
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
			              plainto_tsquery('russian', $1)) AS rank,
			       CASE WHEN source = 'database' THEN 1 ELSE 2 END AS source_priority
			FROM products
			WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			   OR name ILIKE '%' || $1 || '%'
			   OR brand ILIKE '%' || $1 || '%'
			ORDER BY ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) DESC
			LIMIT 200)

			UNION ALL

			-- Food items table (3M+ rows, FTS only via GIN index)
			(SELECT id::text AS id, name, brand,
			       COALESCE(category, '') AS category,
			       COALESCE(serving_size, 100.0) AS serving_size,
			       COALESCE(serving_unit, 'г') AS serving_unit,
			       COALESCE(calories_per_100, 0) AS calories_per_100,
			       COALESCE(protein_per_100, 0) AS protein_per_100,
			       COALESCE(fat_per_100, 0) AS fat_per_100,
			       COALESCE(carbs_per_100, 0) AS carbs_per_100,
			       fiber_per_100 AS fiber_per_100,
			       sugar_per_100 AS sugar_per_100,
			       sodium_per_100 AS sodium_per_100,
			       barcode,
			       COALESCE(source, 'database') AS source,
			       COALESCE(verified, false) AS verified,
			       COALESCE(created_at, NOW()) AS created_at,
			       COALESCE(updated_at, NOW()) AS updated_at,
			       ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) AS rank,
			       CASE WHEN verified = true THEN 0
			            WHEN source = 'database' THEN 1
			            ELSE 2 END AS source_priority
			FROM food_items
			WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			ORDER BY ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) DESC
			LIMIT 200)
		)
		SELECT *
		FROM matched
		ORDER BY
			CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END,
			source_priority,
			rank DESC,
			name ASC
		LIMIT $2 OFFSET $3
	`
```

Update the query call (line 915) to pass `userID`:
```go
	rows, err := s.db.QueryContext(ctx, sqlQuery, query, limit+1, offset, userID)
```

Also update the log call to include userID.

**Step 4: Add fallback query** (after the hasMore/totalCount logic in SearchFoods, ~line 973)

Add fallback for other users' foods when main query returns 0 results:

```go
	// Fallback: search other users' foods if main search returned nothing
	if len(foods) == 0 {
		fallbackQuery := `
			SELECT id::text, name, brand,
			       'user' AS category,
			       serving_size, serving_unit,
			       calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			       NULL::numeric AS fiber_per_100,
			       NULL::numeric AS sugar_per_100,
			       NULL::numeric AS sodium_per_100,
			       NULL::text AS barcode,
			       'user' AS source,
			       false AS verified,
			       created_at, updated_at,
			       ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
			              plainto_tsquery('russian', $1)) AS rank,
			       0 AS source_priority
			FROM user_foods
			WHERE user_id != $4
			  AND to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
			ORDER BY rank DESC
			LIMIT $2 OFFSET $3
		`
		fallbackRows, err := s.db.QueryContext(ctx, fallbackQuery, query, limit+1, offset, userID)
		if err == nil {
			defer fallbackRows.Close()
			for fallbackRows.Next() {
				var item FoodItem
				var rank float64
				var sourcePriority int
				if err := fallbackRows.Scan(
					&item.ID, &item.Name, &item.Brand, &item.Category,
					&item.ServingSize, &item.ServingUnit,
					&item.CaloriesPer100, &item.ProteinPer100, &item.FatPer100, &item.CarbsPer100,
					&item.FiberPer100, &item.SugarPer100, &item.SodiumPer100,
					&item.Barcode, &item.Source, &item.Verified,
					&item.CreatedAt, &item.UpdatedAt, &rank, &sourcePriority,
				); err != nil {
					s.log.Error("Failed to scan fallback user food", "error", err)
					continue
				}
				item.PopulateNutrition()
				foods = append(foods, item)
			}
			hasMore = len(foods) > limit
			if hasMore {
				foods = foods[:limit]
			}
			totalCount = offset + len(foods)
			if hasMore {
				totalCount = offset + limit + 1
			}
		}
	}
```

**Step 5: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: clean build

**Step 6: Commit**

```bash
git add apps/api/internal/modules/food-tracker/service.go apps/api/internal/modules/food-tracker/handler.go apps/api/internal/modules/food-tracker/search_handler.go
git commit -m "feat: integrate user_foods into search with priority and fallback"
```

---

### Task 5: Backend Handlers + Routes

**Files:**
- Create: `apps/api/internal/modules/food-tracker/user_foods_handler.go`
- Modify: `apps/api/cmd/server/main.go` (add routes, lines 283-307)

**Step 1: Create user foods handler file**

```go
package foodtracker

import (
	"net/http"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// CreateUserFood handles POST /api/v1/food-tracker/user-foods
func (h *Handler) CreateUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req CreateUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	food, err := h.service.CreateUserFood(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Failed to create user food", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось создать продукт")
		return
	}

	response.Success(c, http.StatusCreated, food)
}

// CloneUserFood handles POST /api/v1/food-tracker/user-foods/clone
func (h *Handler) CloneUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req CloneUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	food, err := h.service.CloneUserFood(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Failed to clone user food", "error", err, "user_id", userID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusCreated, food)
}

// GetUserFoods handles GET /api/v1/food-tracker/user-foods
func (h *Handler) GetUserFoods(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foods, err := h.service.GetUserFoods(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get user foods", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить пользовательские продукты")
		return
	}

	response.Success(c, http.StatusOK, foods)
}

// UpdateUserFood handles PUT /api/v1/food-tracker/user-foods/:id
func (h *Handler) UpdateUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foodID := c.Param("id")

	var req UpdateUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	food, err := h.service.UpdateUserFood(c.Request.Context(), userID, foodID, &req)
	if err != nil {
		h.log.Errorw("Failed to update user food", "error", err, "user_id", userID, "food_id", foodID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusOK, food)
}

// DeleteUserFood handles DELETE /api/v1/food-tracker/user-foods/:id
func (h *Handler) DeleteUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foodID := c.Param("id")

	if err := h.service.DeleteUserFood(c.Request.Context(), userID, foodID); err != nil {
		h.log.Errorw("Failed to delete user food", "error", err, "user_id", userID, "food_id", foodID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Продукт удалён", nil)
}
```

**Step 2: Add routes** (main.go, after line 296 `ftGroup.DELETE("/favorites/:foodId", ...)`)

```go
			// User foods
			ftGroup.POST("/user-foods", foodTrackerHandler.CreateUserFood)
			ftGroup.POST("/user-foods/clone", foodTrackerHandler.CloneUserFood)
			ftGroup.GET("/user-foods", foodTrackerHandler.GetUserFoods)
			ftGroup.PUT("/user-foods/:id", foodTrackerHandler.UpdateUserFood)
			ftGroup.DELETE("/user-foods/:id", foodTrackerHandler.DeleteUserFood)
```

**Step 3: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: clean build

**Step 4: Commit**

```bash
git add apps/api/internal/modules/food-tracker/user_foods_handler.go apps/api/cmd/server/main.go
git commit -m "feat: add user foods handlers and routes"
```

---

### Task 6: Backend Tests

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/handler_test.go` (add mock methods + tests)

**Step 1: Update MockService** (handler_test.go, after existing mock methods ~line 139)

Add 5 new mock methods matching the new `ServiceInterface`:

```go
func (m *MockService) CreateUserFood(ctx context.Context, userID int64, req *CreateUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) CloneUserFood(ctx context.Context, userID int64, req *CloneUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) GetUserFoods(ctx context.Context, userID int64) ([]UserFood, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]UserFood), args.Error(1)
}

func (m *MockService) UpdateUserFood(ctx context.Context, userID int64, foodID string, req *UpdateUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, foodID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) DeleteUserFood(ctx context.Context, userID int64, foodID string) error {
	args := m.Called(ctx, userID, foodID)
	return args.Error(0)
}
```

**Step 2: Update MockService.SearchFoods signature** (handler_test.go:58-64)

Change:
```go
func (m *MockService) SearchFoods(ctx context.Context, query string, limit int, offset int) (*SearchFoodsResponse, error) {
	args := m.Called(ctx, query, limit, offset)
```
To:
```go
func (m *MockService) SearchFoods(ctx context.Context, userID int64, query string, limit int, offset int) (*SearchFoodsResponse, error) {
	args := m.Called(ctx, userID, query, limit, offset)
```

**Step 3: Update existing SearchFoods test expectations**

Find existing test cases that call `mockService.On("SearchFoods", ...)` and update them to include `userID` as the second argument (`mock.AnythingOfType("int64")` after `mock.Anything`).

**Step 4: Add handler tests for CreateUserFood**

```go
func TestCreateUserFood(t *testing.T) {
	t.Run("successful creation", func(t *testing.T) {
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		expected := &UserFood{
			ID:             uuid.New().String(),
			UserID:         1,
			Name:           "Бабушкины блины",
			CaloriesPer100: 230,
			ProteinPer100:  8.5,
			FatPer100:      10.2,
			CarbsPer100:    27.0,
			ServingSize:    100,
			ServingUnit:    "г",
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}

		mockService.On("CreateUserFood", mock.Anything, int64(1), mock.AnythingOfType("*foodtracker.CreateUserFoodRequest")).
			Return(expected, nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		body := `{"name":"Бабушкины блины","calories_per_100":230,"protein_per_100":8.5,"fat_per_100":10.2,"carbs_per_100":27.0}`
		c.Request = httptest.NewRequest(http.MethodPost, "/food-tracker/user-foods", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.CreateUserFood(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		mockService.AssertExpectations(t)
	})

	t.Run("missing name returns 400", func(t *testing.T) {
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: new(MockService),
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		body := `{"calories_per_100":230}`
		c.Request = httptest.NewRequest(http.MethodPost, "/food-tracker/user-foods", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.CreateUserFood(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}
```

**Step 5: Add handler tests for GetUserFoods and DeleteUserFood**

```go
func TestGetUserFoods(t *testing.T) {
	t.Run("returns user foods list", func(t *testing.T) {
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		foods := []UserFood{
			{ID: uuid.New().String(), UserID: 1, Name: "Food 1", CaloriesPer100: 100},
			{ID: uuid.New().String(), UserID: 1, Name: "Food 2", CaloriesPer100: 200},
		}
		mockService.On("GetUserFoods", mock.Anything, int64(1)).Return(foods, nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		c.Request = httptest.NewRequest(http.MethodGet, "/food-tracker/user-foods", nil)

		handler.GetUserFoods(c)

		assert.Equal(t, http.StatusOK, w.Code)
		mockService.AssertExpectations(t)
	})
}

func TestDeleteUserFood(t *testing.T) {
	t.Run("successful deletion", func(t *testing.T) {
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		foodID := uuid.New().String()
		mockService.On("DeleteUserFood", mock.Anything, int64(1), foodID).Return(nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: foodID}}
		c.Request = httptest.NewRequest(http.MethodDelete, "/food-tracker/user-foods/"+foodID, nil)

		handler.DeleteUserFood(c)

		assert.Equal(t, http.StatusOK, w.Code)
		mockService.AssertExpectations(t)
	})
}
```

**Step 6: Run tests**

Run: `cd apps/api && go test ./internal/modules/food-tracker/ -v`
Expected: all tests pass

**Step 7: Commit**

```bash
git add apps/api/internal/modules/food-tracker/handler_test.go
git commit -m "test: add user foods handler tests, update SearchFoods mock signature"
```

---

### Task 7: Frontend Types + API Client

**Files:**
- Modify: `apps/web/src/features/food-tracker/types/index.ts`

**Step 1: Add `UserFood` interface and request types** (types/index.ts, after `FoodItem` interface ~line 56)

```typescript
/**
 * User-created custom food item
 */
export interface UserFood {
    id: string;
    name: string;
    brand?: string;
    calories_per_100: number;
    protein_per_100: number;
    fat_per_100: number;
    carbs_per_100: number;
    serving_size: number;
    serving_unit: string;
    source_food_id?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Request to create a user food
 */
export interface CreateUserFoodRequest {
    name: string;
    brand?: string;
    calories_per_100: number;
    protein_per_100?: number;
    fat_per_100?: number;
    carbs_per_100?: number;
    serving_size?: number;
    serving_unit?: string;
}

/**
 * Request to clone a food from global DB
 */
export interface CloneUserFoodRequest {
    source_food_id: string;
    name?: string;
    calories_per_100?: number;
    protein_per_100?: number;
    fat_per_100?: number;
    carbs_per_100?: number;
}
```

**Step 2: Add `'manual'` to `EntryMethodTab`** (types/index.ts:324)

Change:
```typescript
export type EntryMethodTab = 'search' | 'barcode' | 'photo' | 'chat';
```
To:
```typescript
export type EntryMethodTab = 'search' | 'barcode' | 'manual' | 'photo' | 'chat';
```

**Step 3: Add helper function to convert `UserFood` → `FoodItem`**

```typescript
/**
 * Convert a UserFood to a FoodItem for use in search results and portion selector
 */
export function userFoodToFoodItem(uf: UserFood): FoodItem {
    return {
        id: uf.id,
        name: uf.name,
        brand: uf.brand,
        category: 'user',
        servingSize: uf.serving_size,
        servingUnit: uf.serving_unit,
        nutritionPer100: {
            calories: uf.calories_per_100,
            protein: uf.protein_per_100,
            fat: uf.fat_per_100,
            carbs: uf.carbs_per_100,
        },
        source: 'user',
        verified: false,
    };
}
```

**Step 4: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

**Step 5: Commit**

```bash
git add apps/web/src/features/food-tracker/types/index.ts
git commit -m "feat: add UserFood types and manual entry tab type"
```

---

### Task 8: Frontend — ManualEntryForm Backend Persistence

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/ManualEntryForm.tsx`

**Step 1: Update ManualEntryForm to POST to backend**

Import API client:
```typescript
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { UserFood, CreateUserFoodRequest } from '../types';
import { userFoodToFoodItem } from '../types';
```

Replace the `handleSubmit` function (lines 131-164) to persist to backend:

```typescript
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const payload: CreateUserFoodRequest = {
                name: formData.name.trim(),
                brand: formData.brand.trim() || undefined,
                calories_per_100: parseFloat(formData.calories) || 0,
                protein_per_100: parseFloat(formData.protein) || 0,
                fat_per_100: parseFloat(formData.fat) || 0,
                carbs_per_100: parseFloat(formData.carbs) || 0,
                serving_size: parseFloat(formData.servingSize) || 100,
                serving_unit: 'г',
            };

            const url = getApiUrl('/food-tracker/user-foods');
            const response = await apiClient.post<UserFood>(url, payload);
            const food = userFoodToFoodItem(response);

            onSubmit(food);
        } catch (error) {
            console.error('Failed to create user food:', error);
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, validateForm, onSubmit]);
```

**Step 2: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

**Step 3: Commit**

```bash
git add apps/web/src/features/food-tracker/components/ManualEntryForm.tsx
git commit -m "feat: persist manual entry to backend via user-foods API"
```

---

### Task 9: Frontend — Add Manual Tab to FoodEntryModal

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`

**Step 1: Add `Edit3` icon import** (line 16)

Add `Edit3` (or `PenLine`) to the lucide-react import.

**Step 2: Add manual tab to TABS array** (lines 56-61)

Change from:
```typescript
const TABS: TabConfig[] = [
    { id: 'search', label: 'Поиск', icon: Search },
    { id: 'barcode', label: 'Штрих-код', icon: Barcode },
    { id: 'photo', label: 'Фото еды', icon: Camera },
    { id: 'chat', label: 'Чат', icon: MessageCircle },
];
```
To:
```typescript
const TABS: TabConfig[] = [
    { id: 'search', label: 'Поиск', icon: Search },
    { id: 'barcode', label: 'Штрих-код', icon: Barcode },
    { id: 'manual', label: 'Ручной ввод', icon: Edit3 },
    { id: 'photo', label: 'Фото еды', icon: Camera },
    { id: 'chat', label: 'Чат', icon: MessageCircle },
];
```

**Step 3: Update tab content rendering**

In the JSX where tabs render content, add a case for `activeTab === 'manual'` that renders `<ManualEntryForm>`. Find the existing pattern where other tabs are rendered and add:

```tsx
{activeTab === 'manual' && step === 'select-food' && (
    <ManualEntryForm
        onSubmit={handleManualEntrySubmit}
        onCancel={onClose}
    />
)}
```

**Step 4: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

**Step 5: Commit**

```bash
git add apps/web/src/features/food-tracker/components/FoodEntryModal.tsx
git commit -m "feat: add manual entry tab to FoodEntryModal"
```

---

### Task 10: Frontend — Clone Button on Search Results

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/SearchTab.tsx` (or PortionSelector)

**Step 1: Add "Сохранить как свой" button**

In the portion selector or product details view, add a clone button that calls:

```typescript
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { CloneUserFoodRequest, UserFood } from '../types';
import toast from 'react-hot-toast';

const handleCloneFood = async (food: FoodItem) => {
    try {
        const payload: CloneUserFoodRequest = {
            source_food_id: food.id,
        };
        const url = getApiUrl('/food-tracker/user-foods/clone');
        await apiClient.post<UserFood>(url, payload);
        toast.success('Продукт сохранён');
    } catch (error) {
        console.error('Failed to clone food:', error);
        toast.error('Не удалось сохранить продукт');
    }
};
```

Add a button in the portion selector UI (when `selectedFood.source !== 'user'`):

```tsx
{selectedFood.source !== 'user' && (
    <button
        type="button"
        onClick={() => handleCloneFood(selectedFood)}
        className="text-sm text-blue-600 hover:text-blue-800"
    >
        Сохранить как свой
    </button>
)}
```

**Step 2: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

**Step 3: Commit**

```bash
git add apps/web/src/features/food-tracker/components/SearchTab.tsx apps/web/src/features/food-tracker/components/PortionSelector.tsx
git commit -m "feat: add clone-to-user-foods button on search results"
```

---

### Task 11: Full-Stack Verification

**Step 1: TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

**Step 2: ESLint**

Run: `cd apps/web && npm run lint`
Expected: no new errors

**Step 3: Go build**

Run: `cd apps/api && go build ./...`
Expected: clean

**Step 4: Go tests**

Run: `cd apps/api && go test ./internal/modules/food-tracker/ -v`
Expected: all pass

**Step 5: Go fmt**

Run: `cd apps/api && go fmt ./...`
Expected: clean

**Step 6: Frontend tests**

Run: `cd apps/web && npx jest --passWithNoTests`
Expected: all pass

**Step 7: Fix any failures, commit**

```bash
git add -A
git commit -m "fix: resolve verification issues for user foods feature"
```
