package nutritioncalc

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

// Service handles nutrition calculation business logic
type Service struct {
	db  *database.DB
	log *logger.Logger
}

// NewService creates a new nutrition-calc service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{db: db, log: log}
}

// RecalculateForDate recalculates and upserts KBJU targets for a user on a given date.
// Returns nil if user profile is incomplete (missing required fields or no weight data).
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

	// 5. Calculate targets
	targets := CalculateTargets(*profile, workout)

	// 6. If curator override, use plan values but keep calculated metadata (BMR/TDEE)
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
			d.date::date::text,
			COALESCE(wp.calories_goal, t.calories) AS t_cal,
			COALESCE(wp.protein_goal, t.protein) AS t_pro,
			COALESCE(wp.fat_goal, t.fat) AS t_fat,
			COALESCE(wp.carbs_goal, t.carbs) AS t_carbs,
			t.bmr, t.tdee, t.workout_bonus, t.weight_used,
			CASE WHEN wp.id IS NOT NULL THEN 'curator_override' ELSE t.source END AS source,
			COALESCE(SUM(fe.calories), 0) AS a_cal,
			COALESCE(SUM(fe.protein), 0) AS a_pro,
			COALESCE(SUM(fe.fat), 0) AS a_fat,
			COALESCE(SUM(fe.carbs), 0) AS a_carbs
		FROM generate_series($1::date, $2::date, '1 day'::interval) AS d(date)
		LEFT JOIN daily_calculated_targets t ON t.user_id = $3 AND t.date = d.date::date
		LEFT JOIN weekly_plans wp ON wp.user_id = $3 AND wp.is_active = true
			AND d.date::date >= wp.start_date AND d.date::date <= wp.end_date
		LEFT JOIN food_entries fe ON fe.user_id = $3 AND fe.date = d.date::date
		GROUP BY d.date, wp.id, wp.calories_goal, wp.protein_goal, wp.fat_goal, wp.carbs_goal,
		         t.calories, t.protein, t.fat, t.carbs,
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
		  AND workout_type IS NOT NULL AND workout_duration IS NOT NULL
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
