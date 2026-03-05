package nutritioncalc

import (
	"math"
	"time"
)

// CalculateBMR returns Basal Metabolic Rate using Mifflin-St Jeor formula.
func CalculateBMR(profile UserProfile) float64 {
	age := calculateAge(profile.BirthDate)
	base := 10*profile.WeightKg + 6.25*profile.HeightCm - 5*float64(age)
	if profile.Sex == SexMale {
		return base + 5
	}
	return base - 161
}

// CalculateTDEE returns Total Daily Energy Expenditure (BMR * PAL).
func CalculateTDEE(bmr float64, level ActivityLevel) float64 {
	coeff, ok := PALCoefficients[level]
	if !ok {
		coeff = PALCoefficients[ActivityModerate]
	}
	return bmr * coeff
}

// CalculateWorkoutBonus returns extra kcal burned from a workout.
func CalculateWorkoutBonus(workout *WorkoutInfo) float64 {
	if workout == nil || workout.DurationMin <= 0 {
		return 0
	}
	kcalPerHour, ok := WorkoutCaloriesPerHour[workout.Type]
	if !ok {
		return 0
	}
	return kcalPerHour * float64(workout.DurationMin) / 60.0
}

// CalculateTargets computes full KBJU targets for a user profile and optional workout.
func CalculateTargets(profile UserProfile, workout *WorkoutInfo) CalculatedTargets {
	bmr := CalculateBMR(profile)
	tdee := CalculateTDEE(bmr, profile.ActivityLevel)
	workoutBonus := CalculateWorkoutBonus(workout)

	totalEnergy := tdee + workoutBonus

	modifier := GoalModifiers[profile.Goal]
	targetCalories := totalEnergy * (1 + modifier)

	proteinG := ProteinPerKg[profile.Goal] * profile.WeightKg
	proteinKcal := proteinG * 4

	fatKcal := targetCalories * FatCaloriePercent
	fatG := fatKcal / 9

	carbsKcal := targetCalories - proteinKcal - fatKcal
	if carbsKcal < 0 {
		carbsKcal = 0
	}
	carbsG := carbsKcal / 4

	return CalculatedTargets{
		Calories:     math.Round(targetCalories*10) / 10,
		Protein:      math.Round(proteinG*10) / 10,
		Fat:          math.Round(fatG*10) / 10,
		Carbs:        math.Round(carbsG*10) / 10,
		BMR:          math.Round(bmr*10) / 10,
		TDEE:         math.Round(tdee*10) / 10,
		WorkoutBonus: math.Round(workoutBonus*10) / 10,
		WeightUsed:   profile.WeightKg,
		Source:       "calculated",
	}
}

func calculateAge(birthDate time.Time) int {
	now := time.Now()
	age := now.Year() - birthDate.Year()
	bMonth, bDay := birthDate.Month(), birthDate.Day()
	nMonth, nDay := now.Month(), now.Day()
	if nMonth < bMonth || (nMonth == bMonth && nDay < bDay) {
		age--
	}
	return age
}
