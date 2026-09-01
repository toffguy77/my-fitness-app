package nutritioncalc

import (
	"fmt"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func guestInput() GuestInput {
	return GuestInput{
		Sex:           "female",
		BirthDate:     time.Now().AddDate(-30, 0, 0).Format("2006-01-02"),
		HeightCm:      170,
		WeightKg:      65,
		ActivityLevel: "moderate",
		Goal:          "loss",
	}
}

// One formula, one implementation. A separate guest calculation would drift,
// and the number somebody joined for would change the moment they registered.
func TestCalculateForGuest_MatchesTheCalculationAUserGets(t *testing.T) {
	in := guestInput()
	birthDate, err := time.Parse("2006-01-02", in.BirthDate)
	require.NoError(t, err)

	result, err := CalculateForGuest(in)
	require.NoError(t, err)

	expected := CalculateTargets(UserProfile{
		BirthDate:     birthDate,
		Sex:           SexFemale,
		HeightCm:      in.HeightCm,
		WeightKg:      in.WeightKg,
		ActivityLevel: ActivityModerate,
		Goal:          GoalLoss,
	}, nil)

	assert.Equal(t, expected, result.CalculatedTargets)
}

func TestCalculateForGuest_RecommendsWaterFromWeight(t *testing.T) {
	in := guestInput()
	in.WeightKg = 65 // 65 × 30 ml = 1950 ml ≈ 8 glasses of 250 ml

	result, err := CalculateForGuest(in)

	require.NoError(t, err)
	assert.Equal(t, 8, result.WaterGlasses)
}

// A calculation from an impossible body would look authoritative and mean
// nothing.
func TestCalculateForGuest_RefusesParametersThatAreNotAPersons(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*GuestInput)
	}{
		{"height of a doll", func(in *GuestInput) { in.HeightCm = 40 }},
		{"height of a building", func(in *GuestInput) { in.HeightCm = 400 }},
		{"weight of a cat", func(in *GuestInput) { in.WeightKg = 4 }},
		{"weight beyond the scale", func(in *GuestInput) { in.WeightKg = 700 }},
		{"a child", func(in *GuestInput) {
			in.BirthDate = time.Now().AddDate(-8, 0, 0).Format("2006-01-02")
		}},
		{"born in the future", func(in *GuestInput) {
			in.BirthDate = time.Now().AddDate(1, 0, 0).Format("2006-01-02")
		}},
		{"a date that is not a date", func(in *GuestInput) { in.BirthDate = "вчера" }},
		{"an unknown sex", func(in *GuestInput) { in.Sex = "unspecified" }},
		{"an unknown activity level", func(in *GuestInput) { in.ActivityLevel = "olympic" }},
		{"an unknown goal", func(in *GuestInput) { in.Goal = "immortality" }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := guestInput()
			tc.mutate(&in)

			_, err := CalculateForGuest(in)

			require.Error(t, err)
			assert.ErrorIs(t, err, apperrors.ErrValidation)
		})
	}
}

// Whatever somebody weighs, the recommendation stays a number of glasses a
// person could drink.
func TestCalculateForGuest_WaterRecommendationStaysPlausible(t *testing.T) {
	for _, weight := range []float64{30, 65, 120, 300} {
		t.Run(fmt.Sprintf("%.0fkg", weight), func(t *testing.T) {
			in := guestInput()
			in.WeightKg = weight

			result, err := CalculateForGuest(in)

			require.NoError(t, err)
			assert.GreaterOrEqual(t, result.WaterGlasses, 1)
			assert.LessOrEqual(t, result.WaterGlasses, maxWaterGlass)
		})
	}
}
