/**
 * Food Tracker feature type definitions
 *
 * Types for КБЖУ (calories, protein, fat, carbs) tracking,
 * food entries, meal slots, and nutrient recommendations.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * КБЖУ (Калории, Белки, Жиры, Углеводы) nutritional values
 */
export interface KBZHU {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
}

/**
 * Meal type - one of four daily meal categories
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Portion measurement type
 */
export type PortionType = 'grams' | 'milliliters' | 'portion';

/**
 * Data source for food items
 */
export type FoodSource = 'database' | 'usda' | 'openfoodfacts' | 'user' | 'ai';

// ============================================================================
// Food Item Types
// ============================================================================

/**
 * Food item from database with nutritional information
 */
export interface FoodItem {
    id: string;
    name: string;
    brand?: string;
    category: string;
    servingSize: number;
    servingUnit: string;
    nutritionPer100: KBZHU;
    barcode?: string;
    source: FoodSource;
    verified: boolean;
    additionalNutrients?: Record<string, number>;
}

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

/**
 * Food entry in user's daily log
 */
export interface FoodEntry {
    id: string;
    foodId: string;
    foodName: string;
    mealType: MealType;
    portionType: PortionType;
    portionAmount: number;
    nutrition: KBZHU;
    time: string; // HH:mm format
    date: string; // YYYY-MM-DD format
    createdAt: string; // ISO 8601 format
    updatedAt: string; // ISO 8601 format
}

// ============================================================================
// AI Recognition Types
// ============================================================================

/**
 * AI food recognition result
 */
export interface RecognizedFood {
    name: string;
    confidence: number;
    estimatedWeight: number;
    nutrition: KBZHU;
    alternatives?: FoodItem[];
}

// ============================================================================
// Nutrient Recommendation Types
// ============================================================================

/**
 * Nutrient category type
 */
export type NutrientCategoryType = 'vitamins' | 'minerals' | 'lipids' | 'fiber' | 'plant';

/**
 * Nutrient recommendation for daily/weekly tracking
 */
export interface NutrientRecommendation {
    id: string;
    name: string;
    category: NutrientCategoryType;
    dailyTarget: number;
    unit: string;
    isWeekly: boolean;
    isCustom: boolean;
}

/**
 * Detailed nutrient information
 */
export interface NutrientDetail {
    id: string;
    name: string;
    description: string;
    benefits: string;
    effects: string;
    minRecommendation: number;
    optimalRecommendation: number;
    unit: string;
    sourcesInDiet: NutrientFoodSource[];
}

/**
 * Food source contributing to nutrient intake
 */
export interface NutrientFoodSource {
    foodName: string;
    amount: number;
    unit: string;
    contribution: number;
}

// ============================================================================
// Water Tracking Types
// ============================================================================

/**
 * Daily water intake log
 */
export interface WaterLog {
    date: string; // YYYY-MM-DD format
    glasses: number;
    goal: number;
    glassSize: number; // in milliliters
}

// ============================================================================
// Meal Template Types
// ============================================================================

/**
 * Saved meal template for quick reuse
 */
export interface MealTemplate {
    id: string;
    name: string;
    mealType: MealType;
    entries: Omit<FoodEntry, 'id' | 'date' | 'createdAt' | 'updatedAt'>[];
    totalNutrition: KBZHU;
    createdAt: string; // ISO 8601 format
}

// ============================================================================
// Custom Recommendation Types
// ============================================================================

/**
 * Unit type for custom recommendations
 */
export type CustomRecommendationUnit = 'г' | 'мг' | 'мкг' | 'МЕ';

/**
 * User-defined custom nutrient recommendation
 */
export interface CustomRecommendation {
    id: string;
    name: string;
    dailyTarget: number;
    unit: CustomRecommendationUnit;
    currentIntake: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request to create a new food entry
 */
export interface CreateFoodEntryRequest {
    foodId: string;
    mealType: MealType;
    portionType: PortionType;
    portionAmount: number;
    time: string;
    date: string;
    /** Override food name (per-entry, does not change catalog) */
    foodName?: string;
    /** Override calculated calories */
    calories?: number;
    /** Override calculated protein */
    protein?: number;
    /** Override calculated fat */
    fat?: number;
    /** Override calculated carbs */
    carbs?: number;
}

/**
 * Request to update an existing food entry
 */
export interface UpdateFoodEntryRequest {
    mealType?: MealType;
    portionType?: PortionType;
    portionAmount?: number;
    time?: string;
    /** Override food name (per-entry, does not change catalog) */
    foodName?: string;
    /** Override calculated calories */
    calories?: number;
    /** Override calculated protein */
    protein?: number;
    /** Override calculated fat */
    fat?: number;
    /** Override calculated carbs */
    carbs?: number;
}

/**
 * API response for fetching food entries
 */
export interface GetFoodEntriesResponse {
    /** Entries may be a flat array or already grouped by meal type */
    entries: FoodEntry[] | Record<string, FoodEntry[]>;
    dailyTotals: KBZHU;
}

/**
 * API response for food search
 */
export interface SearchFoodsResponse {
    items: FoodItem[];
    total: number;
}

/**
 * API response for barcode lookup
 */
export interface BarcodeLookupResponse {
    found: boolean;
    item?: FoodItem;
    cached: boolean;
}

/**
 * API response for AI food recognition
 */
export interface AIRecognitionResponse {
    foods: RecognizedFood[];
    processingTime: number;
}

/**
 * API response for water tracking
 * Backend returns glasses/goal/glass_size directly (snake_case JSON)
 */
export interface WaterLogResponse {
    glasses: number;
    goal: number;
    glass_size: number;
    enabled: boolean;
}

/**
 * API response for recommendations
 */
export interface GetRecommendationsResponse {
    recommendations: NutrientRecommendation[];
    customRecommendations: CustomRecommendation[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for food tracker operations
 */
export type FoodTrackerErrorCode =
    | 'UNAUTHORIZED'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'NETWORK_ERROR'
    | 'SERVER_ERROR'
    | 'CAMERA_PERMISSION_DENIED'
    | 'BARCODE_NOT_FOUND'
    | 'AI_SERVICE_UNAVAILABLE';

/**
 * Error response from API
 */
export interface FoodTrackerError {
    code: FoodTrackerErrorCode;
    message: string; // Russian error message
    details?: Record<string, string>;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Active tab in food tracker
 */
export type FoodTrackerTab = 'diet' | 'recommendations';

/**
 * Entry method tab in food entry modal
 */
export type EntryMethodTab = 'search' | 'barcode' | 'manual' | 'photo' | 'chat';

/**
 * Progress bar color based on percentage
 */
export type ProgressColor = 'green' | 'yellow' | 'red';

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Entries grouped by meal type
 */
export type EntriesByMealType = Record<MealType, FoodEntry[]>;

/**
 * Daily target goals for КБЖУ
 */
export interface TargetGoals extends KBZHU {
    isCustom: boolean;
}
