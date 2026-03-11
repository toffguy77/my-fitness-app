package curator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

// parseIntArray parses a PostgreSQL integer array string like "{1,3,5}" into []int
func parseIntArray(s string) []int {
	s = strings.TrimSpace(s)
	if s == "" || s == "{}" || s == "NULL" {
		return nil
	}
	s = strings.Trim(s, "{}")
	parts := strings.Split(s, ",")
	result := make([]int, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if v, err := strconv.Atoi(p); err == nil {
			result = append(result, v)
		}
	}
	return result
}

// buildPlaceholders returns "($1,$2,$3,...)" and []any args from int64 slice
func buildPlaceholders(ids []int64, offset int) (string, []any) {
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1+offset)
		args[i] = id
	}
	return "(" + strings.Join(placeholders, ",") + ")", args
}

// ServiceInterface defines the interface for curator service operations
type ServiceInterface interface {
	GetClients(ctx context.Context, curatorID int64) ([]ClientCard, error)
	GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error)
	SetTargetWeight(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error
	SetWaterGoal(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error
	CreateWeeklyPlan(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error)
	UpdateWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error)
	DeleteWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string) error
	GetWeeklyPlans(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error)
	CreateTask(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error)
	UpdateTask(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error)
	DeleteTask(ctx context.Context, curatorID, clientID int64, taskID string) error
	GetTasks(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error)
	SubmitFeedback(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error
	GetWeeklyReports(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error)
	GetAnalytics(ctx context.Context, curatorID int64) (*AnalyticsSummary, error)
	GetAttentionList(ctx context.Context, curatorID int64) ([]AttentionItem, error)
	GetAnalyticsHistory(ctx context.Context, curatorID int64, period string, count int) (interface{}, error)
	GetBenchmark(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error)
	CollectDailySnapshot(ctx context.Context, curatorID int64) error
}

// Service handles curator business logic
type Service struct {
	db               *database.DB
	log              *logger.Logger
	notificationsSvc *notifications.Service
}

// NewService creates a new curator service
func NewService(db *database.DB, log *logger.Logger, notificationsSvc *notifications.Service) *Service {
	return &Service{
		db:               db,
		log:              log,
		notificationsSvc: notificationsSvc,
	}
}

// clientRow represents raw data for a single client from the main query
type clientRow struct {
	id           int64
	name         string
	avatarURL    sql.NullString
	todayCal     float64
	todayProtein float64
	todayFat     float64
	todayCarbs   float64
	planCal      sql.NullFloat64
	planProtein  sql.NullFloat64
	planFat      sql.NullFloat64
	planCarbs    sql.NullFloat64
}

// GetClients returns all active clients for a curator with today's KBZHU, plan, alerts, and unread counts
func (s *Service) GetClients(ctx context.Context, curatorID int64) ([]ClientCard, error) {
	startTime := time.Now()

	// Main query: get clients with today's food totals and plan (curator plan OR auto-calculated fallback)
	query := `
		SELECT u.id, COALESCE(u.name, '') AS name, u.avatar_url,
		       COALESCE(SUM(fe.calories), 0) AS today_calories,
		       COALESCE(SUM(fe.protein), 0) AS today_protein,
		       COALESCE(SUM(fe.fat), 0) AS today_fat,
		       COALESCE(SUM(fe.carbs), 0) AS today_carbs,
		       COALESCE(wp.calories_goal, dct.calories) AS plan_calories,
		       COALESCE(wp.protein_goal, dct.protein) AS plan_protein,
		       COALESCE(wp.fat_goal, dct.fat) AS plan_fat,
		       COALESCE(wp.carbs_goal, dct.carbs) AS plan_carbs
		FROM curator_client_relationships ccr
		JOIN users u ON u.id = ccr.client_id
		LEFT JOIN food_entries fe ON fe.user_id = u.id AND fe.date = CURRENT_DATE
		LEFT JOIN weekly_plans wp ON wp.user_id = u.id
		    AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
		    AND wp.is_active = true
		LEFT JOIN daily_calculated_targets dct ON dct.user_id = u.id
		    AND dct.date = CURRENT_DATE
		WHERE ccr.curator_id = $1 AND ccr.status = 'active'
		GROUP BY u.id, u.name, u.avatar_url,
		         wp.calories_goal, wp.protein_goal, wp.fat_goal, wp.carbs_goal,
		         dct.calories, dct.protein, dct.fat, dct.carbs
	`

	rows, err := s.db.QueryContext(ctx, query, curatorID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
		})
		return nil, fmt.Errorf("failed to query clients: %w", err)
	}
	defer rows.Close()

	var clientRows []clientRow
	clientIDs := make([]int64, 0)

	for rows.Next() {
		var cr clientRow
		if err := rows.Scan(
			&cr.id, &cr.name, &cr.avatarURL,
			&cr.todayCal, &cr.todayProtein, &cr.todayFat, &cr.todayCarbs,
			&cr.planCal, &cr.planProtein, &cr.planFat, &cr.planCarbs,
		); err != nil {
			s.log.Error("Failed to scan client row", "error", err)
			return nil, fmt.Errorf("failed to scan client row: %w", err)
		}
		clientRows = append(clientRows, cr)
		clientIDs = append(clientIDs, cr.id)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating client rows: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"count":      len(clientRows),
	})

	// Get unread counts per client
	unreadMap, err := s.getUnreadCounts(ctx, curatorID, clientIDs)
	if err != nil {
		s.log.Error("Failed to get unread counts, continuing with zeros", "error", err)
		unreadMap = make(map[int64]int)
	}

	// Get weight data for all clients (last 2 weights + target)
	weightMap, trendMap := s.getWeightData(ctx, clientIDs)
	targetMap := s.getTargetWeights(ctx, clientIDs)

	// Get today's water intake for all clients
	waterMap := s.getTodayWater(ctx, clientIDs)

	// Get extended fields
	activeTaskMap, overdueTaskMap := s.getActiveTaskCounts(ctx, curatorID, clientIDs)
	weeklyKBZHUMap := s.getWeeklyKBZHUPercent(ctx, clientIDs)
	lastActivityMap := s.getLastActivityDates(ctx, clientIDs)
	streakMap := s.getStreakDays(ctx, clientIDs)

	// Build client cards
	cards := make([]ClientCard, 0, len(clientRows))
	for _, cr := range clientRows {
		card := ClientCard{
			ID:   cr.id,
			Name: cr.name,
			TodayKBZHU: &DailyKBZHU{
				Calories: cr.todayCal,
				Protein:  cr.todayProtein,
				Fat:      cr.todayFat,
				Carbs:    cr.todayCarbs,
			},
			Alerts:             make([]Alert, 0),
			UnreadCount:        unreadMap[cr.id],
			LastWeight:         weightMap[cr.id],
			WeightTrend:        trendMap[cr.id],
			TargetWeight:       targetMap[cr.id],
			TodayWater:         waterMap[cr.id],
			WeeklyKBZHUPercent: weeklyKBZHUMap[cr.id],
			ActiveTasksCount:   activeTaskMap[cr.id],
			OverdueTasksCount:  overdueTaskMap[cr.id],
			LastActivityDate:   lastActivityMap[cr.id],
			StreakDays:         streakMap[cr.id],
		}

		if cr.avatarURL.Valid {
			card.AvatarURL = cr.avatarURL.String
		}

		if cr.planCal.Valid {
			card.Plan = &PlanKBZHU{
				Calories: cr.planCal.Float64,
				Protein:  cr.planProtein.Float64,
				Fat:      cr.planFat.Float64,
				Carbs:    cr.planCarbs.Float64,
			}
		}

		// Compute alerts
		card.Alerts = computeAlerts(card.TodayKBZHU, card.Plan)

		cards = append(cards, card)
	}

	// Sort: clients with red/yellow alerts or unread > 0 first (alphabetically), then remaining (alphabetically)
	sort.SliceStable(cards, func(i, j int) bool {
		iPriority := hasPriorityAlerts(cards[i])
		jPriority := hasPriorityAlerts(cards[j])

		if iPriority && !jPriority {
			return true
		}
		if !iPriority && jPriority {
			return false
		}
		return cards[i].Name < cards[j].Name
	})

	return cards, nil
}

// GetClientDetail returns detailed information about a specific client for a date range.
// If date is provided, single-day mode. Otherwise, returns last N days (newest first).
func (s *Service) GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error) {
	startTime := time.Now()

	// Compute date range
	var startDate, endDate time.Time
	today := time.Now().UTC().Truncate(24 * time.Hour)

	if date != "" {
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil {
			return nil, fmt.Errorf("invalid date format: %w", err)
		}
		startDate = parsed
		endDate = parsed
	} else {
		endDate = today
		startDate = today.AddDate(0, 0, -(days - 1))
	}

	startDateStr := startDate.Format("2006-01-02")
	endDateStr := endDate.Format("2006-01-02")

	// Verify curator-client relationship
	relationshipQuery := `
		SELECT EXISTS (
			SELECT 1 FROM curator_client_relationships
			WHERE curator_id = $1 AND client_id = $2 AND status = 'active'
		)
	`

	var exists bool
	if err := s.db.QueryRowContext(ctx, relationshipQuery, curatorID, clientID).Scan(&exists); err != nil {
		s.log.LogDatabaseQuery(relationshipQuery, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"client_id":  clientID,
		})
		return nil, fmt.Errorf("failed to verify relationship: %w", err)
	}

	if !exists {
		return nil, fmt.Errorf("unauthorized: no active relationship between curator %d and client %d", curatorID, clientID)
	}

	// Get client info
	clientQuery := `
		SELECT u.id, COALESCE(u.name, ''), u.avatar_url, u.email,
		       us.height, COALESCE(us.timezone, 'Europe/Moscow'),
		       COALESCE(us.telegram_username, ''), COALESCE(us.instagram_username, ''),
		       us.target_weight, us.water_goal,
		       us.birth_date, us.biological_sex, us.activity_level, us.fitness_goal
		FROM users u
		LEFT JOIN user_settings us ON us.user_id = u.id
		WHERE u.id = $1
	`
	var clientID64 int64
	var clientName string
	var avatarURL sql.NullString
	var clientEmail string
	var clientHeight sql.NullFloat64
	var clientTimezone string
	var telegramUsername string
	var instagramUsername string
	var targetWeight sql.NullFloat64
	var waterGoal sql.NullInt64
	var birthDate, biologicalSex, activityLevel, fitnessGoal sql.NullString
	if err := s.db.QueryRowContext(ctx, clientQuery, clientID).Scan(
		&clientID64, &clientName, &avatarURL, &clientEmail,
		&clientHeight, &clientTimezone,
		&telegramUsername, &instagramUsername,
		&targetWeight, &waterGoal,
		&birthDate, &biologicalSex, &activityLevel, &fitnessGoal,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("client not found")
		}
		return nil, fmt.Errorf("failed to get client info: %w", err)
	}

	// Get food entries for the date range
	entriesQuery := `
		SELECT id, food_name, meal_type, calories, protein, fat, carbs, portion_amount, created_by, created_at, date
		FROM food_entries
		WHERE user_id = $1 AND date >= $2 AND date <= $3
		ORDER BY date DESC, created_at ASC
	`

	entryRows, err := s.db.QueryContext(ctx, entriesQuery, clientID, startDateStr, endDateStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query food entries: %w", err)
	}
	defer entryRows.Close()

	// Map: date string -> []FoodEntryView
	foodByDate := make(map[string][]FoodEntryView)
	// Map: date string -> DailyKBZHU totals
	kbzhuByDate := make(map[string]*DailyKBZHU)

	for entryRows.Next() {
		var entry FoodEntryView
		var createdBy sql.NullInt64
		var createdAt time.Time
		var entryDate time.Time

		if err := entryRows.Scan(
			&entry.ID, &entry.FoodName, &entry.MealType,
			&entry.Calories, &entry.Protein, &entry.Fat, &entry.Carbs,
			&entry.Weight, &createdBy, &createdAt, &entryDate,
		); err != nil {
			return nil, fmt.Errorf("failed to scan food entry: %w", err)
		}

		if createdBy.Valid {
			v := createdBy.Int64
			entry.CreatedBy = &v
		}
		entry.Time = createdAt.Format("15:04")

		dateKey := entryDate.Format("2006-01-02")
		foodByDate[dateKey] = append(foodByDate[dateKey], entry)

		if kbzhuByDate[dateKey] == nil {
			kbzhuByDate[dateKey] = &DailyKBZHU{}
		}
		kbzhuByDate[dateKey].Calories += entry.Calories
		kbzhuByDate[dateKey].Protein += entry.Protein
		kbzhuByDate[dateKey].Fat += entry.Fat
		kbzhuByDate[dateKey].Carbs += entry.Carbs
	}

	if err := entryRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating food entries: %w", err)
	}

	// Get water logs for the date range
	waterQuery := `
		SELECT date, glasses, goal, glass_size
		FROM water_logs
		WHERE user_id = $1 AND date >= $2 AND date <= $3
	`
	waterRows, err := s.db.QueryContext(ctx, waterQuery, clientID, startDateStr, endDateStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query water logs: %w", err)
	}
	defer waterRows.Close()

	waterByDate := make(map[string]*WaterView)
	for waterRows.Next() {
		var d time.Time
		var w WaterView
		if err := waterRows.Scan(&d, &w.Glasses, &w.Goal, &w.GlassSize); err != nil {
			return nil, fmt.Errorf("failed to scan water log: %w", err)
		}
		waterByDate[d.Format("2006-01-02")] = &w
	}
	if err := waterRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating water logs: %w", err)
	}

	// Get daily metrics (steps, workout) for the date range
	metricsQuery := `
		SELECT date, steps, workout_completed, COALESCE(workout_type, ''), COALESCE(workout_duration, 0)
		FROM daily_metrics
		WHERE user_id = $1 AND date >= $2 AND date <= $3
	`
	metricsRows, err := s.db.QueryContext(ctx, metricsQuery, clientID, startDateStr, endDateStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily metrics: %w", err)
	}
	defer metricsRows.Close()

	type metricsData struct {
		steps            int
		workoutCompleted bool
		workoutType      string
		workoutDuration  int
	}
	metricsByDate := make(map[string]*metricsData)

	for metricsRows.Next() {
		var d time.Time
		var m metricsData
		var steps sql.NullInt64
		var workoutCompleted sql.NullBool
		if err := metricsRows.Scan(&d, &steps, &workoutCompleted, &m.workoutType, &m.workoutDuration); err != nil {
			return nil, fmt.Errorf("failed to scan daily metrics: %w", err)
		}
		if steps.Valid {
			m.steps = int(steps.Int64)
		}
		if workoutCompleted.Valid {
			m.workoutCompleted = workoutCompleted.Bool
		}
		metricsByDate[d.Format("2006-01-02")] = &m
	}
	if err := metricsRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating daily metrics: %w", err)
	}

	// Get weekly photos
	photosQuery := `
		SELECT id, photo_url, week_start, week_end, uploaded_at
		FROM weekly_photos
		WHERE user_id = $1
		ORDER BY week_start DESC
		LIMIT 20
	`
	photoRows, err := s.db.QueryContext(ctx, photosQuery, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to query weekly photos: %w", err)
	}
	defer photoRows.Close()

	photos := make([]PhotoView, 0)
	for photoRows.Next() {
		var p PhotoView
		var weekStart, weekEnd, uploadedAt time.Time
		if err := photoRows.Scan(&p.ID, &p.PhotoURL, &weekStart, &weekEnd, &uploadedAt); err != nil {
			return nil, fmt.Errorf("failed to scan weekly photo: %w", err)
		}
		p.WeekStart = weekStart.Format("2006-01-02")
		p.WeekEnd = weekEnd.Format("2006-01-02")
		p.UploadedAt = uploadedAt.Format(time.RFC3339)
		photos = append(photos, p)
	}
	if err := photoRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating weekly photos: %w", err)
	}

	// Get current weekly plan
	planQuery := `
		SELECT calories_goal, protein_goal, fat_goal, carbs_goal
		FROM weekly_plans
		WHERE user_id = $1 AND start_date <= $2 AND end_date >= $2 AND is_active = true
		ORDER BY start_date DESC
		LIMIT 1
	`

	var planCal, planProtein sql.NullFloat64
	var planFat, planCarbs sql.NullFloat64
	var weeklyPlan *PlanKBZHU

	err = s.db.QueryRowContext(ctx, planQuery, clientID, today).Scan(
		&planCal, &planProtein, &planFat, &planCarbs,
	)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to query weekly plan: %w", err)
	}
	if err == nil && planCal.Valid {
		weeklyPlan = &PlanKBZHU{
			Calories: planCal.Float64,
			Protein:  planProtein.Float64,
			Fat:      planFat.Float64,
			Carbs:    planCarbs.Float64,
		}
	}

	// Get weight history (last 8 weeks)
	historyQuery := `
		SELECT date, weight FROM daily_metrics
		WHERE user_id = $1 AND weight IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '56 days'
		ORDER BY date ASC
	`
	historyRows, err := s.db.QueryContext(ctx, historyQuery, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to query weight history: %w", err)
	}
	defer historyRows.Close()

	weightHistory := make([]WeightHistoryPoint, 0)
	var lastWeight sql.NullFloat64
	for historyRows.Next() {
		var d time.Time
		var weight float64
		if err := historyRows.Scan(&d, &weight); err != nil {
			return nil, fmt.Errorf("failed to scan weight history: %w", err)
		}
		weightHistory = append(weightHistory, WeightHistoryPoint{
			Date:   d.Format("2006-01-02"),
			Weight: weight,
		})
		lastWeight = sql.NullFloat64{Float64: weight, Valid: true}
	}
	if err := historyRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating weight history: %w", err)
	}

	// Get unread count for this client
	unreadMap, err := s.getUnreadCounts(ctx, curatorID, []int64{clientID})
	if err != nil {
		s.log.Error("Failed to get unread counts", "error", err)
		unreadMap = make(map[int64]int)
	}

	// Build DayDetail for each date in range (newest first)
	dayDetails := make([]DayDetail, 0)
	for d := endDate; !d.Before(startDate); d = d.AddDate(0, 0, -1) {
		dateKey := d.Format("2006-01-02")

		entries := foodByDate[dateKey]
		if entries == nil {
			entries = make([]FoodEntryView, 0)
		}

		kbzhu := kbzhuByDate[dateKey]
		if kbzhu == nil {
			kbzhu = &DailyKBZHU{}
		}

		dayDetail := DayDetail{
			Date:        dateKey,
			KBZHU:       kbzhu,
			Plan:        weeklyPlan,
			Alerts:      computeAlerts(kbzhu, weeklyPlan),
			FoodEntries: entries,
			Water:       waterByDate[dateKey],
			Steps:       0,
		}

		if m := metricsByDate[dateKey]; m != nil {
			dayDetail.Steps = m.steps
			if m.workoutCompleted || m.workoutType != "" || m.workoutDuration > 0 {
				dayDetail.Workout = &WorkoutView{
					Completed: m.workoutCompleted,
					Type:      m.workoutType,
					Duration:  m.workoutDuration,
				}
			}
		}

		dayDetails = append(dayDetails, dayDetail)
	}

	// Set today's KBZHU and alerts for the ClientCard from today's data
	todayStr := today.Format("2006-01-02")
	todayKBZHU := kbzhuByDate[todayStr]
	if todayKBZHU == nil {
		todayKBZHU = &DailyKBZHU{}
	}
	todayAlerts := computeAlerts(todayKBZHU, weeklyPlan)

	detail := &ClientDetail{
		ClientCard: ClientCard{
			ID:                clientID,
			Name:              clientName,
			Email:             clientEmail,
			Timezone:          clientTimezone,
			TelegramUsername:  telegramUsername,
			InstagramUsername: instagramUsername,
			TodayKBZHU:        todayKBZHU,
			Plan:              weeklyPlan,
			Alerts:            todayAlerts,
			UnreadCount:       unreadMap[clientID],
		},
		Days:          dayDetails,
		WeeklyPlan:    weeklyPlan,
		WeightHistory: weightHistory,
		Photos:        photos,
	}

	if avatarURL.Valid {
		detail.AvatarURL = avatarURL.String
	}

	if clientHeight.Valid {
		h := clientHeight.Float64
		detail.Height = &h
	}

	if lastWeight.Valid {
		w := lastWeight.Float64
		detail.LastWeight = &w
	}

	if targetWeight.Valid {
		w := targetWeight.Float64
		detail.TargetWeight = &w
	}

	if waterGoal.Valid {
		g := int(waterGoal.Int64)
		detail.WaterGoal = &g
	}

	if birthDate.Valid {
		s := birthDate.String
		detail.BirthDate = &s
	}
	if biologicalSex.Valid {
		s := biologicalSex.String
		detail.BiologicalSex = &s
	}
	if activityLevel.Valid {
		s := activityLevel.String
		detail.ActivityLevel = &s
	}
	if fitnessGoal.Valid {
		s := fitnessGoal.String
		detail.FitnessGoal = &s
	}

	s.log.LogDatabaseQuery("GetClientDetail", time.Since(startTime), nil, map[string]interface{}{
		"curator_id":  curatorID,
		"client_id":   clientID,
		"start_date":  startDateStr,
		"end_date":    endDateStr,
		"days_count":  len(dayDetails),
		"has_plan":    weeklyPlan != nil,
		"has_weight":  lastWeight.Valid,
		"alert_count": len(todayAlerts),
		"photo_count": len(photos),
	})

	return detail, nil
}

// getUnreadCounts returns unread message counts per client for the given curator
func (s *Service) getUnreadCounts(ctx context.Context, curatorID int64, clientIDs []int64) (map[int64]int, error) {
	result := make(map[int64]int)

	if len(clientIDs) == 0 {
		return result, nil
	}

	// Query unread messages: count messages in conversations with each client
	// that were sent after the curator's last_read_at
	unreadQuery := `
		SELECT c.client_id, COUNT(m.id) AS unread_count
		FROM conversations c
		JOIN messages m ON m.conversation_id = c.id AND m.sender_id != $1
		LEFT JOIN message_read_status mrs ON mrs.conversation_id = c.id AND mrs.user_id = $1
		WHERE c.curator_id = $1
		  AND (mrs.last_read_at IS NULL OR m.created_at > mrs.last_read_at)
		GROUP BY c.client_id
	`

	rows, err := s.db.QueryContext(ctx, unreadQuery, curatorID)
	if err != nil {
		return nil, fmt.Errorf("failed to query unread counts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var clientID int64
		var count int
		if err := rows.Scan(&clientID, &count); err != nil {
			return nil, fmt.Errorf("failed to scan unread count: %w", err)
		}
		result[clientID] = count
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating unread counts: %w", err)
	}

	return result, nil
}

// computeAlerts computes nutrition deviation alerts for a client
func computeAlerts(today *DailyKBZHU, plan *PlanKBZHU) []Alert {
	alerts := make([]Alert, 0)

	if plan == nil || today == nil {
		return alerts
	}

	// Check if no food entries today (all zeros)
	if today.Calories == 0 && today.Protein == 0 && today.Fat == 0 && today.Carbs == 0 {
		alerts = append(alerts, Alert{
			Level:   "yellow",
			Message: "Нет записей о питании за сегодня",
		})
		return alerts
	}

	// Red: calories < 50% or > 120% of plan
	if plan.Calories > 0 {
		ratio := today.Calories / plan.Calories
		if ratio < 0.5 {
			alerts = append(alerts, Alert{
				Level:   "red",
				Message: fmt.Sprintf("Калории значительно ниже нормы: %.0f из %.0f (%.0f%%)", today.Calories, plan.Calories, ratio*100),
			})
		} else if ratio > 1.2 {
			alerts = append(alerts, Alert{
				Level:   "red",
				Message: fmt.Sprintf("Калории значительно выше нормы: %.0f из %.0f (%.0f%%)", today.Calories, plan.Calories, ratio*100),
			})
		}
	}

	// Yellow: protein deviation > 30% from plan
	if plan.Protein > 0 {
		deviation := abs((today.Protein - plan.Protein) / plan.Protein)
		if deviation > 0.3 {
			alerts = append(alerts, Alert{
				Level:   "yellow",
				Message: fmt.Sprintf("Белок отклоняется от нормы: %.0f из %.0f", today.Protein, plan.Protein),
			})
		}
	}

	// Yellow: fat deviation > 30% from plan
	if plan.Fat > 0 {
		deviation := abs((today.Fat - plan.Fat) / plan.Fat)
		if deviation > 0.3 {
			alerts = append(alerts, Alert{
				Level:   "yellow",
				Message: fmt.Sprintf("Жиры отклоняются от нормы: %.0f из %.0f", today.Fat, plan.Fat),
			})
		}
	}

	return alerts
}

// hasPriorityAlerts checks if a client card has red/yellow alerts or unread messages
func hasPriorityAlerts(card ClientCard) bool {
	if card.UnreadCount > 0 {
		return true
	}
	for _, alert := range card.Alerts {
		if alert.Level == "red" || alert.Level == "yellow" {
			return true
		}
	}
	return false
}

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// getWeightData returns last weight and trend for a list of clients
func (s *Service) getWeightData(ctx context.Context, clientIDs []int64) (map[int64]*float64, map[int64]string) {
	weightMap := make(map[int64]*float64)
	trendMap := make(map[int64]string)

	if len(clientIDs) == 0 {
		return weightMap, trendMap
	}

	// Get last 2 weight entries per client to compute trend
	inClause, args := buildPlaceholders(clientIDs, 0)
	query := fmt.Sprintf(`
		SELECT user_id, weight, date FROM (
			SELECT user_id, weight, date,
				ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC) as rn
			FROM daily_metrics
			WHERE user_id IN %s AND weight IS NOT NULL
		) sub WHERE rn <= 2
		ORDER BY user_id, date DESC
	`, inClause)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query weight data for clients", "error", err)
		return weightMap, trendMap
	}
	defer rows.Close()

	type weightEntry struct {
		weight float64
		rank   int
	}
	clientWeights := make(map[int64][]weightEntry)

	for rows.Next() {
		var userID int64
		var weight float64
		var date time.Time
		if err := rows.Scan(&userID, &weight, &date); err != nil {
			continue
		}
		clientWeights[userID] = append(clientWeights[userID], weightEntry{weight: weight})
	}

	for userID, entries := range clientWeights {
		if len(entries) > 0 {
			w := entries[0].weight
			weightMap[userID] = &w
		}
		if len(entries) >= 2 {
			if entries[0].weight < entries[1].weight {
				trendMap[userID] = "down"
			} else if entries[0].weight > entries[1].weight {
				trendMap[userID] = "up"
			} else {
				trendMap[userID] = "stable"
			}
		}
	}

	return weightMap, trendMap
}

// getTargetWeights returns target weights for a list of clients
func (s *Service) getTargetWeights(ctx context.Context, clientIDs []int64) map[int64]*float64 {
	result := make(map[int64]*float64)

	if len(clientIDs) == 0 {
		return result
	}

	inClause, args := buildPlaceholders(clientIDs, 0)
	query := fmt.Sprintf(`SELECT user_id, target_weight FROM user_settings WHERE user_id IN %s AND target_weight IS NOT NULL`, inClause)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query target weights", "error", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var weight float64
		if err := rows.Scan(&userID, &weight); err != nil {
			continue
		}
		w := weight
		result[userID] = &w
	}

	return result
}

// getTodayWater returns today's water intake for a list of clients
func (s *Service) getTodayWater(ctx context.Context, clientIDs []int64) map[int64]*WaterView {
	result := make(map[int64]*WaterView)

	if len(clientIDs) == 0 {
		return result
	}

	inClause, args := buildPlaceholders(clientIDs, 0)
	query := fmt.Sprintf(`SELECT user_id, glasses, goal, glass_size FROM water_logs WHERE user_id IN %s AND date = CURRENT_DATE`, inClause)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query today water", "error", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var w WaterView
		if err := rows.Scan(&userID, &w.Glasses, &w.Goal, &w.GlassSize); err != nil {
			continue
		}
		result[userID] = &w
	}

	return result
}

// SetTargetWeight sets the target weight for a client
func (s *Service) SetTargetWeight(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
	// Verify curator-client relationship
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM curator_client_relationships WHERE curator_id = $1 AND client_id = $2 AND status = 'active')`,
		curatorID, clientID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to verify relationship: %w", err)
	}
	if !exists {
		return fmt.Errorf("unauthorized")
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO user_settings (user_id, target_weight, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE SET target_weight = $2, updated_at = NOW()`,
		clientID, targetWeight,
	)
	if err != nil {
		return fmt.Errorf("failed to set target weight: %w", err)
	}

	return nil
}

// verifyRelationship checks that an active curator-client relationship exists
func (s *Service) verifyRelationship(ctx context.Context, curatorID, clientID int64) error {
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM curator_client_relationships WHERE curator_id = $1 AND client_id = $2 AND status = 'active')`,
		curatorID, clientID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to verify relationship: %w", err)
	}
	if !exists {
		return fmt.Errorf("unauthorized: no active relationship between curator %d and client %d", curatorID, clientID)
	}
	return nil
}

// CreateWeeklyPlan creates a new weekly plan for a client, deactivating any existing active plans
func (s *Service) CreateWeeklyPlan(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	// Validate dates
	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		return nil, fmt.Errorf("invalid start_date format: %w", err)
	}
	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		return nil, fmt.Errorf("invalid end_date format: %w", err)
	}
	if endDate.Before(startDate) {
		return nil, fmt.Errorf("end_date must be after start_date")
	}

	// Deactivate existing active plans for this client
	_, err = s.db.ExecContext(ctx,
		`UPDATE weekly_plans SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true`,
		clientID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deactivate existing plans: %w", err)
	}

	// Insert new plan
	var planID string
	var createdAt time.Time
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO weekly_plans (user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, start_date, end_date, comment, is_active, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $2)
		 RETURNING id, created_at`,
		clientID, curatorID, req.Calories, req.Protein, req.Fat, req.Carbs,
		req.StartDate, req.EndDate, req.Comment,
	).Scan(&planID, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create weekly plan: %w", err)
	}

	s.log.LogDatabaseQuery("CreateWeeklyPlan", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"plan_id":    planID,
	})

	plan := &WeeklyPlanView{
		ID:        planID,
		Calories:  req.Calories,
		Protein:   req.Protein,
		Fat:       req.Fat,
		Carbs:     req.Carbs,
		StartDate: startDate.Format("2006-01-02"),
		EndDate:   endDate.Format("2006-01-02"),
		Comment:   req.Comment,
		IsActive:  true,
		CreatedAt: createdAt.Format(time.RFC3339),
	}

	// Send notification to client
	s.sendPlanUpdatedNotification(ctx, clientID, plan)

	return plan, nil
}

// UpdateWeeklyPlan updates an existing weekly plan for a client
func (s *Service) UpdateWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	// Build dynamic SET clause
	setClauses := []string{"updated_at = NOW()"}
	args := []any{}
	argIdx := 1

	if req.Calories != nil {
		setClauses = append(setClauses, fmt.Sprintf("calories_goal = $%d", argIdx))
		args = append(args, *req.Calories)
		argIdx++
	}
	if req.Protein != nil {
		setClauses = append(setClauses, fmt.Sprintf("protein_goal = $%d", argIdx))
		args = append(args, *req.Protein)
		argIdx++
	}
	if req.Fat != nil {
		setClauses = append(setClauses, fmt.Sprintf("fat_goal = $%d", argIdx))
		args = append(args, *req.Fat)
		argIdx++
	}
	if req.Carbs != nil {
		setClauses = append(setClauses, fmt.Sprintf("carbs_goal = $%d", argIdx))
		args = append(args, *req.Carbs)
		argIdx++
	}
	if req.Comment != nil {
		setClauses = append(setClauses, fmt.Sprintf("comment = $%d", argIdx))
		args = append(args, *req.Comment)
		argIdx++
	}

	// Add WHERE clause args
	args = append(args, planID, curatorID)

	query := fmt.Sprintf(
		`UPDATE weekly_plans SET %s WHERE id = $%d AND curator_id = $%d
		 RETURNING id, calories_goal, protein_goal, fat_goal, carbs_goal, start_date, end_date, comment, is_active, created_at`,
		strings.Join(setClauses, ", "), argIdx, argIdx+1,
	)

	var plan WeeklyPlanView
	var startDate, endDate time.Time
	var createdAt time.Time
	var comment sql.NullString

	err := s.db.QueryRowContext(ctx, query, args...).Scan(
		&plan.ID, &plan.Calories, &plan.Protein, &plan.Fat, &plan.Carbs,
		&startDate, &endDate, &comment, &plan.IsActive, &createdAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("weekly plan not found")
		}
		return nil, fmt.Errorf("failed to update weekly plan: %w", err)
	}

	plan.StartDate = startDate.Format("2006-01-02")
	plan.EndDate = endDate.Format("2006-01-02")
	plan.CreatedAt = createdAt.Format(time.RFC3339)
	if comment.Valid {
		plan.Comment = comment.String
	}

	s.log.LogDatabaseQuery("UpdateWeeklyPlan", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"plan_id":    planID,
	})

	// Send notification to client
	s.sendPlanUpdatedNotification(ctx, clientID, &plan)

	return &plan, nil
}

// DeleteWeeklyPlan deletes a weekly plan
func (s *Service) DeleteWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string) error {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`DELETE FROM weekly_plans WHERE id = $1 AND curator_id = $2`,
		planID, curatorID,
	)
	if err != nil {
		return fmt.Errorf("failed to delete weekly plan: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("weekly plan not found")
	}

	// Best-effort: delete related plan_updated notifications for this client
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM notifications WHERE user_id = $1 AND type = 'plan_updated'`,
		clientID,
	); err != nil {
		s.log.Error("Failed to delete plan notifications (best-effort)", "error", err, "plan_id", planID)
	}

	s.log.LogDatabaseQuery("DeleteWeeklyPlan", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"plan_id":    planID,
	})

	return nil
}

// GetWeeklyPlans returns all weekly plans for a client
func (s *Service) GetWeeklyPlans(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, calories_goal, protein_goal, fat_goal, carbs_goal,
		       start_date, end_date, comment, is_active, created_at
		FROM weekly_plans
		WHERE user_id = $1
		ORDER BY start_date DESC
		LIMIT 20
	`

	rows, err := s.db.QueryContext(ctx, query, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to query weekly plans: %w", err)
	}
	defer rows.Close()

	plans := make([]WeeklyPlanView, 0)
	for rows.Next() {
		var plan WeeklyPlanView
		var startDate, endDate time.Time
		var createdAt time.Time
		var comment sql.NullString

		if err := rows.Scan(
			&plan.ID, &plan.Calories, &plan.Protein, &plan.Fat, &plan.Carbs,
			&startDate, &endDate, &comment, &plan.IsActive, &createdAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan weekly plan: %w", err)
		}

		plan.StartDate = startDate.Format("2006-01-02")
		plan.EndDate = endDate.Format("2006-01-02")
		plan.CreatedAt = createdAt.Format(time.RFC3339)
		if comment.Valid {
			plan.Comment = comment.String
		}

		plans = append(plans, plan)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating weekly plans: %w", err)
	}

	s.log.LogDatabaseQuery("GetWeeklyPlans", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"count":      len(plans),
	})

	return plans, nil
}

// CreateTask creates a new task for a client
func (s *Service) CreateTask(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	// Validate deadline date format
	deadline, err := time.Parse("2006-01-02", req.Deadline)
	if err != nil {
		return nil, fmt.Errorf("invalid deadline format: %w", err)
	}

	// Compute week_number from deadline (ISO week)
	_, weekNumber := deadline.ISOWeek()

	// Format recurrence_days as PostgreSQL array literal
	var recurrenceDaysParam interface{}
	if len(req.RecurrenceDays) > 0 {
		parts := make([]string, len(req.RecurrenceDays))
		for i, d := range req.RecurrenceDays {
			parts[i] = strconv.Itoa(d)
		}
		recurrenceDaysParam = "{" + strings.Join(parts, ",") + "}"
	}

	var taskID string
	var createdAt time.Time
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO tasks (user_id, curator_id, title, description, type, due_date, recurrence, recurrence_days, week_number, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
		 RETURNING id, created_at`,
		clientID, curatorID, req.Title, req.Description, req.Type,
		req.Deadline, req.Recurrence, recurrenceDaysParam, weekNumber,
	).Scan(&taskID, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	s.log.LogDatabaseQuery("CreateTask", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"task_id":    taskID,
	})

	task := &TaskView{
		ID:             taskID,
		Title:          req.Title,
		Type:           req.Type,
		Description:    req.Description,
		Deadline:       deadline.Format("2006-01-02"),
		Recurrence:     req.Recurrence,
		RecurrenceDays: req.RecurrenceDays,
		Status:         "active",
		CreatedAt:      createdAt.Format(time.RFC3339),
	}

	// Send notification to client
	s.sendTaskAssignedNotification(ctx, clientID, task)

	return task, nil
}

// GetTasks returns tasks for a client with optional status filter
func (s *Service) GetTasks(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	// Build query with optional status filter
	query := `
		SELECT t.id, t.title, t.type, COALESCE(t.description, ''), t.due_date,
		       t.recurrence, t.recurrence_days, t.status, t.completed_at, t.created_at
		FROM tasks t
		WHERE t.user_id = $1 AND t.curator_id = $2
	`
	args := []any{clientID, curatorID}

	if status != "" {
		query += ` AND t.status = $3`
		args = append(args, status)
	}

	query += ` ORDER BY t.due_date DESC, t.created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	defer rows.Close()

	type taskRow struct {
		id             string
		title          string
		taskType       string
		description    string
		dueDate        time.Time
		recurrence     string
		recurrenceDays sql.NullString
		status         string
		completedAt    sql.NullTime
		createdAt      time.Time
	}

	var taskRows []taskRow
	taskIDs := make([]string, 0)

	for rows.Next() {
		var tr taskRow
		if err := rows.Scan(
			&tr.id, &tr.title, &tr.taskType, &tr.description, &tr.dueDate,
			&tr.recurrence, &tr.recurrenceDays, &tr.status, &tr.completedAt, &tr.createdAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		taskRows = append(taskRows, tr)
		taskIDs = append(taskIDs, tr.id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating tasks: %w", err)
	}

	// Get completions for all tasks (last 30 days)
	completionMap := make(map[string][]string)
	if len(taskIDs) > 0 {
		placeholders := make([]string, len(taskIDs))
		completionArgs := make([]any, len(taskIDs))
		for i, id := range taskIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			completionArgs[i] = id
		}

		completionQuery := fmt.Sprintf(`
			SELECT task_id, completed_date
			FROM task_completions
			WHERE task_id IN (%s) AND completed_date >= CURRENT_DATE - INTERVAL '30 days'
			ORDER BY completed_date DESC
		`, strings.Join(placeholders, ","))

		completionRows, err := s.db.QueryContext(ctx, completionQuery, completionArgs...)
		if err != nil {
			s.log.Error("Failed to query task completions", "error", err)
		} else {
			defer completionRows.Close()
			for completionRows.Next() {
				var taskID string
				var completedDate time.Time
				if err := completionRows.Scan(&taskID, &completedDate); err != nil {
					continue
				}
				completionMap[taskID] = append(completionMap[taskID], completedDate.Format("2006-01-02"))
			}
		}
	}

	// Build TaskView list
	today := time.Now().UTC().Truncate(24 * time.Hour)
	tasks := make([]TaskView, 0, len(taskRows))
	for _, tr := range taskRows {
		// Compute effective status for once-recurrence tasks
		effectiveStatus := tr.status
		if tr.recurrence == "once" {
			if tr.completedAt.Valid {
				effectiveStatus = "completed"
			} else if tr.dueDate.Before(today) && !tr.completedAt.Valid {
				effectiveStatus = "overdue"
			}
		}

		task := TaskView{
			ID:          tr.id,
			Title:       tr.title,
			Type:        tr.taskType,
			Description: tr.description,
			Deadline:    tr.dueDate.Format("2006-01-02"),
			Recurrence:  tr.recurrence,
			Status:      effectiveStatus,
			Completions: completionMap[tr.id],
			CreatedAt:   tr.createdAt.Format(time.RFC3339),
		}
		if tr.recurrenceDays.Valid {
			task.RecurrenceDays = parseIntArray(tr.recurrenceDays.String)
		}

		tasks = append(tasks, task)
	}

	s.log.LogDatabaseQuery("GetTasks", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"count":      len(tasks),
	})

	return tasks, nil
}

// UpdateTask updates an existing task for a client
func (s *Service) UpdateTask(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	// Build dynamic SET clause
	setClauses := []string{"updated_at = NOW()"}
	args := []any{}
	argIdx := 1

	if req.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Deadline != nil {
		// Validate deadline format
		deadline, err := time.Parse("2006-01-02", *req.Deadline)
		if err != nil {
			return nil, fmt.Errorf("invalid deadline format: %w", err)
		}
		setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", argIdx))
		args = append(args, *req.Deadline)
		argIdx++
		// Update week_number
		_, weekNumber := deadline.ISOWeek()
		setClauses = append(setClauses, fmt.Sprintf("week_number = $%d", argIdx))
		args = append(args, weekNumber)
		argIdx++
	}
	if req.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *req.Status)
		argIdx++
		// If marking as completed, set completed_at
		if *req.Status == "completed" {
			setClauses = append(setClauses, "completed_at = NOW()")
		}
	}

	// Add WHERE clause args
	args = append(args, taskID, curatorID)

	query := fmt.Sprintf(
		`UPDATE tasks SET %s WHERE id = $%d AND curator_id = $%d
		 RETURNING id, title, type, COALESCE(description, ''), due_date, recurrence, recurrence_days, status, created_at`,
		strings.Join(setClauses, ", "), argIdx, argIdx+1,
	)

	var task TaskView
	var dueDate time.Time
	var createdAt time.Time
	var recurrenceDays sql.NullString

	err := s.db.QueryRowContext(ctx, query, args...).Scan(
		&task.ID, &task.Title, &task.Type, &task.Description, &dueDate,
		&task.Recurrence, &recurrenceDays, &task.Status, &createdAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("task not found")
		}
		return nil, fmt.Errorf("failed to update task: %w", err)
	}

	task.Deadline = dueDate.Format("2006-01-02")
	task.CreatedAt = createdAt.Format(time.RFC3339)
	if recurrenceDays.Valid {
		task.RecurrenceDays = parseIntArray(recurrenceDays.String)
	}

	s.log.LogDatabaseQuery("UpdateTask", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"task_id":    taskID,
	})

	return &task, nil
}

// DeleteTask deletes a task
func (s *Service) DeleteTask(ctx context.Context, curatorID, clientID int64, taskID string) error {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`DELETE FROM tasks WHERE id = $1 AND curator_id = $2`,
		taskID, curatorID,
	)
	if err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("task not found")
	}

	// Best-effort: delete related notifications
	actionURL := fmt.Sprintf("/dashboard?task=%s", taskID)
	if _, err := s.db.ExecContext(ctx, `DELETE FROM notifications WHERE action_url = $1`, actionURL); err != nil {
		s.log.Error("Failed to delete task notifications (best-effort)", "error", err, "task_id", taskID)
	}

	s.log.LogDatabaseQuery("DeleteTask", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"task_id":    taskID,
	})

	return nil
}

// SetWaterGoal sets the water goal for a client
func (s *Service) SetWaterGoal(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error {
	// Verify curator-client relationship
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM curator_client_relationships WHERE curator_id = $1 AND client_id = $2 AND status = 'active')`,
		curatorID, clientID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to verify relationship: %w", err)
	}
	if !exists {
		return fmt.Errorf("unauthorized")
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO user_settings (user_id, water_goal, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE SET water_goal = $2, updated_at = NOW()`,
		clientID, waterGoal,
	)
	if err != nil {
		return fmt.Errorf("failed to set water goal: %w", err)
	}

	return nil
}

// SubmitFeedback submits structured feedback for a weekly report
func (s *Service) SubmitFeedback(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return err
	}

	feedbackJSON, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal feedback: %w", err)
	}

	query := `UPDATE weekly_reports SET curator_feedback = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2 AND curator_id = $3`
	result, err := s.db.ExecContext(ctx, query, feedbackJSON, reportID, curatorID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"report_id":  reportID,
		})
		return fmt.Errorf("failed to submit feedback: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("weekly report not found")
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"report_id":  reportID,
	})

	// Send notification to client
	s.sendFeedbackReceivedNotification(ctx, clientID, reportID)

	return nil
}

// GetWeeklyReports returns weekly reports for a client
func (s *Service) GetWeeklyReports(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error) {
	startTime := time.Now()

	if err := s.verifyRelationship(ctx, curatorID, clientID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, week_start, week_end, week_number, summary, submitted_at, curator_feedback
		FROM weekly_reports
		WHERE user_id = $1
		ORDER BY week_start DESC
		LIMIT 20
	`

	rows, err := s.db.QueryContext(ctx, query, clientID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"curator_id": curatorID,
			"client_id":  clientID,
		})
		return nil, fmt.Errorf("failed to query weekly reports: %w", err)
	}
	defer rows.Close()

	var reports []WeeklyReportView
	for rows.Next() {
		var r WeeklyReportView
		var weekStart, weekEnd time.Time
		var submittedAt sql.NullTime
		var summary sql.NullString
		var curatorFeedback sql.NullString

		if err := rows.Scan(&r.ID, &weekStart, &weekEnd, &r.WeekNumber, &summary, &submittedAt, &curatorFeedback); err != nil {
			return nil, fmt.Errorf("failed to scan weekly report: %w", err)
		}

		r.WeekStart = weekStart.Format("2006-01-02")
		r.WeekEnd = weekEnd.Format("2006-01-02")
		if submittedAt.Valid {
			r.SubmittedAt = submittedAt.Time.Format(time.RFC3339)
		}
		if summary.Valid {
			r.Summary = json.RawMessage(summary.String)
		}
		if curatorFeedback.Valid {
			raw := json.RawMessage(curatorFeedback.String)
			r.CuratorFeedback = &raw
			r.HasFeedback = true
		}

		reports = append(reports, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate weekly reports: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"client_id":  clientID,
		"count":      len(reports),
	})

	if reports == nil {
		reports = []WeeklyReportView{}
	}

	return reports, nil
}

// getActiveClientIDs returns all active client IDs for a curator
func (s *Service) getActiveClientIDs(ctx context.Context, curatorID int64) ([]int64, error) {
	query := `SELECT client_id FROM curator_client_relationships WHERE curator_id = $1 AND status = 'active'`
	rows, err := s.db.QueryContext(ctx, query, curatorID)
	if err != nil {
		return nil, fmt.Errorf("failed to query active clients: %w", err)
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to scan client id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// getActiveTaskCounts returns active and overdue task counts per client for the given curator
func (s *Service) getActiveTaskCounts(ctx context.Context, curatorID int64, clientIDs []int64) (activeMap map[int64]int, overdueMap map[int64]int) {
	activeMap = make(map[int64]int)
	overdueMap = make(map[int64]int)

	if len(clientIDs) == 0 {
		return
	}

	inClause, args := buildPlaceholders(clientIDs, 1)
	query := fmt.Sprintf(`
		SELECT user_id,
			COUNT(*) FILTER (WHERE status = 'active') AS active_count,
			COUNT(*) FILTER (WHERE status = 'active' AND due_date < CURRENT_DATE AND completed_at IS NULL) AS overdue_count
		FROM tasks
		WHERE curator_id = $1 AND user_id IN %s
		GROUP BY user_id
	`, inClause)

	allArgs := append([]any{curatorID}, args...)
	rows, err := s.db.QueryContext(ctx, query, allArgs...)
	if err != nil {
		s.log.Error("Failed to query task counts", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var active, overdue int
		if err := rows.Scan(&userID, &active, &overdue); err != nil {
			continue
		}
		activeMap[userID] = active
		overdueMap[userID] = overdue
	}
	return
}

// getWeeklyKBZHUPercent returns the weekly KBZHU percent per client (Mon-today actual/plan * 100)
func (s *Service) getWeeklyKBZHUPercent(ctx context.Context, clientIDs []int64) map[int64]*float64 {
	result := make(map[int64]*float64)
	if len(clientIDs) == 0 {
		return result
	}

	inClause, args := buildPlaceholders(clientIDs, 0)
	query := fmt.Sprintf(`
		SELECT fe.user_id,
			SUM(fe.calories) AS actual_cal,
			wp.calories_goal * (EXTRACT(DOW FROM CURRENT_DATE) - EXTRACT(DOW FROM date_trunc('week', CURRENT_DATE))::int + 1) AS plan_cal_total
		FROM food_entries fe
		JOIN weekly_plans wp ON wp.user_id = fe.user_id
			AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
			AND wp.is_active = true
		WHERE fe.user_id IN %s
			AND fe.date >= date_trunc('week', CURRENT_DATE)::date
			AND fe.date <= CURRENT_DATE
		GROUP BY fe.user_id, wp.calories_goal
	`, inClause)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query weekly kbzhu percent", "error", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var actualCal, planCalTotal float64
		if err := rows.Scan(&userID, &actualCal, &planCalTotal); err != nil {
			continue
		}
		if planCalTotal > 0 {
			pct := actualCal / planCalTotal * 100
			result[userID] = &pct
		}
	}
	return result
}

// getLastActivityDates returns the last food entry date per client
func (s *Service) getLastActivityDates(ctx context.Context, clientIDs []int64) map[int64]*string {
	result := make(map[int64]*string)
	if len(clientIDs) == 0 {
		return result
	}

	inClause, args := buildPlaceholders(clientIDs, 0)
	query := fmt.Sprintf(`SELECT user_id, MAX(date) FROM food_entries WHERE user_id IN %s GROUP BY user_id`, inClause)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query last activity dates", "error", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var d time.Time
		if err := rows.Scan(&userID, &d); err != nil {
			continue
		}
		ds := d.Format("2006-01-02")
		result[userID] = &ds
	}
	return result
}

// getStreakDays returns consecutive days of food entries ending today per client
func (s *Service) getStreakDays(ctx context.Context, clientIDs []int64) map[int64]int {
	result := make(map[int64]int)
	if len(clientIDs) == 0 {
		return result
	}

	inClause, args := buildPlaceholders(clientIDs, 0)
	// Get distinct dates per client for the last 60 days
	query := fmt.Sprintf(`
		SELECT user_id, date FROM food_entries
		WHERE user_id IN %s AND date >= CURRENT_DATE - INTERVAL '60 days' AND date <= CURRENT_DATE
		GROUP BY user_id, date
		ORDER BY user_id, date DESC
	`, inClause)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to query streak days", "error", err)
		return result
	}
	defer rows.Close()

	// Build per-client date lists
	clientDates := make(map[int64][]time.Time)
	for rows.Next() {
		var userID int64
		var d time.Time
		if err := rows.Scan(&userID, &d); err != nil {
			continue
		}
		clientDates[userID] = append(clientDates[userID], d.Truncate(24*time.Hour))
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	for userID, dates := range clientDates {
		// dates are sorted desc; count consecutive from today
		streak := 0
		expected := today
		for _, d := range dates {
			if d.Equal(expected) {
				streak++
				expected = expected.AddDate(0, 0, -1)
			} else if d.Before(expected) {
				break
			}
		}
		result[userID] = streak
	}
	return result
}

// GetAnalytics returns aggregate analytics summary for a curator
func (s *Service) GetAnalytics(ctx context.Context, curatorID int64) (*AnalyticsSummary, error) {
	startTime := time.Now()
	summary := &AnalyticsSummary{}

	// Total active clients
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM curator_client_relationships WHERE curator_id = $1 AND status = 'active'`,
		curatorID,
	).Scan(&summary.TotalClients)
	if err != nil {
		return nil, fmt.Errorf("failed to count clients: %w", err)
	}

	if summary.TotalClients == 0 {
		return summary, nil
	}

	// Get client IDs
	clientIDs, err := s.getActiveClientIDs(ctx, curatorID)
	if err != nil {
		return nil, err
	}

	// Attention clients: count clients with red/yellow alert conditions
	// (today's calories <50% or >120% of plan, or no food entries with a plan)
	inClause, args := buildPlaceholders(clientIDs, 0)
	attentionQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT sub.client_id) FROM (
			SELECT u.id AS client_id,
				COALESCE(SUM(fe.calories), 0) AS today_cal,
				wp.calories_goal AS plan_cal
			FROM users u
			LEFT JOIN food_entries fe ON fe.user_id = u.id AND fe.date = CURRENT_DATE
			LEFT JOIN weekly_plans wp ON wp.user_id = u.id
				AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
				AND wp.is_active = true
			WHERE u.id IN %s
			GROUP BY u.id, wp.calories_goal
		) sub
		WHERE sub.plan_cal IS NOT NULL AND sub.plan_cal > 0
			AND (sub.today_cal < sub.plan_cal * 0.5 OR sub.today_cal > sub.plan_cal * 1.2
				OR (sub.today_cal = 0))
	`, inClause)
	err = s.db.QueryRowContext(ctx, attentionQuery, args...).Scan(&summary.AttentionClients)
	if err != nil {
		s.log.Error("Failed to count attention clients", "error", err)
	}

	// Avg KBZHU percent across all clients this week
	avgQuery := fmt.Sprintf(`
		SELECT COALESCE(AVG(sub.pct), 0) FROM (
			SELECT fe.user_id, SUM(fe.calories) / NULLIF(wp.calories_goal * COUNT(DISTINCT fe.date), 0) * 100 AS pct
			FROM food_entries fe
			JOIN weekly_plans wp ON wp.user_id = fe.user_id
				AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
				AND wp.is_active = true
			WHERE fe.user_id IN %s
				AND fe.date >= date_trunc('week', CURRENT_DATE)::date
				AND fe.date <= CURRENT_DATE
			GROUP BY fe.user_id, wp.calories_goal
		) sub
	`, inClause)
	err = s.db.QueryRowContext(ctx, avgQuery, args...).Scan(&summary.AvgKBZHUPercent)
	if err != nil {
		s.log.Error("Failed to compute avg kbzhu percent", "error", err)
	}

	// Unread messages
	unreadMap, err := s.getUnreadCounts(ctx, curatorID, clientIDs)
	if err != nil {
		s.log.Error("Failed to get unread counts for analytics", "error", err)
	} else {
		for _, count := range unreadMap {
			summary.TotalUnread += count
			if count > 0 {
				summary.ClientsWaiting++
			}
		}
	}

	// Task counts
	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tasks WHERE curator_id = $1 AND status = 'active'`,
		curatorID,
	).Scan(&summary.ActiveTasks)
	if err != nil {
		s.log.Error("Failed to count active tasks", "error", err)
	}

	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tasks WHERE curator_id = $1 AND status = 'active' AND due_date < CURRENT_DATE AND completed_at IS NULL`,
		curatorID,
	).Scan(&summary.OverdueTasks)
	if err != nil {
		s.log.Error("Failed to count overdue tasks", "error", err)
	}

	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE t.curator_id = $1 AND tc.completed_date = CURRENT_DATE`,
		curatorID,
	).Scan(&summary.CompletedToday)
	if err != nil {
		s.log.Error("Failed to count completed today", "error", err)
	}

	s.log.LogDatabaseQuery("GetAnalytics", time.Since(startTime), nil, map[string]interface{}{
		"curator_id":    curatorID,
		"total_clients": summary.TotalClients,
	})

	return summary, nil
}

// GetAttentionList returns a prioritized list of items requiring curator attention
func (s *Service) GetAttentionList(ctx context.Context, curatorID int64) ([]AttentionItem, error) {
	startTime := time.Now()

	clientIDs, err := s.getActiveClientIDs(ctx, curatorID)
	if err != nil {
		return nil, err
	}

	if len(clientIDs) == 0 {
		return []AttentionItem{}, nil
	}

	// Build a map of client info (name, avatar)
	type clientInfo struct {
		name   string
		avatar string
	}
	clientInfoMap := make(map[int64]clientInfo)
	inClause, args := buildPlaceholders(clientIDs, 0)

	infoQuery := fmt.Sprintf(`SELECT id, COALESCE(name, ''), COALESCE(avatar_url, '') FROM users WHERE id IN %s`, inClause)
	infoRows, err := s.db.QueryContext(ctx, infoQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query client info: %w", err)
	}
	defer infoRows.Close()
	for infoRows.Next() {
		var id int64
		var info clientInfo
		if err := infoRows.Scan(&id, &info.name, &info.avatar); err != nil {
			continue
		}
		clientInfoMap[id] = info
	}

	items := make([]AttentionItem, 0)

	// Priority 1: Red alerts — calories <50% or >120% of plan (curator plan or auto-calculated)
	alertQuery := fmt.Sprintf(`
		SELECT u.id,
			COALESCE(SUM(fe.calories), 0) AS today_cal,
			COALESCE(wp.calories_goal, dct.calories) AS plan_cal
		FROM users u
		LEFT JOIN food_entries fe ON fe.user_id = u.id AND fe.date = CURRENT_DATE
		LEFT JOIN weekly_plans wp ON wp.user_id = u.id
			AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
			AND wp.is_active = true
		LEFT JOIN daily_calculated_targets dct ON dct.user_id = u.id
			AND dct.date = CURRENT_DATE
		WHERE u.id IN %s
		GROUP BY u.id, wp.calories_goal, dct.calories
	`, inClause)
	alertRows, err := s.db.QueryContext(ctx, alertQuery, args...)
	if err != nil {
		s.log.Error("Failed to query attention alerts", "error", err)
	} else {
		defer alertRows.Close()
		for alertRows.Next() {
			var clientID int64
			var todayCal float64
			var planCal sql.NullFloat64
			if err := alertRows.Scan(&clientID, &todayCal, &planCal); err != nil {
				continue
			}
			if !planCal.Valid || planCal.Float64 == 0 {
				continue
			}
			ratio := todayCal / planCal.Float64
			info := clientInfoMap[clientID]
			if ratio < 0.5 {
				items = append(items, AttentionItem{
					ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
					Reason:   AttentionReasonRedAlert,
					Detail:   fmt.Sprintf("Калории: %.0f из %.0f (%.0f%%)", todayCal, planCal.Float64, ratio*100),
					Priority: 1, ActionURL: fmt.Sprintf("/curator/clients/%d", clientID),
				})
			} else if ratio > 1.2 {
				items = append(items, AttentionItem{
					ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
					Reason:   AttentionReasonRedAlert,
					Detail:   fmt.Sprintf("Калории: %.0f из %.0f (%.0f%%)", todayCal, planCal.Float64, ratio*100),
					Priority: 1, ActionURL: fmt.Sprintf("/curator/clients/%d", clientID),
				})
			}
		}
	}

	// Priority 2: Overdue tasks
	overdueQuery := fmt.Sprintf(`
		SELECT t.user_id, t.title, t.due_date
		FROM tasks t
		WHERE t.curator_id = $1 AND t.status = 'active' AND t.due_date < CURRENT_DATE AND t.completed_at IS NULL
			AND t.user_id IN %s
		ORDER BY t.due_date ASC
		LIMIT 20
	`, inClause)
	overdueArgs := append([]any{curatorID}, args...)
	overdueRows, err := s.db.QueryContext(ctx, overdueQuery, overdueArgs...)
	if err != nil {
		s.log.Error("Failed to query overdue tasks", "error", err)
	} else {
		defer overdueRows.Close()
		for overdueRows.Next() {
			var clientID int64
			var title string
			var dueDate time.Time
			if err := overdueRows.Scan(&clientID, &title, &dueDate); err != nil {
				continue
			}
			info := clientInfoMap[clientID]
			items = append(items, AttentionItem{
				ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
				Reason:   AttentionReasonOverdueTask,
				Detail:   fmt.Sprintf("Просрочено: %s (дедлайн %s)", title, dueDate.Format("02.01")),
				Priority: 2, ActionURL: fmt.Sprintf("/curator/clients/%d", clientID),
			})
		}
	}

	// Priority 3: Inactive clients (no food entries in last 2 days)
	inactiveQuery := fmt.Sprintf(`
		SELECT u.id FROM users u
		WHERE u.id IN %s
			AND NOT EXISTS (
				SELECT 1 FROM food_entries fe
				WHERE fe.user_id = u.id AND fe.date >= CURRENT_DATE - INTERVAL '1 day'
			)
	`, inClause)
	inactiveRows, err := s.db.QueryContext(ctx, inactiveQuery, args...)
	if err != nil {
		s.log.Error("Failed to query inactive clients", "error", err)
	} else {
		defer inactiveRows.Close()
		for inactiveRows.Next() {
			var clientID int64
			if err := inactiveRows.Scan(&clientID); err != nil {
				continue
			}
			info := clientInfoMap[clientID]
			items = append(items, AttentionItem{
				ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
				Reason:   AttentionReasonInactive,
				Detail:   "Нет записей о питании более 2 дней",
				Priority: 3, ActionURL: fmt.Sprintf("/curator/clients/%d", clientID),
			})
		}
	}

	// Priority 4: Unread messages
	unreadMap, err := s.getUnreadCounts(ctx, curatorID, clientIDs)
	if err != nil {
		s.log.Error("Failed to get unread counts for attention", "error", err)
	} else {
		for clientID, count := range unreadMap {
			if count > 0 {
				info := clientInfoMap[clientID]
				items = append(items, AttentionItem{
					ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
					Reason:   AttentionReasonUnreadMessage,
					Detail:   fmt.Sprintf("Непрочитанных сообщений: %d", count),
					Priority: 4, ActionURL: fmt.Sprintf("/curator/chat/%d", clientID),
				})
			}
		}
	}

	// Priority 5: Awaiting feedback on weekly reports
	feedbackQuery := fmt.Sprintf(`
		SELECT wr.user_id, wr.week_start
		FROM weekly_reports wr
		WHERE wr.curator_id = $1 AND wr.curator_feedback IS NULL AND wr.submitted_at IS NOT NULL
			AND wr.user_id IN %s
		ORDER BY wr.submitted_at ASC
		LIMIT 20
	`, inClause)
	feedbackArgs := append([]any{curatorID}, args...)
	feedbackRows, err := s.db.QueryContext(ctx, feedbackQuery, feedbackArgs...)
	if err != nil {
		s.log.Error("Failed to query awaiting feedback", "error", err)
	} else {
		defer feedbackRows.Close()
		for feedbackRows.Next() {
			var clientID int64
			var weekStart time.Time
			if err := feedbackRows.Scan(&clientID, &weekStart); err != nil {
				continue
			}
			info := clientInfoMap[clientID]
			items = append(items, AttentionItem{
				ClientID: clientID, ClientName: info.name, ClientAvatar: info.avatar,
				Reason:   AttentionReasonAwaitingFeedback,
				Detail:   fmt.Sprintf("Отчёт за неделю %s ожидает обратной связи", weekStart.Format("02.01")),
				Priority: 5, ActionURL: fmt.Sprintf("/curator/clients/%d", clientID),
			})
		}
	}

	// Sort by priority ascending, then by client name
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Priority != items[j].Priority {
			return items[i].Priority < items[j].Priority
		}
		return items[i].ClientName < items[j].ClientName
	})

	// Limit to 20
	if len(items) > 20 {
		items = items[:20]
	}

	s.log.LogDatabaseQuery("GetAttentionList", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"count":      len(items),
	})

	return items, nil
}

// sendPlanUpdatedNotification sends a plan_updated notification to the client
func (s *Service) sendPlanUpdatedNotification(ctx context.Context, clientID int64, plan *WeeklyPlanView) {
	if s.notificationsSvc == nil {
		return
	}

	actionURL := "/dashboard"
	notification := &notifications.Notification{
		UserID:    clientID,
		Category:  notifications.CategoryMain,
		Type:      notifications.TypePlanUpdated,
		Title:     "Обновлен план питания",
		Content:   "Ваш куратор обновил план питания на эту неделю",
		ActionURL: &actionURL,
	}

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send plan_updated notification", "error", err, "client_id", clientID)
	}
}

// sendTaskAssignedNotification sends a task_assigned notification to the client
func (s *Service) sendTaskAssignedNotification(ctx context.Context, clientID int64, task *TaskView) {
	if s.notificationsSvc == nil {
		return
	}

	actionURL := fmt.Sprintf("/dashboard?task=%s", task.ID)
	notification := &notifications.Notification{
		UserID:    clientID,
		Category:  notifications.CategoryMain,
		Type:      notifications.TypeTaskAssigned,
		Title:     "Новая задача",
		Content:   fmt.Sprintf("Новая задача: %s", task.Title),
		ActionURL: &actionURL,
	}

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send task_assigned notification", "error", err, "client_id", clientID, "task_id", task.ID)
	}
}

// sendFeedbackReceivedNotification sends a feedback_received notification to the client
func (s *Service) sendFeedbackReceivedNotification(ctx context.Context, clientID int64, reportID string) {
	if s.notificationsSvc == nil {
		return
	}

	notification := &notifications.Notification{
		UserID:   clientID,
		Category: notifications.CategoryMain,
		Type:     notifications.TypeFeedbackReceived,
		Title:    "Обратная связь от куратора",
		Content:  "Куратор оставил обратную связь по вашему отчёту",
	}

	actionURL := fmt.Sprintf("/dashboard/weekly-reports/%s/feedback", reportID)
	notification.ActionURL = &actionURL

	if err := s.notificationsSvc.CreateNotification(ctx, notification); err != nil {
		s.log.Error("Failed to send feedback_received notification", "error", err, "client_id", clientID, "report_id", reportID)
	}
}
