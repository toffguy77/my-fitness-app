/**
 * Unit tests for food tracker types
 * 
 * Tests type definitions and ensures they are correctly structured.
 * Uses fast-check for property-based testing of type generators.
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
    EntriesByMealType,
    TargetGoals,
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
    FoodTrackerErrorCode,
    FoodTrackerError,
} from '../index';
import {
    kbzhuGenerator,
    mealTypeGenerator,
    portionTypeGenerator,
    foodSourceGenerator,
    foodItemGenerator,
    foodEntryGenerator,
    recognizedFoodGenerator,
    nutrientCategoryTypeGenerator,
    nutrientRecommendationGenerator,
    nutrientDetailGenerator,
    nutrientFoodSourceGenerator,
    waterLogGenerator,
    mealTemplateGenerator,
    customRecommendationUnitGenerator,
    customRecommendationGenerator,
    foodTrackerTabGenerator,
    entryMethodTabGenerator,
    progressColorGenerator,
    targetGoalsGenerator,
    timeGenerator,
    dateGenerator,
    timestampGenerator,
    validPortionGenerator,
    invalidPortionGenerator,
    breakfastTimeGenerator,
    lunchTimeGenerator,
    dinnerTimeGenerator,
    snackTimeGenerator,
} from '../../testing/generators';

describe('Food Tracker Types', () => {
    describe('KBZHU', () => {
        it('should have all required nutritional fields', () => {
            fc.assert(
                fc.property(kbzhuGenerator(), (kbzhu: KBZHU) => {
                    expect(kbzhu).toHaveProperty('calories');
                    expect(kbzhu).toHaveProperty('protein');
                    expect(kbzhu).toHaveProperty('fat');
                    expect(kbzhu).toHaveProperty('carbs');
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have non-negative values', () => {
            fc.assert(
                fc.property(kbzhuGenerator(), (kbzhu: KBZHU) => {
                    expect(kbzhu.calories).toBeGreaterThanOrEqual(0);
                    expect(kbzhu.protein).toBeGreaterThanOrEqual(0);
                    expect(kbzhu.fat).toBeGreaterThanOrEqual(0);
                    expect(kbzhu.carbs).toBeGreaterThanOrEqual(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have numeric values', () => {
            fc.assert(
                fc.property(kbzhuGenerator(), (kbzhu: KBZHU) => {
                    expect(typeof kbzhu.calories).toBe('number');
                    expect(typeof kbzhu.protein).toBe('number');
                    expect(typeof kbzhu.fat).toBe('number');
                    expect(typeof kbzhu.carbs).toBe('number');
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('MealType', () => {
        it('should be one of the valid meal types', () => {
            fc.assert(
                fc.property(mealTypeGenerator(), (mealType: MealType) => {
                    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(mealType);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should cover all meal types', () => {
            const mealTypes = new Set<MealType>();
            fc.assert(
                fc.property(mealTypeGenerator(), (mealType: MealType) => {
                    mealTypes.add(mealType);
                    return true;
                }),
                { numRuns: 1000 }
            );
            expect(mealTypes.size).toBe(4);
        });
    });

    describe('PortionType', () => {
        it('should be one of the valid portion types', () => {
            fc.assert(
                fc.property(portionTypeGenerator(), (portionType: PortionType) => {
                    expect(['grams', 'milliliters', 'portion']).toContain(portionType);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('FoodSource', () => {
        it('should be one of the valid food sources', () => {
            fc.assert(
                fc.property(foodSourceGenerator(), (source: FoodSource) => {
                    expect(['database', 'usda', 'openfoodfacts', 'user']).toContain(source);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('FoodItem', () => {
        it('should have all required fields', () => {
            fc.assert(
                fc.property(foodItemGenerator(), (item: FoodItem) => {
                    expect(item).toHaveProperty('id');
                    expect(item).toHaveProperty('name');
                    expect(item).toHaveProperty('category');
                    expect(item).toHaveProperty('servingSize');
                    expect(item).toHaveProperty('servingUnit');
                    expect(item).toHaveProperty('nutritionPer100');
                    expect(item).toHaveProperty('source');
                    expect(item).toHaveProperty('verified');
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid UUID for id', () => {
            fc.assert(
                fc.property(foodItemGenerator(), (item: FoodItem) => {
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    expect(item.id).toMatch(uuidRegex);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have positive serving size', () => {
            fc.assert(
                fc.property(foodItemGenerator(), (item: FoodItem) => {
                    expect(item.servingSize).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid nutritionPer100 KBZHU', () => {
            fc.assert(
                fc.property(foodItemGenerator(), (item: FoodItem) => {
                    expect(item.nutritionPer100).toHaveProperty('calories');
                    expect(item.nutritionPer100).toHaveProperty('protein');
                    expect(item.nutritionPer100).toHaveProperty('fat');
                    expect(item.nutritionPer100).toHaveProperty('carbs');
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('FoodEntry', () => {
        it('should have all required fields', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry: FoodEntry) => {
                    expect(entry).toHaveProperty('id');
                    expect(entry).toHaveProperty('foodId');
                    expect(entry).toHaveProperty('foodName');
                    expect(entry).toHaveProperty('mealType');
                    expect(entry).toHaveProperty('portionType');
                    expect(entry).toHaveProperty('portionAmount');
                    expect(entry).toHaveProperty('nutrition');
                    expect(entry).toHaveProperty('time');
                    expect(entry).toHaveProperty('date');
                    expect(entry).toHaveProperty('createdAt');
                    expect(entry).toHaveProperty('updatedAt');
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid time format (HH:mm)', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry: FoodEntry) => {
                    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                    expect(entry.time).toMatch(timeRegex);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid date format (YYYY-MM-DD)', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry: FoodEntry) => {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    expect(entry.date).toMatch(dateRegex);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have positive portion amount', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry: FoodEntry) => {
                    expect(entry.portionAmount).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('RecognizedFood', () => {
        it('should have confidence between 0 and 1', () => {
            fc.assert(
                fc.property(recognizedFoodGenerator(), (food: RecognizedFood) => {
                    expect(food.confidence).toBeGreaterThanOrEqual(0);
                    expect(food.confidence).toBeLessThanOrEqual(1);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have positive estimated weight', () => {
            fc.assert(
                fc.property(recognizedFoodGenerator(), (food: RecognizedFood) => {
                    expect(food.estimatedWeight).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('NutrientCategoryType', () => {
        it('should be one of the valid categories', () => {
            fc.assert(
                fc.property(nutrientCategoryTypeGenerator(), (category: NutrientCategoryType) => {
                    expect(['vitamins', 'minerals', 'lipids', 'fiber', 'plant']).toContain(category);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('NutrientRecommendation', () => {
        it('should have all required fields', () => {
            fc.assert(
                fc.property(nutrientRecommendationGenerator(), (rec: NutrientRecommendation) => {
                    expect(rec).toHaveProperty('id');
                    expect(rec).toHaveProperty('name');
                    expect(rec).toHaveProperty('category');
                    expect(rec).toHaveProperty('dailyTarget');
                    expect(rec).toHaveProperty('unit');
                    expect(rec).toHaveProperty('isWeekly');
                    expect(rec).toHaveProperty('isCustom');
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have positive daily target', () => {
            fc.assert(
                fc.property(nutrientRecommendationGenerator(), (rec: NutrientRecommendation) => {
                    expect(rec.dailyTarget).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid unit', () => {
            fc.assert(
                fc.property(nutrientRecommendationGenerator(), (rec: NutrientRecommendation) => {
                    expect(['г', 'мг', 'мкг', 'МЕ']).toContain(rec.unit);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('WaterLog', () => {
        it('should have all required fields', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (log: WaterLog) => {
                    expect(log).toHaveProperty('date');
                    expect(log).toHaveProperty('glasses');
                    expect(log).toHaveProperty('goal');
                    expect(log).toHaveProperty('glassSize');
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have non-negative glasses', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (log: WaterLog) => {
                    expect(log.glasses).toBeGreaterThanOrEqual(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have positive goal', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (log: WaterLog) => {
                    expect(log.goal).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have reasonable glass size (100-500ml)', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (log: WaterLog) => {
                    expect(log.glassSize).toBeGreaterThanOrEqual(100);
                    expect(log.glassSize).toBeLessThanOrEqual(500);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('MealTemplate', () => {
        it('should have at least one entry', () => {
            fc.assert(
                fc.property(mealTemplateGenerator(), (template: MealTemplate) => {
                    expect(template.entries.length).toBeGreaterThan(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have valid total nutrition', () => {
            fc.assert(
                fc.property(mealTemplateGenerator(), (template: MealTemplate) => {
                    expect(template.totalNutrition).toHaveProperty('calories');
                    expect(template.totalNutrition).toHaveProperty('protein');
                    expect(template.totalNutrition).toHaveProperty('fat');
                    expect(template.totalNutrition).toHaveProperty('carbs');
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('CustomRecommendation', () => {
        it('should have valid unit', () => {
            fc.assert(
                fc.property(customRecommendationGenerator(), (rec: CustomRecommendation) => {
                    expect(['г', 'мг', 'мкг', 'МЕ']).toContain(rec.unit);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should have non-negative current intake', () => {
            fc.assert(
                fc.property(customRecommendationGenerator(), (rec: CustomRecommendation) => {
                    expect(rec.currentIntake).toBeGreaterThanOrEqual(0);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('UI State Types', () => {
        it('FoodTrackerTab should be diet or recommendations', () => {
            fc.assert(
                fc.property(foodTrackerTabGenerator(), (tab: FoodTrackerTab) => {
                    expect(['diet', 'recommendations']).toContain(tab);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('EntryMethodTab should be one of valid methods', () => {
            fc.assert(
                fc.property(entryMethodTabGenerator(), (tab: EntryMethodTab) => {
                    expect(['search', 'barcode', 'photo', 'chat']).toContain(tab);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('ProgressColor should be green, yellow, or red', () => {
            fc.assert(
                fc.property(progressColorGenerator(), (color: ProgressColor) => {
                    expect(['green', 'yellow', 'red']).toContain(color);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('TargetGoals', () => {
        it('should extend KBZHU with isCustom flag', () => {
            fc.assert(
                fc.property(targetGoalsGenerator(), (goals: TargetGoals) => {
                    expect(goals).toHaveProperty('calories');
                    expect(goals).toHaveProperty('protein');
                    expect(goals).toHaveProperty('fat');
                    expect(goals).toHaveProperty('carbs');
                    expect(goals).toHaveProperty('isCustom');
                    expect(typeof goals.isCustom).toBe('boolean');
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });
});

describe('Time Generators', () => {
    describe('timeGenerator', () => {
        it('should generate valid HH:mm format', () => {
            fc.assert(
                fc.property(timeGenerator(), (time: string) => {
                    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                    expect(time).toMatch(timeRegex);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('dateGenerator', () => {
        it('should generate valid YYYY-MM-DD format', () => {
            fc.assert(
                fc.property(dateGenerator(), (date: string) => {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    expect(date).toMatch(dateRegex);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('timestampGenerator', () => {
        it('should generate valid ISO 8601 format', () => {
            fc.assert(
                fc.property(timestampGenerator(), (timestamp: string) => {
                    const date = new Date(timestamp);
                    expect(date.toISOString()).toBe(timestamp);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Meal time generators', () => {
        it('breakfastTimeGenerator should generate times between 05:00-10:59', () => {
            fc.assert(
                fc.property(breakfastTimeGenerator(), (time: string) => {
                    const [hours] = time.split(':').map(Number);
                    expect(hours).toBeGreaterThanOrEqual(5);
                    expect(hours).toBeLessThanOrEqual(10);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('lunchTimeGenerator should generate times between 11:00-15:59', () => {
            fc.assert(
                fc.property(lunchTimeGenerator(), (time: string) => {
                    const [hours] = time.split(':').map(Number);
                    expect(hours).toBeGreaterThanOrEqual(11);
                    expect(hours).toBeLessThanOrEqual(15);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('dinnerTimeGenerator should generate times between 16:00-20:59', () => {
            fc.assert(
                fc.property(dinnerTimeGenerator(), (time: string) => {
                    const [hours] = time.split(':').map(Number);
                    expect(hours).toBeGreaterThanOrEqual(16);
                    expect(hours).toBeLessThanOrEqual(20);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('snackTimeGenerator should generate times between 21:00-04:59', () => {
            fc.assert(
                fc.property(snackTimeGenerator(), (time: string) => {
                    const [hours] = time.split(':').map(Number);
                    const isLateNight = hours >= 21 && hours <= 23;
                    const isEarlyMorning = hours >= 0 && hours <= 4;
                    expect(isLateNight || isEarlyMorning).toBe(true);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });
});

describe('Portion Generators', () => {
    describe('validPortionGenerator', () => {
        it('should generate positive values', () => {
            fc.assert(
                fc.property(validPortionGenerator(), (portion: number) => {
                    expect(portion).toBeGreaterThan(0);
                    expect(Number.isFinite(portion)).toBe(true);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('invalidPortionGenerator', () => {
        it('should generate invalid values (negative, zero, NaN, or Infinity)', () => {
            fc.assert(
                fc.property(invalidPortionGenerator(), (portion: number) => {
                    const isInvalid = portion <= 0 || !Number.isFinite(portion);
                    expect(isInvalid).toBe(true);
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });
});
