/**
 * Food Tracker feature public API
 *
 * This barrel file exports the public interface of the food tracker feature.
 * Components, hooks, and utilities from this feature should be imported through this file.
 *
 * Feature provides:
 * - Daily meal logging with КБЖУ (calories, protein, fat, carbs) tracking
 * - Multiple food entry methods: search, barcode scanning, AI recognition, chat
 * - Water intake tracking
 * - Nutrient recommendations and custom tracking
 * - Meal templates for quick reuse
 */

// ============================================================================
// Types
// ============================================================================

export type {
    // Core types
    KBZHU,
    MealType,
    PortionType,
    FoodSource,
    // Food item types
    FoodItem,
    FoodEntry,
    // AI recognition
    RecognizedFood,
    // Nutrient recommendations
    NutrientCategoryType,
    NutrientRecommendation,
    NutrientDetail,
    NutrientFoodSource,
    // Water tracking
    WaterLog,
    // Meal templates
    MealTemplate,
    // Custom recommendations
    CustomRecommendationUnit,
    CustomRecommendation,
    // API types
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
    GetFoodEntriesResponse,
    SearchFoodsResponse,
    BarcodeLookupResponse,
    AIRecognitionResponse,
    WaterLogResponse,
    GetRecommendationsResponse,
    // Error types
    FoodTrackerErrorCode,
    FoodTrackerError,
    // UI state types
    FoodTrackerTab,
    EntryMethodTab,
    ProgressColor,
    // Utility types
    EntriesByMealType,
    TargetGoals,
} from './types';

// ============================================================================
// Components (to be implemented)
// ============================================================================

// Layout and navigation
// export { FoodTrackerLayout } from './components/FoodTrackerLayout';
// export { FoodTrackerTabs } from './components/FoodTrackerTabs';
// export { DatePicker } from './components/DatePicker';

// Diet tab components
// export { DietTab } from './components/DietTab';
// export { KBZHUSummary } from './components/KBZHUSummary';
// export { MealSlot } from './components/MealSlot';
// export { FoodEntryItem } from './components/FoodEntryItem';
// export { WaterTracker } from './components/WaterTracker';

// Food entry modal components
// export { FoodEntryModal } from './components/FoodEntryModal';
// export { SearchTab } from './components/SearchTab';
// export { BarcodeTab } from './components/BarcodeTab';
// export { AIPhotoTab } from './components/AIPhotoTab';
// export { ChatTab } from './components/ChatTab';
// export { PortionSelector } from './components/PortionSelector';

// Page components
export { FoodTrackerPage } from './components/FoodTrackerPage';
export { FoodTrackerTabs } from './components/FoodTrackerTabs';
export { DatePicker } from './components/DatePicker';
export { DietTab } from './components/DietTab';
export { OfflineIndicator } from './components/OfflineIndicator';

// Recommendations tab components
export { RecommendationsTab } from './components/RecommendationsTab';
export { NutrientCategory } from './components/NutrientCategory';
export { NutrientRecommendationItem } from './components/NutrientRecommendationItem';
export { NutrientDetailPage } from './components/NutrientDetailPage';
export { ConfigureNutrientsModal } from './components/ConfigureNutrientsModal';
export { AddCustomRecommendationForm } from './components/AddCustomRecommendationForm';

// ============================================================================
// Hooks
// ============================================================================

export { useFoodTracker } from './hooks/useFoodTracker';
export type { UseFoodTracker, UseFoodTrackerOptions } from './hooks/useFoodTracker';

export { useFoodSearch } from './hooks/useFoodSearch';
export type { UseFoodSearch, UseFoodSearchOptions } from './hooks/useFoodSearch';

export { useBarcodeScanner } from './hooks/useBarcodeScanner';
export type { UseBarcodeScanner, BarcodeScannerOptions, CameraStatus } from './hooks/useBarcodeScanner';

export { useWaterTracker } from './hooks/useWaterTracker';
export type { UseWaterTracker } from './hooks/useWaterTracker';

export { useKBZHUCalculator } from './hooks/useKBZHUCalculator';
export type { UseKBZHUCalculator, KBZHUProgress, MacroProgress } from './hooks/useKBZHUCalculator';

export { useOnlineStatus } from './hooks/useOnlineStatus';
export type { UseOnlineStatusReturn } from './hooks/useOnlineStatus';

// ============================================================================
// Store
// ============================================================================

export { useFoodTrackerStore } from './store/foodTrackerStore';

// ============================================================================
// Utils
// ============================================================================

// КБЖУ calculator utilities
export {
    calculateKBZHU,
    calculateFoodKBZHU,
    calculateDailyTotals,
    getProgressColor,
    getPercentage,
    calculateMacroGoals,
    validatePortionAmount,
    roundToOneDecimal,
    EMPTY_KBZHU,
    MACRO_DISTRIBUTION,
    CALORIES_PER_GRAM,
} from './utils/kbzhuCalculator';

// Meal slot utilities
export {
    getMealSlotByTime,
    getMealSlotLabel,
    getMealSlotIcon,
    calculateSlotSubtotals,
    getMealTypesInOrder,
    isValidMealType,
    MEAL_SLOT_LABELS,
    MEAL_SLOT_ICONS,
    MEAL_TIME_RANGES,
} from './utils/mealSlotUtils';
