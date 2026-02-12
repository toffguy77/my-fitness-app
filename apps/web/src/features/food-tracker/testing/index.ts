/**
 * Food Tracker testing utilities
 *
 * Exports test generators for property-based testing with fast-check.
 */

export {
    // Core type generators
    kbzhuGenerator,
    mealTypeGenerator,
    portionTypeGenerator,
    foodSourceGenerator,
    // Food item generators
    foodItemGenerator,
    foodEntryGenerator,
    // AI recognition generators
    recognizedFoodGenerator,
    // Nutrient recommendation generators
    nutrientCategoryTypeGenerator,
    nutrientRecommendationGenerator,
    nutrientDetailGenerator,
    nutrientFoodSourceGenerator,
    // Water tracking generators
    waterLogGenerator,
    // Meal template generators
    mealTemplateGenerator,
    // Custom recommendation generators
    customRecommendationUnitGenerator,
    customRecommendationGenerator,
    // UI state generators
    foodTrackerTabGenerator,
    entryMethodTabGenerator,
    progressColorGenerator,
    targetGoalsGenerator,
    // Time and date generators
    timeGenerator,
    dateGenerator,
    timestampGenerator,
    // Meal time generators
    breakfastTimeGenerator,
    lunchTimeGenerator,
    dinnerTimeGenerator,
    snackTimeGenerator,
    // Portion generators
    validPortionGenerator,
    invalidPortionGenerator,
    // Array generators
    foodEntryArrayGenerator,
    foodItemArrayGenerator,
    nutrientRecommendationArrayGenerator,
} from './generators';
