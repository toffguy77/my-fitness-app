# Design Document: Food Tracker

## Overview

The Food Tracker feature provides a comprehensive interface for users to log daily meals with КБЖУ (calories, protein, fat, carbs) tracking and monitor nutrient intake recommendations. The design follows a tab-based architecture with the Diet tab for meal logging and the Recommendations tab for nutrient tracking.

### Key Design Principles

1. **Mobile-First**: Optimized for on-the-go food logging with quick-add patterns
2. **Multiple Entry Methods**: Search, barcode scanning, AI recognition, and curator chat
3. **Real-Time Feedback**: Immediate КБЖУ updates and progress visualization
4. **Offline Support**: Local caching for seamless experience without connectivity
5. **Accessibility**: WCAG 2.1 compliant with full keyboard navigation

### Technology Stack

- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **State Management**: Zustand for food tracker state, React hooks for local UI state
- **Backend**: Go (Gin framework) with PostgreSQL
- **External APIs**: OpenFoodFacts API for barcode scanning
- **AI Service**: TBD (food recognition service)
- **Styling**: Tailwind CSS with design tokens from `styles/tokens/`

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Food Tracker Page                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FoodTrackerLayout (App Router)                               │  │
│  │  - Authentication check                                       │  │
│  │  - Date picker header                                         │  │
│  │  - Tab navigation                                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FoodTrackerTabs Component                                    │  │
│  │  - Tab switching: Рацион | Рекомендации                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│              │                                    │                  │
│  ┌───────────────────────┐          ┌───────────────────────────┐  │
│  │  DietTab              │          │  RecommendationsTab       │  │
│  │  - КБЖУ Summary       │          │  - Nutrient categories    │  │
│  │  - Meal slots         │          │  - Progress tracking      │  │
│  │  - Water tracker      │          │  - Custom recommendations │  │
│  └───────────────────────┘          └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Food Entry Modal                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Entry Method Tabs: Поиск | Штрих-код | Фото еды | Чат        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│              │              │              │              │          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │
│  │ SearchTab │  │ BarcodeTab│  │ AIPhotoTab│  │ ChatTab   │        │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │
│                              │                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PortionSelector Component                                    │  │
│  │  - Grams / Milliliters / Portion toggle                       │  │
│  │  - Real-time КБЖУ calculation                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Zustand Food Tracker Store                        │
│  - selectedDate: Date                                                │
│  - dailyEntries: Map<mealSlot, FoodEntry[]>                         │
│  - dailyTotals: КБЖУ                                                │
│  - targetGoals: КБЖУ                                                │
│  - waterIntake: number                                               │
│  - recommendations: NutrientRecommendation[]                        │
│  - fetchDayData() / addEntry() / updateEntry() / deleteEntry()      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API Layer (Go Backend)                            │
│  GET  /api/food-tracker/entries?date=YYYY-MM-DD                     │
│  POST /api/food-tracker/entries                                      │
│  PUT  /api/food-tracker/entries/:id                                  │
│  DELETE /api/food-tracker/entries/:id                                │
│  GET  /api/food-tracker/search?q=query                              │
│  GET  /api/food-tracker/barcode/:code                               │
│  POST /api/food-tracker/ai-recognize                                 │
│  GET  /api/food-tracker/recommendations                              │
│  POST /api/food-tracker/water                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                               │
│  Tables: food_entries, food_items, user_foods, water_logs,          │
│          nutrient_recommendations, user_nutrient_preferences,       │
│          meal_templates, barcode_cache                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Page Load**: Fetch entries for selected date, calculate daily totals
2. **Add Entry**: Open modal → Select method → Find food → Set portion → Save
3. **КБЖУ Update**: Entry change triggers immediate recalculation of totals
4. **Barcode Scan**: Camera capture → Decode → Check cache → Query OpenFoodFacts → Display
5. **AI Recognition**: Photo capture → Send to AI service → Display results → User confirms

## Components and Interfaces

### Frontend Components

#### 1. FoodTrackerPage (App Router Page)

**Location**: `apps/web/src/app/food-tracker/page.tsx`

**Responsibilities**:
- Server-side authentication check
- Page metadata and SEO
- Render FoodTrackerLayout

```typescript
export default async function FoodTrackerPage() {
  // Server component - authentication check
  // Render FoodTrackerLayout
}
```

#### 2. FoodTrackerLayout Component

**Location**: `apps/web/src/features/food-tracker/components/FoodTrackerLayout.tsx`

**Responsibilities**:
- Date picker header with navigation
- Tab container for Diet/Recommendations
- Responsive layout structure

```typescript
interface FoodTrackerLayoutProps {
  children: React.ReactNode
}

export function FoodTrackerLayout({ children }: FoodTrackerLayoutProps): JSX.Element
```

#### 3. DatePicker Component

**Location**: `apps/web/src/features/food-tracker/components/DatePicker.tsx`

**Responsibilities**:
- Display current date in format "Сегодня, [day] [month]"
- Previous/next day navigation arrows
- Calendar dropdown for date selection
- "Сегодня" quick return button

```typescript
interface DatePickerProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
}

export function DatePicker({ selectedDate, onDateChange }: DatePickerProps): JSX.Element
```

#### 4. FoodTrackerTabs Component

**Location**: `apps/web/src/features/food-tracker/components/FoodTrackerTabs.tsx`

**Responsibilities**:
- Tab switching between Рацион and Рекомендации
- Active tab styling
- Keyboard navigation support

```typescript
type FoodTrackerTab = 'diet' | 'recommendations'

interface FoodTrackerTabsProps {
  activeTab: FoodTrackerTab
  onTabChange: (tab: FoodTrackerTab) => void
}

export function FoodTrackerTabs(props: FoodTrackerTabsProps): JSX.Element
```

#### 5. DietTab Component

**Location**: `apps/web/src/features/food-tracker/components/DietTab.tsx`

**Responsibilities**:
- КБЖУ summary bar display
- Meal slots rendering
- Water tracker widget
- FAB for quick add

```typescript
interface DietTabProps {
  selectedDate: Date
}

export function DietTab({ selectedDate }: DietTabProps): JSX.Element
```

#### 6. КБЖУSummary Component

**Location**: `apps/web/src/features/food-tracker/components/KBZHUSummary.tsx`

**Responsibilities**:
- Display current/target for each macro
- Progress bars with color coding
- Percentage calculation

```typescript
interface KBZHUSummaryProps {
  current: KBZHU
  target: KBZHU
}

export function KBZHUSummary({ current, target }: KBZHUSummaryProps): JSX.Element
```

#### 7. MealSlot Component

**Location**: `apps/web/src/features/food-tracker/components/MealSlot.tsx`

**Responsibilities**:
- Display meal type icon and name
- List food entries with portions and calories
- Add button to open entry modal
- Subtotal КБЖУ for the meal

```typescript
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface MealSlotProps {
  mealType: MealType
  entries: FoodEntry[]
  onAddClick: () => void
  onEntryClick: (entry: FoodEntry) => void
}

export function MealSlot(props: MealSlotProps): JSX.Element
```

#### 8. FoodEntryItem Component

**Location**: `apps/web/src/features/food-tracker/components/FoodEntryItem.tsx`

**Responsibilities**:
- Display food name, portion, calories
- Swipe actions for edit/delete (mobile)
- Click handler for details

```typescript
interface FoodEntryItemProps {
  entry: FoodEntry
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}

export function FoodEntryItem(props: FoodEntryItemProps): JSX.Element
```

#### 9. WaterTracker Component

**Location**: `apps/web/src/features/food-tracker/components/WaterTracker.tsx`

**Responsibilities**:
- Display current/goal water intake
- Quick add button for one glass
- Visual progress indicator

```typescript
interface WaterTrackerProps {
  current: number // glasses
  goal: number // glasses
  glassSize: number // ml
  onAddGlass: () => void
}

export function WaterTracker(props: WaterTrackerProps): JSX.Element
```

#### 10. FoodEntryModal Component

**Location**: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`

**Responsibilities**:
- Modal container with entry method tabs
- Tab switching logic
- Close on escape/outside click

```typescript
interface FoodEntryModalProps {
  isOpen: boolean
  mealType: MealType
  onClose: () => void
  onFoodAdded: (entry: FoodEntry) => void
}

export function FoodEntryModal(props: FoodEntryModalProps): JSX.Element
```

#### 11. SearchTab Component

**Location**: `apps/web/src/features/food-tracker/components/SearchTab.tsx`

**Responsibilities**:
- Search input with debounce
- Results list display
- Recent/popular foods when empty
- Manual entry option

```typescript
interface SearchTabProps {
  onFoodSelect: (food: FoodItem) => void
}

export function SearchTab({ onFoodSelect }: SearchTabProps): JSX.Element
```

#### 12. BarcodeTab Component

**Location**: `apps/web/src/features/food-tracker/components/BarcodeTab.tsx`

**Responsibilities**:
- Camera viewfinder for scanning
- Barcode detection and decoding
- Product lookup via OpenFoodFacts
- Error handling for not found

```typescript
interface BarcodeTabProps {
  onProductFound: (product: FoodItem) => void
  onNotFound: (barcode: string) => void
}

export function BarcodeTab(props: BarcodeTabProps): JSX.Element
```

#### 13. AIPhotoTab Component

**Location**: `apps/web/src/features/food-tracker/components/AIPhotoTab.tsx`

**Responsibilities**:
- Camera/gallery photo selection
- Photo upload to AI service
- Results display with confidence
- Multi-item selection

```typescript
interface AIPhotoTabProps {
  onFoodsRecognized: (foods: RecognizedFood[]) => void
  onError: (error: Error) => void
}

export function AIPhotoTab(props: AIPhotoTabProps): JSX.Element
```

#### 14. ChatTab Component

**Location**: `apps/web/src/features/food-tracker/components/ChatTab.tsx`

**Responsibilities**:
- Chat interface with curator
- Photo upload capability
- Food entry suggestions from curator
- Response time indicator

```typescript
interface ChatTabProps {
  onFoodSuggested: (food: FoodItem) => void
}

export function ChatTab({ onFoodSuggested }: ChatTabProps): JSX.Element
```

#### 15. PortionSelector Component

**Location**: `apps/web/src/features/food-tracker/components/PortionSelector.tsx`

**Responsibilities**:
- Portion type toggle (grams/ml/portion)
- Numeric input with slider
- Quick portion buttons
- Real-time КБЖУ calculation

```typescript
type PortionType = 'grams' | 'milliliters' | 'portion'

interface PortionSelectorProps {
  food: FoodItem
  portionType: PortionType
  amount: number
  onPortionTypeChange: (type: PortionType) => void
  onAmountChange: (amount: number) => void
}

export function PortionSelector(props: PortionSelectorProps): JSX.Element
```

#### 16. RecommendationsTab Component

**Location**: `apps/web/src/features/food-tracker/components/RecommendationsTab.tsx`

**Responsibilities**:
- Nutrient categories display
- Daily/weekly recommendations
- Configure list button
- Add custom recommendation

```typescript
interface RecommendationsTabProps {
  selectedDate: Date
}

export function RecommendationsTab({ selectedDate }: RecommendationsTabProps): JSX.Element
```

#### 17. NutrientCategory Component

**Location**: `apps/web/src/features/food-tracker/components/NutrientCategory.tsx`

**Responsibilities**:
- Collapsible category section
- List of nutrient recommendations
- Select all/deselect options

```typescript
interface NutrientCategoryProps {
  category: NutrientCategoryType
  recommendations: NutrientRecommendation[]
  isExpanded: boolean
  onToggle: () => void
  onRecommendationClick: (rec: NutrientRecommendation) => void
}

export function NutrientCategory(props: NutrientCategoryProps): JSX.Element
```

#### 18. NutrientRecommendationItem Component

**Location**: `apps/web/src/features/food-tracker/components/NutrientRecommendationItem.tsx`

**Responsibilities**:
- Display nutrient name and progress
- Progress bar visualization
- Click to navigate to detail

```typescript
interface NutrientRecommendationItemProps {
  recommendation: NutrientRecommendation
  currentIntake: number
  onClick: () => void
}

export function NutrientRecommendationItem(props: NutrientRecommendationItemProps): JSX.Element
```

#### 19. NutrientDetailPage Component

**Location**: `apps/web/src/features/food-tracker/components/NutrientDetailPage.tsx`

**Responsibilities**:
- Nutrient name and progress bar
- Information sections (what, why, effects)
- Sources in current diet
- Min/optimal recommendations

```typescript
interface NutrientDetailPageProps {
  nutrientId: string
  onBack: () => void
}

export function NutrientDetailPage(props: NutrientDetailPageProps): JSX.Element
```

#### 20. ConfigureNutrientsModal Component

**Location**: `apps/web/src/features/food-tracker/components/ConfigureNutrientsModal.tsx`

**Responsibilities**:
- List all available nutrients by category
- Checkbox for each nutrient
- Select all/deselect per category
- Save preferences

```typescript
interface ConfigureNutrientsModalProps {
  isOpen: boolean
  trackedNutrients: string[]
  onClose: () => void
  onSave: (nutrients: string[]) => void
}

export function ConfigureNutrientsModal(props: ConfigureNutrientsModalProps): JSX.Element
```

### State Management (Zustand Store)

**Location**: `apps/web/src/features/food-tracker/store/foodTrackerStore.ts`

```typescript
interface FoodTrackerState {
  // Date state
  selectedDate: Date
  
  // Food entries state
  entries: Record<MealType, FoodEntry[]>
  isLoading: boolean
  error: Error | null
  
  // Daily totals (calculated)
  dailyTotals: KBZHU
  targetGoals: KBZHU
  
  // Water tracking
  waterIntake: number
  waterGoal: number
  glassSize: number
  
  // Recommendations
  recommendations: NutrientRecommendation[]
  trackedNutrients: string[]
  customRecommendations: CustomRecommendation[]
  
  // Food search
  searchResults: FoodItem[]
  recentFoods: FoodItem[]
  favoriteFoods: FoodItem[]
  
  // Meal templates
  mealTemplates: MealTemplate[]
  
  // Actions
  setSelectedDate: (date: Date) => void
  fetchDayData: (date: Date) => Promise<void>
  addEntry: (mealType: MealType, entry: Omit<FoodEntry, 'id'>) => Promise<void>
  updateEntry: (id: string, updates: Partial<FoodEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  moveEntry: (id: string, toMealType: MealType) => Promise<void>
  
  // Water actions
  addWater: (glasses?: number) => Promise<void>
  setWaterGoal: (goal: number) => void
  
  // Search actions
  searchFoods: (query: string) => Promise<void>
  lookupBarcode: (barcode: string) => Promise<FoodItem | null>
  recognizePhoto: (photo: File) => Promise<RecognizedFood[]>
  
  // Recommendations actions
  fetchRecommendations: () => Promise<void>
  updateTrackedNutrients: (nutrients: string[]) => Promise<void>
  addCustomRecommendation: (rec: Omit<CustomRecommendation, 'id'>) => Promise<void>
  
  // Template actions
  saveAsTemplate: (mealType: MealType, name: string) => Promise<void>
  applyTemplate: (templateId: string, mealType: MealType) => Promise<void>
}
```

### Custom Hooks

#### useFoodTracker Hook

**Location**: `apps/web/src/features/food-tracker/hooks/useFoodTracker.ts`

```typescript
interface UseFoodTrackerReturn {
  selectedDate: Date
  entries: Record<MealType, FoodEntry[]>
  dailyTotals: KBZHU
  targetGoals: KBZHU
  isLoading: boolean
  error: Error | null
  
  setDate: (date: Date) => void
  addEntry: (mealType: MealType, entry: Omit<FoodEntry, 'id'>) => Promise<void>
  updateEntry: (id: string, updates: Partial<FoodEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  refresh: () => void
}

export function useFoodTracker(): UseFoodTrackerReturn
```

#### useFoodSearch Hook

**Location**: `apps/web/src/features/food-tracker/hooks/useFoodSearch.ts`

```typescript
interface UseFoodSearchReturn {
  query: string
  results: FoodItem[]
  isSearching: boolean
  recentFoods: FoodItem[]
  
  setQuery: (query: string) => void
  clearSearch: () => void
}

export function useFoodSearch(): UseFoodSearchReturn
```

#### useBarcodeScanner Hook

**Location**: `apps/web/src/features/food-tracker/hooks/useBarcodeScanner.ts`

```typescript
interface UseBarcodeScannerReturn {
  isScanning: boolean
  lastScannedCode: string | null
  product: FoodItem | null
  error: Error | null
  
  startScanning: () => void
  stopScanning: () => void
  lookupBarcode: (code: string) => Promise<void>
}

export function useBarcodeScanner(): UseBarcodeScannerReturn
```

#### useWaterTracker Hook

**Location**: `apps/web/src/features/food-tracker/hooks/useWaterTracker.ts`

```typescript
interface UseWaterTrackerReturn {
  current: number
  goal: number
  glassSize: number
  percentage: number
  
  addGlass: () => void
  setGoal: (goal: number) => void
  setGlassSize: (size: number) => void
}

export function useWaterTracker(): UseWaterTrackerReturn
```

#### useKBZHUCalculator Hook

**Location**: `apps/web/src/features/food-tracker/hooks/useKBZHUCalculator.ts`

```typescript
interface UseKBZHUCalculatorReturn {
  calculate: (food: FoodItem, portionType: PortionType, amount: number) => KBZHU
  calculateDailyTotals: (entries: FoodEntry[]) => KBZHU
  getProgressColor: (current: number, target: number) => 'green' | 'yellow' | 'red'
  getPercentage: (current: number, target: number) => number
}

export function useKBZHUCalculator(): UseKBZHUCalculatorReturn
```

### Backend API Handlers

#### 1. Food Entries Handler

**Location**: `apps/api/internal/modules/food-tracker/handler.go`

**Endpoints**:

```go
// GET /api/food-tracker/entries?date=YYYY-MM-DD
func (h *Handler) GetEntries(c *gin.Context)

// POST /api/food-tracker/entries
func (h *Handler) CreateEntry(c *gin.Context)

// PUT /api/food-tracker/entries/:id
func (h *Handler) UpdateEntry(c *gin.Context)

// DELETE /api/food-tracker/entries/:id
func (h *Handler) DeleteEntry(c *gin.Context)
```

#### 2. Food Search Handler

**Location**: `apps/api/internal/modules/food-tracker/search_handler.go`

**Endpoints**:

```go
// GET /api/food-tracker/search?q=query&limit=20
func (h *Handler) SearchFoods(c *gin.Context)

// GET /api/food-tracker/barcode/:code
func (h *Handler) LookupBarcode(c *gin.Context)

// GET /api/food-tracker/recent
func (h *Handler) GetRecentFoods(c *gin.Context)

// GET /api/food-tracker/favorites
func (h *Handler) GetFavoriteFoods(c *gin.Context)

// POST /api/food-tracker/favorites/:foodId
func (h *Handler) AddToFavorites(c *gin.Context)
```

#### 3. AI Recognition Handler

**Location**: `apps/api/internal/modules/food-tracker/ai_handler.go`

**Endpoints**:

```go
// POST /api/food-tracker/ai-recognize
func (h *Handler) RecognizeFood(c *gin.Context)
```

#### 4. Water Tracking Handler

**Location**: `apps/api/internal/modules/food-tracker/water_handler.go`

**Endpoints**:

```go
// GET /api/food-tracker/water?date=YYYY-MM-DD
func (h *Handler) GetWaterIntake(c *gin.Context)

// POST /api/food-tracker/water
func (h *Handler) AddWater(c *gin.Context)
```

#### 5. Recommendations Handler

**Location**: `apps/api/internal/modules/food-tracker/recommendations_handler.go`

**Endpoints**:

```go
// GET /api/food-tracker/recommendations
func (h *Handler) GetRecommendations(c *gin.Context)

// GET /api/food-tracker/recommendations/:id
func (h *Handler) GetRecommendationDetail(c *gin.Context)

// PUT /api/food-tracker/recommendations/preferences
func (h *Handler) UpdatePreferences(c *gin.Context)

// POST /api/food-tracker/recommendations/custom
func (h *Handler) CreateCustomRecommendation(c *gin.Context)
```

### Backend Service Layer

**Location**: `apps/api/internal/modules/food-tracker/service.go`

```go
type Service struct {
    db              *sql.DB
    log             *logger.Logger
    openFoodFacts   *OpenFoodFactsClient
    aiService       AIRecognitionService
    barcodeCache    *BarcodeCache
}

// Food entries
func (s *Service) GetEntriesByDate(ctx context.Context, userID int64, date time.Time) ([]FoodEntry, error)
func (s *Service) CreateEntry(ctx context.Context, userID int64, entry *CreateEntryRequest) (*FoodEntry, error)
func (s *Service) UpdateEntry(ctx context.Context, userID int64, entryID string, updates *UpdateEntryRequest) (*FoodEntry, error)
func (s *Service) DeleteEntry(ctx context.Context, userID int64, entryID string) error
func (s *Service) MoveEntry(ctx context.Context, userID int64, entryID string, toMealType string) error

// Food search
func (s *Service) SearchFoods(ctx context.Context, query string, limit int) ([]FoodItem, error)
func (s *Service) LookupBarcode(ctx context.Context, barcode string) (*FoodItem, error)
func (s *Service) GetRecentFoods(ctx context.Context, userID int64, limit int) ([]FoodItem, error)
func (s *Service) GetFavoriteFoods(ctx context.Context, userID int64) ([]FoodItem, error)

// Water tracking
func (s *Service) GetWaterIntake(ctx context.Context, userID int64, date time.Time) (*WaterLog, error)
func (s *Service) AddWater(ctx context.Context, userID int64, date time.Time, glasses int) error

// Recommendations
func (s *Service) GetRecommendations(ctx context.Context, userID int64) ([]NutrientRecommendation, error)
func (s *Service) GetRecommendationDetail(ctx context.Context, nutrientID string) (*NutrientDetail, error)
func (s *Service) UpdateNutrientPreferences(ctx context.Context, userID int64, nutrients []string) error
func (s *Service) CreateCustomRecommendation(ctx context.Context, userID int64, rec *CustomRecommendation) error

// КБЖУ calculations
func (s *Service) CalculateDailyTotals(ctx context.Context, userID int64, date time.Time) (*KBZHU, error)
func (s *Service) GetUserGoals(ctx context.Context, userID int64) (*KBZHU, error)
```

## Data Models

### Frontend Types

**Location**: `apps/web/src/features/food-tracker/types/index.ts`

```typescript
// Core types
export interface KBZHU {
  calories: number
  protein: number
  fat: number
  carbs: number
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type PortionType = 'grams' | 'milliliters' | 'portion'

// Food item from database
export interface FoodItem {
  id: string
  name: string
  brand?: string
  category: string
  servingSize: number
  servingUnit: string
  nutritionPer100: KBZHU
  barcode?: string
  source: 'database' | 'usda' | 'openfoodfacts' | 'user'
  verified: boolean
  additionalNutrients?: Record<string, number>
}

// Food entry in user's log
export interface FoodEntry {
  id: string
  foodId: string
  foodName: string
  mealType: MealType
  portionType: PortionType
  portionAmount: number
  nutrition: KBZHU
  time: string // HH:mm
  date: string // YYYY-MM-DD
  createdAt: string
  updatedAt: string
}

// AI recognition result
export interface RecognizedFood {
  name: string
  confidence: number
  estimatedWeight: number
  nutrition: KBZHU
  alternatives?: FoodItem[]
}

// Nutrient recommendation
export type NutrientCategoryType = 'vitamins' | 'minerals' | 'lipids' | 'fiber' | 'plant'

export interface NutrientRecommendation {
  id: string
  name: string
  category: NutrientCategoryType
  dailyTarget: number
  unit: string
  isWeekly: boolean
  isCustom: boolean
}

export interface NutrientDetail {
  id: string
  name: string
  description: string
  benefits: string
  effects: string
  minRecommendation: number
  optimalRecommendation: number
  unit: string
  sourcesInDiet: FoodSource[]
}

export interface FoodSource {
  foodName: string
  amount: number
  unit: string
  contribution: number
}

// Water tracking
export interface WaterLog {
  date: string
  glasses: number
  goal: number
  glassSize: number
}

// Meal template
export interface MealTemplate {
  id: string
  name: string
  mealType: MealType
  entries: Omit<FoodEntry, 'id' | 'date' | 'createdAt' | 'updatedAt'>[]
  totalNutrition: KBZHU
  createdAt: string
}

// Custom recommendation
export interface CustomRecommendation {
  id: string
  name: string
  dailyTarget: number
  unit: 'г' | 'мг' | 'мкг' | 'МЕ'
  currentIntake: number
}
```

### Backend Types

**Location**: `apps/api/internal/modules/food-tracker/types.go`

```go
type MealType string

const (
    MealBreakfast MealType = "breakfast"
    MealLunch     MealType = "lunch"
    MealDinner    MealType = "dinner"
    MealSnack     MealType = "snack"
)

type PortionType string

const (
    PortionGrams       PortionType = "grams"
    PortionMilliliters PortionType = "milliliters"
    PortionPortion     PortionType = "portion"
)

type KBZHU struct {
    Calories float64 `json:"calories" db:"calories"`
    Protein  float64 `json:"protein" db:"protein"`
    Fat      float64 `json:"fat" db:"fat"`
    Carbs    float64 `json:"carbs" db:"carbs"`
}

type FoodItem struct {
    ID              string            `json:"id" db:"id"`
    Name            string            `json:"name" db:"name"`
    Brand           *string           `json:"brand,omitempty" db:"brand"`
    Category        string            `json:"category" db:"category"`
    ServingSize     float64           `json:"serving_size" db:"serving_size"`
    ServingUnit     string            `json:"serving_unit" db:"serving_unit"`
    NutritionPer100 KBZHU             `json:"nutrition_per_100"`
    Barcode         *string           `json:"barcode,omitempty" db:"barcode"`
    Source          string            `json:"source" db:"source"`
    Verified        bool              `json:"verified" db:"verified"`
    CreatedAt       time.Time         `json:"created_at" db:"created_at"`
}

type FoodEntry struct {
    ID            string      `json:"id" db:"id"`
    UserID        int64       `json:"user_id" db:"user_id"`
    FoodID        string      `json:"food_id" db:"food_id"`
    FoodName      string      `json:"food_name" db:"food_name"`
    MealType      MealType    `json:"meal_type" db:"meal_type"`
    PortionType   PortionType `json:"portion_type" db:"portion_type"`
    PortionAmount float64     `json:"portion_amount" db:"portion_amount"`
    Nutrition     KBZHU       `json:"nutrition"`
    Time          string      `json:"time" db:"time"`
    Date          string      `json:"date" db:"date"`
    CreatedAt     time.Time   `json:"created_at" db:"created_at"`
    UpdatedAt     time.Time   `json:"updated_at" db:"updated_at"`
}

type CreateEntryRequest struct {
    FoodID        string      `json:"food_id" binding:"required"`
    MealType      MealType    `json:"meal_type" binding:"required,oneof=breakfast lunch dinner snack"`
    PortionType   PortionType `json:"portion_type" binding:"required,oneof=grams milliliters portion"`
    PortionAmount float64     `json:"portion_amount" binding:"required,gt=0"`
    Time          string      `json:"time" binding:"required"`
    Date          string      `json:"date" binding:"required"`
}

type UpdateEntryRequest struct {
    MealType      *MealType    `json:"meal_type,omitempty" binding:"omitempty,oneof=breakfast lunch dinner snack"`
    PortionType   *PortionType `json:"portion_type,omitempty" binding:"omitempty,oneof=grams milliliters portion"`
    PortionAmount *float64     `json:"portion_amount,omitempty" binding:"omitempty,gt=0"`
    Time          *string      `json:"time,omitempty"`
}

type SearchFoodsRequest struct {
    Query string `form:"q" binding:"required,min=2"`
    Limit int    `form:"limit" binding:"omitempty,min=1,max=50"`
}

type WaterLog struct {
    ID        string    `json:"id" db:"id"`
    UserID    int64     `json:"user_id" db:"user_id"`
    Date      string    `json:"date" db:"date"`
    Glasses   int       `json:"glasses" db:"glasses"`
    Goal      int       `json:"goal" db:"goal"`
    GlassSize int       `json:"glass_size" db:"glass_size"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type NutrientRecommendation struct {
    ID          string `json:"id" db:"id"`
    Name        string `json:"name" db:"name"`
    Category    string `json:"category" db:"category"`
    DailyTarget float64 `json:"daily_target" db:"daily_target"`
    Unit        string `json:"unit" db:"unit"`
    IsWeekly    bool   `json:"is_weekly" db:"is_weekly"`
    IsCustom    bool   `json:"is_custom" db:"is_custom"`
}
```

### Database Schema

**Tables**:

```sql
-- Food items database
CREATE TABLE food_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(100) NOT NULL,
    serving_size DECIMAL(10,2) NOT NULL DEFAULT 100,
    serving_unit VARCHAR(20) NOT NULL DEFAULT 'г',
    calories_per_100 DECIMAL(10,2) NOT NULL,
    protein_per_100 DECIMAL(10,2) NOT NULL DEFAULT 0,
    fat_per_100 DECIMAL(10,2) NOT NULL DEFAULT 0,
    carbs_per_100 DECIMAL(10,2) NOT NULL DEFAULT 0,
    fiber_per_100 DECIMAL(10,2),
    sugar_per_100 DECIMAL(10,2),
    sodium_per_100 DECIMAL(10,2),
    barcode VARCHAR(50) UNIQUE,
    source VARCHAR(50) NOT NULL DEFAULT 'database',
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_food_items_name ON food_items USING gin(to_tsvector('russian', name));
CREATE INDEX idx_food_items_barcode ON food_items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_food_items_category ON food_items(category);

-- User food entries
CREATE TABLE food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    food_id UUID NOT NULL REFERENCES food_items(id),
    food_name VARCHAR(255) NOT NULL,
    meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    portion_type VARCHAR(20) NOT NULL CHECK (portion_type IN ('grams', 'milliliters', 'portion')),
    portion_amount DECIMAL(10,2) NOT NULL,
    calories DECIMAL(10,2) NOT NULL,
    protein DECIMAL(10,2) NOT NULL,
    fat DECIMAL(10,2) NOT NULL,
    carbs DECIMAL(10,2) NOT NULL,
    time VARCHAR(5) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_food_entries_user_date ON food_entries(user_id, date DESC);
CREATE INDEX idx_food_entries_user_meal ON food_entries(user_id, date, meal_type);

-- User custom foods
CREATE TABLE user_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    calories_per_100 DECIMAL(10,2) NOT NULL,
    protein_per_100 DECIMAL(10,2) DEFAULT 0,
    fat_per_100 DECIMAL(10,2) DEFAULT 0,
    carbs_per_100 DECIMAL(10,2) DEFAULT 0,
    serving_size DECIMAL(10,2) DEFAULT 100,
    serving_unit VARCHAR(20) DEFAULT 'г',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_foods_user ON user_foods(user_id);

-- Water tracking
CREATE TABLE water_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    glasses INT NOT NULL DEFAULT 0,
    goal INT NOT NULL DEFAULT 8,
    glass_size INT NOT NULL DEFAULT 250,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_water_logs_user_date ON water_logs(user_id, date DESC);

-- Barcode cache
CREATE TABLE barcode_cache (
    barcode VARCHAR(50) PRIMARY KEY,
    food_data JSONB NOT NULL,
    source VARCHAR(50) NOT NULL,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_barcode_cache_expires ON barcode_cache(expires_at);

-- Nutrient recommendations
CREATE TABLE nutrient_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    daily_target DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    is_weekly BOOLEAN DEFAULT false,
    description TEXT,
    benefits TEXT,
    effects TEXT,
    min_recommendation DECIMAL(10,2),
    optimal_recommendation DECIMAL(10,2)
);

-- User nutrient preferences
CREATE TABLE user_nutrient_preferences (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nutrient_id UUID NOT NULL REFERENCES nutrient_recommendations(id),
    is_tracked BOOLEAN DEFAULT true,
    PRIMARY KEY (user_id, nutrient_id)
);

-- Custom user recommendations
CREATE TABLE user_custom_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    daily_target DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_custom_rec_user ON user_custom_recommendations(user_id);

-- Meal templates
CREATE TABLE meal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    entries JSONB NOT NULL,
    total_calories DECIMAL(10,2) NOT NULL,
    total_protein DECIMAL(10,2) NOT NULL,
    total_fat DECIMAL(10,2) NOT NULL,
    total_carbs DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_templates_user ON meal_templates(user_id);

-- User favorites
CREATE TABLE user_favorite_foods (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    food_id UUID NOT NULL REFERENCES food_items(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, food_id)
);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: КБЖУ Proportional Calculation

*For any* food item with known nutrition per 100g/100ml and any valid portion amount, the calculated КБЖУ values SHALL equal (nutritionPer100 * portionAmount) / 100, rounded to one decimal place.

**Validates: Requirements 9.5, 9.7**

### Property 2: Daily Totals Sum

*For any* set of food entries for a given date, the daily totals for each macro (calories, protein, fat, carbs) SHALL equal the sum of the corresponding values from all entries.

**Validates: Requirements 2.4, 2.5, 10.3, 10.5**

### Property 3: Progress Bar Color Coding

*For any* current intake value and target goal, the progress bar color SHALL be:
- Green when percentage is 80-100%
- Yellow when percentage is 50-79% OR 101-120%
- Red when percentage is below 50% OR above 120%

**Validates: Requirements 25.2, 25.3, 25.4**

### Property 4: Time-Based Meal Slot Assignment

*For any* food entry with a time value, the meal slot assignment SHALL follow:
- Завтрак (breakfast) for times 05:00-10:59
- Обед (lunch) for times 11:00-15:59
- Ужин (dinner) for times 16:00-20:59
- Перекус (snack) for all other times

**Validates: Requirements 26.1, 26.2, 26.3, 26.4**

### Property 5: Meal Slot Subtotals

*For any* meal slot containing food entries, the displayed subtotal КБЖУ SHALL equal the sum of КБЖУ values from all entries in that slot.

**Validates: Requirements 26.6**

### Property 6: Food Entry Display Completeness

*For any* food entry in a meal slot, the display SHALL include the food name, portion size with unit, and calorie count.

**Validates: Requirements 3.4, 3.5**

### Property 7: Search Results Display

*For any* search result item, the display SHALL include the food name, serving size, and calories per serving.

**Validates: Requirements 5.3**

### Property 8: Portion Validation

*For any* portion input, the system SHALL reject values that are negative, zero, or non-numeric, and display a validation error in Russian.

**Validates: Requirements 9.6**

### Property 9: Barcode Cache Behavior

*For any* barcode lookup, if a cached result exists and is not expired, the system SHALL return the cached data without making an API call.

**Validates: Requirements 6.4, 6.7**

### Property 10: Tab Switching Content

*For any* tab selection (Рацион or Рекомендации), the displayed content SHALL correspond to the selected tab.

**Validates: Requirements 1.4, 4.3**

### Property 11: Date Selection Data Loading

*For any* date selection, the system SHALL load and display food entries, water intake, and daily totals for that specific date.

**Validates: Requirements 1.6**

### Property 12: Water Intake Increment

*For any* water add action, the current intake SHALL increase by exactly one glass (configured glass size).

**Validates: Requirements 21.2**

### Property 13: Water Display Format

*For any* water intake state, the display SHALL show format "X / Y стаканов" where X is current glasses and Y is goal glasses.

**Validates: Requirements 21.3**

### Property 14: Macro Goal Calculation

*For any* calorie goal, the macro goals SHALL be calculated as:
- Protein: (calorieGoal * 0.30) / 4 grams
- Fat: (calorieGoal * 0.30) / 9 grams
- Carbs: (calorieGoal * 0.40) / 4 grams

**Validates: Requirements 25.6**

### Property 15: Percentage Calculation

*For any* current value and target value where target > 0, the percentage SHALL equal (current / target) * 100, rounded to the nearest integer.

**Validates: Requirements 25.5**

### Property 16: Entry Persistence Round-Trip

*For any* food entry that is created, the entry SHALL be retrievable from the database with identical values for all fields.

**Validates: Requirements 10.6, 16.1**

### Property 17: Nutrient Recommendation Progress Format

*For any* nutrient recommendation with current intake and target, the display SHALL show format "current / target unit" (e.g., "15 / 38 г").

**Validates: Requirements 11.4**

### Property 18: Category Collapsibility

*For any* nutrient category, toggling the collapse state SHALL show/hide the contained recommendations while preserving their data.

**Validates: Requirements 11.2**

### Property 19: Food Entry Edit Preservation

*For any* food entry edit operation, the updated values SHALL be reflected in the entry and the daily totals SHALL be recalculated.

**Validates: Requirements 10.2, 10.3**

### Property 20: Modal Dismiss Without Save

*For any* modal dismiss action (Escape key or outside click), no changes SHALL be persisted to the database.

**Validates: Requirements 4.6**

## Error Handling

### Frontend Error Handling

**Network Errors**:
- Display user-friendly error messages in Russian
- Provide retry button for failed requests
- Show offline indicator when network is unavailable
- Cache entries locally for offline viewing

**Validation Errors**:
- Display field-specific error messages in Russian
- Prevent form submission with invalid data
- Highlight invalid fields with visual indicators
- Clear errors when user corrects input

**Camera/Scanner Errors**:
- Handle camera permission denied gracefully
- Provide fallback to manual entry
- Display clear instructions for troubleshooting

**API Errors**:
- Handle OpenFoodFacts API failures
- Fallback to cached data when available
- Offer manual entry as alternative

### Backend Error Handling

**Database Errors**:
- Log errors with context using Zap logger
- Return 500 status with generic Russian message
- Implement retry logic for transient failures

**Validation Errors**:
- Return 400 status with specific Russian error messages
- Validate all input parameters
- Sanitize user input

**Authentication Errors**:
- Return 401 for missing/invalid tokens
- Redirect to login on session expiry

**Not Found Errors**:
- Return 404 for non-existent entries
- Verify user ownership before operations

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string // "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED"
    message: string // Russian user-friendly message
    details?: Record<string, string> // Field-specific errors
  }
}
```

## Testing Strategy

### Dual Testing Approach

The Food Tracker feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, UI interactions
- **Property tests**: Verify universal properties across randomized inputs

### Property-Based Testing

**Library**: 
- Frontend: fast-check (TypeScript)
- Backend: gopter (Go)

**Configuration**:
- Minimum 100 iterations per property test
- Tag format: `Feature: food-tracker, Property {N}: {property description}`

**Key Properties to Test**:
1. КБЖУ calculation proportionality
2. Daily totals summation
3. Progress bar color coding
4. Time-based meal slot assignment
5. Portion validation
6. Barcode cache behavior

### Unit Testing

**Frontend Coverage Areas**:
- Component rendering with various props
- User interactions (clicks, inputs, tab switching)
- Form validation
- Error states and loading states
- Responsive design breakpoints
- Accessibility attributes

**Backend Coverage Areas**:
- Handler input validation
- Service layer business logic
- Database queries
- API integration (OpenFoodFacts)
- Authentication and authorization

### Test Generators

```typescript
// Food item generator
export const foodItemGenerator = (): fc.Arbitrary<FoodItem> => {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 2, maxLength: 100 }),
    category: fc.constantFrom('meat', 'dairy', 'vegetables', 'fruits', 'grains'),
    servingSize: fc.float({ min: 1, max: 500 }),
    servingUnit: fc.constantFrom('г', 'мл'),
    nutritionPer100: kbzhuGenerator(),
    source: fc.constantFrom('database', 'usda', 'openfoodfacts', 'user'),
    verified: fc.boolean()
  })
}

// КБЖУ generator
export const kbzhuGenerator = (): fc.Arbitrary<KBZHU> => {
  return fc.record({
    calories: fc.float({ min: 0, max: 900 }),
    protein: fc.float({ min: 0, max: 100 }),
    fat: fc.float({ min: 0, max: 100 }),
    carbs: fc.float({ min: 0, max: 100 })
  })
}

// Time generator for meal slot testing
export const timeGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
}
```

### Test Coverage Goals

- **Frontend**: Minimum 80% code coverage
- **Backend**: Minimum 85% code coverage
- **Property tests**: All 20 correctness properties implemented
- **E2E tests**: Critical user flows covered

### Integration Testing

**MSW Mocks**:
- Mock all API endpoints
- Simulate error scenarios
- Test offline behavior

**E2E with Playwright**:
- Complete food logging flow
- Barcode scanning simulation
- Tab navigation
- Date selection
- Responsive behavior
