package curator

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

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
}

// Service handles curator business logic
type Service struct {
	db  *database.DB
	log *logger.Logger
}

// NewService creates a new curator service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{
		db:  db,
		log: log,
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

	// Main query: get clients with today's food totals and active plan
	query := `
		SELECT u.id, COALESCE(u.name, '') AS name, u.avatar_url,
		       COALESCE(SUM(fe.calories), 0) AS today_calories,
		       COALESCE(SUM(fe.protein), 0) AS today_protein,
		       COALESCE(SUM(fe.fat), 0) AS today_fat,
		       COALESCE(SUM(fe.carbs), 0) AS today_carbs,
		       wp.calories_goal AS plan_calories,
		       wp.protein_goal AS plan_protein,
		       wp.fat_goal AS plan_fat,
		       wp.carbs_goal AS plan_carbs
		FROM curator_client_relationships ccr
		JOIN users u ON u.id = ccr.client_id
		LEFT JOIN food_entries fe ON fe.user_id = u.id AND fe.date = CURRENT_DATE
		LEFT JOIN weekly_plans wp ON wp.user_id = u.id
		    AND wp.start_date <= CURRENT_DATE AND wp.end_date >= CURRENT_DATE
		    AND wp.is_active = true
		WHERE ccr.curator_id = $1 AND ccr.status = 'active'
		GROUP BY u.id, u.name, u.avatar_url,
		         wp.calories_goal, wp.protein_goal, wp.fat_goal, wp.carbs_goal
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
			Alerts:       make([]Alert, 0),
			UnreadCount:  unreadMap[cr.id],
			LastWeight:   weightMap[cr.id],
			WeightTrend:  trendMap[cr.id],
			TargetWeight: targetMap[cr.id],
			TodayWater:   waterMap[cr.id],
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

	return &WeeklyPlanView{
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
	}, nil
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
