package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// ============================================================================
// Configuration & types
// ============================================================================

type config struct {
	databaseURL string
	csvPath     string
	dryRun      bool
}

// foodRow holds a parsed and validated row from the OpenFoodFacts TSV dump.
type foodRow struct {
	barcode        string
	name           string
	brand          string
	category       string
	servingSize    float64
	caloriesPer100 float64
	proteinPer100  float64
	fatPer100      float64
	carbsPer100    float64
	fiberPer100    *float64
	sugarPer100    *float64
	sodiumPer100   *float64
	additionalJSON []byte // pre-marshalled JSONB for additional_nutrients
}

// stats tracks import progress counters.
type stats struct {
	totalRead       int64
	skippedFilter   int64
	qualifying      int64
	errors          int64
	dupsRemoved     int64
	enrichedBarcode int64
	enrichedName    int64
	inserted        int64
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
// Row parsing (unchanged from per-row version)
// ============================================================================

func safeCol(record []string, idx int) string {
	if idx < 0 || idx >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[idx])
}

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

func firstFromCommaList(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	parts := strings.SplitN(s, ",", 2)
	result := strings.TrimSpace(parts[0])
	return truncate(result, maxLen)
}

func truncate(s string, maxLen int) string {
	if utf8.RuneCountInString(s) > maxLen {
		runes := []rune(s)
		return string(runes[:maxLen])
	}
	return s
}

func parseRow(record []string, ci *columnIndex) *foodRow {
	barcode := safeCol(record, ci.code)
	if len(barcode) < 8 {
		return nil
	}

	name := safeCol(record, ci.productName)
	if name == "" {
		return nil
	}

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

	if calories < 0 || protein < 0 || fat < 0 || carbs < 0 {
		return nil
	}

	brand := firstFromCommaList(safeCol(record, ci.brands), 255)
	category := firstFromCommaList(safeCol(record, ci.categoriesEn), 255)
	if category == "" {
		category = "imported"
	}

	servingSize := 100.0
	if sv := parseOptionalFloat(safeCol(record, ci.servingQuantity)); sv != nil && *sv > 0 {
		servingSize = *sv
	}

	fiber := parseOptionalFloat(safeCol(record, ci.fiber100g))
	sugar := parseOptionalFloat(safeCol(record, ci.sugars100g))
	sodium := parseOptionalFloat(safeCol(record, ci.sodium100g))

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

func buildAdditionalNutrients(record []string, ci *columnIndex, fiber, sugar, sodium *float64) []byte {
	m := make(map[string]float64)

	addOpt := func(key string, idx int) {
		if v := parseOptionalFloat(safeCol(record, idx)); v != nil {
			m[key] = *v
		}
	}

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
	addOpt("vitamin_a", ci.vitaminA100g)
	addOpt("vitamin_c", ci.vitaminC100g)
	addOpt("vitamin_d", ci.vitaminD100g)
	addOpt("vitamin_e", ci.vitaminE100g)
	addOpt("vitamin_b1", ci.vitaminB1100g)
	addOpt("vitamin_b2", ci.vitaminB2100g)
	addOpt("vitamin_b6", ci.vitaminB6100g)
	addOpt("vitamin_b9", ci.vitaminB9100g)
	addOpt("vitamin_b12", ci.vitaminB12100g)
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
// Streaming COPY source — implements pgx.CopyFromSource
// ============================================================================

var stagingColumns = []string{
	"barcode", "name", "brand", "category", "serving_size",
	"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
	"fiber_per_100", "sugar_per_100", "sodium_per_100",
	"additional_nutrients",
}

type csvCopySource struct {
	reader  *csv.Reader
	ci      *columnIndex
	stats   *stats
	start   time.Time
	current *foodRow
}

func (s *csvCopySource) Next() bool {
	for {
		record, err := s.reader.Read()
		if errors.Is(err, io.EOF) {
			return false
		}
		if err != nil {
			s.stats.errors++
			if s.stats.errors <= 100 {
				log.Printf("WARN: CSV parse error at row %d: %v", s.stats.totalRead+1, err)
			}
			continue
		}
		s.stats.totalRead++

		if s.stats.totalRead%100_000 == 0 {
			elapsed := time.Since(s.start)
			rate := float64(s.stats.totalRead) / elapsed.Seconds()
			log.Printf("  COPY progress: %d rows read (%.0f/sec), %d qualifying, %d skipped",
				s.stats.totalRead, rate, s.stats.qualifying, s.stats.skippedFilter)
		}

		row := parseRow(record, s.ci)
		if row == nil {
			s.stats.skippedFilter++
			continue
		}
		s.stats.qualifying++
		s.current = row
		return true
	}
}

func (s *csvCopySource) Values() ([]any, error) {
	r := s.current
	var additionalStr *string
	if r.additionalJSON != nil {
		v := string(r.additionalJSON)
		additionalStr = &v
	}
	var brand *string
	if r.brand != "" {
		brand = &r.brand
	}
	return []any{
		r.barcode,
		r.name,
		brand,
		r.category,
		r.servingSize,
		r.caloriesPer100,
		r.proteinPer100,
		r.fatPer100,
		r.carbsPer100,
		r.fiberPer100,
		r.sugarPer100,
		r.sodiumPer100,
		additionalStr,
	}, nil
}

func (s *csvCopySource) Err() error {
	return nil
}

// ============================================================================
// Staging table & merge SQL
// ============================================================================

const createStagingSQL = `
DROP TABLE IF EXISTS _staging_off_import;
CREATE UNLOGGED TABLE _staging_off_import (
	barcode            TEXT NOT NULL,
	name               TEXT NOT NULL,
	brand              TEXT,
	category           TEXT,
	serving_size       DOUBLE PRECISION,
	calories_per_100   DOUBLE PRECISION,
	protein_per_100    DOUBLE PRECISION,
	fat_per_100        DOUBLE PRECISION,
	carbs_per_100      DOUBLE PRECISION,
	fiber_per_100      DOUBLE PRECISION,
	sugar_per_100      DOUBLE PRECISION,
	sodium_per_100     DOUBLE PRECISION,
	additional_nutrients TEXT
)`

const dedupStagingSQL = `
WITH ranked AS (
	SELECT ctid, ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY ctid) AS rn
	FROM _staging_off_import
)
DELETE FROM _staging_off_import
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)`

// Remove rows with extreme values that overflow DECIMAL(10,2) columns in food_items.
const cleanupExtremesSQL = `
DELETE FROM _staging_off_import
WHERE serving_size > 99999999
   OR calories_per_100 > 99999999
   OR protein_per_100 > 99999999
   OR fat_per_100 > 99999999
   OR carbs_per_100 > 99999999
   OR COALESCE(fiber_per_100, 0) > 99999999
   OR COALESCE(sugar_per_100, 0) > 99999999
   OR COALESCE(sodium_per_100, 0) > 99999999`

const indexStagingSQL = `
CREATE INDEX idx_staging_barcode ON _staging_off_import(barcode);
CREATE INDEX idx_staging_lower_name ON _staging_off_import(LOWER(name))`

const mergeByBarcodeSQL = `
UPDATE food_items fi SET
	name = CASE WHEN fi.name = '' OR fi.name IS NULL THEN s.name ELSE fi.name END,
	brand = CASE WHEN fi.brand = '' OR fi.brand IS NULL THEN s.brand ELSE fi.brand END,
	category = CASE WHEN fi.category = '' OR fi.category IS NULL THEN s.category ELSE fi.category END,
	serving_size = CASE WHEN fi.serving_size IS NULL OR fi.serving_size = 0 THEN s.serving_size ELSE fi.serving_size END,
	calories_per_100 = CASE WHEN fi.calories_per_100 IS NULL OR fi.calories_per_100 = 0 THEN s.calories_per_100 ELSE fi.calories_per_100 END,
	protein_per_100 = CASE WHEN fi.protein_per_100 IS NULL OR fi.protein_per_100 = 0 THEN s.protein_per_100 ELSE fi.protein_per_100 END,
	fat_per_100 = CASE WHEN fi.fat_per_100 IS NULL OR fi.fat_per_100 = 0 THEN s.fat_per_100 ELSE fi.fat_per_100 END,
	carbs_per_100 = CASE WHEN fi.carbs_per_100 IS NULL OR fi.carbs_per_100 = 0 THEN s.carbs_per_100 ELSE fi.carbs_per_100 END,
	fiber_per_100 = CASE WHEN fi.fiber_per_100 IS NULL OR fi.fiber_per_100 = 0 THEN s.fiber_per_100 ELSE fi.fiber_per_100 END,
	sugar_per_100 = CASE WHEN fi.sugar_per_100 IS NULL OR fi.sugar_per_100 = 0 THEN s.sugar_per_100 ELSE fi.sugar_per_100 END,
	sodium_per_100 = CASE WHEN fi.sodium_per_100 IS NULL OR fi.sodium_per_100 = 0 THEN s.sodium_per_100 ELSE fi.sodium_per_100 END,
	additional_nutrients = CASE WHEN fi.additional_nutrients IS NULL THEN s.additional_nutrients::jsonb ELSE fi.additional_nutrients END,
	updated_at = NOW()
FROM _staging_off_import s
WHERE fi.barcode = s.barcode AND fi.barcode IS NOT NULL`

const mergeByNameBrandSQL = `
WITH matched AS (
	SELECT DISTINCT ON (fi.id)
		fi.id AS target_id,
		s.barcode AS s_barcode,
		s.brand AS s_brand,
		s.category AS s_category,
		s.serving_size AS s_serving_size,
		s.calories_per_100 AS s_cal,
		s.protein_per_100 AS s_prot,
		s.fat_per_100 AS s_fat,
		s.carbs_per_100 AS s_carbs,
		s.fiber_per_100 AS s_fiber,
		s.sugar_per_100 AS s_sugar,
		s.sodium_per_100 AS s_sodium,
		s.additional_nutrients AS s_nutrients
	FROM _staging_off_import s
	JOIN food_items fi ON
		LOWER(fi.name) = LOWER(s.name)
		AND (
			(s.brand IS NULL AND (fi.brand IS NULL OR fi.brand = ''))
			OR LOWER(fi.brand) = LOWER(s.brand)
		)
	WHERE fi.barcode IS NULL
	  AND NOT EXISTS (
		  SELECT 1 FROM food_items f2 WHERE f2.barcode = s.barcode
	  )
	ORDER BY fi.id
)
UPDATE food_items fi SET
	barcode = m.s_barcode,
	brand = CASE WHEN fi.brand = '' OR fi.brand IS NULL THEN m.s_brand ELSE fi.brand END,
	category = CASE WHEN fi.category = '' OR fi.category IS NULL THEN m.s_category ELSE fi.category END,
	serving_size = CASE WHEN fi.serving_size IS NULL OR fi.serving_size = 0 THEN m.s_serving_size ELSE fi.serving_size END,
	calories_per_100 = CASE WHEN fi.calories_per_100 IS NULL OR fi.calories_per_100 = 0 THEN m.s_cal ELSE fi.calories_per_100 END,
	protein_per_100 = CASE WHEN fi.protein_per_100 IS NULL OR fi.protein_per_100 = 0 THEN m.s_prot ELSE fi.protein_per_100 END,
	fat_per_100 = CASE WHEN fi.fat_per_100 IS NULL OR fi.fat_per_100 = 0 THEN m.s_fat ELSE fi.fat_per_100 END,
	carbs_per_100 = CASE WHEN fi.carbs_per_100 IS NULL OR fi.carbs_per_100 = 0 THEN m.s_carbs ELSE fi.carbs_per_100 END,
	fiber_per_100 = CASE WHEN fi.fiber_per_100 IS NULL OR fi.fiber_per_100 = 0 THEN m.s_fiber ELSE fi.fiber_per_100 END,
	sugar_per_100 = CASE WHEN fi.sugar_per_100 IS NULL OR fi.sugar_per_100 = 0 THEN m.s_sugar ELSE fi.sugar_per_100 END,
	sodium_per_100 = CASE WHEN fi.sodium_per_100 IS NULL OR fi.sodium_per_100 = 0 THEN m.s_sodium ELSE fi.sodium_per_100 END,
	additional_nutrients = CASE WHEN fi.additional_nutrients IS NULL THEN m.s_nutrients::jsonb ELSE fi.additional_nutrients END,
	source = 'openfoodfacts',
	updated_at = NOW()
FROM matched m
WHERE fi.id = m.target_id`

const mergeInsertSQL = `
INSERT INTO food_items (
	id, name, brand, category, serving_size, serving_unit,
	calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
	fiber_per_100, sugar_per_100, sodium_per_100,
	barcode, source, verified, additional_nutrients,
	created_at, updated_at
)
SELECT
	gen_random_uuid(), s.name, s.brand, s.category, s.serving_size, 'г',
	s.calories_per_100, s.protein_per_100, s.fat_per_100, s.carbs_per_100,
	s.fiber_per_100, s.sugar_per_100, s.sodium_per_100,
	s.barcode, 'openfoodfacts', false, s.additional_nutrients::jsonb,
	NOW(), NOW()
FROM _staging_off_import s
WHERE NOT EXISTS (
	SELECT 1 FROM food_items fi WHERE fi.barcode = s.barcode
)
ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING`

const dropStagingSQL = `DROP TABLE IF EXISTS _staging_off_import`

// ============================================================================
// Main
// ============================================================================

func main() {
	cfg := config{}

	flag.StringVar(&cfg.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&cfg.csvPath, "csv-path", "", "Path to OpenFoodFacts TSV file (required)")
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

	reader := csv.NewReader(file)
	reader.Comma = '\t'
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		log.Fatalf("Failed to read header: %v", err)
	}
	headerCopy := make([]string, len(header))
	copy(headerCopy, header)

	ci, err := resolveColumns(headerCopy)
	if err != nil {
		log.Fatalf("Column resolution failed: %v", err)
	}
	log.Printf("Header parsed: %d columns, required columns resolved", len(headerCopy))

	// Graceful shutdown
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	s := &stats{}
	startTime := time.Now()

	// ---- DRY RUN: just parse and count ----
	if cfg.dryRun {
		log.Println("DRY RUN mode — parsing CSV only, no database writes")
		for {
			if ctx.Err() != nil {
				log.Println("Shutdown signal received")
				break
			}
			record, err := reader.Read()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				s.errors++
				continue
			}
			s.totalRead++
			if s.totalRead%100_000 == 0 {
				elapsed := time.Since(startTime)
				rate := float64(s.totalRead) / elapsed.Seconds()
				log.Printf("  %d rows read (%.0f/sec), %d qualifying", s.totalRead, rate, s.qualifying)
			}
			if parseRow(record, ci) != nil {
				s.qualifying++
			} else {
				s.skippedFilter++
			}
		}
		printSummary(s, startTime)
		return
	}

	// ---- LIVE IMPORT: staging table + bulk merge ----

	// Connect using pgx directly (needed for CopyFrom)
	conn, err := pgx.Connect(ctx, cfg.databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer conn.Close(context.Background())
	log.Println("Database connected")

	// Phase 1: Create staging table and COPY data
	log.Println("=== Phase 1: Load CSV into staging table via COPY ===")

	if _, err := conn.Exec(ctx, createStagingSQL); err != nil {
		log.Fatalf("Failed to create staging table: %v", err)
	}
	log.Println("Staging table created")

	source := &csvCopySource{
		reader: reader,
		ci:     ci,
		stats:  s,
		start:  startTime,
	}

	copyCount, err := conn.CopyFrom(
		ctx,
		pgx.Identifier{"_staging_off_import"},
		stagingColumns,
		source,
	)
	if err != nil {
		log.Fatalf("COPY failed: %v", err)
	}
	log.Printf("Phase 1 complete: %d rows loaded into staging (%.1fs)",
		copyCount, time.Since(startTime).Seconds())

	// Phase 1.5: Dedup staging table
	log.Println("=== Phase 1.5: Deduplicating staging table ===")
	phaseStart := time.Now()

	tag, err := conn.Exec(ctx, dedupStagingSQL)
	if err != nil {
		log.Fatalf("Dedup failed: %v", err)
	}
	s.dupsRemoved = tag.RowsAffected()
	log.Printf("Removed %d duplicate barcodes (%.1fs)", s.dupsRemoved, time.Since(phaseStart).Seconds())

	// Remove rows with values that overflow DECIMAL(10,2) in food_items
	tag, err = conn.Exec(ctx, cleanupExtremesSQL)
	if err != nil {
		log.Fatalf("Cleanup extremes failed: %v", err)
	}
	if removed := tag.RowsAffected(); removed > 0 {
		log.Printf("Removed %d rows with extreme values", removed)
	}

	// Create indexes on staging table for faster merge joins
	log.Println("Creating staging indexes...")
	phaseStart = time.Now()
	if _, err := conn.Exec(ctx, indexStagingSQL); err != nil {
		log.Fatalf("Staging index creation failed: %v", err)
	}
	log.Printf("Staging indexes created (%.1fs)", time.Since(phaseStart).Seconds())

	// Phase 2: Merge into food_items
	log.Println("=== Phase 2: Merge staging into food_items ===")

	// Step 1: Enrich existing records by barcode match
	log.Println("Step 1/3: Enriching existing records by barcode match...")
	phaseStart = time.Now()
	tag, err = conn.Exec(ctx, mergeByBarcodeSQL)
	if err != nil {
		log.Fatalf("Merge by barcode failed: %v", err)
	}
	s.enrichedBarcode = tag.RowsAffected()
	log.Printf("  Updated %d records by barcode match (%.1fs)", s.enrichedBarcode, time.Since(phaseStart).Seconds())

	// Step 2: Enrich existing records by name+brand match (add barcode)
	log.Println("Step 2/3: Enriching existing records by name+brand match...")
	phaseStart = time.Now()
	tag, err = conn.Exec(ctx, mergeByNameBrandSQL)
	if err != nil {
		log.Fatalf("Merge by name+brand failed: %v", err)
	}
	s.enrichedName = tag.RowsAffected()
	log.Printf("  Updated %d records by name+brand match (%.1fs)", s.enrichedName, time.Since(phaseStart).Seconds())

	// Step 3: Insert remaining new records
	log.Println("Step 3/3: Inserting new records...")
	phaseStart = time.Now()
	tag, err = conn.Exec(ctx, mergeInsertSQL)
	if err != nil {
		log.Fatalf("Merge insert failed: %v", err)
	}
	s.inserted = tag.RowsAffected()
	log.Printf("  Inserted %d new records (%.1fs)", s.inserted, time.Since(phaseStart).Seconds())

	// Phase 3: Cleanup
	log.Println("=== Phase 3: Cleanup ===")
	if _, err := conn.Exec(context.Background(), dropStagingSQL); err != nil {
		log.Printf("WARNING: Failed to drop staging table: %v", err)
	} else {
		log.Println("Staging table dropped")
	}

	printSummary(s, startTime)
}

func printSummary(s *stats, startTime time.Time) {
	elapsed := time.Since(startTime)
	log.Println("============================================================")
	log.Printf("IMPORT COMPLETE in %s", elapsed.Round(time.Second))
	log.Printf("  Total CSV rows read:      %d", s.totalRead)
	log.Printf("  Skipped (filter):         %d", s.skippedFilter)
	log.Printf("  Qualifying rows:          %d", s.qualifying)
	log.Printf("  Duplicates removed:       %d", s.dupsRemoved)
	log.Printf("  Enriched (barcode match): %d", s.enrichedBarcode)
	log.Printf("  Enriched (name+brand):    %d", s.enrichedName)
	log.Printf("  Inserted (new):           %d", s.inserted)
	log.Printf("  CSV parse errors:         %d", s.errors)
	log.Println("============================================================")
}
