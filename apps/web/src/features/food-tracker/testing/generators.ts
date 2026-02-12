/**
 * Property-based test generators for food tracker
 * Uses fast-check to generate random test data
 */

import fc from 'fast-check';
import type {
    KBZHU,
    MealType,
    PortionType,
    FoodSource,
    FoodItem,
    FoodEntry,
    RecognizedFood,
    NutrientCategoryType,
    NutrientRecommendation,
    NutrientDetail,
    NutrientFoodSource,
    WaterLog,
    MealTemplate,
    CustomRecommendationUnit,
    CustomRecommendation,
    FoodTrackerTab,
    EntryMethodTab,
    ProgressColor,
    TargetGoals,
} from '../types';

// ============================================================================
// Core Type Generators
// ============================================================================

/**
 * Generate КБЖУ (calories, protein, fat, carbs) values
 */
export const kbzhuGenerator = (
    options?: {
        maxCalories?: number;
        maxProtein?: number;
        maxFat?: number;
        maxCarbs?: number;
    }
): fc.Arbitrary<KBZHU> => {
    const { maxCalories = 5000, maxProtein = 500, maxFat = 500, maxCarbs = 500 } = options ?? {};

    return fc.record({
        calories: fc.float({ min: 0, max: maxCalories, noNaN: true }),
        protein: fc.float({ min: 0, max: maxProtein, noNaN: true }),
        fat: fc.float({ min: 0, max: maxFat, noNaN: true }),
        carbs: fc.float({ min: 0, max: maxCarbs, noNaN: true }),
    });
};

/**
 * Generate a meal type
 */
export const mealTypeGenerator = (): fc.Arbitrary<MealType> => {
    return fc.constantFrom('breakfast', 'lunch', 'dinner', 'snack');
};

/**
 * Generate a portion type
 */
export const portionTypeGenerator = (): fc.Arbitrary<PortionType> => {
    return fc.constantFrom('grams', 'milliliters', 'portion');
};

/**
 * Generate a food source
 */
export const foodSourceGenerator = (): fc.Arbitrary<FoodSource> => {
    return fc.constantFrom('database', 'usda', 'openfoodfacts', 'user');
};

// ============================================================================
// Food Item Generators
// ============================================================================

/**
 * Generate a food item
 */
export const foodItemGenerator = (): fc.Arbitrary<FoodItem> => {
    return fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 2, maxLength: 100 }),
        brand: fc.option(fc.string({ minLength: 2, maxLength: 50 }), { nil: undefined }),
        category: fc.string({ minLength: 2, maxLength: 50 }),
        servingSize: fc.float({ min: 1, max: 1000, noNaN: true }),
        servingUnit: fc.constantFrom('г', 'мл', 'шт', 'порция'),
        nutritionPer100: kbzhuGenerator(),
        barcode: fc.option(fc.stringMatching(/^\d{8,13}$/), { nil: undefined }),
        source: foodSourceGenerator(),
        verified: fc.boolean(),
        additionalNutrients: fc.option(
            fc.dictionary(
                fc.string({ minLength: 2, maxLength: 20 }),
                fc.float({ min: 0, max: 1000, noNaN: true })
            ),
            { nil: undefined }
        ),
    });
};

/**
 * Generate a time string in HH:mm format
 */
export const timeGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 })
    ).map(([hours, minutes]) =>
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    );
};

/**
 * Generate a date string in YYYY-MM-DD format
 */
export const dateGenerator = (
    minDate = new Date('2024-01-01'),
    maxDate = new Date()
): fc.Arbitrary<string> => {
    return fc
        .integer({ min: minDate.getTime(), max: maxDate.getTime() })
        .map((timestamp) => {
            const date = new Date(timestamp);
            return date.toISOString().split('T')[0];
        });
};

/**
 * Generate an ISO 8601 timestamp
 */
export const timestampGenerator = (
    minDate = new Date('2024-01-01'),
    maxDate = new Date()
): fc.Arbitrary<string> => {
    return fc
        .integer({ min: minDate.getTime(), max: maxDate.getTime() })
        .map((timestamp) => new Date(timestamp).toISOString());
};

/**
 * Generate a food entry
 */
export const foodEntryGenerator = (): fc.Arbitrary<FoodEntry> => {
    return fc.record({
        id: fc.uuid(),
        foodId: fc.uuid(),
        foodName: fc.string({ minLength: 2, maxLength: 100 }),
        mealType: mealTypeGenerator(),
        portionType: portionTypeGenerator(),
        portionAmount: fc.float({ min: 1, max: 2000, noNaN: true }),
        nutrition: kbzhuGenerator(),
        time: timeGenerator(),
        date: dateGenerator(),
        createdAt: timestampGenerator(),
        updatedAt: timestampGenerator(),
    });
};

// ============================================================================
// AI Recognition Generators
// ============================================================================

/**
 * Generate a recognized food from AI
 */
export const recognizedFoodGenerator = (): fc.Arbitrary<RecognizedFood> => {
    return fc.record({
        name: fc.string({ minLength: 2, maxLength: 100 }),
        confidence: fc.float({ min: 0, max: 1, noNaN: true }),
        estimatedWeight: fc.float({ min: 1, max: 1000, noNaN: true }),
        nutrition: kbzhuGenerator(),
        alternatives: fc.option(fc.array(foodItemGenerator(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    });
};

// ============================================================================
// Nutrient Recommendation Generators
// ============================================================================

/**
 * Generate a nutrient category type
 */
export const nutrientCategoryTypeGenerator = (): fc.Arbitrary<NutrientCategoryType> => {
    return fc.constantFrom('vitamins', 'minerals', 'lipids', 'fiber', 'plant');
};

/**
 * Generate a nutrient recommendation
 */
export const nutrientRecommendationGenerator = (): fc.Arbitrary<NutrientRecommendation> => {
    return fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 2, maxLength: 50 }),
        category: nutrientCategoryTypeGenerator(),
        dailyTarget: fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true }),
        unit: fc.constantFrom('г', 'мг', 'мкг', 'МЕ'),
        isWeekly: fc.boolean(),
        isCustom: fc.boolean(),
    });
};

/**
 * Generate a nutrient food source
 */
export const nutrientFoodSourceGenerator = (): fc.Arbitrary<NutrientFoodSource> => {
    return fc.record({
        foodName: fc.string({ minLength: 2, maxLength: 100 }),
        amount: fc.float({ min: 0, max: 1000, noNaN: true }),
        unit: fc.constantFrom('г', 'мг', 'мкг', 'МЕ'),
        contribution: fc.float({ min: 0, max: 100, noNaN: true }),
    });
};

/**
 * Generate nutrient detail
 */
export const nutrientDetailGenerator = (): fc.Arbitrary<NutrientDetail> => {
    return fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 2, maxLength: 50 }),
        description: fc.string({ minLength: 10, maxLength: 500 }),
        benefits: fc.string({ minLength: 10, maxLength: 500 }),
        effects: fc.string({ minLength: 10, maxLength: 500 }),
        minRecommendation: fc.float({ min: 0, max: 1000, noNaN: true }),
        optimalRecommendation: fc.float({ min: 0, max: 2000, noNaN: true }),
        unit: fc.constantFrom('г', 'мг', 'мкг', 'МЕ'),
        sourcesInDiet: fc.array(nutrientFoodSourceGenerator(), { minLength: 0, maxLength: 10 }),
    });
};

// ============================================================================
// Water Tracking Generators
// ============================================================================

/**
 * Generate a water log
 */
export const waterLogGenerator = (): fc.Arbitrary<WaterLog> => {
    return fc.record({
        date: dateGenerator(),
        glasses: fc.integer({ min: 0, max: 20 }),
        goal: fc.integer({ min: 1, max: 20 }),
        glassSize: fc.integer({ min: 100, max: 500 }),
    });
};

// ============================================================================
// Meal Template Generators
// ============================================================================

/**
 * Generate a meal template
 */
export const mealTemplateGenerator = (): fc.Arbitrary<MealTemplate> => {
    return fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 2, maxLength: 100 }),
        mealType: mealTypeGenerator(),
        entries: fc.array(
            fc.record({
                foodId: fc.uuid(),
                foodName: fc.string({ minLength: 2, maxLength: 100 }),
                mealType: mealTypeGenerator(),
                portionType: portionTypeGenerator(),
                portionAmount: fc.float({ min: 1, max: 2000, noNaN: true }),
                nutrition: kbzhuGenerator(),
                time: timeGenerator(),
            }),
            { minLength: 1, maxLength: 10 }
        ),
        totalNutrition: kbzhuGenerator(),
        createdAt: timestampGenerator(),
    });
};

// ============================================================================
// Custom Recommendation Generators
// ============================================================================

/**
 * Generate a custom recommendation unit
 */
export const customRecommendationUnitGenerator = (): fc.Arbitrary<CustomRecommendationUnit> => {
    return fc.constantFrom('г', 'мг', 'мкг', 'МЕ');
};

/**
 * Generate a custom recommendation
 */
export const customRecommendationGenerator = (): fc.Arbitrary<CustomRecommendation> => {
    return fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 2, maxLength: 50 }),
        dailyTarget: fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true }),
        unit: customRecommendationUnitGenerator(),
        currentIntake: fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
    });
};

// ============================================================================
// UI State Generators
// ============================================================================

/**
 * Generate a food tracker tab
 */
export const foodTrackerTabGenerator = (): fc.Arbitrary<FoodTrackerTab> => {
    return fc.constantFrom('diet', 'recommendations');
};

/**
 * Generate an entry method tab
 */
export const entryMethodTabGenerator = (): fc.Arbitrary<EntryMethodTab> => {
    return fc.constantFrom('search', 'barcode', 'photo', 'chat');
};

/**
 * Generate a progress color
 */
export const progressColorGenerator = (): fc.Arbitrary<ProgressColor> => {
    return fc.constantFrom('green', 'yellow', 'red');
};

/**
 * Generate target goals
 */
export const targetGoalsGenerator = (): fc.Arbitrary<TargetGoals> => {
    return fc.record({
        calories: fc.float({ min: 1000, max: 5000, noNaN: true }),
        protein: fc.float({ min: 50, max: 300, noNaN: true }),
        fat: fc.float({ min: 30, max: 200, noNaN: true }),
        carbs: fc.float({ min: 100, max: 500, noNaN: true }),
        isCustom: fc.boolean(),
    });
};

// ============================================================================
// Portion Generators (for testing calculations)
// ============================================================================

/**
 * Generate a valid portion amount (positive number)
 */
export const validPortionGenerator = (): fc.Arbitrary<number> => {
    return fc.float({ min: Math.fround(0.1), max: Math.fround(2000), noNaN: true });
};

/**
 * Generate an invalid portion amount (negative, zero, or NaN)
 */
export const invalidPortionGenerator = (): fc.Arbitrary<number> => {
    return fc.oneof(
        fc.float({ min: -1000, max: 0, noNaN: true }),
        fc.constant(0),
        fc.constant(NaN),
        fc.constant(-Infinity)
    );
};

// ============================================================================
// Time-based Generators (for meal slot testing)
// ============================================================================

/**
 * Generate a breakfast time (05:00-10:59)
 */
export const breakfastTimeGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(
        fc.integer({ min: 5, max: 10 }),
        fc.integer({ min: 0, max: 59 })
    ).map(([hours, minutes]) =>
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    );
};

/**
 * Generate a lunch time (11:00-15:59)
 */
export const lunchTimeGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(
        fc.integer({ min: 11, max: 15 }),
        fc.integer({ min: 0, max: 59 })
    ).map(([hours, minutes]) =>
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    );
};

/**
 * Generate a dinner time (16:00-20:59)
 */
export const dinnerTimeGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(
        fc.integer({ min: 16, max: 20 }),
        fc.integer({ min: 0, max: 59 })
    ).map(([hours, minutes]) =>
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    );
};

/**
 * Generate a snack time (21:00-04:59)
 */
export const snackTimeGenerator = (): fc.Arbitrary<string> => {
    return fc.oneof(
        // 21:00-23:59
        fc.tuple(
            fc.integer({ min: 21, max: 23 }),
            fc.integer({ min: 0, max: 59 })
        ).map(([hours, minutes]) =>
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
        ),
        // 00:00-04:59
        fc.tuple(
            fc.integer({ min: 0, max: 4 }),
            fc.integer({ min: 0, max: 59 })
        ).map(([hours, minutes]) =>
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
        )
    );
};

// ============================================================================
// Array Generators
// ============================================================================

/**
 * Generate an array of food entries
 */
export const foodEntryArrayGenerator = (
    minLength = 0,
    maxLength = 50
): fc.Arbitrary<FoodEntry[]> => {
    return fc.array(foodEntryGenerator(), { minLength, maxLength });
};

/**
 * Generate an array of food items
 */
export const foodItemArrayGenerator = (
    minLength = 0,
    maxLength = 50
): fc.Arbitrary<FoodItem[]> => {
    return fc.array(foodItemGenerator(), { minLength, maxLength });
};

/**
 * Generate an array of nutrient recommendations
 */
export const nutrientRecommendationArrayGenerator = (
    minLength = 0,
    maxLength = 20
): fc.Arbitrary<NutrientRecommendation[]> => {
    return fc.array(nutrientRecommendationGenerator(), { minLength, maxLength });
};
