package nutritioncalc

import "time"

// ActivityLevel represents user's base physical activity level
type ActivityLevel string

const (
	ActivitySedentary ActivityLevel = "sedentary"
	ActivityLight     ActivityLevel = "light"
	ActivityModerate  ActivityLevel = "moderate"
	ActivityActive    ActivityLevel = "active"
)

// PALCoefficients maps activity levels to their multipliers
var PALCoefficients = map[ActivityLevel]float64{
	ActivitySedentary: 1.2,
	ActivityLight:     1.375,
	ActivityModerate:  1.55,
	ActivityActive:    1.725,
}

// FitnessGoal represents user's body composition goal
type FitnessGoal string

const (
	GoalLoss     FitnessGoal = "loss"
	GoalMaintain FitnessGoal = "maintain"
	GoalGain     FitnessGoal = "gain"
)

// GoalModifiers maps goals to calorie adjustment percentages
var GoalModifiers = map[FitnessGoal]float64{
	GoalLoss:     -0.15,
	GoalMaintain: 0.0,
	GoalGain:     0.15,
}

// ProteinPerKg maps goals to protein g/kg body weight
var ProteinPerKg = map[FitnessGoal]float64{
	GoalLoss:     1.8,
	GoalMaintain: 1.6,
	GoalGain:     2.0,
}

// FatCaloriePercent is the percentage of calories from fat
const FatCaloriePercent = 0.25

// WorkoutCaloriesPerHour maps workout types (Russian UI labels) to kcal/hour burn estimates
var WorkoutCaloriesPerHour = map[string]float64{
	"Силовая":    300,
	"Кардио":     400,
	"HIIT":       500,
	"Йога":       200,
	"Растяжка":   200,
	"Плавание":   350,
	"Бег":        450,
	"Велосипед":  400,
}

// BiologicalSex for BMR calculation
type BiologicalSex string

const (
	SexMale   BiologicalSex = "male"
	SexFemale BiologicalSex = "female"
)

// UserProfile contains all data needed for KBJU calculation
type UserProfile struct {
	BirthDate     time.Time
	Sex           BiologicalSex
	HeightCm      float64
	WeightKg      float64
	ActivityLevel ActivityLevel
	Goal          FitnessGoal
}

// WorkoutInfo represents a workout for the day
type WorkoutInfo struct {
	Type        string
	DurationMin int
}

// CalculatedTargets is the result of KBJU calculation
type CalculatedTargets struct {
	Calories     float64 `json:"calories"`
	Protein      float64 `json:"protein"`
	Fat          float64 `json:"fat"`
	Carbs        float64 `json:"carbs"`
	BMR          float64 `json:"bmr"`
	TDEE         float64 `json:"tdee"`
	WorkoutBonus float64 `json:"workout_bonus"`
	WeightUsed   float64 `json:"weight_used"`
	Source       string  `json:"source"`
}

// DailyTargetRecord is the DB row for daily_calculated_targets
type DailyTargetRecord struct {
	ID           int64     `json:"id" db:"id"`
	UserID       int64     `json:"user_id" db:"user_id"`
	Date         string    `json:"date" db:"date"`
	Calories     float64   `json:"calories" db:"calories"`
	Protein      float64   `json:"protein" db:"protein"`
	Fat          float64   `json:"fat" db:"fat"`
	Carbs        float64   `json:"carbs" db:"carbs"`
	BMR          float64   `json:"bmr" db:"bmr"`
	TDEE         float64   `json:"tdee" db:"tdee"`
	WorkoutBonus float64   `json:"workout_bonus" db:"workout_bonus"`
	WeightUsed   float64   `json:"weight_used" db:"weight_used"`
	Source       string    `json:"source" db:"source"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// TargetVsActual combines target and actual data for a day
type TargetVsActual struct {
	Date         string             `json:"date"`
	Target       *CalculatedTargets `json:"target"`
	Actual       *ActualIntake      `json:"actual"`
	WorkoutBonus float64            `json:"workout_bonus"`
	Source       string             `json:"source"`
}

// ActualIntake is the user's actual KBJU for the day
type ActualIntake struct {
	Calories float64 `json:"calories"`
	Protein  float64 `json:"protein"`
	Fat      float64 `json:"fat"`
	Carbs    float64 `json:"carbs"`
}

// HistoryResponse is the API response for target history
type HistoryResponse struct {
	Days []TargetVsActual `json:"days"`
}
