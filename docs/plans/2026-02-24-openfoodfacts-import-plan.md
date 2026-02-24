# OpenFoodFacts CSV Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import ~3M products from OpenFoodFacts CSV dump into `food_items` table for instant barcode lookups and improved food search.

**Architecture:** Go CLI tool streams the 12GB CSV, batch-upserts into `food_items` with multi-level dedup (barcode match → name+brand match → insert). Backend barcode lookup simplified to query `food_items` first, API fallback second. Search updated to cover both `products` and `food_items` tables.

**Tech Stack:** Go 1.24 stdlib `encoding/csv`, `database/sql`, `pgx/v5`, PostgreSQL `ON CONFLICT` upsert.

---

### Task 1: Add UNIQUE constraint on food_items.barcode

The current index `idx_food_items_barcode` is NOT unique — `ON CONFLICT (barcode)` won't work without it. Need a unique partial index.

**Files:**
- Create: `apps/api/migrations/017_add_unique_barcode_index_up.sql`
- Create: `apps/api/migrations/017_add_unique_barcode_index_down.sql`

**Step 1: Write the up migration**

```sql
-- Migration: Add unique constraint on food_items.barcode
-- Required for ON CONFLICT (barcode) in import tool and existing saveOFFProduct()
-- Version: 017

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_food_items_barcode;

-- Create a unique partial index (NULL barcodes are allowed, but non-NULL must be unique)
CREATE UNIQUE INDEX idx_food_items_barcode_unique ON food_items(barcode) WHERE barcode IS NOT NULL;
```

**Step 2: Write the down migration**

```sql
DROP INDEX IF EXISTS idx_food_items_barcode_unique;
CREATE INDEX idx_food_items_barcode ON food_items(barcode) WHERE barcode IS NOT NULL;
```

**Step 3: Add composite FTS index on food_items (name + brand)**

The `products` table has a composite FTS index (migration 012). `food_items` only has FTS on `name`. Add matching composite index for search to work well across both tables.

Create `apps/api/migrations/018_add_food_items_fts_index_up.sql`:
```sql
-- Add composite FTS index on food_items covering name and brand for food search
CREATE INDEX IF NOT EXISTS idx_food_items_name_brand_fts
ON food_items USING GIN (to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
```

Create `apps/api/migrations/018_add_food_items_fts_index_down.sql`:
```sql
DROP INDEX IF EXISTS idx_food_items_name_brand_fts;
```

**Step 4: Commit**

```bash
git add apps/api/migrations/017_* apps/api/migrations/018_*
git commit -m "feat: add unique barcode index and composite FTS index on food_items"
```

---

### Task 2: Build Go CLI import tool — scaffold and CSV parsing

**Files:**
- Create: `apps/api/cmd/import-openfoodfacts/main.go`

**Step 1: Write the CSV streaming parser with filtering**

The tool must:
- Accept `--database-url`, `--csv-path`, `--batch-size`, `--dry-run` flags
- Stream CSV line-by-line using `encoding/csv` (12GB file)
- TSV format (tab separator)
- Filter: `code` >= 8 chars, `product_name` non-empty, `energy-kcal_100g`, `proteins_100g`, `fat_100g`, `carbohydrates_100g` all non-empty and parseable as float
- Map CSV columns to `food_items` columns (see mapping table in design doc)
- Parse `brands` — take first brand from comma-separated list
- Parse `categories_en` — take first category
- Parse `serving_size` — extract number, default to 100
- Build `additional_nutrients` JSONB from: `fiber_100g`, `sugars_100g`, `sodium_100g`, plus any available vitamin/mineral columns
- Collect rows into batches of `--batch-size` (default 1000)
- Log progress every 100,000 rows

```go
package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"database/sql"
	"github.com/google/uuid"
)

type FoodRecord struct {
	Barcode             string
	Name                string
	Brand               string
	Category            string
	ServingSize         float64
	CaloriesPer100      float64
	ProteinPer100       float64
	FatPer100           float64
	CarbsPer100         float64
	AdditionalNutrients map[string]float64
}

func main() {
	dbURL := flag.String("database-url", "", "PostgreSQL connection string")
	csvPath := flag.String("csv-path", "", "Path to OpenFoodFacts CSV file")
	batchSize := flag.Int("batch-size", 1000, "Batch size for DB inserts")
	dryRun := flag.Bool("dry-run", false, "Count qualifying products without writing to DB")
	flag.Parse()

	if *csvPath == "" {
		log.Fatal("--csv-path is required")
	}
	if !*dryRun && *dbURL == "" {
		log.Fatal("--database-url is required (or use --dry-run)")
	}

	file, err := os.Open(*csvPath)
	if err != nil {
		log.Fatalf("Failed to open CSV: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = '\t'
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1 // variable field count

	// Read header and build column index
	header, err := reader.Read()
	if err != nil {
		log.Fatalf("Failed to read header: %v", err)
	}
	colIdx := buildColumnIndex(header)

	var db *sql.DB
	if !*dryRun {
		db, err = sql.Open("pgx", *dbURL)
		if err != nil {
			log.Fatalf("Failed to connect to DB: %v", err)
		}
		defer db.Close()
		db.SetMaxOpenConns(5)
		if err := db.Ping(); err != nil {
			log.Fatalf("Failed to ping DB: %v", err)
		}
		log.Println("Connected to database")
	}

	var (
		batch     []FoodRecord
		total     int
		qualified int
		inserted  int
		updated   int
		skipped   int
		startTime = time.Now()
	)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			total++
			continue
		}
		total++

		food, ok := parseRecord(record, colIdx)
		if !ok {
			continue
		}
		qualified++

		if *dryRun {
			if qualified%500000 == 0 {
				log.Printf("Progress: %d/%d rows, %d qualifying", qualified, total, qualified)
			}
			continue
		}

		batch = append(batch, food)
		if len(batch) >= *batchSize {
			ins, upd, skip := processBatch(db, batch)
			inserted += ins
			updated += upd
			skipped += skip
			batch = batch[:0]
		}

		if total%100000 == 0 {
			elapsed := time.Since(startTime)
			log.Printf("Progress: %d rows, %d qualifying, %d inserted, %d updated, %d skipped [%s]",
				total, qualified, inserted, updated, skipped, elapsed.Round(time.Second))
		}
	}

	// Process remaining batch
	if len(batch) > 0 && !*dryRun {
		ins, upd, skip := processBatch(db, batch)
		inserted += ins
		updated += upd
		skipped += skip
	}

	elapsed := time.Since(startTime)
	log.Printf("Done! Total: %d, Qualifying: %d, Inserted: %d, Updated: %d, Skipped: %d [%s]",
		total, qualified, inserted, updated, skipped, elapsed.Round(time.Second))
}
```

**Step 2: Implement helper functions**

```go
// buildColumnIndex maps column names to their indices
func buildColumnIndex(header []string) map[string]int {
	idx := make(map[string]int, len(header))
	for i, col := range header {
		idx[col] = i
	}
	return idx
}

// getCol safely gets a column value by name
func getCol(record []string, colIdx map[string]int, name string) string {
	i, ok := colIdx[name]
	if !ok || i >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[i])
}

// parseFloat parses a string to float64, returns 0 and false if empty or invalid
func parseFloat(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

// parseRecord converts a CSV row into a FoodRecord, returns false if not qualifying
func parseRecord(record []string, colIdx map[string]int) (FoodRecord, bool) {
	code := getCol(record, colIdx, "code")
	if len(code) < 8 {
		return FoodRecord{}, false
	}

	name := getCol(record, colIdx, "product_name")
	if name == "" {
		return FoodRecord{}, false
	}
	// Truncate very long names
	if len(name) > 255 {
		name = name[:255]
	}

	cal, ok := parseFloat(getCol(record, colIdx, "energy-kcal_100g"))
	if !ok {
		return FoodRecord{}, false
	}
	prot, ok := parseFloat(getCol(record, colIdx, "proteins_100g"))
	if !ok {
		return FoodRecord{}, false
	}
	fat, ok := parseFloat(getCol(record, colIdx, "fat_100g"))
	if !ok {
		return FoodRecord{}, false
	}
	carb, ok := parseFloat(getCol(record, colIdx, "carbohydrates_100g"))
	if !ok {
		return FoodRecord{}, false
	}

	// Parse brand — take first from comma-separated list
	brand := getCol(record, colIdx, "brands")
	if idx := strings.IndexByte(brand, ','); idx > 0 {
		brand = strings.TrimSpace(brand[:idx])
	}
	if len(brand) > 255 {
		brand = brand[:255]
	}

	// Parse category — take first from comma-separated list
	category := getCol(record, colIdx, "categories_en")
	if idx := strings.IndexByte(category, ','); idx > 0 {
		category = strings.TrimSpace(category[:idx])
	}
	if category == "" {
		category = "imported"
	}
	if len(category) > 255 {
		category = category[:255]
	}

	// Parse serving size — extract number, default 100
	servingSize := 100.0
	if ss := getCol(record, colIdx, "serving_quantity"); ss != "" {
		if v, ok := parseFloat(ss); ok && v > 0 {
			servingSize = v
		}
	}

	// Build additional nutrients
	nutrients := make(map[string]float64)
	nutrientCols := map[string]string{
		"fiber_100g":           "fiber",
		"sugars_100g":          "sugar",
		"sodium_100g":          "sodium",
		"saturated-fat_100g":   "saturated_fat",
		"vitamin-a_100g":       "vitamin_a",
		"vitamin-c_100g":       "vitamin_c",
		"vitamin-d_100g":       "vitamin_d",
		"vitamin-e_100g":       "vitamin_e",
		"vitamin-b1_100g":      "vitamin_b1",
		"vitamin-b2_100g":      "vitamin_b2",
		"vitamin-b6_100g":      "vitamin_b6",
		"vitamin-b9_100g":      "vitamin_b9",
		"vitamin-b12_100g":     "vitamin_b12",
		"calcium_100g":         "calcium",
		"iron_100g":            "iron",
		"magnesium_100g":       "magnesium",
		"potassium_100g":       "potassium",
		"zinc_100g":            "zinc",
	}
	for csvCol, jsonKey := range nutrientCols {
		if v, ok := parseFloat(getCol(record, colIdx, csvCol)); ok && v > 0 {
			nutrients[jsonKey] = v
		}
	}

	return FoodRecord{
		Barcode:             code,
		Name:                name,
		Brand:               brand,
		Category:            category,
		ServingSize:         servingSize,
		CaloriesPer100:      cal,
		ProteinPer100:       prot,
		FatPer100:           fat,
		CarbsPer100:         carb,
		AdditionalNutrients: nutrients,
	}, true
}
```

**Step 3: Commit scaffold**

```bash
cd apps/api && go build ./cmd/import-openfoodfacts/
git add apps/api/cmd/import-openfoodfacts/
git commit -m "feat: scaffold OpenFoodFacts CSV import tool with parsing"
```

---

### Task 3: Implement batch upsert with multi-level dedup

**Files:**
- Modify: `apps/api/cmd/import-openfoodfacts/main.go`

**Step 1: Implement the processBatch function**

This is the core dedup logic — three-level matching:

```go
// processBatch processes a batch of FoodRecords with multi-level dedup
// Returns (inserted, updated, skipped) counts
func processBatch(db *sql.DB, batch []FoodRecord) (int, int, int) {
	if len(batch) == 0 {
		return 0, 0, 0
	}

	tx, err := db.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return 0, 0, len(batch)
	}
	defer tx.Rollback()

	inserted, updated, skipped := 0, 0, 0

	// Step 1: Check which barcodes already exist in food_items
	barcodes := make([]string, len(batch))
	byBarcode := make(map[string]*FoodRecord, len(batch))
	for i := range batch {
		barcodes[i] = batch[i].Barcode
		byBarcode[batch[i].Barcode] = &batch[i]
	}

	existingBarcodes := queryExistingBarcodes(tx, barcodes)

	// Step 2: For barcodes that exist — enrich (fill empty fields only)
	var remaining []*FoodRecord
	for _, food := range batch {
		if existingID, ok := existingBarcodes[food.Barcode]; ok {
			if enrichExisting(tx, existingID, &food) {
				updated++
			} else {
				skipped++
			}
		} else {
			remaining = append(remaining, &food)
		}
	}

	// Step 3: For remaining — match by LOWER(name) + LOWER(brand)
	var toInsert []*FoodRecord
	if len(remaining) > 0 {
		nameBrandMatches := queryByNameBrand(tx, remaining)
		for _, food := range remaining {
			key := strings.ToLower(food.Name) + "|" + strings.ToLower(food.Brand)
			if existingID, ok := nameBrandMatches[key]; ok {
				// Add barcode + enrich
				if enrichWithBarcode(tx, existingID, food) {
					updated++
				} else {
					skipped++
				}
			} else {
				toInsert = append(toInsert, food)
			}
		}
	}

	// Step 4: Batch INSERT new products
	for _, food := range toInsert {
		if insertFood(tx, food) {
			inserted++
		} else {
			skipped++
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit batch: %v", err)
		return 0, 0, len(batch)
	}

	return inserted, updated, skipped
}
```

**Step 2: Implement the query and mutation helpers**

```go
// queryExistingBarcodes returns map[barcode]->id for barcodes that exist in food_items
func queryExistingBarcodes(tx *sql.Tx, barcodes []string) map[string]string {
	result := make(map[string]string)
	if len(barcodes) == 0 {
		return result
	}

	// Build placeholder list: $1, $2, ...
	placeholders := make([]string, len(barcodes))
	args := make([]interface{}, len(barcodes))
	for i, b := range barcodes {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = b
	}

	query := fmt.Sprintf(
		"SELECT id, barcode FROM food_items WHERE barcode IN (%s)",
		strings.Join(placeholders, ","),
	)

	rows, err := tx.Query(query, args...)
	if err != nil {
		log.Printf("queryExistingBarcodes failed: %v", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var id, barcode string
		if err := rows.Scan(&id, &barcode); err == nil {
			result[barcode] = id
		}
	}
	return result
}

// queryByNameBrand returns map["lower_name|lower_brand"]->id for name+brand matches
// Only matches records that have no barcode (to avoid overwriting barcoded products)
func queryByNameBrand(tx *sql.Tx, foods []*FoodRecord) map[string]string {
	result := make(map[string]string)
	if len(foods) == 0 {
		return result
	}

	// Build (LOWER(name), LOWER(brand)) pairs
	placeholders := make([]string, 0, len(foods))
	args := make([]interface{}, 0, len(foods)*2)
	for i, f := range foods {
		placeholders = append(placeholders, fmt.Sprintf("($%d, $%d)", i*2+1, i*2+2))
		args = append(args, strings.ToLower(f.Name), strings.ToLower(f.Brand))
	}

	query := fmt.Sprintf(`
		SELECT id, LOWER(name), LOWER(COALESCE(brand, ''))
		FROM food_items
		WHERE (LOWER(name), LOWER(COALESCE(brand, ''))) IN (%s)
		  AND (barcode IS NULL OR barcode = '')
	`, strings.Join(placeholders, ","))

	rows, err := tx.Query(query, args...)
	if err != nil {
		log.Printf("queryByNameBrand failed: %v", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var id, name, brand string
		if err := rows.Scan(&id, &name, &brand); err == nil {
			result[name+"|"+brand] = id
		}
	}
	return result
}

// enrichExisting updates empty fields on an existing food_items record
// Does NOT overwrite existing non-empty values
func enrichExisting(tx *sql.Tx, id string, food *FoodRecord) bool {
	nutrients, _ := json.Marshal(food.AdditionalNutrients)

	query := `
		UPDATE food_items SET
			brand = COALESCE(NULLIF(brand, ''), NULLIF($2, '')),
			category = CASE WHEN category = 'imported' THEN COALESCE(NULLIF($3, ''), category) ELSE category END,
			fiber_per_100 = COALESCE(NULLIF(fiber_per_100, 0), $4),
			sugar_per_100 = COALESCE(NULLIF(sugar_per_100, 0), $5),
			sodium_per_100 = COALESCE(NULLIF(sodium_per_100, 0), $6),
			additional_nutrients = CASE
				WHEN additional_nutrients IS NULL THEN $7::jsonb
				ELSE additional_nutrients || $7::jsonb
			END,
			updated_at = NOW()
		WHERE id = $1
	`

	fiber, _ := food.AdditionalNutrients["fiber"]
	sugar, _ := food.AdditionalNutrients["sugar"]
	sodium, _ := food.AdditionalNutrients["sodium"]

	_, err := tx.Exec(query, id, food.Brand, food.Category, fiber, sugar, sodium, string(nutrients))
	if err != nil {
		log.Printf("enrichExisting failed for %s: %v", id, err)
		return false
	}
	return true
}

// enrichWithBarcode adds barcode + enriches empty fields on a name+brand matched record
func enrichWithBarcode(tx *sql.Tx, id string, food *FoodRecord) bool {
	nutrients, _ := json.Marshal(food.AdditionalNutrients)

	query := `
		UPDATE food_items SET
			barcode = $2,
			brand = COALESCE(NULLIF(brand, ''), NULLIF($3, '')),
			category = CASE WHEN category = 'imported' THEN COALESCE(NULLIF($4, ''), category) ELSE category END,
			fiber_per_100 = COALESCE(NULLIF(fiber_per_100, 0), $5),
			sugar_per_100 = COALESCE(NULLIF(sugar_per_100, 0), $6),
			sodium_per_100 = COALESCE(NULLIF(sodium_per_100, 0), $7),
			additional_nutrients = CASE
				WHEN additional_nutrients IS NULL THEN $8::jsonb
				ELSE additional_nutrients || $8::jsonb
			END,
			updated_at = NOW()
		WHERE id = $1
	`

	fiber, _ := food.AdditionalNutrients["fiber"]
	sugar, _ := food.AdditionalNutrients["sugar"]
	sodium, _ := food.AdditionalNutrients["sodium"]

	_, err := tx.Exec(query, id, food.Barcode, food.Brand, food.Category,
		fiber, sugar, sodium, string(nutrients))
	if err != nil {
		log.Printf("enrichWithBarcode failed for %s: %v", id, err)
		return false
	}
	return true
}

// insertFood inserts a new food_items record
func insertFood(tx *sql.Tx, food *FoodRecord) bool {
	nutrients, _ := json.Marshal(food.AdditionalNutrients)
	id := uuid.New().String()

	fiber, _ := food.AdditionalNutrients["fiber"]
	sugar, _ := food.AdditionalNutrients["sugar"]
	sodium, _ := food.AdditionalNutrients["sodium"]

	var brandPtr *string
	if food.Brand != "" {
		brandPtr = &food.Brand
	}

	query := `
		INSERT INTO food_items (
			id, name, brand, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			fiber_per_100, sugar_per_100, sodium_per_100,
			barcode, source, verified, additional_nutrients,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, 'г',
			$6, $7, $8, $9,
			$10, $11, $12,
			$13, 'openfoodfacts', false, $14::jsonb,
			NOW(), NOW()
		) ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING
	`

	_, err := tx.Exec(query, id, food.Name, brandPtr, food.Category, food.ServingSize,
		food.CaloriesPer100, food.ProteinPer100, food.FatPer100, food.CarbsPer100,
		fiber, sugar, sodium,
		food.Barcode, string(nutrients))
	if err != nil {
		log.Printf("insertFood failed for %s: %v", food.Barcode, err)
		return false
	}
	return true
}
```

**Step 3: Verify build**

Run: `cd apps/api && go build ./cmd/import-openfoodfacts/`
Expected: builds successfully

**Step 4: Commit**

```bash
git add apps/api/cmd/import-openfoodfacts/
git commit -m "feat: implement batch upsert with multi-level dedup for OpenFoodFacts import"
```

---

### Task 4: Update SearchFoods to include food_items table

Currently `SearchFoods()` (service.go:824-939) only queries `products` table. After importing 3M products into `food_items`, users won't find them via text search. Need to UNION results from both tables.

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/service.go:824-939`

**Step 1: Update the SQL query to UNION both tables**

Replace the `sqlQuery` in `SearchFoods()` (lines 844-875) with a UNION ALL query that searches both `products` and `food_items`:

```go
sqlQuery := `
    WITH matched AS (
        -- Search products table (legacy)
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
                      plainto_tsquery('russian', $1)) AS rank,
               CASE WHEN COALESCE(source, 'database') = 'database' THEN 0 ELSE 2 END AS source_priority
        FROM products
        WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
           OR name ILIKE '%' || $1 || '%'
           OR brand ILIKE '%' || $1 || '%'

        UNION ALL

        -- Search food_items table (OpenFoodFacts + API-saved)
        SELECT id::text, name, brand,
               category,
               serving_size, serving_unit,
               calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
               fiber_per_100, sugar_per_100, sodium_per_100,
               barcode,
               source, verified,
               created_at, updated_at,
               ts_rank(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')),
                      plainto_tsquery('russian', $1)) AS rank,
               CASE
                   WHEN verified THEN 0
                   WHEN source = 'database' THEN 1
                   ELSE 2
               END AS source_priority
        FROM food_items
        WHERE to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')) @@ plainto_tsquery('russian', $1)
           OR name ILIKE '%' || $1 || '%'
           OR (brand IS NOT NULL AND brand ILIKE '%' || $1 || '%')
    )
    SELECT id, name, brand, category, serving_size, serving_unit,
           calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
           fiber_per_100, sugar_per_100, sodium_per_100,
           barcode, source, verified, created_at, updated_at,
           rank, COUNT(*) OVER() AS total_count
    FROM matched
    ORDER BY
        CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END,
        source_priority,
        rank DESC,
        name ASC
    LIMIT $2 OFFSET $3
`
```

The scan loop at lines 890-921 stays the same — it already scans `rank` and `totalCount`.

**Step 2: Verify build**

Run: `cd apps/api && go build ./...`
Expected: builds successfully

**Step 3: Commit**

```bash
git add apps/api/internal/modules/food-tracker/service.go
git commit -m "feat: search food_items table alongside products for unified search results"
```

---

### Task 5: Simplify LookupBarcode — DB first, API fallback

Currently `LookupBarcode()` (service.go:941-990) has 3 steps: food_items → barcode_cache → API. After import, the cache step is unnecessary — 3M products are in food_items.

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/service.go:941-990`

**Step 1: Simplify to 2-step cascade**

Replace lines 941-990 with:

```go
// LookupBarcode looks up a food item by barcode:
// local DB (food_items) → OpenFoodFacts API fallback
func (s *Service) LookupBarcode(ctx context.Context, barcode string) (*BarcodeResponse, error) {
	if barcode == "" {
		return nil, fmt.Errorf("штрих-код обязателен")
	}

	// 1. Check local food_items table (fast — indexed, includes 3M+ imported products)
	food, err := s.getFoodByBarcode(ctx, barcode)
	if err == nil {
		return &BarcodeResponse{Found: true, Food: food, Cached: false}, nil
	}

	// 2. Fallback: Call OpenFoodFacts API
	product, err := s.offClient.LookupBarcode(ctx, barcode)
	if err != nil {
		s.log.Warn("OpenFoodFacts lookup failed", "error", err, "barcode", barcode)
	}
	if product != nil {
		foodItem := s.saveOFFProduct(ctx, barcode, product)
		if foodItem != nil {
			return &BarcodeResponse{Found: true, Food: foodItem, Cached: false}, nil
		}
	}

	// Not found anywhere
	message := "Продукт не найден. Попробуйте ввести вручную."
	return &BarcodeResponse{Found: false, Cached: false, Message: &message}, nil
}
```

This removes:
- The barcode_cache query (lines 954-971)
- The cache write in `saveOFFProduct` call — `cacheBarcode()` is no longer called

Note: `cacheBarcode()` function (lines 1115-1132) can stay as dead code for now. The `barcode_cache` table is untouched.

**Step 2: Verify build**

Run: `cd apps/api && go build ./...`
Expected: builds successfully

**Step 3: Run tests**

Run: `cd apps/api && go test ./internal/modules/food-tracker/ -v`
Expected: all tests pass

**Step 4: Commit**

```bash
git add apps/api/internal/modules/food-tracker/service.go
git commit -m "feat: simplify barcode lookup to DB-first with API fallback"
```

---

### Task 6: Test import tool end-to-end

**Step 1: Dry run to verify parsing**

Run: `cd apps/api && go run ./cmd/import-openfoodfacts/ --csv-path ~/Downloads/en.openfoodfacts.org.products.csv --dry-run`
Expected: reports ~3M qualifying products, no errors

**Step 2: Test with real DB on small subset**

Create a small test CSV (first 10,000 lines) and run against the DB:

```bash
head -10000 ~/Downloads/en.openfoodfacts.org.products.csv > /tmp/off-test.csv
cd apps/api && go run ./cmd/import-openfoodfacts/ \
  --csv-path /tmp/off-test.csv \
  --database-url "$DATABASE_URL" \
  --batch-size 500
```

Expected: inserts/updates complete without errors, reports counts

**Step 3: Verify data in DB**

```bash
# Check counts
psql "$DATABASE_URL" -c "SELECT source, COUNT(*) FROM food_items GROUP BY source"

# Check barcode lookup works
psql "$DATABASE_URL" -c "SELECT id, name, brand, barcode FROM food_items WHERE barcode IS NOT NULL LIMIT 5"

# Check search works
psql "$DATABASE_URL" -c "SELECT name, source FROM food_items WHERE to_tsvector('russian', name) @@ plainto_tsquery('russian', 'молоко') LIMIT 5"
```

**Step 4: Run full import (when ready)**

```bash
cd apps/api && go run ./cmd/import-openfoodfacts/ \
  --csv-path ~/Downloads/en.openfoodfacts.org.products.csv \
  --database-url "$DATABASE_URL" \
  --batch-size 1000
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: OpenFoodFacts CSV import with dedup, unified search, and simplified barcode lookup"
```

---

### Summary of all changes

| Component | Action |
|---|---|
| `migrations/017_*` | Unique barcode index on food_items |
| `migrations/018_*` | Composite FTS index (name+brand) on food_items |
| `cmd/import-openfoodfacts/main.go` | New Go CLI tool for CSV import |
| `service.go` SearchFoods() | UNION search across products + food_items |
| `service.go` LookupBarcode() | Simplified: DB → API fallback (removed cache step) |
