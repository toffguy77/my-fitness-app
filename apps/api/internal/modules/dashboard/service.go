package dashboard

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"path/filepath"
	"time"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/google/uuid"
)

// Service handles dashboard business logic
type Service struct {
	db               *database.DB
	log              *logger.Logger
	s3Client         *storage.S3Client
	notificationsSvc *notifications.Service
}

// NewService creates a new dashboard service
func NewService(db *database.DB, log *logger.Logger, s3Client *storage.S3Client, notificationsSvc *notifications.Service) *Service {
	return &Service{
		db:               db,
		log:              log,
		s3Client:         s3Client,
		notificationsSvc: notificationsSvc,
	}
}

// GetDailyMetrics retrieves daily metrics for a specific date
func (s *Service) GetDailyMetrics(ctx context.Context, userID int64, date time.Time) (*DailyMetrics, error) {
	startTime := time.Now()

	// Normalize date to start of day
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())

	query := `
		SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps,
		       workout_completed, workout_type, workout_duration, created_at, updated_at
		FROM daily_metrics
		WHERE user_id = $1 AND date = $2
	`

	var metrics DailyMetrics
	err := s.db.QueryRowContext(ctx, query, userID, date).Scan(
		&metrics.ID,
		&metrics.UserID,
		&metrics.Date,
		&metrics.Calories,
		&metrics.Protein,
		&metrics.Fat,
		&metrics.Carbs,
		&metrics.Weight,
		&metrics.Steps,
		&metrics.WorkoutCompleted,
		&metrics.WorkoutType,
		&metrics.WorkoutDuration,
		&metrics.CreatedAt,
		&metrics.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return empty metrics for the date
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"user_id": userID,
				"date":    date,
				"found":   false,
			})
			return &DailyMetrics{
				ID:               uuid.New().String(),
				UserID:           userID,
				Date:             date,
				Calories:         0,
				Protein:          0,
				Fat:              0,
				Carbs:            0,
				Weight:           nil,
				Steps:            0,
				WorkoutCompleted: false,
				WorkoutType:      nil,
				WorkoutDuration:  nil,
				CreatedAt:        time.Now(),
				UpdatedAt:        time.Now(),
			}, nil
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    date,
		})
		return nil, fmt.Errorf("failed to query daily metrics: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"date":    date,
		"found":   true,
	})

	return &metrics, nil
}

// SaveMetric creates or updates a daily metric
func (s *Service) SaveMetric(ctx context.Context, userID int64, date time.Time, metricUpdate MetricUpdate) (*DailyMetrics, error) {
	startTime := time.Now()

	// Normalize date to start of day
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())

	// Validate metric update type
	if !metricUpdate.Type.IsValid() {
		return nil, fmt.Errorf("invalid metric update type: %s", metricUpdate.Type)
	}

	// Get existing metrics or create new
	existing, err := s.GetDailyMetrics(ctx, userID, date)
	if err != nil {
		return nil, fmt.Errorf("failed to get existing metrics: %w", err)
	}

	// Update the specific metric based on type
	switch metricUpdate.Type {
	case MetricUpdateTypeNutrition:
		data, ok := metricUpdate.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid nutrition data format")
		}
		if calories, ok := data["calories"].(float64); ok {
			existing.Calories = int(calories)
		}
		if protein, ok := data["protein"].(float64); ok {
			existing.Protein = int(protein)
		}
		if fat, ok := data["fat"].(float64); ok {
			existing.Fat = int(fat)
		}
		if carbs, ok := data["carbs"].(float64); ok {
			existing.Carbs = int(carbs)
		}

	case MetricUpdateTypeWeight:
		data, ok := metricUpdate.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid weight data format")
		}
		if weight, ok := data["weight"].(float64); ok {
			existing.Weight = &weight
		}

	case MetricUpdateTypeSteps:
		data, ok := metricUpdate.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid steps data format")
		}
		if steps, ok := data["steps"].(float64); ok {
			existing.Steps = int(steps)
		}

	case MetricUpdateTypeWorkout:
		data, ok := metricUpdate.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid workout data format")
		}
		if completed, ok := data["completed"].(bool); ok {
			existing.WorkoutCompleted = completed
		}
		if workoutType, ok := data["type"].(string); ok {
			existing.WorkoutType = &workoutType
		}
		if duration, ok := data["duration"].(float64); ok {
			dur := int(duration)
			existing.WorkoutDuration = &dur
		}
	}

	// Validate the updated metrics
	if err := existing.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Upsert the metrics
	query := `
		INSERT INTO daily_metrics (
			id, user_id, date, calories, protein, fat, carbs, weight, steps,
			workout_completed, workout_type, workout_duration, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		ON CONFLICT (user_id, date)
		DO UPDATE SET
			calories = EXCLUDED.calories,
			protein = EXCLUDED.protein,
			fat = EXCLUDED.fat,
			carbs = EXCLUDED.carbs,
			weight = EXCLUDED.weight,
			steps = EXCLUDED.steps,
			workout_completed = EXCLUDED.workout_completed,
			workout_type = EXCLUDED.workout_type,
			workout_duration = EXCLUDED.workout_duration,
			updated_at = NOW()
		RETURNING id, user_id, date, calories, protein, fat, carbs, weight, steps,
		          workout_completed, workout_type, workout_duration, created_at, updated_at
	`

	var result DailyMetrics
	err = s.db.QueryRowContext(
		ctx,
		query,
		existing.ID,
		userID,
		date,
		existing.Calories,
		existing.Protein,
		existing.Fat,
		existing.Carbs,
		existing.Weight,
		existing.Steps,
		existing.WorkoutCompleted,
		existing.WorkoutType,
		existing.WorkoutDuration,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.Date,
		&result.Calories,
		&result.Protein,
		&result.Fat,
		&result.Carbs,
		&result.Weight,
		&result.Steps,
		&result.WorkoutCompleted,
		&result.WorkoutType,
		&result.WorkoutDuration,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":     userID,
			"date":        date,
			"metric_type": metricUpdate.Type,
		})
		return nil, fmt.Errorf("failed to save metric: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":     userID,
		"date":        date,
		"metric_type": metricUpdate.Type,
	})

	s.log.LogBusinessEvent("metric_saved", map[string]interface{}{
		"user_id":     userID,
		"date":        date,
		"metric_type": metricUpdate.Type,
	})

	return &result, nil
}

// GetWeekMetrics retrieves daily metrics for a week range
func (s *Service) GetWeekMetrics(ctx context.Context, userID int64, startDate, endDate time.Time) ([]DailyMetrics, error) {
	startTime := time.Now()

	// Normalize dates to start of day
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())
	endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 0, 0, 0, 0, endDate.Location())

	query := `
		SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps,
		       workout_completed, workout_type, workout_duration, created_at, updated_at
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2 AND date <= $3
		ORDER BY date ASC
	`

	rows, err := s.db.QueryContext(ctx, query, userID, startDate, endDate)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":    userID,
			"start_date": startDate,
			"end_date":   endDate,
		})
		return nil, fmt.Errorf("failed to query week metrics: %w", err)
	}
	defer rows.Close()

	metrics := make([]DailyMetrics, 0)
	for rows.Next() {
		var m DailyMetrics
		err := rows.Scan(
			&m.ID,
			&m.UserID,
			&m.Date,
			&m.Calories,
			&m.Protein,
			&m.Fat,
			&m.Carbs,
			&m.Weight,
			&m.Steps,
			&m.WorkoutCompleted,
			&m.WorkoutType,
			&m.WorkoutDuration,
			&m.CreatedAt,
			&m.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan daily metrics", "error", err)
			return nil, fmt.Errorf("failed to scan daily metrics: %w", err)
		}
		metrics = append(metrics, m)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating metrics: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":    userID,
		"start_date": startDate,
		"end_date":   endDate,
		"count":      len(metrics),
	})

	return metrics, nil
}

// CalculateCompletionStatus calculates the completion status for daily metrics
func (s *Service) CalculateCompletionStatus(metrics *DailyMetrics, goals *WeeklyPlan) CompletionStatus {
	status := CompletionStatus{
		NutritionFilled:   false,
		WeightLogged:      false,
		ActivityCompleted: false,
	}

	// Nutrition is filled if calories > 0
	if metrics.Calories > 0 {
		status.NutritionFilled = true
	}

	// Weight is logged if weight is not nil
	if metrics.Weight != nil {
		status.WeightLogged = true
	}

	// Activity is completed if steps >= goal OR workout completed
	if goals != nil && goals.StepsGoal != nil {
		if metrics.Steps >= *goals.StepsGoal || metrics.WorkoutCompleted {
			status.ActivityCompleted = true
		}
	} else {
		// If no goal, just check if workout completed
		if metrics.WorkoutCompleted {
			status.ActivityCompleted = true
		}
	}

	return status
}

// CompletionStatus represents the completion status for a day
type CompletionStatus struct {
	NutritionFilled   bool `json:"nutrition_filled"`
	WeightLogged      bool `json:"weight_logged"`
	ActivityCompleted bool `json:"activity_completed"`
}

// GetWeeklyPlan retrieves the active weekly plan for a user (stub for now)
func (s *Service) GetWeeklyPlan(ctx context.Context, userID int64) (*WeeklyPlan, error) {
	startTime := time.Now()

	query := `
		SELECT id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
		       start_date, end_date, is_active, created_at, updated_at, created_by
		FROM weekly_plans
		WHERE user_id = $1 AND is_active = true
		ORDER BY start_date DESC
		LIMIT 1
	`

	var plan WeeklyPlan
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&plan.ID,
		&plan.UserID,
		&plan.CuratorID,
		&plan.CaloriesGoal,
		&plan.ProteinGoal,
		&plan.FatGoal,
		&plan.CarbsGoal,
		&plan.StepsGoal,
		&plan.StartDate,
		&plan.EndDate,
		&plan.IsActive,
		&plan.CreatedAt,
		&plan.UpdatedAt,
		&plan.CreatedBy,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"user_id": userID,
				"found":   false,
			})
			return nil, nil
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to query weekly plan: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"found":   true,
	})

	return &plan, nil
}

// GetTasks retrieves tasks for a user (stub for now)
func (s *Service) GetTasks(ctx context.Context, userID int64, weekNumber int) ([]*Task, error) {
	startTime := time.Now()

	query := `
		SELECT id, user_id, curator_id, title, description, week_number, assigned_at,
		       due_date, completed_at, status, created_at, updated_at
		FROM tasks
		WHERE user_id = $1 AND week_number = $2
		ORDER BY due_date ASC
	`

	rows, err := s.db.QueryContext(ctx, query, userID, weekNumber)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":     userID,
			"week_number": weekNumber,
		})
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]*Task, 0)
	for rows.Next() {
		var task Task
		err := rows.Scan(
			&task.ID,
			&task.UserID,
			&task.CuratorID,
			&task.Title,
			&task.Description,
			&task.WeekNumber,
			&task.AssignedAt,
			&task.DueDate,
			&task.CompletedAt,
			&task.Status,
			&task.CreatedAt,
			&task.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan task", "error", err)
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		tasks = append(tasks, &task)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating tasks: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":     userID,
		"week_number": weekNumber,
		"count":       len(tasks),
	})

	return tasks, nil
}

// GetActivePlan retrieves the active weekly plan for a user
func (s *Service) GetActivePlan(ctx context.Context, userID int64) (*WeeklyPlan, error) {
	startTime := time.Now()

	query := `
		SELECT id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
		       start_date, end_date, is_active, created_at, updated_at, created_by
		FROM weekly_plans
		WHERE user_id = $1 AND is_active = true AND end_date >= CURRENT_DATE
		ORDER BY start_date DESC
		LIMIT 1
	`

	var plan WeeklyPlan
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&plan.ID,
		&plan.UserID,
		&plan.CuratorID,
		&plan.CaloriesGoal,
		&plan.ProteinGoal,
		&plan.FatGoal,
		&plan.CarbsGoal,
		&plan.StepsGoal,
		&plan.StartDate,
		&plan.EndDate,
		&plan.IsActive,
		&plan.CreatedAt,
		&plan.UpdatedAt,
		&plan.CreatedBy,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
				"user_id": userID,
				"found":   false,
			})
			return nil, nil
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to query active plan: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"plan_id": plan.ID,
		"found":   true,
	})

	return &plan, nil
}

// CreatePlan creates a new weekly plan (curator only)
func (s *Service) CreatePlan(ctx context.Context, curatorID int64, clientID int64, plan *WeeklyPlan) (*WeeklyPlan, error) {
	startTime := time.Now()

	// Validate curator-client relationship
	hasRelationship, err := s.validateCuratorClientRelationship(ctx, curatorID, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to validate curator-client relationship: %w", err)
	}
	if !hasRelationship {
		return nil, fmt.Errorf("curator %d does not have an active relationship with client %d", curatorID, clientID)
	}

	// Set required fields
	plan.ID = uuid.New().String()
	plan.UserID = clientID
	plan.CuratorID = curatorID
	plan.CreatedBy = curatorID
	plan.IsActive = true
	plan.CreatedAt = time.Now()
	plan.UpdatedAt = time.Now()

	// Validate plan
	if err := plan.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Deactivate existing active plans for this user
	deactivateQuery := `
		UPDATE weekly_plans
		SET is_active = false, updated_at = NOW()
		WHERE user_id = $1 AND is_active = true
	`

	_, err = s.db.ExecContext(ctx, deactivateQuery, clientID)
	if err != nil {
		s.log.LogDatabaseQuery(deactivateQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": clientID,
		})
		return nil, fmt.Errorf("failed to deactivate existing plans: %w", err)
	}

	// Insert new plan
	query := `
		INSERT INTO weekly_plans (
			id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
			start_date, end_date, is_active, created_at, updated_at, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12)
		RETURNING id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
		          start_date, end_date, is_active, created_at, updated_at, created_by
	`

	var result WeeklyPlan
	err = s.db.QueryRowContext(
		ctx,
		query,
		plan.ID,
		plan.UserID,
		plan.CuratorID,
		plan.CaloriesGoal,
		plan.ProteinGoal,
		plan.FatGoal,
		plan.CarbsGoal,
		plan.StepsGoal,
		plan.StartDate,
		plan.EndDate,
		plan.IsActive,
		plan.CreatedBy,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.CuratorID,
		&result.CaloriesGoal,
		&result.ProteinGoal,
		&result.FatGoal,
		&result.CarbsGoal,
		&result.StepsGoal,
		&result.StartDate,
		&result.EndDate,
		&result.IsActive,
		&result.CreatedAt,
		&result.UpdatedAt,
		&result.CreatedBy,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"client_id":  clientID,
		})
		return nil, fmt.Errorf("failed to create plan: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"plan_id":    result.ID,
	})

	s.log.LogBusinessEvent("weekly_plan_created", map[string]interface{}{
		"plan_id":    result.ID,
		"curator_id": curatorID,
		"client_id":  clientID,
	})

	// Send notification to client
	if err := s.sendPlanUpdateNotification(ctx, clientID, &result); err != nil {
		// Log error but don't fail the operation
		s.log.Error("Failed to send plan creation notification", "error", err)
	}

	return &result, nil
}

// UpdatePlan updates an existing weekly plan (curator only)
func (s *Service) UpdatePlan(ctx context.Context, curatorID int64, planID string, updates *WeeklyPlan) (*WeeklyPlan, error) {
	startTime := time.Now()

	// Get existing plan
	existingQuery := `
		SELECT id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
		       start_date, end_date, is_active, created_at, updated_at, created_by
		FROM weekly_plans
		WHERE id = $1
	`

	var existing WeeklyPlan
	err := s.db.QueryRowContext(ctx, existingQuery, planID).Scan(
		&existing.ID,
		&existing.UserID,
		&existing.CuratorID,
		&existing.CaloriesGoal,
		&existing.ProteinGoal,
		&existing.FatGoal,
		&existing.CarbsGoal,
		&existing.StepsGoal,
		&existing.StartDate,
		&existing.EndDate,
		&existing.IsActive,
		&existing.CreatedAt,
		&existing.UpdatedAt,
		&existing.CreatedBy,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("plan not found")
		}
		return nil, fmt.Errorf("failed to query existing plan: %w", err)
	}

	// Validate curator-client relationship
	hasRelationship, err := s.validateCuratorClientRelationship(ctx, curatorID, existing.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to validate curator-client relationship: %w", err)
	}
	if !hasRelationship {
		return nil, fmt.Errorf("curator %d does not have an active relationship with client %d", curatorID, existing.UserID)
	}

	// Verify curator owns this plan
	if existing.CuratorID != curatorID {
		return nil, fmt.Errorf("curator %d is not authorized to update plan %s", curatorID, planID)
	}

	// Apply updates
	if updates.CaloriesGoal > 0 {
		existing.CaloriesGoal = updates.CaloriesGoal
	}
	if updates.ProteinGoal > 0 {
		existing.ProteinGoal = updates.ProteinGoal
	}
	if updates.FatGoal != nil {
		existing.FatGoal = updates.FatGoal
	}
	if updates.CarbsGoal != nil {
		existing.CarbsGoal = updates.CarbsGoal
	}
	if updates.StepsGoal != nil {
		existing.StepsGoal = updates.StepsGoal
	}
	if !updates.StartDate.IsZero() {
		existing.StartDate = updates.StartDate
	}
	if !updates.EndDate.IsZero() {
		existing.EndDate = updates.EndDate
	}

	// Validate updated plan
	if err := existing.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Update plan
	updateQuery := `
		UPDATE weekly_plans
		SET calories_goal = $1, protein_goal = $2, fat_goal = $3, carbs_goal = $4, steps_goal = $5,
		    start_date = $6, end_date = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING id, user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal,
		          start_date, end_date, is_active, created_at, updated_at, created_by
	`

	var result WeeklyPlan
	err = s.db.QueryRowContext(
		ctx,
		updateQuery,
		existing.CaloriesGoal,
		existing.ProteinGoal,
		existing.FatGoal,
		existing.CarbsGoal,
		existing.StepsGoal,
		existing.StartDate,
		existing.EndDate,
		planID,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.CuratorID,
		&result.CaloriesGoal,
		&result.ProteinGoal,
		&result.FatGoal,
		&result.CarbsGoal,
		&result.StepsGoal,
		&result.StartDate,
		&result.EndDate,
		&result.IsActive,
		&result.CreatedAt,
		&result.UpdatedAt,
		&result.CreatedBy,
	)

	if err != nil {
		s.log.LogDatabaseQuery(updateQuery, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"plan_id":    planID,
		})
		return nil, fmt.Errorf("failed to update plan: %w", err)
	}

	s.log.LogDatabaseQuery(updateQuery, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"plan_id":    planID,
	})

	s.log.LogBusinessEvent("weekly_plan_updated", map[string]interface{}{
		"plan_id":    planID,
		"curator_id": curatorID,
		"client_id":  result.UserID,
	})

	// Send notification to client
	if err := s.sendPlanUpdateNotification(ctx, result.UserID, &result); err != nil {
		// Log error but don't fail the operation
		s.log.Error("Failed to send plan update notification", "error", err)
	}

	return &result, nil
}

// validateCuratorClientRelationship checks if a curator has an active relationship with a client
func (s *Service) validateCuratorClientRelationship(ctx context.Context, curatorID int64, clientID int64) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM curator_client_relationships
			WHERE curator_id = $1 AND client_id = $2 AND status = 'active'
		)
	`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, curatorID, clientID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check curator-client relationship: %w", err)
	}

	return exists, nil
}

// GetTasksByWeek retrieves tasks for a user filtered by week number
func (s *Service) GetTasksByWeek(ctx context.Context, userID int64, weekNumber int) ([]*Task, error) {
	startTime := time.Now()

	query := `
		SELECT id, user_id, curator_id, title, description, week_number, assigned_at,
		       due_date, completed_at, status, created_at, updated_at
		FROM tasks
		WHERE user_id = $1 AND week_number = $2
		ORDER BY due_date ASC, created_at ASC
	`

	rows, err := s.db.QueryContext(ctx, query, userID, weekNumber)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":     userID,
			"week_number": weekNumber,
		})
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]*Task, 0)
	for rows.Next() {
		var task Task
		err := rows.Scan(
			&task.ID,
			&task.UserID,
			&task.CuratorID,
			&task.Title,
			&task.Description,
			&task.WeekNumber,
			&task.AssignedAt,
			&task.DueDate,
			&task.CompletedAt,
			&task.Status,
			&task.CreatedAt,
			&task.UpdatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan task", "error", err)
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		tasks = append(tasks, &task)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating tasks: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":     userID,
		"week_number": weekNumber,
		"count":       len(tasks),
	})

	return tasks, nil
}

// CreateTask creates a new task (curator only)
func (s *Service) CreateTask(ctx context.Context, curatorID int64, clientID int64, task *Task) (*Task, error) {
	startTime := time.Now()

	// Validate curator-client relationship
	hasRelationship, err := s.validateCuratorClientRelationship(ctx, curatorID, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to validate curator-client relationship: %w", err)
	}
	if !hasRelationship {
		return nil, fmt.Errorf("curator %d does not have an active relationship with client %d", curatorID, clientID)
	}

	// Set required fields
	task.ID = uuid.New().String()
	task.UserID = clientID
	task.CuratorID = curatorID
	task.Status = TaskStatusActive
	task.AssignedAt = time.Now()
	task.CreatedAt = time.Now()
	task.UpdatedAt = time.Now()

	// Validate task
	if err := task.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Insert task
	query := `
		INSERT INTO tasks (
			id, user_id, curator_id, title, description, week_number, assigned_at,
			due_date, completed_at, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING id, user_id, curator_id, title, description, week_number, assigned_at,
		          due_date, completed_at, status, created_at, updated_at
	`

	var result Task
	err = s.db.QueryRowContext(
		ctx,
		query,
		task.ID,
		task.UserID,
		task.CuratorID,
		task.Title,
		task.Description,
		task.WeekNumber,
		task.AssignedAt,
		task.DueDate,
		task.CompletedAt,
		task.Status,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.CuratorID,
		&result.Title,
		&result.Description,
		&result.WeekNumber,
		&result.AssignedAt,
		&result.DueDate,
		&result.CompletedAt,
		&result.Status,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"client_id":  clientID,
		})
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"task_id":    result.ID,
	})

	s.log.LogBusinessEvent("task_created", map[string]interface{}{
		"task_id":    result.ID,
		"curator_id": curatorID,
		"client_id":  clientID,
	})

	// Send notification to client
	if err := s.sendTaskAssignedNotification(ctx, clientID, &result); err != nil {
		// Log error but don't fail the operation
		s.log.Error("Failed to send task assigned notification", "error", err)
	}

	return &result, nil
}

// UpdateTaskStatus updates the status of a task
func (s *Service) UpdateTaskStatus(ctx context.Context, userID int64, taskID string, status TaskStatus) (*Task, error) {
	startTime := time.Now()

	// Validate status
	if !status.IsValid() {
		return nil, fmt.Errorf("invalid status: %s", status)
	}

	// Get existing task to verify ownership
	existingQuery := `
		SELECT id, user_id, curator_id, title, description, week_number, assigned_at,
		       due_date, completed_at, status, created_at, updated_at
		FROM tasks
		WHERE id = $1
	`

	var existing Task
	err := s.db.QueryRowContext(ctx, existingQuery, taskID).Scan(
		&existing.ID,
		&existing.UserID,
		&existing.CuratorID,
		&existing.Title,
		&existing.Description,
		&existing.WeekNumber,
		&existing.AssignedAt,
		&existing.DueDate,
		&existing.CompletedAt,
		&existing.Status,
		&existing.CreatedAt,
		&existing.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("task not found")
		}
		return nil, fmt.Errorf("failed to query existing task: %w", err)
	}

	// Verify user owns this task
	if existing.UserID != userID {
		return nil, fmt.Errorf("user %d is not authorized to update task %s", userID, taskID)
	}

	// Set completed_at timestamp if marking as completed
	var completedAt *time.Time
	if status == TaskStatusCompleted {
		now := time.Now()
		completedAt = &now
	}

	// Update task status
	updateQuery := `
		UPDATE tasks
		SET status = $1, completed_at = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING id, user_id, curator_id, title, description, week_number, assigned_at,
		          due_date, completed_at, status, created_at, updated_at
	`

	var result Task
	err = s.db.QueryRowContext(
		ctx,
		updateQuery,
		status,
		completedAt,
		taskID,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.CuratorID,
		&result.Title,
		&result.Description,
		&result.WeekNumber,
		&result.AssignedAt,
		&result.DueDate,
		&result.CompletedAt,
		&result.Status,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(updateQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"task_id": taskID,
			"status":  status,
		})
		return nil, fmt.Errorf("failed to update task status: %w", err)
	}

	s.log.LogDatabaseQuery(updateQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"task_id": taskID,
		"status":  status,
	})

	s.log.LogBusinessEvent("task_status_updated", map[string]interface{}{
		"task_id": taskID,
		"user_id": userID,
		"status":  status,
	})

	return &result, nil
}

// ValidateWeekData validates that sufficient data exists for weekly report
func (s *Service) ValidateWeekData(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (bool, []string, error) {
	startTime := time.Now()

	// Normalize dates
	weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, weekStart.Location())
	weekEnd = time.Date(weekEnd.Year(), weekEnd.Month(), weekEnd.Day(), 0, 0, 0, 0, weekEnd.Location())

	errors := make([]string, 0)

	// Check nutrition logged for >= 5 days
	nutritionQuery := `
		SELECT COUNT(DISTINCT date)
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2 AND date <= $3 AND calories > 0
	`

	var nutritionDays int
	err := s.db.QueryRowContext(ctx, nutritionQuery, userID, weekStart, weekEnd).Scan(&nutritionDays)
	if err != nil {
		return false, nil, fmt.Errorf("failed to check nutrition days: %w", err)
	}

	if nutritionDays < 5 {
		errors = append(errors, fmt.Sprintf("nutrition logged for only %d days (minimum 5 required)", nutritionDays))
	}

	// Check weight logged for >= 5 days
	weightQuery := `
		SELECT COUNT(DISTINCT date)
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2 AND date <= $3 AND weight IS NOT NULL
	`

	var weightDays int
	err = s.db.QueryRowContext(ctx, weightQuery, userID, weekStart, weekEnd).Scan(&weightDays)
	if err != nil {
		return false, nil, fmt.Errorf("failed to check weight days: %w", err)
	}

	if weightDays < 5 {
		errors = append(errors, fmt.Sprintf("weight logged for only %d days (minimum 5 required)", weightDays))
	}

	// Check weekly photo uploaded
	photoQuery := `
		SELECT EXISTS (
			SELECT 1 FROM weekly_photos
			WHERE user_id = $1 AND week_start = $2 AND week_end = $3
		)
	`

	var hasPhoto bool
	err = s.db.QueryRowContext(ctx, photoQuery, userID, weekStart, weekEnd).Scan(&hasPhoto)
	if err != nil {
		return false, nil, fmt.Errorf("failed to check weekly photo: %w", err)
	}

	if !hasPhoto {
		errors = append(errors, "weekly photo not uploaded")
	}

	s.log.LogDatabaseQuery("ValidateWeekData", time.Since(startTime), nil, map[string]interface{}{
		"user_id":        userID,
		"week_start":     weekStart,
		"week_end":       weekEnd,
		"nutrition_days": nutritionDays,
		"weight_days":    weightDays,
		"has_photo":      hasPhoto,
		"valid":          len(errors) == 0,
	})

	return len(errors) == 0, errors, nil
}

// CreateWeeklyReport creates a weekly report
func (s *Service) CreateWeeklyReport(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (*WeeklyReport, error) {
	startTime := time.Now()

	// Validate week data
	valid, validationErrors, err := s.ValidateWeekData(ctx, userID, weekStart, weekEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to validate week data: %w", err)
	}
	if !valid {
		return nil, fmt.Errorf("validation failed: %v", validationErrors)
	}

	// Get curator ID
	var curatorID int64
	curatorQuery := `
		SELECT curator_id FROM curator_client_relationships
		WHERE client_id = $1 AND status = 'active'
		LIMIT 1
	`
	err = s.db.QueryRowContext(ctx, curatorQuery, userID).Scan(&curatorID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no active curator found for user")
		}
		return nil, fmt.Errorf("failed to get curator: %w", err)
	}

	// Calculate summary statistics
	summaryQuery := `
		SELECT
			COUNT(DISTINCT CASE WHEN calories > 0 THEN date END) as days_with_nutrition,
			COUNT(DISTINCT CASE WHEN weight IS NOT NULL THEN date END) as days_with_weight,
			COUNT(DISTINCT CASE WHEN steps > 0 OR workout_completed THEN date END) as days_with_activity,
			COALESCE(AVG(NULLIF(calories, 0)), 0) as avg_calories,
			COALESCE(AVG(weight), 0) as avg_weight,
			COALESCE(SUM(steps), 0) as total_steps,
			COUNT(CASE WHEN workout_completed THEN 1 END) as workouts_completed
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2 AND date <= $3
	`

	var summary struct {
		DaysWithNutrition int
		DaysWithWeight    int
		DaysWithActivity  int
		AverageCalories   float64
		AverageWeight     float64
		TotalSteps        int
		WorkoutsCompleted int
	}

	err = s.db.QueryRowContext(ctx, summaryQuery, userID, weekStart, weekEnd).Scan(
		&summary.DaysWithNutrition,
		&summary.DaysWithWeight,
		&summary.DaysWithActivity,
		&summary.AverageCalories,
		&summary.AverageWeight,
		&summary.TotalSteps,
		&summary.WorkoutsCompleted,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate summary: %w", err)
	}

	// Get photo URL
	var photoURL *string
	photoQuery := `SELECT photo_url FROM weekly_photos WHERE user_id = $1 AND week_start = $2 AND week_end = $3`
	err = s.db.QueryRowContext(ctx, photoQuery, userID, weekStart, weekEnd).Scan(&photoURL)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to get photo: %w", err)
	}

	// Calculate week number
	weekNumber := int(weekStart.Sub(time.Date(weekStart.Year(), 1, 1, 0, 0, 0, 0, time.UTC)).Hours()/24/7) + 1

	// Create report
	report := &WeeklyReport{
		ID:         uuid.New().String(),
		UserID:     userID,
		CuratorID:  curatorID,
		WeekStart:  weekStart,
		WeekEnd:    weekEnd,
		WeekNumber: weekNumber,
		Summary: fmt.Sprintf(`{"days_with_nutrition":%d,"days_with_weight":%d,"days_with_activity":%d,"average_calories":%.0f,"average_weight":%.1f,"total_steps":%d,"workouts_completed":%d}`,
			summary.DaysWithNutrition, summary.DaysWithWeight, summary.DaysWithActivity,
			summary.AverageCalories, summary.AverageWeight, summary.TotalSteps, summary.WorkoutsCompleted),
		PhotoURL:    photoURL,
		SubmittedAt: time.Now(),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Insert report
	insertQuery := `
		INSERT INTO weekly_reports (
			id, user_id, curator_id, week_start, week_end, week_number, summary, photo_url,
			submitted_at, reviewed_at, curator_feedback, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, user_id, curator_id, week_start, week_end, week_number, summary, photo_url,
		          submitted_at, reviewed_at, curator_feedback, created_at, updated_at
	`

	err = s.db.QueryRowContext(
		ctx,
		insertQuery,
		report.ID,
		report.UserID,
		report.CuratorID,
		report.WeekStart,
		report.WeekEnd,
		report.WeekNumber,
		report.Summary,
		report.PhotoURL,
		report.SubmittedAt,
		report.ReviewedAt,
		report.CuratorFeedback,
	).Scan(
		&report.ID,
		&report.UserID,
		&report.CuratorID,
		&report.WeekStart,
		&report.WeekEnd,
		&report.WeekNumber,
		&report.Summary,
		&report.PhotoURL,
		&report.SubmittedAt,
		&report.ReviewedAt,
		&report.CuratorFeedback,
		&report.CreatedAt,
		&report.UpdatedAt,
	)

	if err != nil {
		s.log.LogDatabaseQuery(insertQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to create report: %w", err)
	}

	s.log.LogDatabaseQuery(insertQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id":   userID,
		"report_id": report.ID,
	})

	s.log.LogBusinessEvent("weekly_report_created", map[string]interface{}{
		"report_id":  report.ID,
		"user_id":    userID,
		"curator_id": curatorID,
	})

	// Send notification to curator
	if err := s.sendWeeklyReportNotification(ctx, curatorID, report); err != nil {
		// Log error but don't fail the operation
		s.log.Error("Failed to send weekly report notification", "error", err)
	}

	return report, nil
}

// ValidatePhoto validates photo file
func (s *Service) ValidatePhoto(fileSize int, mimeType string) error {
	// Check file size (max 10MB)
	if fileSize <= 0 {
		return fmt.Errorf("file size must be positive")
	}
	if fileSize > 10*1024*1024 {
		return fmt.Errorf("file size must be 10MB or less")
	}

	// Check mime type
	validMimeTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
	}

	if !validMimeTypes[mimeType] {
		return fmt.Errorf("mime type must be image/jpeg, image/png, or image/webp")
	}

	return nil
}

// UploadPhoto uploads a weekly photo to Yandex Cloud S3
func (s *Service) UploadPhoto(ctx context.Context, userID int64, weekIdentifier string, fileData io.Reader, fileSize int, mimeType string) (*PhotoData, error) {
	startTime := time.Now()

	// Validate photo
	if err := s.ValidatePhoto(fileSize, mimeType); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Parse week identifier (format: "2024-W01")
	// For now, use current week
	weekStart := time.Now().AddDate(0, 0, -int(time.Now().Weekday()))
	weekEnd := weekStart.AddDate(0, 0, 6)

	// Generate unique filename with proper extension
	ext := getFileExtension(mimeType)
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	// Generate S3 key: weekly-photos/{userID}/{weekIdentifier}/{filename}
	s3Key := fmt.Sprintf("weekly-photos/%d/%s/%s", userID, weekIdentifier, filename)

	// Upload to S3
	photoURL, err := s.s3Client.UploadFile(ctx, s3Key, fileData, mimeType, int64(fileSize))
	if err != nil {
		s.log.Error("Failed to upload photo to S3",
			"error", err,
			"user_id", userID,
			"week_identifier", weekIdentifier,
			"s3_key", s3Key,
		)
		return nil, fmt.Errorf("failed to upload photo to S3: %w", err)
	}

	// Create photo data
	photo := &PhotoData{
		ID:             uuid.New().String(),
		UserID:         userID,
		WeekStart:      weekStart,
		WeekEnd:        weekEnd,
		WeekIdentifier: weekIdentifier,
		PhotoURL:       photoURL,
		FileSize:       fileSize,
		MimeType:       mimeType,
		UploadedAt:     time.Now(),
		CreatedAt:      time.Now(),
	}

	// Insert photo metadata into database
	query := `
		INSERT INTO weekly_photos (
			id, user_id, week_start, week_end, week_identifier, photo_url, file_size, mime_type,
			uploaded_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (user_id, week_identifier)
		DO UPDATE SET
			photo_url = EXCLUDED.photo_url,
			file_size = EXCLUDED.file_size,
			mime_type = EXCLUDED.mime_type,
			uploaded_at = EXCLUDED.uploaded_at
		RETURNING id, user_id, week_start, week_end, week_identifier, photo_url, file_size, mime_type,
		          uploaded_at, created_at
	`

	err = s.db.QueryRowContext(
		ctx,
		query,
		photo.ID,
		photo.UserID,
		photo.WeekStart,
		photo.WeekEnd,
		photo.WeekIdentifier,
		photo.PhotoURL,
		photo.FileSize,
		photo.MimeType,
		photo.UploadedAt,
	).Scan(
		&photo.ID,
		&photo.UserID,
		&photo.WeekStart,
		&photo.WeekEnd,
		&photo.WeekIdentifier,
		&photo.PhotoURL,
		&photo.FileSize,
		&photo.MimeType,
		&photo.UploadedAt,
		&photo.CreatedAt,
	)

	if err != nil {
		// If database insert fails, try to delete the uploaded file from S3
		deleteErr := s.s3Client.DeleteFile(ctx, s3Key)
		if deleteErr != nil {
			s.log.Error("Failed to cleanup S3 file after database error",
				"error", deleteErr,
				"s3_key", s3Key,
			)
		}

		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":         userID,
			"week_identifier": weekIdentifier,
		})
		return nil, fmt.Errorf("failed to save photo metadata: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":         userID,
		"week_identifier": weekIdentifier,
		"photo_id":        photo.ID,
		"s3_key":          s3Key,
	})

	s.log.LogBusinessEvent("photo_uploaded", map[string]interface{}{
		"photo_id":        photo.ID,
		"user_id":         userID,
		"week_identifier": weekIdentifier,
		"s3_key":          s3Key,
		"file_size":       fileSize,
	})

	return photo, nil
}

// getFileExtension returns file extension based on MIME type
func getFileExtension(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

// GetPhotoSignedURL generates a temporary signed URL for photo access
func (s *Service) GetPhotoSignedURL(ctx context.Context, photoID string, userID int64) (string, error) {
	// Get photo metadata from database
	query := `
		SELECT photo_url FROM weekly_photos
		WHERE id = $1 AND user_id = $2
	`

	var photoURL string
	err := s.db.QueryRowContext(ctx, query, photoID, userID).Scan(&photoURL)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("photo not found")
		}
		return "", fmt.Errorf("failed to get photo: %w", err)
	}

	// Extract S3 key from URL
	// URL format: https://storage.yandexcloud.net/bucket/key
	// We need to extract the key part
	s3Key := extractS3KeyFromURL(photoURL)

	// Generate signed URL (valid for 15 minutes)
	signedURL, err := s.s3Client.GetSignedURL(ctx, s3Key, 15*time.Minute)
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}

	return signedURL, nil
}

// extractS3KeyFromURL extracts S3 key from full URL
func extractS3KeyFromURL(url string) string {
	// URL format: https://storage.yandexcloud.net/bucket/key
	// Extract everything after the bucket name
	// For simplicity, assume the key starts after the third slash
	parts := filepath.SplitList(url)
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return url
}

// sendPlanUpdateNotification sends a notification to the client when their plan is updated
func (s *Service) sendPlanUpdateNotification(ctx context.Context, clientID int64, plan *WeeklyPlan) error {
	// Skip if notifications service is not configured
	if s.notificationsSvc == nil {
		s.log.Warn("Notifications service not configured, skipping plan update notification",
			"client_id", clientID,
			"plan_id", plan.ID,
		)
		return nil
	}

	notification := &notifications.Notification{
		UserID:   clientID,
		Category: notifications.CategoryMain,
		Type:     notifications.TypeTrainerFeedback,
		Title:    "Обновлен план питания",
		Content:  fmt.Sprintf("Ваш тренер обновил план питания: %d ккал, %d г белка в день", plan.CaloriesGoal, plan.ProteinGoal),
		IconURL:  nil,
	}

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send plan update notification",
			"error", err,
			"client_id", clientID,
			"plan_id", plan.ID,
		)
		return fmt.Errorf("failed to send plan update notification: %w", err)
	}

	s.log.Info("Plan update notification sent",
		"client_id", clientID,
		"plan_id", plan.ID,
		"notification_id", notification.ID,
	)

	return nil
}

// sendTaskAssignedNotification sends a notification to the client when a task is assigned
func (s *Service) sendTaskAssignedNotification(ctx context.Context, clientID int64, task *Task) error {
	// Skip if notifications service is not configured
	if s.notificationsSvc == nil {
		s.log.Warn("Notifications service not configured, skipping task assigned notification",
			"client_id", clientID,
			"task_id", task.ID,
		)
		return nil
	}

	notification := &notifications.Notification{
		UserID:   clientID,
		Category: notifications.CategoryMain,
		Type:     notifications.TypeTrainerFeedback,
		Title:    "Новое задание от тренера",
		Content:  fmt.Sprintf("Вам назначено новое задание: %s", task.Title),
		IconURL:  nil,
	}

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send task assigned notification",
			"error", err,
			"client_id", clientID,
			"task_id", task.ID,
		)
		return fmt.Errorf("failed to send task assigned notification: %w", err)
	}

	s.log.Info("Task assigned notification sent",
		"client_id", clientID,
		"task_id", task.ID,
		"notification_id", notification.ID,
	)

	return nil
}

// sendWeeklyReportNotification sends a notification to the curator when a client submits a weekly report
func (s *Service) sendWeeklyReportNotification(ctx context.Context, curatorID int64, report *WeeklyReport) error {
	// Skip if notifications service is not configured
	if s.notificationsSvc == nil {
		s.log.Warn("Notifications service not configured, skipping weekly report notification",
			"curator_id", curatorID,
			"report_id", report.ID,
		)
		return nil
	}

	// Get client name for better notification message
	var clientName string
	nameQuery := `SELECT COALESCE(name, email) FROM users WHERE id = $1`
	err := s.db.QueryRowContext(ctx, nameQuery, report.UserID).Scan(&clientName)
	if err != nil {
		clientName = fmt.Sprintf("Клиент #%d", report.UserID)
	}

	notification := &notifications.Notification{
		UserID:   curatorID,
		Category: notifications.CategoryMain,
		Type:     notifications.TypeTrainerFeedback,
		Title:    "Получен недельный отчет",
		Content:  fmt.Sprintf("%s отправил недельный отчет за неделю %d", clientName, report.WeekNumber),
		IconURL:  nil,
	}

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send weekly report notification",
			"error", err,
			"curator_id", curatorID,
			"report_id", report.ID,
		)
		return fmt.Errorf("failed to send weekly report notification: %w", err)
	}

	s.log.Info("Weekly report notification sent",
		"curator_id", curatorID,
		"report_id", report.ID,
		"notification_id", notification.ID,
	)

	return nil
}

// GetProgressData retrieves progress data including weight trend and nutrition adherence
func (s *Service) GetProgressData(ctx context.Context, userID int64, weeks int) (*ProgressData, error) {
	startDate := time.Now().AddDate(0, 0, -weeks*7)

	// Query weight trend data
	weightQuery := `
		SELECT date, weight
		FROM daily_metrics
		WHERE user_id = $1 AND weight IS NOT NULL AND date >= $2
		ORDER BY date ASC
	`

	rows, err := s.db.QueryContext(ctx, weightQuery, userID, startDate)
	if err != nil {
		return nil, fmt.Errorf("failed to query weight trend: %w", err)
	}
	defer rows.Close()

	weightTrend := make([]WeightTrendPoint, 0)
	for rows.Next() {
		var date time.Time
		var weight float64
		if err := rows.Scan(&date, &weight); err != nil {
			return nil, fmt.Errorf("failed to scan weight data: %w", err)
		}
		weightTrend = append(weightTrend, WeightTrendPoint{
			Date:   date.Format("2006-01-02"),
			Weight: weight,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating weight data: %w", err)
	}

	// Query nutrition adherence
	adherenceQuery := `
		SELECT
			COUNT(DISTINCT CASE WHEN calories > 0 THEN date END) as days_with_nutrition,
			COUNT(DISTINCT date) as total_days
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2
	`

	var daysWithNutrition, totalDays int
	err = s.db.QueryRowContext(ctx, adherenceQuery, userID, startDate).Scan(&daysWithNutrition, &totalDays)
	if err != nil {
		return nil, fmt.Errorf("failed to query nutrition adherence: %w", err)
	}

	var nutritionAdherence float64
	if totalDays > 0 {
		nutritionAdherence = (float64(daysWithNutrition) / float64(totalDays)) * 100
	}

	// Query target weight from user_settings
	targetQuery := `SELECT target_weight FROM user_settings WHERE user_id = $1`
	var targetWeight sql.NullFloat64
	err = s.db.QueryRowContext(ctx, targetQuery, userID).Scan(&targetWeight)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to query target weight: %w", err)
	}

	var targetWeightPtr *float64
	if targetWeight.Valid {
		targetWeightPtr = &targetWeight.Float64
	}

	return &ProgressData{
		WeightTrend:        weightTrend,
		NutritionAdherence: nutritionAdherence,
		TargetWeight:       targetWeightPtr,
	}, nil
}
