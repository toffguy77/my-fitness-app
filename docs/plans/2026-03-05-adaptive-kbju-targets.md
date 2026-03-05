# Adaptive KBJU Targets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically calculate daily KBJU targets based on user profile (age, sex, height, weight, activity level, goal) and workout activity, storing results in DB for historical tracking.

**Architecture:** New `nutrition-calc` backend module calculates BMR/TDEE/KBJU and stores results in `daily_calculated_targets` table. Recalculation triggers on weight change, workout log, and profile update. Frontend adds onboarding step, settings page, and Recharts-based weekly chart.

**Tech Stack:** Go/Gin backend, PostgreSQL, Next.js/React frontend, Zustand, Recharts, Tailwind CSS v4

---

## Task 1: Database Migration — New Fields in user_settings

**Files:**
- Create: `apps/api/migrations/034_user_body_profile_up.sql`
- Create: `apps/api/migrations/034_user_body_profile_down.sql`

**Step 1: Write the up migration**

```sql
-- Add body profile fields to user_settings for KBJU calculation
ALTER TABLE user_settings ADD COLUMN birth_date DATE;
ALTER TABLE user_settings ADD COLUMN biological_sex VARCHAR(10)
    CHECK (biological_sex IN ('male', 'female'));
ALTER TABLE user_settings ADD COLUMN activity_level VARCHAR(20) DEFAULT 'moderate'
    CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active'));
ALTER TABLE user_settings ADD COLUMN fitness_goal VARCHAR(20) DEFAULT 'maintain'
    CHECK (fitness_goal IN ('loss', 'maintain', 'gain'));
```

**Step 2: Write the down migration**

```sql
ALTER TABLE user_settings DROP COLUMN IF EXISTS birth_date;
ALTER TABLE user_settings DROP COLUMN IF EXISTS biological_sex;
ALTER TABLE user_settings DROP COLUMN IF EXISTS activity_level;
ALTER TABLE user_settings DROP COLUMN IF EXISTS fitness_goal;
```

**Step 3: Commit**

```bash
git add apps/api/migrations/034_user_body_profile_up.sql apps/api/migrations/034_user_body_profile_down.sql
git commit -m "feat: add body profile fields to user_settings migration"
```

---

## Task 2: Database Migration — daily_calculated_targets Table

**Files:**
- Create: `apps/api/migrations/035_daily_calculated_targets_up.sql`
- Create: `apps/api/migrations/035_daily_calculated_targets_down.sql`

**Step 1: Write the up migration**

```sql
CREATE TABLE daily_calculated_targets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    calories DECIMAL(7,1) NOT NULL,
    protein DECIMAL(5,1) NOT NULL,
    fat DECIMAL(5,1) NOT NULL,
    carbs DECIMAL(5,1) NOT NULL,
    bmr DECIMAL(7,1) NOT NULL,
    tdee DECIMAL(7,1) NOT NULL,
    workout_bonus DECIMAL(6,1) NOT NULL DEFAULT 0,
    weight_used DECIMAL(5,1) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'calculated'
        CHECK (source IN ('calculated', 'curator_override')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_date UNIQUE (user_id, date)
);

CREATE INDEX idx_dct_user_date ON daily_calculated_targets(user_id, date DESC);

DO $$ BEGIN
    EXECUTE 'GRANT ALL ON TABLE daily_calculated_targets TO PUBLIC';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE daily_calculated_targets_id_seq TO PUBLIC';
END $$;
```

**Step 2: Write the down migration**

```sql
DROP TABLE IF EXISTS daily_calculated_targets;
```

**Step 3: Commit**

```bash
git add apps/api/migrations/035_daily_calculated_targets_up.sql apps/api/migrations/035_daily_calculated_targets_down.sql
git commit -m "feat: add daily_calculated_targets table migration"
```

---

## Task 3: Backend — nutrition-calc Types

**Files:**
- Create: `apps/api/internal/modules/nutrition-calc/types.go`

**Step 1: Write types**

```go
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

// WorkoutCaloriesPerHour maps workout types to kcal/hour burn estimates
var WorkoutCaloriesPerHour = map[string]float64{
	"strength":  300,
	"cardio":    400,
	"hiit":      500,
	"yoga":      200,
	"swimming":  350,
	"walking":   250,
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
	Type       string
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
	Date         string           `json:"date"`
	Target       *CalculatedTargets `json:"target"`
	Actual       *ActualIntake    `json:"actual"`
	WorkoutBonus float64          `json:"workout_bonus"`
	Source       string           `json:"source"`
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
```

**Step 2: Commit**

```bash
git add apps/api/internal/modules/nutrition-calc/types.go
git commit -m "feat: add nutrition-calc types"
```

---

## Task 4: Backend — Calculator (Pure Functions)

**Files:**
- Create: `apps/api/internal/modules/nutrition-calc/calculator.go`
- Create: `apps/api/internal/modules/nutrition-calc/calculator_test.go`

**Step 1: Write the failing tests**

```go
package nutritioncalc

import (
	"testing"
	"time"
)

func TestCalculateBMR_Male(t *testing.T) {
	// 30-year-old male, 80kg, 180cm
	// BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
	profile := UserProfile{
		BirthDate: time.Now().AddDate(-30, 0, 0),
		Sex:       SexMale,
		HeightCm:  180,
		WeightKg:  80,
	}
	bmr := CalculateBMR(profile)
	if bmr < 1779 || bmr > 1781 {
		t.Errorf("expected BMR ~1780, got %f", bmr)
	}
}

func TestCalculateBMR_Female(t *testing.T) {
	// 25-year-old female, 60kg, 165cm
	// BMR = 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
	profile := UserProfile{
		BirthDate: time.Now().AddDate(-25, 0, 0),
		Sex:       SexFemale,
		HeightCm:  165,
		WeightKg:  60,
	}
	bmr := CalculateBMR(profile)
	if bmr < 1344 || bmr > 1347 {
		t.Errorf("expected BMR ~1345.25, got %f", bmr)
	}
}

func TestCalculateTDEE(t *testing.T) {
	bmr := 1780.0
	tdee := CalculateTDEE(bmr, ActivityModerate)
	// 1780 * 1.55 = 2759
	expected := 2759.0
	if tdee < expected-1 || tdee > expected+1 {
		t.Errorf("expected TDEE ~%f, got %f", expected, tdee)
	}
}

func TestCalculateWorkoutBonus(t *testing.T) {
	// 60 min strength = 300 kcal
	bonus := CalculateWorkoutBonus(&WorkoutInfo{Type: "strength", DurationMin: 60})
	if bonus != 300 {
		t.Errorf("expected 300, got %f", bonus)
	}

	// 90 min cardio = 600 kcal
	bonus = CalculateWorkoutBonus(&WorkoutInfo{Type: "cardio", DurationMin: 90})
	if bonus != 600 {
		t.Errorf("expected 600, got %f", bonus)
	}

	// nil workout = 0
	bonus = CalculateWorkoutBonus(nil)
	if bonus != 0 {
		t.Errorf("expected 0, got %f", bonus)
	}

	// unknown type = 0
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

	// BMR = ~1780, TDEE = ~2759, workout = 300
	// Total = (2759 + 300) * 0.85 = 2600.15
	// Protein = 1.8 * 80 = 144g = 576 kcal
	// Fat = 2600.15 * 0.25 = 650 kcal = 72.2g
	// Carbs = (2600.15 - 576 - 650) / 4 = 343.5g

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

	// BMR ~1345.25, TDEE = 1345.25 * 1.375 = 1849.7, no modifier
	// Protein = 1.6 * 60 = 96g
	// WorkoutBonus = 0
	if targets.WorkoutBonus != 0 {
		t.Errorf("expected 0 workout bonus, got %f", targets.WorkoutBonus)
	}
	if targets.Calories < 1800 || targets.Calories > 1900 {
		t.Errorf("expected calories ~1850, got %f", targets.Calories)
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && go test ./internal/modules/nutrition-calc/ -v`
Expected: FAIL — functions not defined

**Step 3: Write the calculator implementation**

```go
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
	if now.YearDay() < birthDate.YearDay() {
		age--
	}
	return age
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && go test ./internal/modules/nutrition-calc/ -v`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/internal/modules/nutrition-calc/calculator.go apps/api/internal/modules/nutrition-calc/calculator_test.go
git commit -m "feat: add KBJU calculator with Mifflin-St Jeor formula"
```

---

## Task 5: Backend — nutrition-calc Service

**Files:**
- Create: `apps/api/internal/modules/nutrition-calc/service.go`

**Step 1: Write the service**

```go
package nutritioncalc

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

type Service struct {
	db  *database.DB
	log *logger.Logger
}

func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{db: db, log: log}
}

// RecalculateForDate recalculates and upserts KBJU targets for a user on a given date.
// Returns nil if user profile is incomplete (missing required fields).
func (s *Service) RecalculateForDate(ctx context.Context, userID int64, date time.Time) (*CalculatedTargets, error) {
	dateStr := date.Format("2006-01-02")

	// 1. Check if curator override exists (weekly_plan active for this date)
	var hasCuratorPlan bool
	var planCalories, planProtein, planFat, planCarbs float64
	planQuery := `
		SELECT calories_goal, protein_goal, fat_goal, carbs_goal
		FROM weekly_plans
		WHERE user_id = $1 AND is_active = true
		  AND start_date <= $2 AND end_date >= $2
		LIMIT 1
	`
	err := s.db.QueryRowContext(ctx, planQuery, userID, dateStr).Scan(
		&planCalories, &planProtein, &planFat, &planCarbs,
	)
	if err == nil {
		hasCuratorPlan = true
	} else if err != sql.ErrNoRows {
		return nil, fmt.Errorf("checking weekly plan: %w", err)
	}

	// 2. Get user profile
	profile, err := s.getUserProfile(ctx, userID)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, nil // incomplete profile, skip
	}

	// 3. Get latest weight
	weight, err := s.getLatestWeight(ctx, userID, date)
	if err != nil {
		return nil, err
	}
	if weight == 0 {
		return nil, nil // no weight data, skip
	}
	profile.WeightKg = weight

	// 4. Get workout for the day
	workout, err := s.getWorkoutForDate(ctx, userID, date)
	if err != nil {
		return nil, err
	}

	// 5. Calculate
	targets := CalculateTargets(*profile, workout)

	// 6. If curator override, use plan values but keep calculated metadata
	if hasCuratorPlan {
		targets.Calories = planCalories
		targets.Protein = planProtein
		targets.Fat = planFat
		targets.Carbs = planCarbs
		targets.Source = "curator_override"
	}

	// 7. Upsert into daily_calculated_targets
	upsertQuery := `
		INSERT INTO daily_calculated_targets
			(user_id, date, calories, protein, fat, carbs, bmr, tdee, workout_bonus, weight_used, source, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		ON CONFLICT (user_id, date) DO UPDATE SET
			calories = EXCLUDED.calories,
			protein = EXCLUDED.protein,
			fat = EXCLUDED.fat,
			carbs = EXCLUDED.carbs,
			bmr = EXCLUDED.bmr,
			tdee = EXCLUDED.tdee,
			workout_bonus = EXCLUDED.workout_bonus,
			weight_used = EXCLUDED.weight_used,
			source = EXCLUDED.source,
			created_at = NOW()
	`
	_, err = s.db.ExecContext(ctx, upsertQuery,
		userID, dateStr,
		targets.Calories, targets.Protein, targets.Fat, targets.Carbs,
		targets.BMR, targets.TDEE, targets.WorkoutBonus, targets.WeightUsed,
		targets.Source,
	)
	if err != nil {
		return nil, fmt.Errorf("upserting calculated targets: %w", err)
	}

	return &targets, nil
}

// GetTargetsForDate returns the stored calculated targets for a date.
func (s *Service) GetTargetsForDate(ctx context.Context, userID int64, date string) (*DailyTargetRecord, error) {
	query := `
		SELECT id, user_id, date, calories, protein, fat, carbs, bmr, tdee,
		       workout_bonus, weight_used, source, created_at
		FROM daily_calculated_targets
		WHERE user_id = $1 AND date = $2
	`
	var r DailyTargetRecord
	err := s.db.QueryRowContext(ctx, query, userID, date).Scan(
		&r.ID, &r.UserID, &r.Date, &r.Calories, &r.Protein, &r.Fat, &r.Carbs,
		&r.BMR, &r.TDEE, &r.WorkoutBonus, &r.WeightUsed, &r.Source, &r.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting targets: %w", err)
	}
	return &r, nil
}

// GetHistory returns target vs actual data for the last N days.
func (s *Service) GetHistory(ctx context.Context, userID int64, days int) ([]TargetVsActual, error) {
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -days+1)

	query := `
		SELECT
			d.date::text,
			t.calories AS t_cal, t.protein AS t_pro, t.fat AS t_fat, t.carbs AS t_carbs,
			t.bmr, t.tdee, t.workout_bonus, t.weight_used, t.source,
			COALESCE(SUM(fe.calories), 0) AS a_cal,
			COALESCE(SUM(fe.protein), 0) AS a_pro,
			COALESCE(SUM(fe.fat), 0) AS a_fat,
			COALESCE(SUM(fe.carbs), 0) AS a_carbs
		FROM generate_series($1::date, $2::date, '1 day') AS d(date)
		LEFT JOIN daily_calculated_targets t ON t.user_id = $3 AND t.date = d.date
		LEFT JOIN food_entries fe ON fe.user_id = $3 AND fe.date = d.date::text
		GROUP BY d.date, t.calories, t.protein, t.fat, t.carbs,
		         t.bmr, t.tdee, t.workout_bonus, t.weight_used, t.source
		ORDER BY d.date
	`

	rows, err := s.db.QueryContext(ctx, query,
		startDate.Format("2006-01-02"),
		endDate.Format("2006-01-02"),
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying history: %w", err)
	}
	defer rows.Close()

	var result []TargetVsActual
	for rows.Next() {
		var day TargetVsActual
		var tCal, tPro, tFat, tCarbs sql.NullFloat64
		var bmr, tdee, wBonus, wUsed sql.NullFloat64
		var source sql.NullString
		var aCal, aPro, aFat, aCarbs float64

		err := rows.Scan(
			&day.Date,
			&tCal, &tPro, &tFat, &tCarbs,
			&bmr, &tdee, &wBonus, &wUsed, &source,
			&aCal, &aPro, &aFat, &aCarbs,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning history row: %w", err)
		}

		if tCal.Valid {
			day.Target = &CalculatedTargets{
				Calories:     tCal.Float64,
				Protein:      tPro.Float64,
				Fat:          tFat.Float64,
				Carbs:        tCarbs.Float64,
				BMR:          bmr.Float64,
				TDEE:         tdee.Float64,
				WorkoutBonus: wBonus.Float64,
				WeightUsed:   wUsed.Float64,
				Source:       source.String,
			}
			day.WorkoutBonus = wBonus.Float64
			day.Source = source.String
		}

		day.Actual = &ActualIntake{
			Calories: aCal,
			Protein:  aPro,
			Fat:      aFat,
			Carbs:    aCarbs,
		}

		result = append(result, day)
	}

	return result, nil
}

// getUserProfile returns profile data needed for calculation, or nil if incomplete.
func (s *Service) getUserProfile(ctx context.Context, userID int64) (*UserProfile, error) {
	query := `
		SELECT birth_date, biological_sex, height, activity_level, fitness_goal
		FROM user_settings
		WHERE user_id = $1
	`
	var birthDate sql.NullTime
	var sex, activityLevel, goal sql.NullString
	var height sql.NullFloat64

	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&birthDate, &sex, &height, &activityLevel, &goal,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting user profile: %w", err)
	}

	if !birthDate.Valid || !sex.Valid || !height.Valid {
		return nil, nil // incomplete profile
	}

	al := ActivityLevel(activityLevel.String)
	if _, ok := PALCoefficients[al]; !ok {
		al = ActivityModerate
	}

	fg := FitnessGoal(goal.String)
	if _, ok := GoalModifiers[fg]; !ok {
		fg = GoalMaintain
	}

	return &UserProfile{
		BirthDate:     birthDate.Time,
		Sex:           BiologicalSex(sex.String),
		HeightCm:      height.Float64,
		ActivityLevel: al,
		Goal:          fg,
	}, nil
}

// getLatestWeight returns the most recent weight entry on or before date.
func (s *Service) getLatestWeight(ctx context.Context, userID int64, date time.Time) (float64, error) {
	query := `
		SELECT weight FROM daily_metrics
		WHERE user_id = $1 AND date <= $2 AND weight IS NOT NULL
		ORDER BY date DESC LIMIT 1
	`
	var weight float64
	err := s.db.QueryRowContext(ctx, query, userID, date.Format("2006-01-02")).Scan(&weight)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("getting latest weight: %w", err)
	}
	return weight, nil
}

// getWorkoutForDate returns workout info for a specific date, or nil.
func (s *Service) getWorkoutForDate(ctx context.Context, userID int64, date time.Time) (*WorkoutInfo, error) {
	query := `
		SELECT workout_type, workout_duration
		FROM daily_metrics
		WHERE user_id = $1 AND date = $2
		  AND workout_completed = true AND workout_type IS NOT NULL AND workout_duration IS NOT NULL
	`
	var wType string
	var wDuration int
	err := s.db.QueryRowContext(ctx, query, userID, date.Format("2006-01-02")).Scan(&wType, &wDuration)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting workout: %w", err)
	}
	return &WorkoutInfo{Type: wType, DurationMin: wDuration}, nil
}
```

**Step 2: Commit**

```bash
git add apps/api/internal/modules/nutrition-calc/service.go
git commit -m "feat: add nutrition-calc service with recalculation and history"
```

---

## Task 6: Backend — nutrition-calc Handler + Routes

**Files:**
- Create: `apps/api/internal/modules/nutrition-calc/handler.go`
- Modify: `apps/api/cmd/server/main.go` (add routes, ~line 334 after food-tracker group)

**Step 1: Write the handler**

```go
package nutritioncalc

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/burcev/api/internal/shared/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
)

type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	db      *database.DB
	service *Service
}

func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		db:      db,
		service: NewService(db, log),
	}
}

// GetTargets returns calculated targets for a specific date.
func (h *Handler) GetTargets(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	dateStr := c.Query("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	record, err := h.service.GetTargetsForDate(c.Request.Context(), userID, dateStr)
	if err != nil {
		h.log.Errorw("Failed to get targets", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить цели")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"targets": record})
}

// GetHistory returns target vs actual for the last N days.
func (h *Handler) GetHistory(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	days := 7
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 && parsed <= 30 {
			days = parsed
		}
	}

	history, err := h.service.GetHistory(c.Request.Context(), userID, days)
	if err != nil {
		h.log.Errorw("Failed to get history", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить историю")
		return
	}

	response.Success(c, http.StatusOK, HistoryResponse{Days: history})
}

// Recalculate triggers manual recalculation for today.
func (h *Handler) Recalculate(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	now := time.Now().In(userLoc)

	targets, err := h.service.RecalculateForDate(c.Request.Context(), userID, now)
	if err != nil {
		h.log.Errorw("Failed to recalculate", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось пересчитать")
		return
	}

	if targets == nil {
		response.Error(c, http.StatusBadRequest, "Заполните профиль (дата рождения, пол, рост, вес) для расчёта КБЖУ")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"targets": targets})
}

// GetClientHistory returns target vs actual for a curator's client.
func (h *Handler) GetClientHistory(c *gin.Context) {
	clientIDStr := c.Param("id")
	clientID, err := strconv.ParseInt(clientIDStr, 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный ID клиента")
		return
	}

	days := 7
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 && parsed <= 30 {
			days = parsed
		}
	}

	history, err := h.service.GetHistory(c.Request.Context(), clientID, days)
	if err != nil {
		h.log.Errorw("Failed to get client history", "error", err, "client_id", clientID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить историю клиента")
		return
	}

	response.Success(c, http.StatusOK, HistoryResponse{Days: history})
}
```

**Step 2: Add routes to main.go**

After the food-tracker group (around line 334), add:

```go
		// Nutrition calculator routes (protected)
		nutritionCalcHandler := nutritioncalc.NewHandler(cfg, log, db)
		ncGroup := v1.Group("/nutrition-calc")
		ncGroup.Use(middleware.RequireAuth(cfg))
		{
			ncGroup.GET("/targets", nutritionCalcHandler.GetTargets)
			ncGroup.GET("/history", nutritionCalcHandler.GetHistory)
			ncGroup.POST("/recalculate", nutritionCalcHandler.Recalculate)
		}
```

And add to the curator routes group (around line 377):

```go
			curatorGroup.GET("/clients/:id/targets/history", nutritionCalcHandler.GetClientHistory)
```

Add the import at the top of main.go:

```go
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
```

**Step 3: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add apps/api/internal/modules/nutrition-calc/handler.go apps/api/cmd/server/main.go
git commit -m "feat: add nutrition-calc handler and routes"
```

---

## Task 7: Backend — Integration Triggers

**Files:**
- Modify: `apps/api/internal/modules/dashboard/handler.go` — inject nutrition-calc service
- Modify: `apps/api/internal/modules/users/handler.go` — trigger on settings update
- Modify: `apps/api/cmd/server/main.go` — pass nutrition-calc service to dashboard and users handlers

**Step 1: Add trigger in dashboard SaveMetric**

In `apps/api/internal/modules/dashboard/handler.go`, the `SaveMetric` handler already saves weight and workout data. After the successful save, add a call to recalculate:

```go
// After: metrics, err := h.service.SaveMetric(...)
// Add:
if h.nutritionCalcSvc != nil {
    go func() {
        _, err := h.nutritionCalcSvc.RecalculateForDate(context.Background(), userID, date)
        if err != nil {
            h.log.Errorw("Failed to recalculate KBJU after metric save", "error", err, "user_id", userID)
        }
    }()
}
```

Add `nutritionCalcSvc` field to the Handler struct and update NewHandler to accept it.

**Step 2: Add trigger in users UpdateSettings**

In `apps/api/internal/modules/users/handler.go`, after UpdateSettings succeeds, trigger recalculation if body profile fields changed:

```go
// After: settings, err := h.service.UpdateSettings(...)
// Add:
if h.nutritionCalcSvc != nil {
    go func() {
        _, err := h.nutritionCalcSvc.RecalculateForDate(context.Background(), userID, time.Now())
        if err != nil {
            h.log.Errorw("Failed to recalculate KBJU after settings update", "error", err, "user_id", userID)
        }
    }()
}
```

**Step 3: Update main.go to wire dependencies**

Create the nutrition-calc service once and pass it to both dashboard and users handlers:

```go
nutritionCalcSvc := nutritioncalc.NewService(db, log)
// Pass to dashboard handler and users handler constructors
```

**Step 4: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add apps/api/internal/modules/dashboard/handler.go apps/api/internal/modules/users/handler.go apps/api/cmd/server/main.go
git commit -m "feat: add KBJU recalculation triggers on weight/workout/settings changes"
```

---

## Task 8: Backend — Update user_settings API to include new fields

**Files:**
- Modify: `apps/api/internal/modules/users/handler.go` — add new fields to UpdateSettingsRequest
- Modify: `apps/api/internal/modules/users/service.go` — update Settings type and SQL query

**Step 1: Update Settings type**

Add to `Settings` struct:

```go
BirthDate     *string  `json:"birth_date,omitempty"`     // "YYYY-MM-DD"
BiologicalSex *string  `json:"biological_sex,omitempty"` // "male" / "female"
ActivityLevel *string  `json:"activity_level,omitempty"` // "sedentary"/"light"/"moderate"/"active"
FitnessGoal   *string  `json:"fitness_goal,omitempty"`   // "loss"/"maintain"/"gain"
```

**Step 2: Update UpdateSettingsRequest**

Add same fields to the request DTO.

**Step 3: Add validation in handler**

```go
if req.BiologicalSex != nil && *req.BiologicalSex != "male" && *req.BiologicalSex != "female" {
    response.Error(c, http.StatusBadRequest, "Пол должен быть 'male' или 'female'")
    return
}
if req.ActivityLevel != nil {
    validLevels := map[string]bool{"sedentary": true, "light": true, "moderate": true, "active": true}
    if !validLevels[*req.ActivityLevel] {
        response.Error(c, http.StatusBadRequest, "Неверный уровень активности")
        return
    }
}
if req.FitnessGoal != nil {
    validGoals := map[string]bool{"loss": true, "maintain": true, "gain": true}
    if !validGoals[*req.FitnessGoal] {
        response.Error(c, http.StatusBadRequest, "Неверная цель")
        return
    }
}
```

**Step 4: Update SQL query in service**

Add the new columns to the INSERT/ON CONFLICT query in `UpdateSettings`.

**Step 5: Update GetProfile**

Update the `GetProfile` SQL query to also return the new fields so they appear in the profile response.

**Step 6: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: SUCCESS

**Step 7: Commit**

```bash
git add apps/api/internal/modules/users/handler.go apps/api/internal/modules/users/service.go
git commit -m "feat: add body profile fields to user settings API"
```

---

## Task 9: Backend — Update curator types with new profile fields

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go` — add profile fields to ClientCard
- Modify: `apps/api/internal/modules/curator/service.go` — query new fields

**Step 1: Add fields to ClientCard**

```go
BirthDate     *string  `json:"birth_date,omitempty"`
BiologicalSex *string  `json:"biological_sex,omitempty"`
ActivityLevel *string  `json:"activity_level,omitempty"`
FitnessGoal   *string  `json:"fitness_goal,omitempty"`
```

**Step 2: Update the SQL query in GetClientDetail to join user_settings for new fields**

**Step 3: Commit**

```bash
git add apps/api/internal/modules/curator/types.go apps/api/internal/modules/curator/service.go
git commit -m "feat: expose body profile fields in curator client card"
```

---

## Task 10: Frontend — Update settings types and API

**Files:**
- Modify: `apps/web/src/features/settings/api/settings.ts` — add new fields to UserSettings

**Step 1: Update UserSettings interface**

```typescript
export interface UserSettings {
    language: string
    units: string
    timezone: string
    telegram_username: string
    instagram_username: string
    apple_health_enabled: boolean
    target_weight?: number | null
    height?: number | null
    birth_date?: string | null       // "YYYY-MM-DD"
    biological_sex?: string | null   // "male" | "female"
    activity_level?: string | null   // "sedentary" | "light" | "moderate" | "active"
    fitness_goal?: string | null     // "loss" | "maintain" | "gain"
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/settings/api/settings.ts
git commit -m "feat: add body profile fields to frontend settings types"
```

---

## Task 11: Frontend — nutrition-calc API client

**Files:**
- Create: `apps/web/src/features/nutrition-calc/api/nutritionCalc.ts`
- Create: `apps/web/src/features/nutrition-calc/types/index.ts`
- Create: `apps/web/src/features/nutrition-calc/index.ts`

**Step 1: Write types**

```typescript
// apps/web/src/features/nutrition-calc/types/index.ts
export interface CalculatedTargets {
    calories: number
    protein: number
    fat: number
    carbs: number
    bmr: number
    tdee: number
    workout_bonus: number
    weight_used: number
    source: 'calculated' | 'curator_override'
}

export interface ActualIntake {
    calories: number
    protein: number
    fat: number
    carbs: number
}

export interface TargetVsActual {
    date: string
    target: CalculatedTargets | null
    actual: ActualIntake | null
    workout_bonus: number
    source: string
}

export interface HistoryResponse {
    days: TargetVsActual[]
}
```

**Step 2: Write API client**

```typescript
// apps/web/src/features/nutrition-calc/api/nutritionCalc.ts
import { apiClient } from '@/shared/utils/api-client'
import type { CalculatedTargets, HistoryResponse } from '../types'

export async function getTargets(date?: string): Promise<CalculatedTargets | null> {
    const params = date ? `?date=${date}` : ''
    const res = await apiClient.get<{ targets: CalculatedTargets | null }>(
        `/backend-api/v1/nutrition-calc/targets${params}`
    )
    return res.targets
}

export async function getHistory(days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/nutrition-calc/history?days=${days}`
    )
}

export async function recalculate(): Promise<CalculatedTargets> {
    const res = await apiClient.post<{ targets: CalculatedTargets }>(
        '/backend-api/v1/nutrition-calc/recalculate'
    )
    return res.targets
}

export async function getClientHistory(clientId: number, days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/curator/clients/${clientId}/targets/history?days=${days}`
    )
}
```

**Step 3: Write barrel export**

```typescript
// apps/web/src/features/nutrition-calc/index.ts
export * from './types'
export * from './api/nutritionCalc'
```

**Step 4: Commit**

```bash
git add apps/web/src/features/nutrition-calc/
git commit -m "feat: add nutrition-calc frontend types and API client"
```

---

## Task 12: Frontend — Settings Body Page

**Files:**
- Create: `apps/web/src/app/settings/body/page.tsx`
- Create: `apps/web/src/features/settings/components/SettingsBody.tsx`

**Step 1: Write the page component**

```typescript
// apps/web/src/app/settings/body/page.tsx
'use client'

import { SettingsBody } from '@/features/settings/components/SettingsBody'

export default function SettingsBodyPage() {
    return <SettingsBody />
}
```

**Step 2: Write the SettingsBody component**

Build a form similar to existing settings pages using `SettingsPageLayout`. Fields:
- Birth date: `<input type="date">`
- Biological sex: radio buttons (М / Ж)
- Height: numeric input (existing field, moved here)
- Current weight: read-only display from latest daily_metrics, link to dashboard
- Target weight: numeric input (existing field, moved here)
- Activity level: select with 4 options and descriptions
- Fitness goal: radio buttons (Снижение / Поддержание / Набор)
- Save button → calls `updateSettings()` then `recalculate()` → shows toast with new targets

Follow the exact patterns from `SettingsLocality` component. Use `SettingsPageLayout` wrapper.

**Step 3: Add navigation item**

Add "Тело и цели" to the settings navigation (check `apps/web/src/app/settings/layout.tsx` or equivalent settings nav).

**Step 4: Commit**

```bash
git add apps/web/src/app/settings/body/ apps/web/src/features/settings/components/SettingsBody.tsx
git commit -m "feat: add body & goals settings page"
```

---

## Task 13: Frontend — Onboarding Step "Body & Goals"

**Files:**
- Modify: `apps/web/src/features/onboarding/store/onboardingStore.ts` — add new fields, bump totalSteps to 5
- Modify: `apps/web/src/features/onboarding/components/OnboardingWizard.tsx` — add step 2 content, shift steps 2-3 to 3-4

**Step 1: Update onboarding store**

Add fields to state:

```typescript
birthDate: string         // 'YYYY-MM-DD'
biologicalSex: 'male' | 'female' | ''
currentWeight: string     // numeric string
activityLevel: 'sedentary' | 'light' | 'moderate' | 'active'
fitnessGoal: 'loss' | 'maintain' | 'gain'
```

Add setters. Update `totalSteps: 5`. Update `initialState` with defaults.

**Step 2: Update OnboardingWizard**

Insert new step at index 2 (between Settings and Social). The step renders a form with:
- Date of birth picker
- Sex radio (М / Ж)
- Current weight input
- Height input (if not already filled)
- Activity level select
- Goal radio

On "Next" for this step: save all body fields via `updateSettings()`, then save weight via dashboard API if entered.

Shift the case indices in `handleNext`:
- case 0: Photo (unchanged)
- case 1: Settings (unchanged)
- case 2: Body & Goals (NEW)
- case 3: Social (was case 2)
- case 4: Apple Health + complete (was case 3)

**Step 3: Commit**

```bash
git add apps/web/src/features/onboarding/
git commit -m "feat: add body & goals step to onboarding wizard"
```

---

## Task 14: Frontend — Install Recharts + Weekly KBJU Chart Component

**Files:**
- Run: `cd apps/web && npm install recharts`
- Create: `apps/web/src/features/nutrition-calc/components/KBJUWeeklyChart.tsx`

**Step 1: Install recharts**

Run: `cd apps/web && npm install recharts`

**Step 2: Write the chart component**

```typescript
// apps/web/src/features/nutrition-calc/components/KBJUWeeklyChart.tsx
'use client'

import { useMemo } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Dot
} from 'recharts'
import type { TargetVsActual } from '../types'

interface KBJUWeeklyChartProps {
    data: TargetVsActual[]
    className?: string
}

export function KBJUWeeklyChart({ data, className }: KBJUWeeklyChartProps) {
    const chartData = useMemo(() =>
        data.map(d => {
            const targetCal = d.target?.calories ?? null
            const actualCal = d.actual?.calories ?? null
            const dateObj = new Date(d.date + 'T00:00:00')
            const label = dateObj.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
            const hasWorkout = (d.workout_bonus ?? 0) > 0

            let status: 'green' | 'yellow' | 'red' = 'green'
            if (targetCal && actualCal) {
                const deviation = Math.abs(actualCal - targetCal) / targetCal
                if (deviation > 0.2) status = 'red'
                else if (deviation > 0.1) status = 'yellow'
            }

            return {
                date: d.date,
                label,
                target: targetCal,
                actual: actualCal,
                workoutBonus: d.workout_bonus,
                hasWorkout,
                status,
                source: d.source,
            }
        }),
        [data]
    )

    if (chartData.length === 0) return null

    return (
        <section className={`rounded-xl bg-white p-4 shadow-sm border border-gray-100 ${className ?? ''}`}>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">КБЖУ за неделю</h2>
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                        formatter={(value: number, name: string) => [
                            `${Math.round(value)} ккал`,
                            name === 'target' ? 'Цель' : 'Факт'
                        ]}
                        labelFormatter={(label: string) => label}
                    />
                    <Line
                        type="monotone"
                        dataKey="target"
                        stroke="#6366f1"
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#6366f1' }}
                        connectNulls
                        name="target"
                    />
                    <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={(props: Record<string, unknown>) => {
                            const { cx, cy, payload } = props as { cx: number; cy: number; payload: { status: string } }
                            const colors = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' }
                            const color = colors[payload.status as keyof typeof colors] ?? colors.green
                            return <Dot cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1} />
                        }}
                        connectNulls
                        name="actual"
                    />
                </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-indigo-500 inline-block" style={{ borderTop: '2px dashed' }} />
                    Цель
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-emerald-500 inline-block" />
                    Факт
                </span>
            </div>
        </section>
    )
}
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/features/nutrition-calc/components/
git commit -m "feat: add Recharts-based KBJU weekly chart component"
```

---

## Task 15: Frontend — Add Chart to Dashboard

**Files:**
- Modify: dashboard page component (find via `apps/web/src/app/dashboard/page.tsx` or equivalent)
- The chart needs to fetch data via `getHistory()` and render `KBJUWeeklyChart`

**Step 1: Add chart to dashboard**

Import `KBJUWeeklyChart` and `getHistory`. Fetch on mount with `useEffect`. Render below existing `KBZHUSummary` or `WeightBlock`.

**Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/ apps/web/src/features/dashboard/
git commit -m "feat: add KBJU weekly chart to client dashboard"
```

---

## Task 16: Frontend — Profile Completion Banner

**Files:**
- Create: `apps/web/src/features/nutrition-calc/components/ProfileCompletionBanner.tsx`
- Modify: dashboard page to include banner

**Step 1: Write the banner component**

```typescript
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { getProfile } from '@/features/settings/api/settings'

export function ProfileCompletionBanner() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const dismissed = localStorage.getItem('kbju_banner_dismissed')
        if (dismissed) {
            const dismissedAt = new Date(dismissed)
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            if (dismissedAt > threeDaysAgo) return
        }

        getProfile().then(profile => {
            const s = profile.settings
            if (!s?.birth_date || !s?.biological_sex || !s?.height) {
                setShow(true)
            }
        }).catch(() => {})
    }, [])

    if (!show) return null

    return (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-indigo-800">
                <span>Заполните профиль для автоматического расчёта КБЖУ</span>
                <Link href="/settings/body" className="font-semibold underline hover:text-indigo-600">
                    Заполнить
                </Link>
            </div>
            <button
                onClick={() => {
                    setShow(false)
                    localStorage.setItem('kbju_banner_dismissed', new Date().toISOString())
                }}
                className="text-indigo-400 hover:text-indigo-600"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
```

**Step 2: Add banner to dashboard page (at the top, before other blocks)**

**Step 3: Commit**

```bash
git add apps/web/src/features/nutrition-calc/components/ProfileCompletionBanner.tsx
git commit -m "feat: add profile completion banner for KBJU calculation"
```

---

## Task 17: Frontend — Curator Client Card Updates

**Files:**
- Modify: `apps/web/src/features/curator/types/index.ts` — add new fields to ClientCard
- Modify: curator client detail component — add profile info row and chart

**Step 1: Update curator types**

Add to `ClientCard` interface:

```typescript
birth_date?: string | null
biological_sex?: string | null
activity_level?: string | null
fitness_goal?: string | null
```

**Step 2: Add profile row and chart to curator client detail view**

Display compact row: age (calculated from birth_date), sex, activity level, goal.
Add `KBJUWeeklyChart` using `getClientHistory(clientId)`.

**Step 3: Commit**

```bash
git add apps/web/src/features/curator/
git commit -m "feat: add body profile and KBJU chart to curator client view"
```

---

## Task 18: Frontend — Update KBZHUSummary with source label

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/KBZHUSummary.tsx`

**Step 1: Add source prop and label**

Add optional `source` prop to `KBZHUSummaryProps`:

```typescript
export interface KBZHUSummaryProps {
    current: KBZHU
    target: Partial<KBZHU> | null
    source?: 'calculated' | 'curator_override' | null
    workoutBonus?: number | null
    className?: string
}
```

Render below the progress bars:

```typescript
{source && (
    <p className="mt-2 text-xs text-gray-400">
        {source === 'calculated' ? 'Рассчитано автоматически' : 'План куратора'}
        {workoutBonus ? ` · +${Math.round(workoutBonus)} ккал за тренировку` : ''}
    </p>
)}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/food-tracker/components/KBZHUSummary.tsx
git commit -m "feat: add source label and workout bonus to KBZHUSummary"
```

---

## Task 19: Run Migrations and Full Integration Test

**Step 1: Run migrations**

Run: `cd apps/api && go run cmd/server/main.go migrate` (or the project's migration command)

**Step 2: Run all backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: PASS

**Step 3: Run frontend linting and type check**

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: PASS

**Step 4: Run frontend tests**

Run: `cd apps/web && npx jest`
Expected: PASS

**Step 5: Manual smoke test**

1. Start dev: `make dev`
2. Go to `/settings/body`, fill in profile
3. Log weight on dashboard
4. Check that `daily_calculated_targets` has a record
5. Check weekly chart on dashboard
6. Check curator view for client

**Step 6: Commit any remaining fixes**

```bash
git commit -m "fix: integration fixes for adaptive KBJU targets"
```
