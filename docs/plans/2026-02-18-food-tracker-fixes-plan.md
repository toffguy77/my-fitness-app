# Food Tracker Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all broken food tracker user flows: register backend routes, integrate real barcode scanning with html5-qrcode, connect OpenFoodFacts API, fix batch photo adds, edit mode, search pagination, and recommendations currentIntake.

**Architecture:** The food tracker is a feature module split across Next.js frontend (`apps/web/src/features/food-tracker/`) and Go/Gin backend (`apps/api/internal/modules/food-tracker/`). Frontend uses Zustand store + hooks + components pattern. Backend uses handler/service pattern with PostgreSQL. API calls go through `getApiUrl()` which prefixes `/backend-api/v1`.

**Tech Stack:** Next.js 16, React 19, Zustand, TypeScript, Go 1.24, Gin, PostgreSQL, html5-qrcode (new dep)

---

### Task 1: Register Food Tracker Routes in Backend

**Files:**
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add import for food-tracker module**

Add to imports block in `main.go`:
```go
foodtracker "github.com/burcev/api/internal/modules/food-tracker"
```

**Step 2: Register food-tracker routes**

After the logs routes block (line ~199), add:
```go
// Food tracker routes (protected)
foodTrackerHandler := foodtracker.NewHandler(cfg, log, db)
ftGroup := v1.Group("/food-tracker")
ftGroup.Use(middleware.RequireAuth(cfg))
{
    // Food entries
    ftGroup.GET("/entries", foodTrackerHandler.GetEntries)
    ftGroup.POST("/entries", foodTrackerHandler.CreateEntry)
    ftGroup.PUT("/entries/:id", foodTrackerHandler.UpdateEntry)
    ftGroup.DELETE("/entries/:id", foodTrackerHandler.DeleteEntry)

    // Food search
    ftGroup.GET("/search", foodTrackerHandler.SearchFoods)
    ftGroup.GET("/barcode/:code", foodTrackerHandler.LookupBarcode)
    ftGroup.GET("/recent", foodTrackerHandler.GetRecentFoods)
    ftGroup.GET("/favorites", foodTrackerHandler.GetFavoriteFoods)
    ftGroup.POST("/favorites/:foodId", foodTrackerHandler.AddToFavorites)
    ftGroup.DELETE("/favorites/:foodId", foodTrackerHandler.RemoveFromFavorites)

    // Water tracking
    ftGroup.GET("/water", foodTrackerHandler.GetWaterIntake)
    ftGroup.POST("/water", foodTrackerHandler.AddWater)

    // Recommendations
    ftGroup.GET("/recommendations", foodTrackerHandler.GetRecommendations)
    ftGroup.GET("/recommendations/:id", foodTrackerHandler.GetRecommendationDetail)
    ftGroup.PUT("/recommendations/preferences", foodTrackerHandler.UpdatePreferences)
    ftGroup.POST("/recommendations/custom", foodTrackerHandler.CreateCustomRecommendation)
}
```

**Step 3: Verify it compiles**

Run: `cd apps/api && go build ./cmd/server`
Expected: Clean build, no errors

**Step 4: Run existing backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/cmd/server/main.go
git commit -m "feat: register food-tracker routes in main.go"
```

---

### Task 2: OpenFoodFacts Client + Barcode Cache Sliding TTL

**Files:**
- Create: `apps/api/internal/shared/openfoodfacts/client.go`
- Modify: `apps/api/internal/modules/food-tracker/service.go` (LookupBarcode + cacheBarcode)

**Step 1: Create OpenFoodFacts HTTP client**

Create `apps/api/internal/shared/openfoodfacts/client.go`:
```go
package openfoodfacts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	BaseURL   = "https://world.openfoodfacts.org/api/v2/product"
	UserAgent = "BurcevFitnessApp/1.0 (https://burcev.team)"
	Timeout   = 10 * time.Second
)

type Product struct {
	Code    string  `json:"code"`
	Name    string  `json:"product_name"`
	Brand   string  `json:"brands"`
	Calories float64 `json:"-"`
	Protein  float64 `json:"-"`
	Fat      float64 `json:"-"`
	Carbs    float64 `json:"-"`
}

type apiResponse struct {
	Status  int `json:"status"`
	Product struct {
		ProductName string `json:"product_name"`
		Brands      string `json:"brands"`
		Nutriments  struct {
			EnergyKcal100g float64 `json:"energy-kcal_100g"`
			Proteins100g   float64 `json:"proteins_100g"`
			Fat100g        float64 `json:"fat_100g"`
			Carbs100g      float64 `json:"carbohydrates_100g"`
		} `json:"nutriments"`
	} `json:"product"`
}

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: Timeout},
	}
}

func (c *Client) LookupBarcode(ctx context.Context, barcode string) (*Product, error) {
	url := fmt.Sprintf("%s/%s?fields=product_name,brands,nutriments", BaseURL, barcode)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", UserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var apiResp apiResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if apiResp.Status != 1 || apiResp.Product.ProductName == "" {
		return nil, nil // not found
	}

	return &Product{
		Code:     barcode,
		Name:     apiResp.Product.ProductName,
		Brand:    apiResp.Product.Brands,
		Calories: apiResp.Product.Nutriments.EnergyKcal100g,
		Protein:  apiResp.Product.Nutriments.Proteins100g,
		Fat:      apiResp.Product.Nutriments.Fat100g,
		Carbs:    apiResp.Product.Nutriments.Carbs100g,
	}, nil
}
```

**Step 2: Update LookupBarcode in service.go**

Add `offClient` field to Service and update NewService:
```go
import "github.com/burcev/api/internal/shared/openfoodfacts"

type Service struct {
	db        *database.DB
	log       *logger.Logger
	offClient *openfoodfacts.Client
}

func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{
		db:        db,
		log:       log,
		offClient: openfoodfacts.NewClient(),
	}
}
```

Replace `LookupBarcode` method — after local DB miss, call OpenFoodFacts:
```go
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
	cachedFood, err := s.getCachedBarcode(ctx, barcode)
	if err == nil && cachedFood != nil {
		// Extend TTL on hit (sliding expiration)
		s.extendCacheTTL(ctx, barcode)
		return &BarcodeResponse{Found: true, Food: cachedFood, Cached: true}, nil
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
```

Add helper methods:
```go
func (s *Service) getCachedBarcode(ctx context.Context, barcode string) (*FoodItem, error) {
	query := `
		SELECT food_data FROM barcode_cache
		WHERE barcode = $1 AND expires_at > NOW()
	`
	var foodData string
	err := s.db.QueryRowContext(ctx, query, barcode).Scan(&foodData)
	if err != nil {
		return nil, err
	}
	// Cache stores food_id reference, look up actual item
	return s.getFoodByBarcode(ctx, barcode)
}

func (s *Service) extendCacheTTL(ctx context.Context, barcode string) {
	query := `UPDATE barcode_cache SET expires_at = NOW() + INTERVAL '90 days' WHERE barcode = $1`
	_, _ = s.db.ExecContext(ctx, query, barcode)
}

func (s *Service) saveOFFProduct(ctx context.Context, barcode string, product *openfoodfacts.Product) *FoodItem {
	id := uuid.New().String()
	query := `
		INSERT INTO food_items (id, name, brand, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			barcode, source, verified, created_at, updated_at)
		VALUES ($1, $2, $3, 'imported', 100, 'г', $4, $5, $6, $7, $8, 'openfoodfacts', false, NOW(), NOW())
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
```

**Step 3: Update cacheBarcode TTL from 30 to 90 days**

In `cacheBarcode()`, change `'30 days'` to `'90 days'` (two occurrences in the INTERVAL).

**Step 4: Verify it compiles and tests pass**

Run: `cd apps/api && go build ./cmd/server && go test ./... -v`

**Step 5: Commit**

```bash
git add apps/api/internal/shared/openfoodfacts/client.go apps/api/internal/modules/food-tracker/service.go
git commit -m "feat: integrate OpenFoodFacts API with 90-day sliding cache"
```

---

### Task 3: Install html5-qrcode and Implement Barcode Scanner

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/BarcodeTab.tsx`
- Modify: `apps/web/src/features/food-tracker/hooks/useBarcodeScanner.ts`

**Step 1: Install html5-qrcode**

Run: `cd apps/web && npm install html5-qrcode`

**Step 2: Rewrite useBarcodeScanner hook**

Replace the hook to use html5-qrcode for real scanning. Key changes:
- Import `Html5Qrcode` via dynamic import (SSR-safe)
- On `startScanning()`: create Html5Qrcode instance, start with back camera
- On detect: auto-call `lookupBarcode()` and stop scanning
- On stop/unmount: properly cleanup scanner instance
- Keep manual input as fallback
- Update cache duration from 30 to 90 days with sliding refresh on hit

```typescript
// Key changes to useBarcodeScanner.ts:
const DEFAULT_CACHE_DURATION_DAYS = 90;

// In getCachedBarcode: refresh expiresAt on read (sliding TTL)
function getCachedBarcode(barcode: string): FoodItem | null {
    // ... existing cache check ...
    // On hit: refresh expiry
    setCachedBarcode(barcode, data.food, DEFAULT_CACHE_DURATION_DAYS);
    return data.food;
}

// New: scanner management
let scannerInstance: any = null;

async function startScanning(videoElementId: string, onDetect: (barcode: string) => void) {
    const { Html5Qrcode } = await import('html5-qrcode');
    scannerInstance = new Html5Qrcode(videoElementId);
    await scannerInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText: string) => { onDetect(decodedText); },
        () => {} // ignore errors during scanning
    );
}

async function stopScanning() {
    if (scannerInstance?.isScanning) {
        await scannerInstance.stop();
    }
    scannerInstance = null;
}
```

**Step 3: Rewrite BarcodeTab component**

Key changes:
- Remove manual video/stream management (html5-qrcode handles it)
- Add a `<div id="barcode-reader" />` container for html5-qrcode to render into
- On "Включить камеру" click: call hook's `startScanning()`
- On successful scan: auto-trigger `lookupBarcode()`, show result
- Keep manual input form as fallback below the scanner
- On unmount/tab switch: call `stopScanning()`

The component should:
1. Show "Включить камеру" button in idle state
2. Show live camera feed with real barcode detection overlay when active
3. Auto-detect barcode → auto-lookup → show product card
4. Keep manual input always available below

**Step 4: Verify frontend builds**

Run: `cd apps/web && npm run build`
Expected: Clean build

**Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json \
  apps/web/src/features/food-tracker/components/BarcodeTab.tsx \
  apps/web/src/features/food-tracker/hooks/useBarcodeScanner.ts
git commit -m "feat: real barcode scanning with html5-qrcode"
```

---

### Task 4: Fix Batch Photo Add (Multiple Items)

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`

**Step 1: Implement sequential batch add in handleSelectFoods**

Replace the `handleSelectFoods` callback (line ~174) to process all items:

```typescript
const [batchFoods, setBatchFoods] = useState<FoodItem[]>([]);
const [batchIndex, setBatchIndex] = useState(0);

const handleSelectFoods = useCallback((foods: FoodItem[]) => {
    if (foods.length === 1) {
        handleSelectFood(foods[0]);
    } else if (foods.length > 1) {
        setBatchFoods(foods);
        setBatchIndex(0);
        handleSelectFood(foods[0]);
    }
}, [handleSelectFood]);
```

**Step 2: Update handleSaveEntry to advance batch**

After successfully saving an entry, check if there are more items in the batch:

```typescript
const handleSaveEntry = useCallback(async () => {
    if (!selectedFood || !calculatedNutrition) return;
    setIsSaving(true);
    try {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        await addEntry(mealType, {
            foodId: selectedFood.id, mealType, portionType, portionAmount, time, date: selectedDate,
        });

        // Check if there are more items in batch
        const nextIndex = batchIndex + 1;
        if (batchFoods.length > 0 && nextIndex < batchFoods.length) {
            setBatchIndex(nextIndex);
            handleSelectFood(batchFoods[nextIndex]);
        } else {
            // Done — reset batch and close
            setBatchFoods([]);
            setBatchIndex(0);
            onClose();
        }
    } catch (error) {
        console.error('Failed to save entry:', error);
    } finally {
        setIsSaving(false);
    }
}, [selectedFood, calculatedNutrition, mealType, portionType, portionAmount,
    selectedDate, addEntry, onClose, batchFoods, batchIndex, handleSelectFood]);
```

**Step 3: Add batch progress indicator and skip button**

In the portion selection step, show progress when in batch mode:

```tsx
{batchFoods.length > 1 && (
    <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
            Добавляем {batchIndex + 1} из {batchFoods.length}
        </p>
        <button type="button" onClick={handleSkipBatchItem}
            className="text-sm text-blue-600 hover:text-blue-800">
            Пропустить
        </button>
    </div>
)}
```

Add skip handler:
```typescript
const handleSkipBatchItem = useCallback(() => {
    const nextIndex = batchIndex + 1;
    if (nextIndex < batchFoods.length) {
        setBatchIndex(nextIndex);
        handleSelectFood(batchFoods[nextIndex]);
    } else {
        setBatchFoods([]);
        setBatchIndex(0);
        onClose();
    }
}, [batchIndex, batchFoods, handleSelectFood, onClose]);
```

**Step 4: Reset batch state when modal opens**

In the `useEffect` that resets state on modal open (line ~95), add:
```typescript
setBatchFoods([]);
setBatchIndex(0);
```

**Step 5: Update save button text for batch mode**

Change button text from "Добавить" to "Добавить и далее" when more items remain:
```tsx
<span>{batchFoods.length > 0 && batchIndex + 1 < batchFoods.length ? 'Добавить и далее' : 'Добавить'}</span>
```

**Step 6: Verify frontend builds**

Run: `cd apps/web && npm run build`

**Step 7: Commit**

```bash
git add apps/web/src/features/food-tracker/components/FoodEntryModal.tsx
git commit -m "feat: batch photo add with sequential portion selection"
```

---

### Task 5: Fix Edit Mode in FoodEntryModal

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`
- Modify: `apps/web/src/features/food-tracker/store/foodTrackerStore.ts`

**Step 1: Populate modal with existing entry data when editing**

In the `useEffect` that resets state (line ~95), add edit mode handling:

```typescript
useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
        if (editingEntry) {
            // Edit mode: pre-fill with existing data
            setActiveTab(DEFAULT_TAB);
            setStep('select-portion');
            setSelectedFood({
                id: editingEntry.foodId,
                name: editingEntry.foodName,
                nutritionPer100: {
                    calories: (editingEntry.nutrition.calories / editingEntry.portionAmount) * 100,
                    protein: (editingEntry.nutrition.protein / editingEntry.portionAmount) * 100,
                    fat: (editingEntry.nutrition.fat / editingEntry.portionAmount) * 100,
                    carbs: (editingEntry.nutrition.carbs / editingEntry.portionAmount) * 100,
                },
                servingSize: editingEntry.portionAmount,
                servingUnit: editingEntry.portionType === 'milliliters' ? 'мл' : 'г',
            } as FoodItem);
            setPortionType(editingEntry.portionType);
            setPortionAmount(editingEntry.portionAmount);
        } else {
            // New entry mode: reset everything
            setActiveTab(DEFAULT_TAB);
            setStep('select-food');
            setSelectedFood(null);
            setPortionType('grams');
            setPortionAmount(100);
        }
        setCalculatedNutrition(null);
        setBatchFoods([]);
        setBatchIndex(0);
        setTimeout(() => firstFocusableRef.current?.focus(), 0);
    }
    wasOpenRef.current = isOpen;
}, [isOpen, editingEntry]);
```

**Step 2: Update save handler to use PUT for edits**

Add `updateEntry` from store and modify `handleSaveEntry`:

```typescript
const updateEntry = useFoodTrackerStore((state) => state.updateEntry);

// In handleSaveEntry:
if (editingEntry) {
    await updateEntry(editingEntry.id, {
        mealType,
        portionType,
        portionAmount,
        time: editingEntry.time,
    });
} else {
    await addEntry(mealType, { ... });
}
```

**Step 3: Update modal title and button text**

```tsx
// Title
{step === 'select-food'
    ? (editingEntry ? 'Редактировать запись' : 'Добавить запись')
    : step === 'manual-entry' ? 'Ввести вручную'
    : selectedFood?.name || 'Выбор порции'}

// Button
<span>{editingEntry ? 'Сохранить' : (batchNext ? 'Добавить и далее' : 'Добавить')}</span>
```

**Step 4: Verify frontend builds**

Run: `cd apps/web && npm run build`

**Step 5: Commit**

```bash
git add apps/web/src/features/food-tracker/components/FoodEntryModal.tsx \
  apps/web/src/features/food-tracker/store/foodTrackerStore.ts
git commit -m "feat: edit mode populates existing entry data"
```

---

### Task 6: Add Infinite Scroll to Search Results

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/SearchTab.tsx`
- Modify: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx` (SearchTabWithHook)

**Step 1: Pass loadMore and hasMore to SearchTab**

Update `SearchTabProps` and `SearchTabWithHook`:

```typescript
// In SearchTabProps, add:
hasMore?: boolean;
onLoadMore?: () => void;
isLoadingMore?: boolean;

// In SearchTabWithHook:
const { results, recentFoods, favoriteFoods, isSearching, setQuery, hasMore, loadMore } = useFoodSearch({ autoLoadRecent: true });

return (
    <SearchTab
        onSelectFood={onSelectFood}
        onManualEntry={onManualEntry}
        recentFoods={recentFoods}
        popularFoods={favoriteFoods}
        searchResults={results}
        onSearch={handleSearch}
        isLoading={isSearching}
        hasMore={hasMore}
        onLoadMore={loadMore}
    />
);
```

**Step 2: Add IntersectionObserver sentinel in SearchTab**

```tsx
// Add ref for sentinel
const sentinelRef = useRef<HTMLDivElement>(null);

// Add IntersectionObserver effect
useEffect(() => {
    if (!hasMore || !onLoadMore) return;

    const observer = new IntersectionObserver(
        (entries) => {
            if (entries[0].isIntersecting && !loading) {
                onLoadMore();
            }
        },
        { threshold: 0.1 }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => { if (sentinel) observer.unobserve(sentinel); };
}, [hasMore, onLoadMore, loading]);

// In the results section, add sentinel after FoodList:
{showResults && !showEmptyState && (
    <div className="flex-1 overflow-y-auto">
        <FoodList foods={results} onSelect={handleSelectFood} emptyMessage="" />
        {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )}
    </div>
)}
```

**Step 3: Verify frontend builds**

Run: `cd apps/web && npm run build`

**Step 4: Commit**

```bash
git add apps/web/src/features/food-tracker/components/SearchTab.tsx \
  apps/web/src/features/food-tracker/components/FoodEntryModal.tsx
git commit -m "feat: infinite scroll pagination for food search"
```

---

### Task 7: Recommendations — Real currentIntake from Food Entries

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/service.go` (GetRecommendations)

**Step 1: Calculate real daily macros intake**

In `GetRecommendations()`, after fetching recommendations, calculate actual intake from today's food entries:

```go
// Calculate today's intake from food entries
today := time.Now()
dailyTotals, err := s.CalculateDailyTotals(ctx, userID, today)
if err != nil {
    s.log.Warn("Failed to calculate daily totals for recommendations", "error", err)
    dailyTotals = &KBZHU{}
}
```

**Step 2: Map KBZHU to nutrient currentIntake**

When building `NutrientRecommendationWithProgress`, map standard nutrients:

```go
// Map nutrient names to actual intake values
nutrientIntakeMap := map[string]float64{
    "Белок":    dailyTotals.Protein,
    "Жиры":     dailyTotals.Fat,
    "Углеводы": dailyTotals.Carbs,
    "Калории":  dailyTotals.Calories,
}

// In the loop where we build recWithProgress:
currentIntake := 0.0
if val, ok := nutrientIntakeMap[rec.Name]; ok {
    currentIntake = val
}
percentage := 0.0
if rec.DailyTarget > 0 {
    percentage = roundToOneDecimal((currentIntake / rec.DailyTarget) * 100)
}
```

**Step 3: Verify backend tests pass**

Run: `cd apps/api && go test ./... -v`

**Step 4: Commit**

```bash
git add apps/api/internal/modules/food-tracker/service.go
git commit -m "feat: real currentIntake in recommendations from food entries"
```

---

### Task 8: Run Full Test Suite and Verify

**Step 1: Run all backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: All pass

**Step 2: Run all frontend tests**

Run: `cd apps/web && npx jest --passWithNoTests`
Expected: All pass

**Step 3: Run frontend lint and type-check**

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: No errors

**Step 4: Build both apps**

Run: `make build`
Expected: Clean builds

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test and lint issues from food tracker changes"
```
