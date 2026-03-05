package nutritioncalc

import (
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
	bonus := CalculateWorkoutBonus(&WorkoutInfo{Type: "strength", DurationMin: 60})
	if bonus != 300 {
		t.Errorf("expected 300, got %f", bonus)
	}

	bonus = CalculateWorkoutBonus(&WorkoutInfo{Type: "cardio", DurationMin: 90})
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
	workout := &WorkoutInfo{Type: "strength", DurationMin: 60}

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
