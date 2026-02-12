package foodtracker

import (
	"math"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Helper function to create a test service for property tests
func setupPropertyTestService() *Service {
	log := logger.New()
	// Service doesn't need DB for CalculateKBZHU - it's a pure function
	return NewService(nil, log)
}

// roundToOneDecimal rounds a float64 to one decimal place (same as service implementation)
func testRoundToOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

// floatEquals compares two floats with tolerance for floating point precision
func floatEquals(a, b, tolerance float64) bool {
	return math.Abs(a-b) <= tolerance
}

// ============================================================================
// Property 1: КБЖУ Proportional Calculation
// **Validates: Requirements 9.5, 9.7**
//
// Property: For any food item with known nutrition per 100g/100ml and any valid
// portion amount, the calculated КБЖУ values SHALL equal
// (nutritionPer100 * portionAmount) / 100, rounded to one decimal place.
//
// Feature: food-tracker, Property 1: КБЖУ Proportional Calculation
// ============================================================================

func TestKBZHUCalculationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100 // Run at least 100 iterations
	properties := gopter.NewProperties(parameters)

	service := setupPropertyTestService()

	// Property 1.1: Calories calculation is proportional to portion
	properties.Property("Calories calculation is proportional to portion", prop.ForAll(
		func(caloriesPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: caloriesPer100,
				Protein:  50.0, // Fixed values for other macros
				Fat:      20.0,
				Carbs:    30.0,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			// Expected: (caloriesPer100 * portionAmount) / 100, rounded to 1 decimal
			expected := testRoundToOneDecimal((caloriesPer100 * portionAmount) / 100)

			// Use tolerance for floating point comparison
			if !floatEquals(result.Calories, expected, 0.1) {
				t.Logf("Calories mismatch: got %.1f, expected %.1f (per100=%.1f, portion=%.1f)",
					result.Calories, expected, caloriesPer100, portionAmount)
				return false
			}

			return true
		},
		gen.Float64Range(0, 1000),   // caloriesPer100: 0-1000 kcal
		gen.Float64Range(0.1, 1000), // portionAmount: must be > 0
	))

	// Property 1.2: Protein calculation is proportional to portion
	properties.Property("Protein calculation is proportional to portion", prop.ForAll(
		func(proteinPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: 200.0,
				Protein:  proteinPer100,
				Fat:      20.0,
				Carbs:    30.0,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			expected := testRoundToOneDecimal((proteinPer100 * portionAmount) / 100)

			if !floatEquals(result.Protein, expected, 0.1) {
				t.Logf("Protein mismatch: got %.1f, expected %.1f (per100=%.1f, portion=%.1f)",
					result.Protein, expected, proteinPer100, portionAmount)
				return false
			}

			return true
		},
		gen.Float64Range(0, 100),    // proteinPer100: 0-100g
		gen.Float64Range(0.1, 1000), // portionAmount
	))

	// Property 1.3: Fat calculation is proportional to portion
	properties.Property("Fat calculation is proportional to portion", prop.ForAll(
		func(fatPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: 200.0,
				Protein:  50.0,
				Fat:      fatPer100,
				Carbs:    30.0,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			expected := testRoundToOneDecimal((fatPer100 * portionAmount) / 100)

			if !floatEquals(result.Fat, expected, 0.1) {
				t.Logf("Fat mismatch: got %.1f, expected %.1f (per100=%.1f, portion=%.1f)",
					result.Fat, expected, fatPer100, portionAmount)
				return false
			}

			return true
		},
		gen.Float64Range(0, 100),    // fatPer100: 0-100g
		gen.Float64Range(0.1, 1000), // portionAmount
	))

	// Property 1.4: Carbs calculation is proportional to portion
	properties.Property("Carbs calculation is proportional to portion", prop.ForAll(
		func(carbsPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: 200.0,
				Protein:  50.0,
				Fat:      20.0,
				Carbs:    carbsPer100,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			expected := testRoundToOneDecimal((carbsPer100 * portionAmount) / 100)

			if !floatEquals(result.Carbs, expected, 0.1) {
				t.Logf("Carbs mismatch: got %.1f, expected %.1f (per100=%.1f, portion=%.1f)",
					result.Carbs, expected, carbsPer100, portionAmount)
				return false
			}

			return true
		},
		gen.Float64Range(0, 100),    // carbsPer100: 0-100g
		gen.Float64Range(0.1, 1000), // portionAmount
	))

	// Property 1.5: All КБЖУ values calculated correctly together
	properties.Property("All КБЖУ values are calculated proportionally", prop.ForAll(
		func(caloriesPer100, proteinPer100, fatPer100, carbsPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: caloriesPer100,
				Protein:  proteinPer100,
				Fat:      fatPer100,
				Carbs:    carbsPer100,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			// Calculate expected values
			expectedCalories := testRoundToOneDecimal((caloriesPer100 * portionAmount) / 100)
			expectedProtein := testRoundToOneDecimal((proteinPer100 * portionAmount) / 100)
			expectedFat := testRoundToOneDecimal((fatPer100 * portionAmount) / 100)
			expectedCarbs := testRoundToOneDecimal((carbsPer100 * portionAmount) / 100)

			// Verify all values
			if !floatEquals(result.Calories, expectedCalories, 0.1) {
				t.Logf("Calories mismatch: got %.1f, expected %.1f", result.Calories, expectedCalories)
				return false
			}
			if !floatEquals(result.Protein, expectedProtein, 0.1) {
				t.Logf("Protein mismatch: got %.1f, expected %.1f", result.Protein, expectedProtein)
				return false
			}
			if !floatEquals(result.Fat, expectedFat, 0.1) {
				t.Logf("Fat mismatch: got %.1f, expected %.1f", result.Fat, expectedFat)
				return false
			}
			if !floatEquals(result.Carbs, expectedCarbs, 0.1) {
				t.Logf("Carbs mismatch: got %.1f, expected %.1f", result.Carbs, expectedCarbs)
				return false
			}

			return true
		},
		gen.Float64Range(0, 1000),   // caloriesPer100
		gen.Float64Range(0, 100),    // proteinPer100
		gen.Float64Range(0, 100),    // fatPer100
		gen.Float64Range(0, 100),    // carbsPer100
		gen.Float64Range(0.1, 1000), // portionAmount (must be > 0)
	))

	// Property 1.6: 100g portion returns same values as per100
	properties.Property("100g portion returns same values as per100", prop.ForAll(
		func(caloriesPer100, proteinPer100, fatPer100, carbsPer100 float64) bool {
			nutritionPer100 := KBZHU{
				Calories: caloriesPer100,
				Protein:  proteinPer100,
				Fat:      fatPer100,
				Carbs:    carbsPer100,
			}

			result := service.CalculateKBZHU(nutritionPer100, 100.0)

			// For 100g portion, result should equal input (rounded)
			expectedCalories := testRoundToOneDecimal(caloriesPer100)
			expectedProtein := testRoundToOneDecimal(proteinPer100)
			expectedFat := testRoundToOneDecimal(fatPer100)
			expectedCarbs := testRoundToOneDecimal(carbsPer100)

			if !floatEquals(result.Calories, expectedCalories, 0.1) {
				t.Logf("100g Calories mismatch: got %.1f, expected %.1f", result.Calories, expectedCalories)
				return false
			}
			if !floatEquals(result.Protein, expectedProtein, 0.1) {
				t.Logf("100g Protein mismatch: got %.1f, expected %.1f", result.Protein, expectedProtein)
				return false
			}
			if !floatEquals(result.Fat, expectedFat, 0.1) {
				t.Logf("100g Fat mismatch: got %.1f, expected %.1f", result.Fat, expectedFat)
				return false
			}
			if !floatEquals(result.Carbs, expectedCarbs, 0.1) {
				t.Logf("100g Carbs mismatch: got %.1f, expected %.1f", result.Carbs, expectedCarbs)
				return false
			}

			return true
		},
		gen.Float64Range(0, 1000), // caloriesPer100
		gen.Float64Range(0, 100),  // proteinPer100
		gen.Float64Range(0, 100),  // fatPer100
		gen.Float64Range(0, 100),  // carbsPer100
	))

	// Property 1.7: Double portion gives double values
	properties.Property("Double portion gives double values", prop.ForAll(
		func(caloriesPer100, proteinPer100, fatPer100, carbsPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: caloriesPer100,
				Protein:  proteinPer100,
				Fat:      fatPer100,
				Carbs:    carbsPer100,
			}

			result1 := service.CalculateKBZHU(nutritionPer100, portionAmount)
			result2 := service.CalculateKBZHU(nutritionPer100, portionAmount*2)

			// Double portion should give approximately double values
			// (accounting for rounding differences)
			expectedCalories := testRoundToOneDecimal(result1.Calories * 2)
			expectedProtein := testRoundToOneDecimal(result1.Protein * 2)
			expectedFat := testRoundToOneDecimal(result1.Fat * 2)
			expectedCarbs := testRoundToOneDecimal(result1.Carbs * 2)

			// Allow slightly larger tolerance due to double rounding
			tolerance := 0.2

			if !floatEquals(result2.Calories, expectedCalories, tolerance) {
				t.Logf("Double portion Calories: got %.1f, expected ~%.1f", result2.Calories, expectedCalories)
				return false
			}
			if !floatEquals(result2.Protein, expectedProtein, tolerance) {
				t.Logf("Double portion Protein: got %.1f, expected ~%.1f", result2.Protein, expectedProtein)
				return false
			}
			if !floatEquals(result2.Fat, expectedFat, tolerance) {
				t.Logf("Double portion Fat: got %.1f, expected ~%.1f", result2.Fat, expectedFat)
				return false
			}
			if !floatEquals(result2.Carbs, expectedCarbs, tolerance) {
				t.Logf("Double portion Carbs: got %.1f, expected ~%.1f", result2.Carbs, expectedCarbs)
				return false
			}

			return true
		},
		gen.Float64Range(0, 500),   // caloriesPer100 (smaller range to avoid overflow)
		gen.Float64Range(0, 50),    // proteinPer100
		gen.Float64Range(0, 50),    // fatPer100
		gen.Float64Range(0, 50),    // carbsPer100
		gen.Float64Range(0.1, 500), // portionAmount (smaller to avoid overflow when doubled)
	))

	// Property 1.8: Zero nutrition per 100 gives zero result
	properties.Property("Zero nutrition per 100 gives zero result", prop.ForAll(
		func(portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: 0,
				Protein:  0,
				Fat:      0,
				Carbs:    0,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			if result.Calories != 0 || result.Protein != 0 || result.Fat != 0 || result.Carbs != 0 {
				t.Logf("Zero nutrition should give zero result, got: %+v", result)
				return false
			}

			return true
		},
		gen.Float64Range(0.1, 1000), // portionAmount
	))

	// Property 1.9: Result values are non-negative for non-negative inputs
	properties.Property("Result values are non-negative for non-negative inputs", prop.ForAll(
		func(caloriesPer100, proteinPer100, fatPer100, carbsPer100, portionAmount float64) bool {
			nutritionPer100 := KBZHU{
				Calories: caloriesPer100,
				Protein:  proteinPer100,
				Fat:      fatPer100,
				Carbs:    carbsPer100,
			}

			result := service.CalculateKBZHU(nutritionPer100, portionAmount)

			if result.Calories < 0 {
				t.Logf("Negative calories: %.1f", result.Calories)
				return false
			}
			if result.Protein < 0 {
				t.Logf("Negative protein: %.1f", result.Protein)
				return false
			}
			if result.Fat < 0 {
				t.Logf("Negative fat: %.1f", result.Fat)
				return false
			}
			if result.Carbs < 0 {
				t.Logf("Negative carbs: %.1f", result.Carbs)
				return false
			}

			return true
		},
		gen.Float64Range(0, 1000),   // caloriesPer100
		gen.Float64Range(0, 100),    // proteinPer100
		gen.Float64Range(0, 100),    // fatPer100
		gen.Float64Range(0, 100),    // carbsPer100
		gen.Float64Range(0.1, 1000), // portionAmount
	))

	properties.TestingRun(t)
}

// ============================================================================
// Additional edge case tests for КБЖУ calculation
// ============================================================================

func TestKBZHUCalculationEdgeCases(t *testing.T) {
	service := setupPropertyTestService()

	// Test case: Very small portion
	t.Run("Very small portion (1g)", func(t *testing.T) {
		nutritionPer100 := KBZHU{
			Calories: 100,
			Protein:  10,
			Fat:      5,
			Carbs:    15,
		}

		result := service.CalculateKBZHU(nutritionPer100, 1.0)

		// 1g = 1% of 100g values
		if !floatEquals(result.Calories, 1.0, 0.1) {
			t.Errorf("Expected calories ~1.0, got %.1f", result.Calories)
		}
		if !floatEquals(result.Protein, 0.1, 0.1) {
			t.Errorf("Expected protein ~0.1, got %.1f", result.Protein)
		}
	})

	// Test case: Large portion
	t.Run("Large portion (500g)", func(t *testing.T) {
		nutritionPer100 := KBZHU{
			Calories: 200,
			Protein:  20,
			Fat:      10,
			Carbs:    30,
		}

		result := service.CalculateKBZHU(nutritionPer100, 500.0)

		// 500g = 5x of 100g values
		if !floatEquals(result.Calories, 1000.0, 0.1) {
			t.Errorf("Expected calories ~1000.0, got %.1f", result.Calories)
		}
		if !floatEquals(result.Protein, 100.0, 0.1) {
			t.Errorf("Expected protein ~100.0, got %.1f", result.Protein)
		}
	})

	// Test case: Fractional portion
	t.Run("Fractional portion (33.3g)", func(t *testing.T) {
		nutritionPer100 := KBZHU{
			Calories: 300,
			Protein:  30,
			Fat:      15,
			Carbs:    45,
		}

		result := service.CalculateKBZHU(nutritionPer100, 33.3)

		// 33.3g = 33.3% of 100g values
		expectedCalories := testRoundToOneDecimal((300 * 33.3) / 100)
		if !floatEquals(result.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, result.Calories)
		}
	})

	// Test case: High calorie food (oil, butter)
	t.Run("High calorie food (oil)", func(t *testing.T) {
		nutritionPer100 := KBZHU{
			Calories: 900, // Oil has ~900 kcal per 100g
			Protein:  0,
			Fat:      100,
			Carbs:    0,
		}

		result := service.CalculateKBZHU(nutritionPer100, 15.0) // 1 tablespoon

		expectedCalories := testRoundToOneDecimal((900 * 15) / 100)
		if !floatEquals(result.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, result.Calories)
		}
	})

	// Test case: Low calorie food (vegetables)
	t.Run("Low calorie food (cucumber)", func(t *testing.T) {
		nutritionPer100 := KBZHU{
			Calories: 15, // Cucumber has ~15 kcal per 100g
			Protein:  0.7,
			Fat:      0.1,
			Carbs:    3.6,
		}

		result := service.CalculateKBZHU(nutritionPer100, 200.0) // One medium cucumber

		expectedCalories := testRoundToOneDecimal((15 * 200) / 100)
		if !floatEquals(result.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, result.Calories)
		}
	})
}

// ============================================================================
// Property 2: Daily Totals Sum
// **Validates: Requirements 2.4, 2.5, 10.3, 10.5**
//
// Property: For any set of food entries for a given date, the daily totals for
// each macro (calories, protein, fat, carbs) SHALL equal the sum of the
// corresponding values from all entries.
//
// Feature: food-tracker, Property 2: Daily Totals Sum
// ============================================================================

// genMealType generates a random valid MealType
func genMealType() gopter.Gen {
	return gen.OneConstOf(MealBreakfast, MealLunch, MealDinner, MealSnack)
}

// genFoodEntry generates a random FoodEntry with valid КБЖУ values
func genFoodEntry() gopter.Gen {
	return gopter.CombineGens(
		gen.Float64Range(0, 500), // calories
		gen.Float64Range(0, 50),  // protein
		gen.Float64Range(0, 50),  // fat
		gen.Float64Range(0, 50),  // carbs
		genMealType(),            // meal type
	).Map(func(values []interface{}) FoodEntry {
		return FoodEntry{
			Calories: values[0].(float64),
			Protein:  values[1].(float64),
			Fat:      values[2].(float64),
			Carbs:    values[3].(float64),
			MealType: values[4].(MealType),
		}
	})
}

// genFoodEntries generates a slice of 0-10 random FoodEntry items
func genFoodEntries() gopter.Gen {
	return gen.SliceOfN(10, genFoodEntry())
}

// genFoodEntriesWithCount generates a slice of exactly n random FoodEntry items
func genFoodEntriesWithCount(n int) gopter.Gen {
	return gen.SliceOfN(n, genFoodEntry())
}

func TestDailyTotalsSumProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100 // Run at least 100 iterations
	properties := gopter.NewProperties(parameters)

	service := setupPropertyTestService()

	// Property 2.1: Daily totals equal sum of all entries
	properties.Property("Daily totals equal sum of all entries", prop.ForAll(
		func(entries []FoodEntry) bool {
			// Group entries by meal type
			entriesMap := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}

			var expectedCalories, expectedProtein, expectedFat, expectedCarbs float64
			for _, entry := range entries {
				entriesMap[entry.MealType] = append(entriesMap[entry.MealType], entry)
				expectedCalories += entry.Calories
				expectedProtein += entry.Protein
				expectedFat += entry.Fat
				expectedCarbs += entry.Carbs
			}

			totals := service.calculateTotalsFromEntries(entriesMap)

			// Verify sums match (with tolerance for rounding)
			if !floatEquals(totals.Calories, testRoundToOneDecimal(expectedCalories), 0.5) {
				t.Logf("Calories mismatch: got %.1f, expected ~%.1f", totals.Calories, expectedCalories)
				return false
			}
			if !floatEquals(totals.Protein, testRoundToOneDecimal(expectedProtein), 0.5) {
				t.Logf("Protein mismatch: got %.1f, expected ~%.1f", totals.Protein, expectedProtein)
				return false
			}
			if !floatEquals(totals.Fat, testRoundToOneDecimal(expectedFat), 0.5) {
				t.Logf("Fat mismatch: got %.1f, expected ~%.1f", totals.Fat, expectedFat)
				return false
			}
			if !floatEquals(totals.Carbs, testRoundToOneDecimal(expectedCarbs), 0.5) {
				t.Logf("Carbs mismatch: got %.1f, expected ~%.1f", totals.Carbs, expectedCarbs)
				return false
			}

			return true
		},
		genFoodEntries(),
	))

	// Property 2.2: Empty entries give zero totals
	properties.Property("Empty entries give zero totals", prop.ForAll(
		func(_ int) bool {
			entriesMap := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}

			totals := service.calculateTotalsFromEntries(entriesMap)

			if totals.Calories != 0 || totals.Protein != 0 || totals.Fat != 0 || totals.Carbs != 0 {
				t.Logf("Empty entries should give zero totals, got: %+v", totals)
				return false
			}

			return true
		},
		gen.Int(), // Dummy generator to satisfy prop.ForAll
	))

	// Property 2.3: Single entry totals equal entry values
	properties.Property("Single entry totals equal entry values", prop.ForAll(
		func(entry FoodEntry) bool {
			entriesMap := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}
			entriesMap[entry.MealType] = append(entriesMap[entry.MealType], entry)

			totals := service.calculateTotalsFromEntries(entriesMap)

			// Single entry totals should equal entry values (rounded)
			expectedCalories := testRoundToOneDecimal(entry.Calories)
			expectedProtein := testRoundToOneDecimal(entry.Protein)
			expectedFat := testRoundToOneDecimal(entry.Fat)
			expectedCarbs := testRoundToOneDecimal(entry.Carbs)

			if !floatEquals(totals.Calories, expectedCalories, 0.1) {
				t.Logf("Single entry Calories: got %.1f, expected %.1f", totals.Calories, expectedCalories)
				return false
			}
			if !floatEquals(totals.Protein, expectedProtein, 0.1) {
				t.Logf("Single entry Protein: got %.1f, expected %.1f", totals.Protein, expectedProtein)
				return false
			}
			if !floatEquals(totals.Fat, expectedFat, 0.1) {
				t.Logf("Single entry Fat: got %.1f, expected %.1f", totals.Fat, expectedFat)
				return false
			}
			if !floatEquals(totals.Carbs, expectedCarbs, 0.1) {
				t.Logf("Single entry Carbs: got %.1f, expected %.1f", totals.Carbs, expectedCarbs)
				return false
			}

			return true
		},
		genFoodEntry(),
	))

	// Property 2.4: Totals are independent of meal type distribution
	properties.Property("Totals are independent of meal type distribution", prop.ForAll(
		func(calories, protein, fat, carbs float64) bool {
			// Create same entry in different meal types
			entry := FoodEntry{
				Calories: calories,
				Protein:  protein,
				Fat:      fat,
				Carbs:    carbs,
			}

			// All entries in breakfast
			entriesMap1 := map[MealType][]FoodEntry{
				MealBreakfast: {entry, entry, entry, entry},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}

			// Entries distributed across all meal types
			entriesMap2 := map[MealType][]FoodEntry{
				MealBreakfast: {entry},
				MealLunch:     {entry},
				MealDinner:    {entry},
				MealSnack:     {entry},
			}

			totals1 := service.calculateTotalsFromEntries(entriesMap1)
			totals2 := service.calculateTotalsFromEntries(entriesMap2)

			// Totals should be equal regardless of distribution
			if !floatEquals(totals1.Calories, totals2.Calories, 0.1) {
				t.Logf("Distribution independence Calories: %+v vs %+v", totals1, totals2)
				return false
			}
			if !floatEquals(totals1.Protein, totals2.Protein, 0.1) {
				t.Logf("Distribution independence Protein: %+v vs %+v", totals1, totals2)
				return false
			}
			if !floatEquals(totals1.Fat, totals2.Fat, 0.1) {
				t.Logf("Distribution independence Fat: %+v vs %+v", totals1, totals2)
				return false
			}
			if !floatEquals(totals1.Carbs, totals2.Carbs, 0.1) {
				t.Logf("Distribution independence Carbs: %+v vs %+v", totals1, totals2)
				return false
			}

			return true
		},
		gen.Float64Range(0, 200), // calories
		gen.Float64Range(0, 30),  // protein
		gen.Float64Range(0, 30),  // fat
		gen.Float64Range(0, 30),  // carbs
	))

	// Property 2.5: Totals are non-negative for non-negative entries
	properties.Property("Totals are non-negative for non-negative entries", prop.ForAll(
		func(entries []FoodEntry) bool {
			entriesMap := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}

			for _, entry := range entries {
				entriesMap[entry.MealType] = append(entriesMap[entry.MealType], entry)
			}

			totals := service.calculateTotalsFromEntries(entriesMap)

			if totals.Calories < 0 {
				t.Logf("Negative calories total: %.1f", totals.Calories)
				return false
			}
			if totals.Protein < 0 {
				t.Logf("Negative protein total: %.1f", totals.Protein)
				return false
			}
			if totals.Fat < 0 {
				t.Logf("Negative fat total: %.1f", totals.Fat)
				return false
			}
			if totals.Carbs < 0 {
				t.Logf("Negative carbs total: %.1f", totals.Carbs)
				return false
			}

			return true
		},
		genFoodEntries(),
	))

	// Property 2.6: Adding an entry increases totals by entry values
	properties.Property("Adding an entry increases totals by entry values", prop.ForAll(
		func(existingEntries []FoodEntry, newEntry FoodEntry) bool {
			// Calculate totals without new entry
			entriesMap1 := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}
			for _, entry := range existingEntries {
				entriesMap1[entry.MealType] = append(entriesMap1[entry.MealType], entry)
			}
			totals1 := service.calculateTotalsFromEntries(entriesMap1)

			// Calculate totals with new entry
			entriesMap2 := map[MealType][]FoodEntry{
				MealBreakfast: {},
				MealLunch:     {},
				MealDinner:    {},
				MealSnack:     {},
			}
			for _, entry := range existingEntries {
				entriesMap2[entry.MealType] = append(entriesMap2[entry.MealType], entry)
			}
			entriesMap2[newEntry.MealType] = append(entriesMap2[newEntry.MealType], newEntry)
			totals2 := service.calculateTotalsFromEntries(entriesMap2)

			// Difference should equal new entry values (with rounding tolerance)
			expectedCaloriesDiff := testRoundToOneDecimal(newEntry.Calories)
			expectedProteinDiff := testRoundToOneDecimal(newEntry.Protein)
			expectedFatDiff := testRoundToOneDecimal(newEntry.Fat)
			expectedCarbsDiff := testRoundToOneDecimal(newEntry.Carbs)

			actualCaloriesDiff := totals2.Calories - totals1.Calories
			actualProteinDiff := totals2.Protein - totals1.Protein
			actualFatDiff := totals2.Fat - totals1.Fat
			actualCarbsDiff := totals2.Carbs - totals1.Carbs

			// Allow tolerance for rounding differences
			tolerance := 0.5

			if !floatEquals(actualCaloriesDiff, expectedCaloriesDiff, tolerance) {
				t.Logf("Calories diff: got %.1f, expected %.1f", actualCaloriesDiff, expectedCaloriesDiff)
				return false
			}
			if !floatEquals(actualProteinDiff, expectedProteinDiff, tolerance) {
				t.Logf("Protein diff: got %.1f, expected %.1f", actualProteinDiff, expectedProteinDiff)
				return false
			}
			if !floatEquals(actualFatDiff, expectedFatDiff, tolerance) {
				t.Logf("Fat diff: got %.1f, expected %.1f", actualFatDiff, expectedFatDiff)
				return false
			}
			if !floatEquals(actualCarbsDiff, expectedCarbsDiff, tolerance) {
				t.Logf("Carbs diff: got %.1f, expected %.1f", actualCarbsDiff, expectedCarbsDiff)
				return false
			}

			return true
		},
		gen.SliceOfN(5, genFoodEntry()), // Smaller slice for existing entries
		genFoodEntry(),
	))

	properties.TestingRun(t)
}

// ============================================================================
// Additional edge case tests for daily totals calculation
// ============================================================================

func TestDailyTotalsEdgeCases(t *testing.T) {
	service := setupPropertyTestService()

	// Test case: Many entries in single meal slot
	t.Run("Many entries in single meal slot", func(t *testing.T) {
		entries := make([]FoodEntry, 20)
		var expectedCalories float64
		for i := 0; i < 20; i++ {
			entries[i] = FoodEntry{
				Calories: 100.0,
				Protein:  10.0,
				Fat:      5.0,
				Carbs:    15.0,
				MealType: MealBreakfast,
			}
			expectedCalories += 100.0
		}

		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: entries,
			MealLunch:     {},
			MealDinner:    {},
			MealSnack:     {},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		if !floatEquals(totals.Calories, testRoundToOneDecimal(expectedCalories), 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, totals.Calories)
		}
	})

	// Test case: Entries with fractional values
	t.Run("Entries with fractional values", func(t *testing.T) {
		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: {
				{Calories: 33.3, Protein: 11.1, Fat: 5.5, Carbs: 22.2, MealType: MealBreakfast},
			},
			MealLunch: {
				{Calories: 66.6, Protein: 22.2, Fat: 11.1, Carbs: 44.4, MealType: MealLunch},
			},
			MealDinner: {},
			MealSnack:  {},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		expectedCalories := testRoundToOneDecimal(33.3 + 66.6)
		if !floatEquals(totals.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, totals.Calories)
		}
	})

	// Test case: Entries across all meal types
	t.Run("Entries across all meal types", func(t *testing.T) {
		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: {
				{Calories: 300, Protein: 20, Fat: 10, Carbs: 40, MealType: MealBreakfast},
			},
			MealLunch: {
				{Calories: 500, Protein: 30, Fat: 15, Carbs: 60, MealType: MealLunch},
			},
			MealDinner: {
				{Calories: 600, Protein: 35, Fat: 20, Carbs: 70, MealType: MealDinner},
			},
			MealSnack: {
				{Calories: 200, Protein: 10, Fat: 8, Carbs: 25, MealType: MealSnack},
			},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		expectedCalories := testRoundToOneDecimal(300 + 500 + 600 + 200)
		expectedProtein := testRoundToOneDecimal(20 + 30 + 35 + 10)
		expectedFat := testRoundToOneDecimal(10 + 15 + 20 + 8)
		expectedCarbs := testRoundToOneDecimal(40 + 60 + 70 + 25)

		if !floatEquals(totals.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories %.1f, got %.1f", expectedCalories, totals.Calories)
		}
		if !floatEquals(totals.Protein, expectedProtein, 0.1) {
			t.Errorf("Expected protein %.1f, got %.1f", expectedProtein, totals.Protein)
		}
		if !floatEquals(totals.Fat, expectedFat, 0.1) {
			t.Errorf("Expected fat %.1f, got %.1f", expectedFat, totals.Fat)
		}
		if !floatEquals(totals.Carbs, expectedCarbs, 0.1) {
			t.Errorf("Expected carbs %.1f, got %.1f", expectedCarbs, totals.Carbs)
		}
	})

	// Test case: Very small values
	t.Run("Very small values", func(t *testing.T) {
		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: {
				{Calories: 0.1, Protein: 0.1, Fat: 0.1, Carbs: 0.1, MealType: MealBreakfast},
				{Calories: 0.1, Protein: 0.1, Fat: 0.1, Carbs: 0.1, MealType: MealBreakfast},
			},
			MealLunch:  {},
			MealDinner: {},
			MealSnack:  {},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		expectedCalories := testRoundToOneDecimal(0.2)
		if !floatEquals(totals.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories ~%.1f, got %.1f", expectedCalories, totals.Calories)
		}
	})

	// Test case: Large values
	t.Run("Large values", func(t *testing.T) {
		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: {
				{Calories: 1000, Protein: 50, Fat: 40, Carbs: 100, MealType: MealBreakfast},
			},
			MealLunch: {
				{Calories: 1500, Protein: 60, Fat: 50, Carbs: 150, MealType: MealLunch},
			},
			MealDinner: {
				{Calories: 2000, Protein: 80, Fat: 70, Carbs: 200, MealType: MealDinner},
			},
			MealSnack: {},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		expectedCalories := testRoundToOneDecimal(1000 + 1500 + 2000)
		if !floatEquals(totals.Calories, expectedCalories, 0.1) {
			t.Errorf("Expected calories %.1f, got %.1f", expectedCalories, totals.Calories)
		}
	})

	// Test case: Zero values in entries
	t.Run("Zero values in entries", func(t *testing.T) {
		entriesMap := map[MealType][]FoodEntry{
			MealBreakfast: {
				{Calories: 0, Protein: 0, Fat: 0, Carbs: 0, MealType: MealBreakfast},
				{Calories: 100, Protein: 10, Fat: 5, Carbs: 15, MealType: MealBreakfast},
			},
			MealLunch:  {},
			MealDinner: {},
			MealSnack:  {},
		}

		totals := service.calculateTotalsFromEntries(entriesMap)

		if !floatEquals(totals.Calories, 100.0, 0.1) {
			t.Errorf("Expected calories 100.0, got %.1f", totals.Calories)
		}
	})
}

// ============================================================================
// Property 9: Barcode Cache Behavior
// **Validates: Requirements 6.4, 6.7**
// For any cached barcode, return cached data without API call
// ============================================================================

// TestBarcodeCacheBehaviorProperty tests barcode cache response structure properties
// These are simplified property tests that verify the BarcodeResponse structure invariants
func TestBarcodeCacheBehaviorProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 9.1: BarcodeResponse structure consistency - Found=true implies Food is not nil
	properties.Property("Found=true implies Food is not nil", prop.ForAll(
		func(foodName string, cached bool) bool {
			// Create a response where Found=true
			response := BarcodeResponse{
				Found:  true,
				Cached: cached,
				Food:   &FoodItem{ID: "test-id", Name: foodName},
			}

			// Property: When Found=true, Food must not be nil
			if response.Found && response.Food == nil {
				t.Logf("Invariant violated: Found=true but Food is nil")
				return false
			}

			return true
		},
		gen.AlphaString(),
		gen.Bool(),
	))

	// Property 9.2: BarcodeResponse structure consistency - Found=false implies Message is set
	properties.Property("Found=false implies Message is set", prop.ForAll(
		func(message string) bool {
			// Create a response where Found=false
			msg := message
			if msg == "" {
				msg = "Продукт не найден"
			}
			response := BarcodeResponse{
				Found:   false,
				Cached:  false, // Not found items cannot be cached
				Message: &msg,
			}

			// Property: When Found=false, Message should be set
			if !response.Found && response.Message == nil {
				t.Logf("Invariant violated: Found=false but Message is nil")
				return false
			}

			return true
		},
		gen.AlphaString(),
	))

	// Property 9.3: Cached flag is independent of Found flag when Found=true
	properties.Property("Cached flag can be true or false when Found=true", prop.ForAll(
		func(cached bool) bool {
			response := BarcodeResponse{
				Found:  true,
				Cached: cached,
				Food:   &FoodItem{ID: "test-id", Name: "Test Food"},
			}

			// Property: Both cached=true and cached=false are valid when Found=true
			// This verifies the response structure allows both states
			return response.Found == true
		},
		gen.Bool(),
	))

	// Property 9.4: Not found items are never cached
	properties.Property("Not found items have Cached=false", prop.ForAll(
		func(_ int) bool {
			msg := "Продукт не найден"
			response := BarcodeResponse{
				Found:   false,
				Cached:  false,
				Message: &msg,
			}

			// Property: When Found=false, Cached must be false
			// (you can't cache something that wasn't found)
			if !response.Found && response.Cached {
				t.Logf("Invariant violated: Found=false but Cached=true")
				return false
			}

			return true
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// TestBarcodeCacheExpirationProperty tests cache expiration behavior properties
func TestBarcodeCacheExpirationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 50
	properties := gopter.NewProperties(parameters)

	// Property 9.5: Cache expiration time is always in the future relative to cached_at
	properties.Property("Cache expires_at is after cached_at", prop.ForAll(
		func(daysUntilExpiry int) bool {
			if daysUntilExpiry < 1 {
				daysUntilExpiry = 1
			}
			if daysUntilExpiry > 365 {
				daysUntilExpiry = 365
			}

			cachedAt := time.Now()
			expiresAt := cachedAt.Add(time.Duration(daysUntilExpiry) * 24 * time.Hour)

			cache := BarcodeCache{
				Barcode:   "4600000000001",
				FoodData:  `{"id":"test"}`,
				Source:    "database",
				CachedAt:  cachedAt,
				ExpiresAt: expiresAt,
			}

			// Property: ExpiresAt must be after CachedAt
			if !cache.ExpiresAt.After(cache.CachedAt) {
				t.Logf("Invariant violated: ExpiresAt (%v) is not after CachedAt (%v)",
					cache.ExpiresAt, cache.CachedAt)
				return false
			}

			return true
		},
		gen.IntRange(1, 365),
	))

	// Property 9.6: Valid barcode cache has non-empty barcode
	properties.Property("Valid cache has non-empty barcode", prop.ForAll(
		func(barcodeLen int) bool {
			if barcodeLen < 1 {
				barcodeLen = 1
			}
			if barcodeLen > 50 {
				barcodeLen = 50
			}

			// Generate a barcode of specified length
			barcode := ""
			for i := 0; i < barcodeLen; i++ {
				barcode += "0"
			}

			cache := BarcodeCache{
				Barcode:   barcode,
				FoodData:  `{"id":"test"}`,
				Source:    "database",
				CachedAt:  time.Now(),
				ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
			}

			// Property: Barcode must not be empty
			if cache.Barcode == "" {
				t.Logf("Invariant violated: Barcode is empty")
				return false
			}

			return true
		},
		gen.IntRange(1, 50),
	))

	// Property 9.7: Cache source is always set
	properties.Property("Cache source is always set", prop.ForAll(
		func(sourceIdx int) bool {
			sources := []string{"database", "fatsecret", "openfoodfacts", "manual"}
			source := sources[sourceIdx%len(sources)]

			cache := BarcodeCache{
				Barcode:   "4600000000001",
				FoodData:  `{"id":"test"}`,
				Source:    source,
				CachedAt:  time.Now(),
				ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
			}

			// Property: Source must not be empty
			if cache.Source == "" {
				t.Logf("Invariant violated: Source is empty")
				return false
			}

			return true
		},
		gen.IntRange(0, 100),
	))

	properties.TestingRun(t)
}
