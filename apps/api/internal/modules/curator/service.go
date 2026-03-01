package curator

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

// ServiceInterface defines the interface for curator service operations
type ServiceInterface interface {
	GetClients(ctx context.Context, curatorID int64) ([]ClientCard, error)
	GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string) (*ClientDetail, error)
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
		SELECT u.id, u.full_name, u.avatar_url,
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
		GROUP BY u.id, u.full_name, u.avatar_url,
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
			Alerts:      make([]Alert, 0),
			UnreadCount: unreadMap[cr.id],
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

// GetClientDetail returns detailed information about a specific client
func (s *Service) GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string) (*ClientDetail, error) {
	startTime := time.Now()

	// Parse date, default to today
	var targetDate time.Time
	if date == "" {
		targetDate = time.Now().UTC().Truncate(24 * time.Hour)
	} else {
		var err error
		targetDate, err = time.Parse("2006-01-02", date)
		if err != nil {
			return nil, fmt.Errorf("invalid date format: %w", err)
		}
	}

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
	clientQuery := `SELECT id, full_name, avatar_url FROM users WHERE id = $1`
	var clientID64 int64
	var clientName string
	var avatarURL sql.NullString
	if err := s.db.QueryRowContext(ctx, clientQuery, clientID).Scan(&clientID64, &clientName, &avatarURL); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("client not found")
		}
		return nil, fmt.Errorf("failed to get client info: %w", err)
	}

	// Get food entries for the date
	entriesQuery := `
		SELECT id, food_name, meal_type, calories, protein, fat, carbs, weight, created_by, created_at
		FROM food_entries
		WHERE user_id = $1 AND date = $2
		ORDER BY created_at ASC
	`

	entryRows, err := s.db.QueryContext(ctx, entriesQuery, clientID, targetDate)
	if err != nil {
		return nil, fmt.Errorf("failed to query food entries: %w", err)
	}
	defer entryRows.Close()

	foodEntries := make([]FoodEntryView, 0)
	var totalCal, totalProtein, totalFat, totalCarbs float64

	for entryRows.Next() {
		var entry FoodEntryView
		var createdBy sql.NullInt64
		var createdAt time.Time

		if err := entryRows.Scan(
			&entry.ID, &entry.FoodName, &entry.MealType,
			&entry.Calories, &entry.Protein, &entry.Fat, &entry.Carbs,
			&entry.Weight, &createdBy, &createdAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan food entry: %w", err)
		}

		if createdBy.Valid {
			v := createdBy.Int64
			entry.CreatedBy = &v
		}
		entry.Time = createdAt.Format("15:04")

		totalCal += entry.Calories
		totalProtein += entry.Protein
		totalFat += entry.Fat
		totalCarbs += entry.Carbs

		foodEntries = append(foodEntries, entry)
	}

	if err := entryRows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating food entries: %w", err)
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

	err = s.db.QueryRowContext(ctx, planQuery, clientID, targetDate).Scan(
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

	// Get last weight from daily_metrics
	weightQuery := `
		SELECT weight FROM daily_metrics
		WHERE user_id = $1 AND weight IS NOT NULL
		ORDER BY metric_date DESC
		LIMIT 1
	`

	var lastWeight sql.NullFloat64
	err = s.db.QueryRowContext(ctx, weightQuery, clientID).Scan(&lastWeight)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to query last weight: %w", err)
	}

	// Get unread count for this client
	unreadMap, err := s.getUnreadCounts(ctx, curatorID, []int64{clientID})
	if err != nil {
		s.log.Error("Failed to get unread counts", "error", err)
		unreadMap = make(map[int64]int)
	}

	todayKBZHU := &DailyKBZHU{
		Calories: totalCal,
		Protein:  totalProtein,
		Fat:      totalFat,
		Carbs:    totalCarbs,
	}

	alerts := computeAlerts(todayKBZHU, weeklyPlan)

	detail := &ClientDetail{
		ClientCard: ClientCard{
			ID:          clientID,
			Name:        clientName,
			TodayKBZHU:  todayKBZHU,
			Plan:        weeklyPlan,
			Alerts:      alerts,
			UnreadCount: unreadMap[clientID],
		},
		FoodEntries: foodEntries,
		WeeklyPlan:  weeklyPlan,
	}

	if avatarURL.Valid {
		detail.AvatarURL = avatarURL.String
	}

	if lastWeight.Valid {
		w := lastWeight.Float64
		detail.LastWeight = &w
	}

	s.log.LogDatabaseQuery("GetClientDetail", time.Since(startTime), nil, map[string]interface{}{
		"curator_id":   curatorID,
		"client_id":    clientID,
		"date":         targetDate.Format("2006-01-02"),
		"food_entries": len(foodEntries),
		"has_plan":     weeklyPlan != nil,
		"has_weight":   lastWeight.Valid,
		"alert_count":  len(alerts),
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
