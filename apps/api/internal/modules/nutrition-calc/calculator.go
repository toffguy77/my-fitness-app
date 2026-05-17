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
// When workout.Types is non-empty, it averages kcal/hour across all known types.
// Falls back to workout.Type for single-type entries.
func CalculateWorkoutBonus(workout *WorkoutInfo) float64 {
	if workout == nil || workout.DurationMin <= 0 {
		return 0
	}
	types := workout.Types
	if len(types) == 0 && workout.Type != "" {
		types = []string{workout.Type}
	}
	var total float64
	count := 0
	for _, t := range types {
		if kcal, ok := WorkoutCaloriesPerHour[t]; ok {
			total += kcal
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return (total / float64(count)) * float64(workout.DurationMin) / 60.0
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

	roundedProtein := math.Round(proteinG*10) / 10
	roundedFat := math.Round(fatG*10) / 10
	roundedCarbs := math.Round(carbsG*10) / 10

	return CalculatedTargets{
		Calories:     math.Round((roundedProtein*4+roundedFat*9+roundedCarbs*4)*10) / 10,
		Protein:      roundedProtein,
		Fat:          roundedFat,
		Carbs:        roundedCarbs,
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
