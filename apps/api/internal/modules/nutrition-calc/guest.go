package nutritioncalc

import (
	"fmt"
	"math"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// GuestInput is what somebody who has no account can supply.
type GuestInput struct {
	Sex           string  `json:"sex" binding:"required"`
	BirthDate     string  `json:"birth_date" binding:"required"`
	HeightCm      float64 `json:"height_cm" binding:"required"`
	WeightKg      float64 `json:"weight_kg" binding:"required"`
	ActivityLevel string  `json:"activity_level" binding:"required"`
	Goal          string  `json:"goal" binding:"required"`
}

// GuestResult is the calculation, plus the water recommendation the wizard
// shows alongside it.
type GuestResult struct {
	CalculatedTargets
	WaterGlasses int `json:"water_glasses"`
}

// Ranges the wizard accepts. Values outside them are not a person's, and a
// calculation from them would look authoritative while meaning nothing.
const (
	minHeightCm = 100.0
	maxHeightCm = 250.0
	minWeightKg = 30.0
	maxWeightKg = 300.0
	minAge      = 14
	maxAge      = 100
)

// Water intake recommendation: 30 ml per kilogram, in glasses of 250 ml.
const (
	waterMlPerKg  = 30.0
	glassSizeMl   = 250.0
	maxWaterGlass = 20
)

// CalculateForGuest runs the same formula a signed-in user gets.
//
// One formula, one implementation: a separate guest calculation would drift
// from the real one, and the number a person joined for would change the moment
// they registered.
func CalculateForGuest(in GuestInput) (*GuestResult, error) {
	birthDate, err := time.Parse("2006-01-02", in.BirthDate)
	if err != nil {
		return nil, fmt.Errorf("birth_date must be YYYY-MM-DD: %w", apperrors.ErrValidation)
	}

	age := calculateAge(birthDate)
	if age < minAge || age > maxAge {
		return nil, fmt.Errorf("age must be between %d and %d: %w", minAge, maxAge, apperrors.ErrValidation)
	}
	if in.HeightCm < minHeightCm || in.HeightCm > maxHeightCm {
		return nil, fmt.Errorf("height must be between %.0f and %.0f cm: %w",
			minHeightCm, maxHeightCm, apperrors.ErrValidation)
	}
	if in.WeightKg < minWeightKg || in.WeightKg > maxWeightKg {
		return nil, fmt.Errorf("weight must be between %.0f and %.0f kg: %w",
			minWeightKg, maxWeightKg, apperrors.ErrValidation)
	}

	sex := BiologicalSex(in.Sex)
	if sex != SexMale && sex != SexFemale {
		return nil, fmt.Errorf("unknown sex %q: %w", in.Sex, apperrors.ErrValidation)
	}
	activity := ActivityLevel(in.ActivityLevel)
	if _, ok := PALCoefficients[activity]; !ok {
		return nil, fmt.Errorf("unknown activity level %q: %w", in.ActivityLevel, apperrors.ErrValidation)
	}
	goal := FitnessGoal(in.Goal)
	if _, ok := GoalModifiers[goal]; !ok {
		return nil, fmt.Errorf("unknown goal %q: %w", in.Goal, apperrors.ErrValidation)
	}

	targets := CalculateTargets(UserProfile{
		BirthDate:     birthDate,
		Sex:           sex,
		HeightCm:      in.HeightCm,
		WeightKg:      in.WeightKg,
		ActivityLevel: activity,
		Goal:          goal,
	}, nil)

	glasses := int(math.Round(in.WeightKg * waterMlPerKg / glassSizeMl))
	if glasses > maxWaterGlass {
		glasses = maxWaterGlass
	}

	return &GuestResult{CalculatedTargets: targets, WaterGlasses: glasses}, nil
}
