package nutritioncalc

import (
	"math"
	"testing"
	"time"
)

func TestCalculateBMR_Male(t *testing.T) {
	profile := UserProfile{
		BirthDate: time.Now().AddDate(-30, 0, 0),
		Sex:       SexMale,
		HeightCm:  180,
		WeightKg:  80,
	}
	bmr := CalculateBMR(profile)
	// BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780
	if bmr < 1779 || bmr > 1781 {
		t.Errorf("expected BMR ~1780, got %f", bmr)
	}
}

func TestCalculateBMR_Female(t *testing.T) {
	profile := UserProfile{
		BirthDate: time.Now().AddDate(-25, 0, 0),
		Sex:       SexFemale,
		HeightCm:  165,
		WeightKg:  60,
	}
	bmr := CalculateBMR(profile)
	// BMR = 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
	if bmr < 1344 || bmr > 1347 {
		t.Errorf("expected BMR ~1345.25, got %f", bmr)
	}
}

func TestCalculateTDEE(t *testing.T) {
	bmr := 1780.0
	tdee := CalculateTDEE(bmr, ActivityModerate)
	expected := 2759.0
	if tdee < expected-1 || tdee > expected+1 {
		t.Errorf("expected TDEE ~%f, got %f", expected, tdee)
	}
}

func TestCalculateWorkoutBonus(t *testing.T) {
	bonus := CalculateWorkoutBonus(&WorkoutInfo{Type: "Силовая", DurationMin: 60})
	if bonus != 300 {
		t.Errorf("expected 300, got %f", bonus)
	}

	bonus = CalculateWorkoutBonus(&WorkoutInfo{Type: "Кардио", DurationMin: 90})
	if bonus != 600 {
		t.Errorf("expected 600, got %f", bonus)
	}

	bonus = CalculateWorkoutBonus(nil)
	if bonus != 0 {
		t.Errorf("expected 0, got %f", bonus)
	}

	bonus = CalculateWorkoutBonus(&WorkoutInfo{Type: "unknown", DurationMin: 60})
	if bonus != 0 {
		t.Errorf("expected 0 for unknown type, got %f", bonus)
	}
}

func TestCalculateTargets(t *testing.T) {
	profile := UserProfile{
		BirthDate:     time.Now().AddDate(-30, 0, 0),
		Sex:           SexMale,
		HeightCm:      180,
		WeightKg:      80,
		ActivityLevel: ActivityModerate,
		Goal:          GoalLoss,
	}
	workout := &WorkoutInfo{Type: "Силовая", DurationMin: 60}

	targets := CalculateTargets(profile, workout)

	if targets.Calories < 2550 || targets.Calories > 2650 {
		t.Errorf("expected calories ~2600, got %f", targets.Calories)
	}
	if targets.Protein < 140 || targets.Protein > 148 {
		t.Errorf("expected protein ~144, got %f", targets.Protein)
	}
	if targets.WorkoutBonus != 300 {
		t.Errorf("expected workout bonus 300, got %f", targets.WorkoutBonus)
	}
	if targets.Source != "calculated" {
		t.Errorf("expected source 'calculated', got %s", targets.Source)
	}
}

func TestCalculateWorkoutBonus_MultipleTypes(t *testing.T) {
	// Average of Силовая (300) + Кардио (400) = 350 kcal/h × 60 min = 350
	bonus := CalculateWorkoutBonus(&WorkoutInfo{
		Types:       []string{"Силовая", "Кардио"},
		DurationMin: 60,
	})
	if bonus != 350 {
		t.Errorf("expected 350 for two types averaged, got %f", bonus)
	}
}

func TestCalculateWorkoutBonus_TypesFallbackToType(t *testing.T) {
	// When Types is empty, falls back to single Type field
	bonus := CalculateWorkoutBonus(&WorkoutInfo{Type: "Силовая", DurationMin: 60})
	if bonus != 300 {
		t.Errorf("expected 300 fallback to Type field, got %f", bonus)
	}
}

func TestCalculateTargets_CaloriesMatchMacroSum(t *testing.T) {
	profile := UserProfile{
		BirthDate:     time.Now().AddDate(-30, 0, 0),
		Sex:           SexMale,
		HeightCm:      180,
		WeightKg:      80,
		ActivityLevel: ActivityModerate,
		Goal:          GoalLoss,
	}
	workout := &WorkoutInfo{Type: "Силовая", DurationMin: 60}

	targets := CalculateTargets(profile, workout)

	// Calories must equal protein*4 + fat*9 + carbs*4 using the returned rounded values
	expectedCalories := math.Round((targets.Protein*4+targets.Fat*9+targets.Carbs*4)*10) / 10
	if targets.Calories != expectedCalories {
		t.Errorf("Calories %f != macro sum %f (P=%f F=%f C=%f)",
			targets.Calories, expectedCalories, targets.Protein, targets.Fat, targets.Carbs)
	}
}

func TestCalculateWorkoutBonus_PerTypeDurations(t *testing.T) {
	bonus := CalculateWorkoutBonus(&WorkoutInfo{
		Types: []string{"Силовая", "Кардио"},
		TypeDurations: map[string]int{
			"Силовая": 45,
			"Кардио":  30,
		},
	})
	// Силовая: 300 kcal/h × 45/60 = 225
	// Кардио:  400 kcal/h × 30/60 = 200
	// Total: 425
	if bonus != 425 {
		t.Errorf("expected 425, got %f", bonus)
	}
}

func TestCalculateTargets_NoWorkout_Maintain(t *testing.T) {
	profile := UserProfile{
		BirthDate:     time.Now().AddDate(-25, 0, 0),
		Sex:           SexFemale,
		HeightCm:      165,
		WeightKg:      60,
		ActivityLevel: ActivityLight,
		Goal:          GoalMaintain,
	}

	targets := CalculateTargets(profile, nil)

	if targets.WorkoutBonus != 0 {
		t.Errorf("expected 0 workout bonus, got %f", targets.WorkoutBonus)
	}
	if targets.Calories < 1800 || targets.Calories > 1900 {
		t.Errorf("expected calories ~1850, got %f", targets.Calories)
	}
}
