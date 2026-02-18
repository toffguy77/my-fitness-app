# Food Tracker: Fix User Flows & Implement Missing Features

## Problem

Food tracker has multiple broken user flows:
- Barcode scanner shows camera but never detects barcodes (no detection library)
- Backend routes not registered in main.go — frontend requests go nowhere
- AI photo batch adds only first item, silently drops the rest
- Edit mode doesn't populate existing entry data
- Search pagination not wired to UI
- Recommendations show currentIntake as 0 (placeholder)
- No external barcode API integration (OpenFoodFacts/USDA)

## Design

### 1. Barcode Scanner — html5-qrcode

Replace mock overlay with real barcode detection via `html5-qrcode` library.

- Dynamic import in `BarcodeTab.tsx` (SSR-safe)
- Supports EAN-8/13, UPC, Code128, QR
- On detect: auto-lookup via API, show result, user confirms and sets portion
- Fallback: manual barcode input preserved
- Error states: permission denied, no camera, unsupported browser
- ~50KB gzipped, 11k+ GitHub stars, well-maintained

Why not alternatives:
- `zxing-wasm`: heavier (~300KB wasm), complex SSR integration
- Native BarcodeDetector API: no Safari/Firefox support

### 2. Backend Route Registration

Register food-tracker handler in `cmd/server/main.go` under `/api/v1/food-tracker` with auth middleware. Straightforward — handler and service already exist.

### 3. OpenFoodFacts Integration

New service `internal/shared/openfoodfacts/client.go`:
- HTTP client to `world.openfoodfacts.org/api/v2/product/{barcode}`
- Maps response to FoodItem (name, brand, KBZHU per 100g, barcode, category)
- User-Agent header per OFF API guidelines

Update `LookupBarcode()` flow:
1. Check local food_items table by barcode
2. Check barcode_cache table
3. If miss — call OpenFoodFacts API
4. Cache result in barcode_cache

### 4. Barcode Cache — 90-day Sliding TTL

- Change TTL from 30 to 90 days
- On cache hit: UPDATE expires_at = now() + 90 days (sliding expiration)
- Popular products effectively never expire
- Frontend localStorage cache: also 90 days with sliding refresh
- Backend migration: update default in cacheBarcode()

### 5. Batch Photo Fix

In `FoodEntryModal.tsx`:
- Loop through all selected items from AI photo recognition
- Sequential PortionSelector for each item (step-through UX)
- Progress indicator: "Adding 2 of 5..."
- Skip button per item
- All items added to the same meal type

### 6. Edit Mode

When modal opens with `editingEntry`:
- Load food item data by food_id
- Pre-fill portion type, amount, meal type, time
- Show calculated KBZHU for current portion
- Button text: "Save" instead of "Add"
- Call PUT endpoint instead of POST

### 7. Search Pagination

- Add IntersectionObserver sentinel at bottom of SearchTab results
- Trigger `loadMore()` on intersection
- Show loading spinner during fetch
- Stop when no more results (total reached)

### 8. Recommendations — Real currentIntake

Update backend `GetRecommendations()`:
- Query food_entries for current day
- Sum standard nutrients (calories, protein, fat, carbs) from entries
- For extended nutrients (fiber, vitamins, etc.) — sum from additional_nutrients JSONB
- Return real values instead of 0.0 placeholder

## Out of Scope

- Chat/Curator backend (needs separate AI service design)
- AI photo recognition backend (needs ML pipeline)
- USDA API integration (can add as fallback later)
- Meal templates CRUD (schema exists, low priority)
- User foods management UI (custom foods already work via manual entry)

## Technical Notes

- html5-qrcode must be loaded client-side only (next/dynamic with ssr: false)
- OpenFoodFacts API is free, no key needed, rate limit ~100 req/min
- Barcode cache sliding TTL requires single UPDATE query on read path
- Batch photo UX uses existing PortionSelector, just iterates over items
