package main

import (
	"context"
	"database/sql"
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

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// ============================================================================
// Configuration & types
// ============================================================================

type config struct {
	databaseURL string
	csvPath     string
	batchSize   int
	dryRun      bool
}

// foodRow holds a parsed and validated row from the OpenFoodFacts TSV dump.
type foodRow struct {
	barcode            string
	name               string
	brand              string
	category           string
	servingSize        float64
	caloriesPer100     float64
	proteinPer100      float64
	fatPer100          float64
	carbsPer100        float64
	fiberPer100        *float64
	sugarPer100        *float64
	sodiumPer100       *float64
	additionalJSON     []byte // pre-marshalled JSONB for additional_nutrients
}

// stats tracks import progress counters.
type stats struct {
	totalRead        int64
	skippedFilter    int64
	updatedBarcode   int64
	updatedNameBrand int64
	inserted         int64
	conflictSkipped  int64
	errors           int64
}

// ============================================================================
// Column index mapping — resolved once from the header row
// ============================================================================

type columnIndex struct {
	code              int
	productName       int
	brands            int
	categoriesEn      int
	servingQuantity   int
	energyKcal100g    int
	proteins100g      int
	fat100g           int
	carbohydrates100g int
	fiber100g         int
	sugars100g        int
	sodium100g        int
	saturatedFat100g  int
	vitaminA100g      int
	vitaminC100g      int
	vitaminD100g      int
	vitaminE100g      int
	vitaminB1100g     int
	vitaminB2100g     int
	vitaminB6100g     int
	vitaminB9100g     int
	vitaminB12100g    int
	calcium100g       int
	iron100g          int
	magnesium100g     int
	potassium100g     int
	zinc100g          int
}

// resolveColumns maps header names to their column indices.
// Returns an error if any required column is missing.
func resolveColumns(header []string) (*columnIndex, error) {
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[h] = i
	}

	get := func(name string) (int, error) {
		if i, ok := idx[name]; ok {
			return i, nil
		}
		return -1, fmt.Errorf("required column %q not found in header", name)
	}

	getOpt := func(name string) int {
		if i, ok := idx[name]; ok {
			return i
		}
		return -1
	}

	ci := &columnIndex{}
	var err error

	// Required columns
	if ci.code, err = get("code"); err != nil {
		return nil, err
	}
	if ci.productName, err = get("product_name"); err != nil {
		return nil, err
	}
	if ci.energyKcal100g, err = get("energy-kcal_100g"); err != nil {
		return nil, err
	}
	if ci.proteins100g, err = get("proteins_100g"); err != nil {
		return nil, err
	}
	if ci.fat100g, err = get("fat_100g"); err != nil {
		return nil, err
	}
	if ci.carbohydrates100g, err = get("carbohydrates_100g"); err != nil {
		return nil, err
	}

	// Optional columns
	ci.brands = getOpt("brands")
	ci.categoriesEn = getOpt("categories_en")
	ci.servingQuantity = getOpt("serving_quantity")
	ci.fiber100g = getOpt("fiber_100g")
	ci.sugars100g = getOpt("sugars_100g")
	ci.sodium100g = getOpt("sodium_100g")
	ci.saturatedFat100g = getOpt("saturated-fat_100g")
	ci.vitaminA100g = getOpt("vitamin-a_100g")
	ci.vitaminC100g = getOpt("vitamin-c_100g")
	ci.vitaminD100g = getOpt("vitamin-d_100g")
	ci.vitaminE100g = getOpt("vitamin-e_100g")
	ci.vitaminB1100g = getOpt("vitamin-b1_100g")
	ci.vitaminB2100g = getOpt("vitamin-b2_100g")
	ci.vitaminB6100g = getOpt("vitamin-b6_100g")
	ci.vitaminB9100g = getOpt("vitamin-b9_100g")
	ci.vitaminB12100g = getOpt("vitamin-b12_100g")
	ci.calcium100g = getOpt("calcium_100g")
	ci.iron100g = getOpt("iron_100g")
	ci.magnesium100g = getOpt("magnesium_100g")
	ci.potassium100g = getOpt("potassium_100g")
	ci.zinc100g = getOpt("zinc_100g")

	return ci, nil
}

// ============================================================================
// Row parsing
// ============================================================================

// safeCol returns the column value if the index is valid, otherwise "".
func safeCol(record []string, idx int) string {
	if idx < 0 || idx >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[idx])
}

// parseOptionalFloat returns a *float64 if the string is non-empty and parseable, else nil.
func parseOptionalFloat(s string) *float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &v
}

// firstFromCommaList extracts the first item from a comma-separated list,
// trims whitespace, and truncates to maxLen.
func firstFromCommaList(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	parts := strings.SplitN(s, ",", 2)
	result := strings.TrimSpace(parts[0])
	if len(result) > maxLen {
		result = result[:maxLen]
	}
	return result
}

// truncate limits a string to maxLen characters.
func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}

// parseRow converts a raw CSV record into a foodRow, applying all filters.
// Returns nil if the row should be skipped.
func parseRow(record []string, ci *columnIndex) *foodRow {
	barcode := safeCol(record, ci.code)
	if len(barcode) < 8 {
		return nil
	}

	name := safeCol(record, ci.productName)
	if name == "" {
		return nil
	}

	// Parse required numeric fields
	calStr := safeCol(record, ci.energyKcal100g)
	protStr := safeCol(record, ci.proteins100g)
	fatStr := safeCol(record, ci.fat100g)
	carbStr := safeCol(record, ci.carbohydrates100g)

	if calStr == "" || protStr == "" || fatStr == "" || carbStr == "" {
		return nil
	}

	calories, err := strconv.ParseFloat(calStr, 64)
	if err != nil {
		return nil
	}
	protein, err := strconv.ParseFloat(protStr, 64)
	if err != nil {
		return nil
	}
	fat, err := strconv.ParseFloat(fatStr, 64)
	if err != nil {
		return nil
	}
	carbs, err := strconv.ParseFloat(carbStr, 64)
	if err != nil {
		return nil
	}

	// Sanity check: skip rows with negative or clearly impossible values
	if calories < 0 || protein < 0 || fat < 0 || carbs < 0 {
		return nil
	}

	// Brand: first from comma list, max 255 chars
	brand := firstFromCommaList(safeCol(record, ci.brands), 255)

	// Category: first from comma list, default "imported"
	category := firstFromCommaList(safeCol(record, ci.categoriesEn), 255)
	if category == "" {
		category = "imported"
	}

	// Serving size
	servingSize := 100.0
	if sv := parseOptionalFloat(safeCol(record, ci.servingQuantity)); sv != nil && *sv > 0 {
		servingSize = *sv
	}

	// Optional nutrients
	fiber := parseOptionalFloat(safeCol(record, ci.fiber100g))
	sugar := parseOptionalFloat(safeCol(record, ci.sugars100g))
	sodium := parseOptionalFloat(safeCol(record, ci.sodium100g))

	// Build additional_nutrients JSONB
	additional := buildAdditionalNutrients(record, ci, fiber, sugar, sodium)

	return &foodRow{
		barcode:        barcode,
		name:           truncate(name, 255),
		brand:          brand,
		category:       category,
		servingSize:    servingSize,
		caloriesPer100: calories,
		proteinPer100:  protein,
		fatPer100:      fat,
		carbsPer100:    carbs,
		fiberPer100:    fiber,
		sugarPer100:    sugar,
		sodiumPer100:   sodium,
		additionalJSON: additional,
	}
}

// buildAdditionalNutrients assembles the JSONB blob for additional_nutrients.
func buildAdditionalNutrients(record []string, ci *columnIndex, fiber, sugar, sodium *float64) []byte {
	m := make(map[string]float64)

	addOpt := func(key string, idx int) {
		if v := parseOptionalFloat(safeCol(record, idx)); v != nil {
			m[key] = *v
		}
	}

	// Include fiber/sugar/sodium in JSONB as well for completeness
	if fiber != nil {
		m["fiber"] = *fiber
	}
	if sugar != nil {
		m["sugar"] = *sugar
	}
	if sodium != nil {
		m["sodium"] = *sodium
	}

	addOpt("saturated_fat", ci.saturatedFat100g)

	// Vitamins
	addOpt("vitamin_a", ci.vitaminA100g)
	addOpt("vitamin_c", ci.vitaminC100g)
	addOpt("vitamin_d", ci.vitaminD100g)
	addOpt("vitamin_e", ci.vitaminE100g)
	addOpt("vitamin_b1", ci.vitaminB1100g)
	addOpt("vitamin_b2", ci.vitaminB2100g)
	addOpt("vitamin_b6", ci.vitaminB6100g)
	addOpt("vitamin_b9", ci.vitaminB9100g)
	addOpt("vitamin_b12", ci.vitaminB12100g)

	// Minerals
	addOpt("calcium", ci.calcium100g)
	addOpt("iron", ci.iron100g)
	addOpt("magnesium", ci.magnesium100g)
	addOpt("potassium", ci.potassium100g)
	addOpt("zinc", ci.zinc100g)

	if len(m) == 0 {
		return nil
	}

	data, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	return data
}

// ============================================================================
// Database batch operations
// ============================================================================

// processBatch handles a batch of parsed rows inside a single transaction.
// It implements the three-level dedup strategy:
//  1. Match by barcode -> UPDATE (enrich empty fields only)
//  2. Match by LOWER(name)+LOWER(brand) where barcode IS NULL -> UPDATE (add barcode + enrich)
//  3. INSERT remaining with ON CONFLICT (barcode) DO NOTHING
func processBatch(ctx context.Context, db *sql.DB, batch []*foodRow, s *stats, dryRun bool) error {
	if len(batch) == 0 {
		return nil
	}

	if dryRun {
		s.inserted += int64(len(batch))
		return nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	for _, row := range batch {
		if err := processRow(ctx, tx, row, s); err != nil {
			s.errors++
			// Log but don't abort the whole batch for a single row failure
			log.Printf("WARN: row barcode=%s error: %v", row.barcode, err)
			continue
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

// processRow handles a single row through the three-level dedup strategy.
func processRow(ctx context.Context, tx *sql.Tx, row *foodRow, s *stats) error {
	// Step 1: Try to match by barcode in food_items -> UPDATE (enrich empty fields only)
	updated, err := enrichByBarcode(ctx, tx, row)
	if err != nil {
		return err
	}
	if updated {
		s.updatedBarcode++
		return nil
	}

	// Step 2: Match by LOWER(name)+LOWER(brand) where barcode IS NULL -> UPDATE (add barcode + enrich)
	updated, err = enrichByNameBrand(ctx, tx, row)
	if err != nil {
		return err
	}
	if updated {
		s.updatedNameBrand++
		return nil
	}

	// Step 3: INSERT with ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING
	inserted, err := insertRow(ctx, tx, row)
	if err != nil {
		return err
	}
	if inserted {
		s.inserted++
	} else {
		s.conflictSkipped++
	}

	return nil
}

// enrichByBarcode updates an existing row matched by barcode, filling only empty/zero fields.
// Returns true if a row was found and updated.
func enrichByBarcode(ctx context.Context, tx *sql.Tx, row *foodRow) (bool, error) {
	// Check if a row exists with this barcode
	query := `
		UPDATE food_items SET
			name = CASE WHEN name = '' OR name IS NULL THEN $2 ELSE name END,
			brand = CASE WHEN brand = '' OR brand IS NULL THEN $3 ELSE brand END,
			category = CASE WHEN category = '' OR category IS NULL THEN $4 ELSE category END,
			serving_size = CASE WHEN serving_size IS NULL OR serving_size = 0 THEN $5 ELSE serving_size END,
			calories_per_100 = CASE WHEN calories_per_100 IS NULL OR calories_per_100 = 0 THEN $6 ELSE calories_per_100 END,
			protein_per_100 = CASE WHEN protein_per_100 IS NULL OR protein_per_100 = 0 THEN $7 ELSE protein_per_100 END,
			fat_per_100 = CASE WHEN fat_per_100 IS NULL OR fat_per_100 = 0 THEN $8 ELSE fat_per_100 END,
			carbs_per_100 = CASE WHEN carbs_per_100 IS NULL OR carbs_per_100 = 0 THEN $9 ELSE carbs_per_100 END,
			fiber_per_100 = CASE WHEN fiber_per_100 IS NULL OR fiber_per_100 = 0 THEN $10 ELSE fiber_per_100 END,
			sugar_per_100 = CASE WHEN sugar_per_100 IS NULL OR sugar_per_100 = 0 THEN $11 ELSE sugar_per_100 END,
			sodium_per_100 = CASE WHEN sodium_per_100 IS NULL OR sodium_per_100 = 0 THEN $12 ELSE sodium_per_100 END,
			additional_nutrients = CASE WHEN additional_nutrients IS NULL THEN $13::jsonb ELSE additional_nutrients END,
			updated_at = NOW()
		WHERE barcode = $1
	`

	result, err := tx.ExecContext(ctx, query,
		row.barcode,           // $1
		row.name,              // $2
		nilIfEmpty(row.brand), // $3
		row.category,          // $4
		row.servingSize,       // $5
		row.caloriesPer100,    // $6
		row.proteinPer100,     // $7
		row.fatPer100,         // $8
		row.carbsPer100,       // $9
		row.fiberPer100,       // $10
		row.sugarPer100,       // $11
		row.sodiumPer100,      // $12
		nullableJSON(row.additionalJSON), // $13
	)
	if err != nil {
		return false, fmt.Errorf("enrich by barcode: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

// enrichByNameBrand updates an existing row matched by LOWER(name)+LOWER(brand)
// where barcode IS NULL, adding the barcode and enriching empty fields.
// Returns true if a row was found and updated.
func enrichByNameBrand(ctx context.Context, tx *sql.Tx, row *foodRow) (bool, error) {
	query := `
		UPDATE food_items SET
			barcode = $1,
			brand = CASE WHEN brand = '' OR brand IS NULL THEN $3 ELSE brand END,
			category = CASE WHEN category = '' OR category IS NULL THEN $4 ELSE category END,
			serving_size = CASE WHEN serving_size IS NULL OR serving_size = 0 THEN $5 ELSE serving_size END,
			calories_per_100 = CASE WHEN calories_per_100 IS NULL OR calories_per_100 = 0 THEN $6 ELSE calories_per_100 END,
			protein_per_100 = CASE WHEN protein_per_100 IS NULL OR protein_per_100 = 0 THEN $7 ELSE protein_per_100 END,
			fat_per_100 = CASE WHEN fat_per_100 IS NULL OR fat_per_100 = 0 THEN $8 ELSE fat_per_100 END,
			carbs_per_100 = CASE WHEN carbs_per_100 IS NULL OR carbs_per_100 = 0 THEN $9 ELSE carbs_per_100 END,
			fiber_per_100 = CASE WHEN fiber_per_100 IS NULL OR fiber_per_100 = 0 THEN $10 ELSE fiber_per_100 END,
			sugar_per_100 = CASE WHEN sugar_per_100 IS NULL OR sugar_per_100 = 0 THEN $11 ELSE sugar_per_100 END,
			sodium_per_100 = CASE WHEN sodium_per_100 IS NULL OR sodium_per_100 = 0 THEN $12 ELSE sodium_per_100 END,
			additional_nutrients = CASE WHEN additional_nutrients IS NULL THEN $13::jsonb ELSE additional_nutrients END,
			source = CASE WHEN source = 'database' THEN 'openfoodfacts' ELSE source END,
			updated_at = NOW()
		WHERE barcode IS NULL
		  AND LOWER(name) = LOWER($2)
		  AND (
			($3 IS NULL AND (brand IS NULL OR brand = ''))
			OR LOWER(brand) = LOWER($3)
		  )
	`

	result, err := tx.ExecContext(ctx, query,
		row.barcode,           // $1
		row.name,              // $2
		nilIfEmpty(row.brand), // $3
		row.category,          // $4
		row.servingSize,       // $5
		row.caloriesPer100,    // $6
		row.proteinPer100,     // $7
		row.fatPer100,         // $8
		row.carbsPer100,       // $9
		row.fiberPer100,       // $10
		row.sugarPer100,       // $11
		row.sodiumPer100,      // $12
		nullableJSON(row.additionalJSON), // $13
	)
	if err != nil {
		return false, fmt.Errorf("enrich by name+brand: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

// insertRow inserts a new food_items row.
// ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING handles races.
// Returns true if the row was actually inserted.
func insertRow(ctx context.Context, tx *sql.Tx, row *foodRow) (bool, error) {
	id := uuid.New().String()

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
		)
		ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING
	`

	result, err := tx.ExecContext(ctx, query,
		id,                    // $1
		row.name,              // $2
		nilIfEmpty(row.brand), // $3
		row.category,          // $4
		row.servingSize,       // $5
		row.caloriesPer100,    // $6
		row.proteinPer100,     // $7
		row.fatPer100,         // $8
		row.carbsPer100,       // $9
		row.fiberPer100,       // $10
		row.sugarPer100,       // $11
		row.sodiumPer100,      // $12
		row.barcode,           // $13
		nullableJSON(row.additionalJSON), // $14
	)
	if err != nil {
		return false, fmt.Errorf("insert row: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

// nilIfEmpty returns nil for empty strings (maps to SQL NULL).
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// nullableJSON returns nil if the byte slice is nil, otherwise a string for the JSONB parameter.
func nullableJSON(b []byte) *string {
	if b == nil {
		return nil
	}
	s := string(b)
	return &s
}

// ============================================================================
// Main
// ============================================================================

func main() {
	cfg := config{}

	flag.StringVar(&cfg.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&cfg.csvPath, "csv-path", "", "Path to OpenFoodFacts TSV file (required)")
	flag.IntVar(&cfg.batchSize, "batch-size", 1000, "Number of rows per transaction batch")
	flag.BoolVar(&cfg.dryRun, "dry-run", false, "Parse and validate without writing to database")
	flag.Parse()

	if cfg.csvPath == "" {
		log.Fatal("--csv-path is required")
	}

	if !cfg.dryRun && cfg.databaseURL == "" {
		log.Fatal("--database-url is required (or set DATABASE_URL env var)")
	}

	// Open TSV file
	file, err := os.Open(cfg.csvPath)
	if err != nil {
		log.Fatalf("Failed to open CSV file: %v", err)
	}
	defer file.Close()

	// Configure CSV reader for TSV
	reader := csv.NewReader(file)
	reader.Comma = '\t'
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1 // Variable number of fields
	reader.ReuseRecord = true   // Reduce GC pressure for 12GB file

	// Read header
	header, err := reader.Read()
	if err != nil {
		log.Fatalf("Failed to read header: %v", err)
	}

	// Make a copy since ReuseRecord is true
	headerCopy := make([]string, len(header))
	copy(headerCopy, header)

	ci, err := resolveColumns(headerCopy)
	if err != nil {
		log.Fatalf("Column resolution failed: %v", err)
	}

	log.Printf("Header parsed: %d columns, required columns resolved", len(headerCopy))

	// Connect to database (unless dry-run)
	var db *sql.DB
	if !cfg.dryRun {
		db, err = sql.Open("pgx", cfg.databaseURL)
		if err != nil {
			log.Fatalf("Failed to open database: %v", err)
		}
		defer db.Close()

		db.SetMaxOpenConns(4)
		db.SetMaxIdleConns(2)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			log.Fatalf("Failed to ping database: %v", err)
		}
		log.Println("Database connected")
	} else {
		log.Println("DRY RUN mode — no database writes")
	}

	// Process rows
	ctx := context.Background()
	s := &stats{}
	batch := make([]*foodRow, 0, cfg.batchSize)
	startTime := time.Now()

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			s.errors++
			// Log parse errors but continue (corrupted lines happen in 12GB dumps)
			if s.errors <= 100 {
				log.Printf("WARN: CSV parse error at row %d: %v", s.totalRead+1, err)
			}
			continue
		}

		s.totalRead++

		// Progress logging every 100,000 rows
		if s.totalRead%100_000 == 0 {
			elapsed := time.Since(startTime)
			rate := float64(s.totalRead) / elapsed.Seconds()
			log.Printf("PROGRESS: %d rows read (%.0f rows/sec) | inserted=%d updated_barcode=%d updated_name=%d skipped=%d errors=%d",
				s.totalRead, rate, s.inserted, s.updatedBarcode, s.updatedNameBrand, s.skippedFilter, s.errors)
		}

		// Parse and filter
		row := parseRow(record, ci)
		if row == nil {
			s.skippedFilter++
			continue
		}

		batch = append(batch, row)

		// Flush batch when full
		if len(batch) >= cfg.batchSize {
			if err := processBatch(ctx, db, batch, s, cfg.dryRun); err != nil {
				log.Printf("ERROR: batch processing failed: %v", err)
				s.errors++
			}
			// Reset batch (re-use slice capacity)
			batch = batch[:0]
		}
	}

	// Flush remaining rows
	if len(batch) > 0 {
		if err := processBatch(ctx, db, batch, s, cfg.dryRun); err != nil {
			log.Printf("ERROR: final batch processing failed: %v", err)
			s.errors++
		}
	}

	// Summary
	elapsed := time.Since(startTime)
	log.Println("============================================================")
	log.Printf("IMPORT COMPLETE in %s", elapsed.Round(time.Second))
	log.Printf("  Total rows read:          %d", s.totalRead)
	log.Printf("  Skipped (filter):         %d", s.skippedFilter)
	log.Printf("  Updated (barcode match):  %d", s.updatedBarcode)
	log.Printf("  Updated (name+brand):     %d", s.updatedNameBrand)
	log.Printf("  Inserted (new):           %d", s.inserted)
	log.Printf("  Skipped (conflict):       %d", s.conflictSkipped)
	log.Printf("  Errors:                   %d", s.errors)
	log.Println("============================================================")

	if s.errors > 0 {
		os.Exit(1)
	}
}
