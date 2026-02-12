# Implementation Plan: Food Tracker

## Overview

This implementation plan breaks down the Food Tracker feature into discrete, incremental coding tasks. The approach follows a bottom-up strategy: building database schema and backend services first, then frontend components, then integration. Each task builds on previous work to ensure no orphaned code.

All user-facing text (error messages, labels, notifications) must be in Russian per localization requirements.

## Tasks

- [x] 1. Set up food-tracker feature structure and types
  - Create feature directory structure at `apps/web/src/features/food-tracker/`
  - Create subdirectories: `components/`, `hooks/`, `store/`, `types/`, `utils/`, `testing/`
  - Define TypeScript types in `types/index.ts` (KBZHU, FoodItem, FoodEntry, MealType, PortionType, NutrientRecommendation)
  - Create barrel export in `features/food-tracker/index.ts`
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement backend database schema and migrations
  - [x] 2.1 Create migration file for `food_items` table with nutrition columns and indexes
    - Include full-text search index for Russian language (`to_tsvector('russian', name)`)
    - Add barcode index for quick lookups
    - _Requirements: 5.2, 6.2_
  
  - [x] 2.2 Create migration file for `food_entries` table
    - Include user_id, food_id, meal_type, portion columns
    - Add composite index on (user_id, date)
    - _Requirements: 10.6, 16.1_
  
  - [x] 2.3 Create migration file for `water_logs` table
    - Include glasses, goal, glass_size columns
    - Add unique constraint on (user_id, date)
    - _Requirements: 21.1, 21.2_

  - [x] 2.4 Create migration file for `barcode_cache` table
    - Include food_data JSONB, expires_at columns
    - _Requirements: 6.4, 6.7, 19.6_
  
  - [x] 2.5 Create migration file for supporting tables
    - user_foods, nutrient_recommendations, user_nutrient_preferences
    - meal_templates, user_favorite_foods, user_custom_recommendations
    - _Requirements: 11.1, 14.1, 22.1, 23.1_
  
  - [x] 2.6 Define Go types in `apps/api/internal/modules/food-tracker/types.go`
    - Include validation tags for all request types
    - All validation error messages in Russian
    - _Requirements: 9.6, 16.1_

- [x] 3. Implement backend service layer for food entries
  - [x] 3.1 Create food-tracker service in `apps/api/internal/modules/food-tracker/service.go`
    - Implement `GetEntriesByDate()` with user filtering
    - Implement `CreateEntry()` with КБЖУ calculation
    - Implement `UpdateEntry()` with validation
    - Implement `DeleteEntry()` with ownership check
    - _Requirements: 10.1, 10.3, 10.5, 10.6_
  
  - [x] 3.2 Write property test for КБЖУ calculation (gopter)
    - **Property 1: КБЖУ Proportional Calculation**
    - For any food item and valid portion, calculated КБЖУ = (nutritionPer100 * portionAmount) / 100
    - **Validates: Requirements 9.5, 9.7**
  
  - [x] 3.3 Write property test for daily totals (gopter)
    - **Property 2: Daily Totals Sum**
    - For any set of entries, daily totals = sum of all entry values
    - **Validates: Requirements 2.4, 2.5, 10.3, 10.5**
  
  - [x] 3.4 Write unit tests for service layer
    - Test GetEntriesByDate with various dates
    - Test CreateEntry with valid/invalid data
    - Test user isolation (can't access other users' entries)
    - Error messages must be in Russian
    - _Requirements: 10.6, 16.1_

- [x] 4. Implement backend food search service
  - [x] 4.1 Create search service methods
    - Implement `SearchFoods()` with fuzzy matching (Russian language support)
    - Implement `LookupBarcode()` with cache check
    - Implement `GetRecentFoods()` for user
    - Implement `GetFavoriteFoods()` for user
    - _Requirements: 5.2, 6.2, 6.7_
  
  - [x] 4.2 Write property test for barcode cache (gopter)
    - **Property 9: Barcode Cache Behavior**
    - For any cached barcode, return cached data without API call
    - **Validates: Requirements 6.4, 6.7**
  
  - [x] 4.3 Write unit tests for search service
    - Test SearchFoods with various queries (including Cyrillic)
    - Test LookupBarcode with cached/uncached barcodes
    - _Requirements: 5.2, 6.2_

- [x] 5. Implement backend API handlers
  - [x] 5.1 Create food entries handlers in `apps/api/internal/modules/food-tracker/handler.go`
    - Implement GET `/api/food-tracker/entries` with date query
    - Implement POST `/api/food-tracker/entries`
    - Implement PUT `/api/food-tracker/entries/:id`
    - Implement DELETE `/api/food-tracker/entries/:id`
    - Add authentication middleware
    - _Requirements: 10.1, 10.3, 10.5, 16.1_
  
  - [x] 5.2 Create search handlers in `apps/api/internal/modules/food-tracker/search_handler.go`
    - Implement GET `/api/food-tracker/search`
    - Implement GET `/api/food-tracker/barcode/:code`
    - Implement GET `/api/food-tracker/recent`
    - Implement GET `/api/food-tracker/favorites`
    - _Requirements: 5.2, 5.6, 6.2_
  
  - [x] 5.3 Create water tracking handlers
    - Implement GET `/api/food-tracker/water`
    - Implement POST `/api/food-tracker/water`
    - _Requirements: 21.1, 21.2_
  
  - [x] 5.4 Create recommendations handlers
    - Implement GET `/api/food-tracker/recommendations`
    - Implement GET `/api/food-tracker/recommendations/:id`
    - Implement PUT `/api/food-tracker/recommendations/preferences`
    - Implement POST `/api/food-tracker/recommendations/custom`
    - _Requirements: 11.1, 12.1, 13.1, 14.1_
  
  - [x] 5.5 Write unit tests for handlers
    - Test request validation
    - Test authentication failures
    - Test error responses in Russian (e.g., "Запись не найдена", "Неверный формат данных")
    - _Requirements: 16.4, 18.2_

- [x] 6. Checkpoint - Backend complete
  - Run all backend tests: `make test-api`
  - Test API endpoints manually with curl
  - Verify database schema is correct
  - Ensure all error messages are in Russian
  - Ask the user if questions arise

- [x] 7. Implement Zustand store for food tracker
  - [x] 7.1 Create store in `apps/web/src/features/food-tracker/store/foodTrackerStore.ts`
    - Define state interface (entries, dailyTotals, targetGoals, waterIntake)
    - Implement `fetchDayData()` with date parameter
    - Implement `addEntry()` with optimistic updates
    - Implement `updateEntry()` with optimistic updates
    - Implement `deleteEntry()` with optimistic updates
    - Implement `addWater()` for water tracking
    - _Requirements: 2.4, 10.3, 10.5, 21.2_
  
  - [x] 7.2 Write property test for entry persistence round-trip (fast-check)
    - **Property 16: Entry Persistence Round-Trip**
    - For any created entry, retrieved entry has identical values
    - **Validates: Requirements 10.6, 16.1**
  
  - [x] 7.3 Write unit tests for store
    - Test fetchDayData success and error cases
    - Test optimistic update and rollback
    - Test daily totals recalculation
    - _Requirements: 2.4, 2.5_

- [x] 8. Implement КБЖУ calculation utilities
  - [x] 8.1 Create calculation utility in `apps/web/src/features/food-tracker/utils/kbzhuCalculator.ts`
    - Implement `calculateKBZHU()` for portion-based calculation
    - Implement `calculateDailyTotals()` for summing entries
    - Implement `getProgressColor()` for color coding
    - Implement `getPercentage()` for progress calculation
    - Implement `calculateMacroGoals()` for calorie-based macro calculation
    - _Requirements: 9.5, 25.2, 25.3, 25.4, 25.5, 25.6_
  
  - [x] 8.2 Write property test for КБЖУ calculation (fast-check)
    - **Property 1: КБЖУ Proportional Calculation**
    - For any food item and valid portion, calculated КБЖУ = (nutritionPer100 * portionAmount) / 100
    - **Validates: Requirements 9.5, 9.7**
  
  - [x] 8.3 Write property test for progress color coding (fast-check)
    - **Property 3: Progress Bar Color Coding**
    - Green: 80-100%, Yellow: 50-79% or 101-120%, Red: <50% or >120%
    - **Validates: Requirements 25.2, 25.3, 25.4**
  
  - [x] 8.4 Write property test for percentage calculation (fast-check)
    - **Property 15: Percentage Calculation**
    - For any current/target where target > 0, percentage = (current / target) * 100
    - **Validates: Requirements 25.5**
  
  - [x] 8.5 Write property test for macro goal calculation (fast-check)
    - **Property 14: Macro Goal Calculation**
    - Protein: (calorieGoal * 0.30) / 4, Fat: (calorieGoal * 0.30) / 9, Carbs: (calorieGoal * 0.40) / 4
    - **Validates: Requirements 25.6**

- [x] 9. Implement meal slot utilities
  - [x] 9.1 Create meal slot utility in `apps/web/src/features/food-tracker/utils/mealSlotUtils.ts`
    - Implement `getMealSlotByTime()` for time-based assignment
    - Implement `getMealSlotLabel()` for Russian labels (Завтрак, Обед, Ужин, Перекус)
    - Implement `getMealSlotIcon()` for icon mapping
    - Implement `calculateSlotSubtotals()` for slot КБЖУ
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.6_
  
  - [x] 9.2 Write property test for time-based meal slot assignment (fast-check)
    - **Property 4: Time-Based Meal Slot Assignment**
    - 05:00-10:59 → Завтрак, 11:00-15:59 → Обед, 16:00-20:59 → Ужин, else → Перекус
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.4**
  
  - [x] 9.3 Write property test for meal slot subtotals (fast-check)
    - **Property 5: Meal Slot Subtotals**
    - For any meal slot, subtotal = sum of all entries in that slot
    - **Validates: Requirements 26.6**

- [x] 10. Implement base UI components
  - [x] 10.1 Create DatePicker component in `apps/web/src/features/food-tracker/components/DatePicker.tsx`
    - Display date in format "Сегодня, [day] [month]" (Russian month names)
    - Previous/next day navigation arrows
    - Calendar dropdown for date selection
    - "Сегодня" quick return button
    - Prevent navigation to future dates
    - _Requirements: 1.1, 1.5, 27.1, 27.2, 27.3, 27.4, 27.6_
  
  - [x] 10.2 Create FoodTrackerTabs component
    - Render two tabs: "Рацион" and "Рекомендации"
    - Handle tab switching with keyboard support
    - Apply active tab styling
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 10.3 Write property test for tab switching (fast-check)
    - **Property 10: Tab Switching Content**
    - For any tab selection, displayed content corresponds to selected tab
    - **Validates: Requirements 1.4, 4.3**
  
  - [x] 10.4 Write unit tests for DatePicker and Tabs
    - Test date format display with Russian month names
    - Test navigation arrows
    - Test tab switching
    - Test future date prevention
    - _Requirements: 1.1, 1.4, 27.6_

- [x] 11. Implement КБЖУ Summary component
  - [x] 11.1 Create KBZHUSummary component in `apps/web/src/features/food-tracker/components/KBZHUSummary.tsx`
    - Display current/target for each macro (Белки, Жиры, Углеводы, Ккал)
    - Progress bars with color coding
    - Percentage display
    - Handle missing targets with "-" format
    - Visual indicator when exceeding target
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 25.1_
  
  - [x] 11.2 Write unit tests for KBZHUSummary
    - Test display with various current/target values
    - Test color coding at boundary values (50%, 80%, 100%, 120%)
    - Test missing target display
    - Test exceeding target indicator
    - _Requirements: 2.2, 2.3, 2.6, 25.2, 25.3, 25.4_

- [x] 12. Implement MealSlot and FoodEntry components
  - [x] 12.1 Create MealSlot component in `apps/web/src/features/food-tracker/components/MealSlot.tsx`
    - Display meal type icon and Russian name (Завтрак, Обед, Ужин, Перекус)
    - List food entries
    - Add button ("+" icon) to open entry modal
    - Subtotal КБЖУ display
    - First entry time display
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 26.6_
  
  - [x] 12.2 Create FoodEntryItem component
    - Display food name, portion size with unit, calories
    - Swipe actions for edit/delete (mobile)
    - Click handler for details
    - _Requirements: 3.5, 10.1_
  
  - [x] 12.3 Write property test for food entry display (fast-check)
    - **Property 6: Food Entry Display Completeness**
    - For any entry, display includes name, portion size with unit, and calories
    - **Validates: Requirements 3.4, 3.5**
  
  - [x] 12.4 Write unit tests for MealSlot
    - Test rendering with entries
    - Test empty state
    - Test add button click
    - Test Russian labels
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 13. Implement WaterTracker component
  - [x] 13.1 Create WaterTracker component in `apps/web/src/features/food-tracker/components/WaterTracker.tsx`
    - Display current/goal water intake in format "X / Y стаканов"
    - Quick add button for one glass (250ml default)
    - Visual progress indicator
    - Completion indicator when goal reached
    - _Requirements: 21.1, 21.2, 21.3, 21.6_
  
  - [x] 13.2 Write property test for water increment (fast-check)
    - **Property 12: Water Intake Increment**
    - For any add action, intake increases by exactly one glass
    - **Validates: Requirements 21.2**
  
  - [x] 13.3 Write property test for water display format (fast-check)
    - **Property 13: Water Display Format**
    - Display format is always "X / Y стаканов"
    - **Validates: Requirements 21.3**
  
  - [x] 13.4 Write unit tests for WaterTracker
    - Test display format with Russian text
    - Test add glass functionality
    - Test goal completion indicator
    - _Requirements: 21.1, 21.3, 21.6_

- [x] 14. Checkpoint - Core components complete
  - Run all frontend tests: `make test-web`
  - Verify components render correctly
  - Test responsive design
  - Verify all text is in Russian
  - Ask the user if questions arise

- [x] 15. Implement Food Entry Modal
  - [x] 15.1 Create FoodEntryModal component in `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`
    - Modal container with entry method tabs
    - Tab switching logic (Поиск, Штрих-код, Фото еды, Чат)
    - Close on escape/outside click
    - Default to "Поиск" tab
    - _Requirements: 4.1, 4.2, 4.3, 4.6_
  
  - [x] 15.2 Write property test for modal dismiss (fast-check)
    - **Property 20: Modal Dismiss Without Save**
    - For any dismiss action (Escape/outside click), no changes persisted
    - **Validates: Requirements 4.6**
  
  - [x] 15.3 Write unit tests for FoodEntryModal
    - Test tab rendering with Russian labels
    - Test default tab selection
    - Test close behavior (Escape, outside click)
    - _Requirements: 4.1, 4.2, 4.6_

- [x] 16. Implement SearchTab component
  - [x] 16.1 Create SearchTab component in `apps/web/src/features/food-tracker/components/SearchTab.tsx`
    - Search input with placeholder "Поиск блюд и продуктов"
    - Debounced search (300ms)
    - Results list display with name, portion, calories
    - Recent/popular foods when empty
    - "Ничего не найдено" empty state
    - "Ввести вручную" manual entry option
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 23.1_
  
  - [x] 16.2 Write property test for search results display (fast-check)
    - **Property 7: Search Results Display**
    - For any result, display includes name, serving size, and calories
    - **Validates: Requirements 5.3**
  
  - [x] 16.3 Write unit tests for SearchTab
    - Test search input debounce
    - Test results rendering
    - Test empty state with Russian message
    - Test food selection
    - _Requirements: 5.2, 5.3, 5.5_

- [x] 17. Implement BarcodeTab component
  - [x] 17.1 Create BarcodeTab component in `apps/web/src/features/food-tracker/components/BarcodeTab.tsx`
    - Camera viewfinder for scanning
    - Barcode detection integration
    - Product lookup via OpenFoodFacts API
    - Display product name, image, КБЖУ per 100g
    - "Продукт не найден" error with manual entry option
    - Camera permission error handling with Russian instructions
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 19.2_
  
  - [x] 17.2 Create useBarcodeScanner hook
    - Camera access management
    - Barcode detection logic
    - API lookup integration with cache check
    - Cache management (30-day expiry)
    - _Requirements: 6.2, 6.4, 6.7, 19.6, 19.7_
  
  - [x] 17.3 Write unit tests for BarcodeTab
    - Test camera permission handling
    - Test product found display
    - Test not found error with Russian message
    - Test cached data usage
    - _Requirements: 6.3, 6.5, 6.6, 6.7_

- [x] 18. Implement AIPhotoTab component
  - [x] 18.1 Create AIPhotoTab component in `apps/web/src/features/food-tracker/components/AIPhotoTab.tsx`
    - Camera/gallery photo selection
    - Photo upload to AI service
    - Loading indicator during processing
    - Results display with confidence scores
    - Multi-item selection for multiple foods
    - Fallback to manual search on low confidence
    - Error handling with Russian messages
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  
  - [x] 18.2 Write unit tests for AIPhotoTab
    - Test photo selection
    - Test loading state
    - Test results display with confidence
    - Test error handling with Russian messages
    - _Requirements: 7.3, 7.5, 7.7_

- [x] 19. Implement ChatTab component
  - [x] 19.1 Create ChatTab component in `apps/web/src/features/food-tracker/components/ChatTab.tsx`
    - Chat interface with curator
    - Photo upload capability
    - Food entry suggestions display
    - Response time indicator when curator unavailable
    - Session chat history persistence
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [x] 19.2 Write unit tests for ChatTab
    - Test message display
    - Test photo upload
    - Test suggestion acceptance
    - Test response time indicator
    - _Requirements: 8.2, 8.4, 8.5_

- [x] 20. Implement PortionSelector component
  - [x] 20.1 Create PortionSelector component in `apps/web/src/features/food-tracker/components/PortionSelector.tsx`
    - Portion type toggle (Граммы, Миллилитры, Порция)
    - Numeric input with slider
    - Quick portion buttons
    - Real-time КБЖУ calculation display
    - Validation error display in Russian
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  
  - [x] 20.2 Write property test for portion validation (fast-check)
    - **Property 8: Portion Validation**
    - For any invalid input (negative, zero, non-numeric), display Russian error
    - **Validates: Requirements 9.6**
  
  - [x] 20.3 Write unit tests for PortionSelector
    - Test portion type switching with Russian labels
    - Test КБЖУ calculation display
    - Test validation errors in Russian
    - Test slider interaction
    - _Requirements: 9.2, 9.3, 9.5, 9.6_

- [x] 21. Implement DietTab main component
  - [x] 21.1 Create DietTab component in `apps/web/src/features/food-tracker/components/DietTab.tsx`
    - Integrate KBZHUSummary
    - Render four MealSlot components (Завтрак, Обед, Ужин, Перекус)
    - Integrate WaterTracker
    - FAB for quick add
    - _Requirements: 2.1, 3.1, 21.1_
  
  - [x] 21.2 Write property test for date selection data loading (fast-check)
    - **Property 11: Date Selection Data Loading**
    - For any date selection, load entries, water, and totals for that date
    - **Validates: Requirements 1.6**
  
  - [x] 21.3 Write unit tests for DietTab
    - Test component integration
    - Test data loading
    - Test FAB click
    - _Requirements: 2.1, 3.1_

- [x] 22. Implement RecommendationsTab components
  - [x] 22.1 Create RecommendationsTab component
    - Nutrient categories display (Витамины, Минералы, Липиды, Клетчатка, Растительность)
    - Daily recommendations section
    - "Недельные рекомендации" weekly section
    - "Настроить список" configure button
    - "Добавить рекомендацию" add custom button
    - _Requirements: 11.1, 11.6, 14.1, 15.1, 15.2_
  
  - [x] 22.2 Create NutrientCategory component
    - Collapsible section with Russian category name
    - List of nutrient recommendations
    - "Выбрать все" / "Снять выбор" options
    - _Requirements: 11.2, 11.3, 13.5_
  
  - [x] 22.3 Create NutrientRecommendationItem component
    - Display nutrient name and progress in format "current / target unit"
    - Progress bar visualization
    - Click to navigate to detail
    - _Requirements: 11.3, 11.4, 11.5_
  
  - [x] 22.4 Write property test for recommendation progress format (fast-check)
    - **Property 17: Nutrient Recommendation Progress Format**
    - Display format is always "current / target unit" (e.g., "15 / 38 г")
    - **Validates: Requirements 11.4**
  
  - [x] 22.5 Write property test for category collapsibility (fast-check)
    - **Property 18: Category Collapsibility**
    - Toggle collapse shows/hides recommendations while preserving data
    - **Validates: Requirements 11.2**
  
  - [x] 22.6 Write unit tests for RecommendationsTab
    - Test category rendering with Russian names
    - Test recommendation display
    - Test navigation to detail
    - Test weekly section
    - _Requirements: 11.1, 11.3, 11.5, 15.1_

- [x] 23. Implement NutrientDetailPage component
  - [x] 23.1 Create NutrientDetailPage component
    - Nutrient name and progress bar
    - "Что это и зачем принимать" section
    - "На что влияет и как" section
    - "Источники в рационе" section with foods from current diet
    - Min/optimal recommendations display
    - Back navigation
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [x] 23.2 Write unit tests for NutrientDetailPage
    - Test information display with Russian section headers
    - Test sources rendering
    - Test back navigation
    - _Requirements: 12.2, 12.4, 12.7_

- [x] 24. Implement ConfigureNutrientsModal and CustomRecommendation
  - [x] 24.1 Create ConfigureNutrientsModal component
    - List all nutrients by category
    - Checkbox for each nutrient
    - "Выбрать все" / "Снять выбор" per category
    - Save preferences
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  
  - [x] 24.2 Create AddCustomRecommendationForm component
    - Name input (required)
    - Daily target input (required)
    - Unit selector (г, мг, мкг, МЕ)
    - Validation with Russian error messages
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  
  - [x] 24.3 Write unit tests for ConfigureNutrientsModal
    - Test checkbox toggling
    - Test select all/deselect
    - Test save functionality
    - _Requirements: 13.4, 13.5, 13.6_

- [x] 25. Checkpoint - All components complete
  - Run all frontend tests: `make test-web`
  - Verify all components render correctly
  - Test component interactions
  - Verify all text is in Russian
  - Ask the user if questions arise

- [x] 26. Implement custom hooks
  - [x] 26.1 Create useFoodTracker hook
    - Connect to Zustand store
    - Return entries, dailyTotals, targetGoals
    - Provide CRUD functions
    - Handle initial data fetching
    - _Requirements: 2.4, 10.1, 10.3_
  
  - [x] 26.2 Create useFoodSearch hook
    - Search query state with debounce (300ms)
    - Results management
    - Recent foods loading
    - _Requirements: 5.2, 5.6_
  
  - [x] 26.3 Create useWaterTracker hook
    - Connect to water state
    - Provide addGlass function
    - Goal and glass size management
    - _Requirements: 21.2, 21.4, 21.5_
  
  - [x] 26.4 Create useKBZHUCalculator hook
    - Calculation functions
    - Progress color determination
    - Percentage calculation
    - Macro goal calculation
    - _Requirements: 9.5, 25.2, 25.5, 25.6_
  
  - [x] 26.5 Write unit tests for hooks
    - Test data fetching
    - Test calculations
    - Test state updates
    - _Requirements: 2.4, 9.5, 21.2_

- [x] 27. Create Next.js App Router pages
  - [x] 27.1 Create page at `apps/web/src/app/food-tracker/page.tsx`
    - Server component with authentication check
    - Redirect to login if not authenticated
    - Set page metadata (title: "Дневник питания", description in Russian)
    - Render FoodTrackerPage client component
    - _Requirements: 16.6_
  
  - [x] 27.2 Create FoodTrackerPage component
    - Integrate FoodTrackerLayout
    - Integrate DatePicker
    - Integrate FoodTrackerTabs
    - Manage active tab state
    - Connect to store
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 27.3 Create nutrient detail page at `apps/web/src/app/food-tracker/nutrient/[id]/page.tsx`
    - Dynamic route for nutrient ID
    - Render NutrientDetailPage
    - _Requirements: 11.5, 12.1_
  
  - [x] 27.4 Write unit tests for pages
    - Test authentication redirect
    - Test page rendering
    - _Requirements: 16.6_

- [x] 28. Implement responsive design and accessibility
  - [x] 28.1 Add responsive styles to all components
    - Mobile (< 768px): Single column, touch-friendly, stacked components
    - Tablet (768px - 1024px): Optimized two-column layout
    - Desktop (>= 1024px): Multi-column layout maximizing screen space
    - Orientation change adaptation within 300ms
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_
  
  - [x] 28.2 Enhance accessibility features
    - Add focus-visible styles for keyboard navigation
    - Verify ARIA labels in Russian
    - Test keyboard navigation for all interactive elements
    - Ensure 4.5:1 contrast ratio for all text
    - Add text alternatives for progress bars and visual indicators
    - Implement ARIA live regions for error announcements
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_
  
  - [x] 28.3 Write unit tests for responsive breakpoints
    - Test mobile layout
    - Test tablet layout
    - Test desktop layout
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 29. Implement error handling and offline support
  - [x] 29.1 Add comprehensive error handling to store
    - Handle network errors with Russian messages (e.g., "Ошибка сети. Попробуйте снова.")
    - Implement retry logic with exponential backoff
    - Add offline detection
    - Rollback optimistic updates on failure
    - _Requirements: 16.4, 16.5, 19.4, 19.5_
  
  - [x] 29.2 Implement offline caching
    - Cache entries in localStorage
    - Load cached data when offline
    - Sync when connection restored
    - Show offline indicator
    - _Requirements: 16.5_
  
  - [x] 29.3 Write unit tests for error handling
    - Test network error display in Russian
    - Test retry functionality
    - Test offline indicator
    - _Requirements: 16.4, 16.5_

- [x] 30. Checkpoint - Frontend complete
  - Run all frontend tests: `make test-web`
  - Verify responsive design on different devices
  - Test keyboard navigation
  - Run accessibility audit
  - Verify all user-facing text is in Russian
  - Ask the user if questions arise

- [x] 31. Implement test generators and remaining property tests
  - [x] 31.1 Create test generators in `apps/web/src/features/food-tracker/testing/generators.ts`
    - Implement `foodItemGenerator()` using fast-check
    - Implement `kbzhuGenerator()`
    - Implement `foodEntryGenerator()`
    - Implement `timeGenerator()` for meal slot testing
    - Implement `portionGenerator()`
    - Implement `nutrientRecommendationGenerator()`
    - _Requirements: All (testing infrastructure)_
  
  - [x] 31.2 Write property test for food entry edit preservation (fast-check)
    - **Property 19: Food Entry Edit Preservation**
    - For any edit, updated values reflected and daily totals recalculated
    - **Validates: Requirements 10.2, 10.3**

- [x] 32. Integration and end-to-end testing
  - [x] 32.1 Set up MSW mocks for API endpoints
    - Mock GET/POST/PUT/DELETE `/api/food-tracker/entries`
    - Mock GET `/api/food-tracker/search`
    - Mock GET `/api/food-tracker/barcode/:code`
    - Mock GET/POST `/api/food-tracker/water`
    - Mock GET `/api/food-tracker/recommendations`
    - Mock error scenarios with Russian messages
    - _Requirements: All (testing infrastructure)_
  
  - [x] 32.2 Write integration tests
    - Test complete flow: open page → add food → verify totals
    - Test tab switching with data
    - Test date navigation
    - Test error recovery
    - _Requirements: 1.4, 2.4, 10.3_
  
  - [x] 32.3 Write E2E tests with Playwright
    - Test user login → navigate to food tracker → add entry
    - Test barcode scanning flow (mocked)
    - Test mobile responsive behavior
    - Test keyboard navigation
    - Verify Russian text throughout
    - _Requirements: All (E2E validation)_

- [x] 33. Performance optimization
  - [x] 33.1 Implement virtual scrolling for large lists
    - Use react-window for food lists > 50 items
    - Configure proper item heights
    - _Requirements: 20.7_
  
  - [x] 33.2 Optimize bundle size
    - Code split food-tracker feature
    - Lazy load heavy dependencies (camera, AI)
    - _Requirements: 20.1_
  
  - [x] 33.3 Add loading states and skeleton screens
    - Loading indicators for data fetching
    - Skeleton screens for initial load
    - Progress feedback for AI recognition
    - Camera feed without lag for barcode scanning
    - _Requirements: 20.2, 20.3, 20.4, 20.5_

- [x] 34. Final integration and polish
  - [x] 34.1 Wire up food tracker to main navigation
    - Add food tracker link to main menu
    - Add food icon in navigation
    - _Requirements: 1.1_
  
  - [x] 34.2 Add toast notifications for user feedback
    - Show toast when entry saved (Russian: "Запись сохранена")
    - Show toast on errors in Russian
    - Use react-hot-toast library
    - Immediate visual feedback for all user actions
    - _Requirements: 16.4, 20.6_
  
  - [x] 34.3 Final polish and refinements
    - Review all animations and transitions
    - Verify design token usage from `styles/tokens/`
    - Check for console errors/warnings
    - Ensure all text is in Russian
    - _Requirements: All_

- [x] 35. Final checkpoint - Complete feature
  - Run full test suite: `make test` (unit + property + integration + E2E)
  - Verify all 20 correctness properties are tested:
    - Property 1: КБЖУ Proportional Calculation (backend + frontend)
    - Property 2: Daily Totals Sum (backend)
    - Property 3: Progress Bar Color Coding (frontend)
    - Property 4: Time-Based Meal Slot Assignment (frontend)
    - Property 5: Meal Slot Subtotals (frontend)
    - Property 6: Food Entry Display Completeness (frontend)
    - Property 7: Search Results Display (frontend)
    - Property 8: Portion Validation (frontend)
    - Property 9: Barcode Cache Behavior (backend)
    - Property 10: Tab Switching Content (frontend)
    - Property 11: Date Selection Data Loading (frontend)
    - Property 12: Water Intake Increment (frontend)
    - Property 13: Water Display Format (frontend)
    - Property 14: Macro Goal Calculation (frontend)
    - Property 15: Percentage Calculation (frontend)
    - Property 16: Entry Persistence Round-Trip (frontend)
    - Property 17: Nutrient Recommendation Progress Format (frontend)
    - Property 18: Category Collapsibility (frontend)
    - Property 19: Food Entry Edit Preservation (frontend)
    - Property 20: Modal Dismiss Without Save (frontend)
  - Check test coverage meets goals (80% frontend, 85% backend)
  - Test on multiple browsers (Chrome, Firefox, Safari)
  - Test on multiple devices (mobile, tablet, desktop)
  - Run accessibility audit and fix any issues
  - Verify all user-facing text is in Russian
  - Ask the user for final review and approval

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with 100+ iterations each
- Unit tests validate specific examples, edge cases, and error conditions
- All user-facing text must be in Russian per localization requirements
- The implementation follows bottom-up approach: database → backend → frontend → integration
- Frontend property tests use fast-check library
- Backend property tests use gopter library
- Test coverage goals: 80% frontend, 85% backend
