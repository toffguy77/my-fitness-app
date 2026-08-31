package curator

import (
	"context"
	"fmt"
	"time"
)

// CollectAllDailySnapshots takes a snapshot for every curator with active
// clients and reports how many were written.
//
// CollectDailySnapshot existed and was unit-tested but was never called from
// anywhere but its own tests: there was no scheduler to call it. As a result
// curator_daily_snapshots stayed empty and the "History" screen could never
// show anything.
func (s *Service) CollectAllDailySnapshots(ctx context.Context) (int, error) {
	curatorIDs, err := s.activeCuratorIDs(ctx)
	if err != nil {
		return 0, fmt.Errorf("list curators: %w", err)
	}

	collected := 0
	for _, id := range curatorIDs {
		// One curator's failure must not cost the rest their snapshot; the
		// collector runs once a day and a gap is not recoverable.
		if err := s.CollectDailySnapshot(ctx, id); err != nil {
			s.log.Error("Failed to collect daily snapshot", "curator_id", id, "error", err)
			continue
		}
		collected++
	}
	return collected, nil
}

// CollectAllWeeklySnapshots writes weekly snapshots for the week that has just
// ended, then the platform-wide benchmark for the same week.
func (s *Service) CollectAllWeeklySnapshots(ctx context.Context) (int, error) {
	weekStart := lastCompletedWeekStart(time.Now())

	curatorIDs, err := s.activeCuratorIDs(ctx)
	if err != nil {
		return 0, fmt.Errorf("list curators: %w", err)
	}

	collected := 0
	for _, id := range curatorIDs {
		if err := s.collectWeeklySnapshot(ctx, id, weekStart); err != nil {
			s.log.Error("Failed to collect weekly snapshot", "curator_id", id, "error", err)
			continue
		}
		collected++
	}

	// The benchmark averages the snapshots just written, so it must come after.
	if err := s.collectPlatformBenchmark(ctx, weekStart); err != nil {
		return collected, fmt.Errorf("collect platform benchmark: %w", err)
	}

	return collected, nil
}

// lastCompletedWeekStart returns the Monday of the most recently finished week.
func lastCompletedWeekStart(now time.Time) time.Time {
	// Go weeks start on Sunday; shift so Monday is day 0.
	offset := (int(now.Weekday()) + 6) % 7
	thisWeekMonday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).
		AddDate(0, 0, -offset)
	return thisWeekMonday.AddDate(0, 0, -7)
}

// activeCuratorIDs lists curators that have at least one active client. A
// curator with no clients has nothing to snapshot.
func (s *Service) activeCuratorIDs(ctx context.Context) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT curator_id
		FROM curator_client_relationships
		WHERE status = 'active'
		ORDER BY curator_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// weeklyMetrics holds one curator's numbers for a completed week.
type weeklyMetrics struct {
	AvgKBZHUPercent      float64
	AvgResponseTimeHours float64
	ClientsWithFeedback  int
	ClientsTotal         int
	TaskCompletionRate   float64
	ClientsOnTrack       int
	ClientsOffTrack      int
	AvgClientStreak      float64
}

// onTrackKBZHUPercent is the share of the calorie target a client must hit on
// average for the week to count as on track. It matches the threshold the
// attention list uses, so the two screens agree.
const onTrackKBZHUPercent = 80.0

// collectWeeklySnapshot writes one curator's metrics for a finished week.
//
// The numbers are computed over the week itself rather than taken from
// GetAnalytics, which reports the present moment: a snapshot of "now" filed
// under last week would be wrong the moment anything changed.
func (s *Service) collectWeeklySnapshot(ctx context.Context, curatorID int64, weekStart time.Time) error {
	weekEnd := weekStart.AddDate(0, 0, 7)

	m, err := s.weeklyMetricsFor(ctx, curatorID, weekStart, weekEnd)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO curator_weekly_snapshots (
			curator_id, week_start, avg_kbzhu_percent, avg_response_time_hours,
			clients_with_feedback, clients_total, task_completion_rate,
			clients_on_track, clients_off_track, avg_client_streak)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (curator_id, week_start) DO UPDATE SET
			avg_kbzhu_percent = EXCLUDED.avg_kbzhu_percent,
			avg_response_time_hours = EXCLUDED.avg_response_time_hours,
			clients_with_feedback = EXCLUDED.clients_with_feedback,
			clients_total = EXCLUDED.clients_total,
			task_completion_rate = EXCLUDED.task_completion_rate,
			clients_on_track = EXCLUDED.clients_on_track,
			clients_off_track = EXCLUDED.clients_off_track,
			avg_client_streak = EXCLUDED.avg_client_streak`,
		curatorID, weekStart,
		m.AvgKBZHUPercent, m.AvgResponseTimeHours,
		m.ClientsWithFeedback, m.ClientsTotal, m.TaskCompletionRate,
		m.ClientsOnTrack, m.ClientsOffTrack, m.AvgClientStreak)
	return err
}

// weeklyMetricsFor computes the metrics for [weekStart, weekEnd).
func (s *Service) weeklyMetricsFor(ctx context.Context, curatorID int64, weekStart, weekEnd time.Time) (weeklyMetrics, error) {
	var m weeklyMetrics

	clientIDs, err := s.getActiveClientIDs(ctx, curatorID)
	if err != nil {
		return m, fmt.Errorf("get client ids: %w", err)
	}
	m.ClientsTotal = len(clientIDs)
	if m.ClientsTotal == 0 {
		return m, nil
	}

	// Per-client adherence to the calorie target, averaged over the week.
	// Clients above the threshold count as on track.
	rows, err := s.db.QueryContext(ctx, `
		SELECT fe.user_id,
		       AVG(LEAST(fe.day_calories / NULLIF(wp.calories_goal, 0) * 100, 200)) AS pct
		FROM (
			SELECT user_id, date, SUM(calories) AS day_calories
			FROM food_entries
			WHERE user_id = ANY($1) AND date >= $2 AND date < $3
			GROUP BY user_id, date
		) fe
		JOIN weekly_plans wp
		  ON wp.user_id = fe.user_id AND wp.is_active = true
		GROUP BY fe.user_id`, clientIDs, weekStart, weekEnd)
	if err != nil {
		return m, fmt.Errorf("weekly adherence: %w", err)
	}
	defer rows.Close()

	var sum float64
	var counted int
	for rows.Next() {
		var userID int64
		var pct float64
		if err := rows.Scan(&userID, &pct); err != nil {
			return m, fmt.Errorf("scan adherence: %w", err)
		}
		sum += pct
		counted++
		if pct >= onTrackKBZHUPercent {
			m.ClientsOnTrack++
		}
	}
	if err := rows.Err(); err != nil {
		return m, fmt.Errorf("iterate adherence: %w", err)
	}
	if counted > 0 {
		m.AvgKBZHUPercent = sum / float64(counted)
	}
	// Clients with no logged data are off track by omission.
	m.ClientsOffTrack = m.ClientsTotal - m.ClientsOnTrack

	// How long a client waited for the curator's reply, on average.
	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (reply.created_at - ask.created_at)) / 3600), 0)
		FROM messages ask
		JOIN LATERAL (
			SELECT created_at FROM messages r
			WHERE r.conversation_id = ask.conversation_id
			  AND r.sender_id = $1
			  AND r.created_at > ask.created_at
			ORDER BY r.created_at
			LIMIT 1
		) reply ON true
		JOIN conversations c ON c.id = ask.conversation_id
		WHERE c.curator_id = $1
		  AND ask.sender_id <> $1
		  AND ask.created_at >= $2 AND ask.created_at < $3`,
		curatorID, weekStart, weekEnd).Scan(&m.AvgResponseTimeHours); err != nil {
		return m, fmt.Errorf("response time: %w", err)
	}

	// Clients whose weekly report received a reply from the curator.
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT user_id) FROM weekly_reports
		WHERE user_id = ANY($1) AND created_at >= $2 AND created_at < $3
		  AND feedback IS NOT NULL`,
		clientIDs, weekStart, weekEnd).Scan(&m.ClientsWithFeedback); err != nil {
		return m, fmt.Errorf("clients with feedback: %w", err)
	}

	// Share of tasks due during the week that were completed.
	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(
			COUNT(*) FILTER (WHERE status = 'completed')::numeric * 100 / NULLIF(COUNT(*), 0), 0)
		FROM tasks
		WHERE user_id = ANY($1) AND due_date >= $2 AND due_date < $3`,
		clientIDs, weekStart, weekEnd).Scan(&m.TaskCompletionRate); err != nil {
		return m, fmt.Errorf("task completion: %w", err)
	}

	streaks := s.getStreakDays(ctx, clientIDs)
	total := 0
	for _, v := range streaks {
		total += v
	}
	m.AvgClientStreak = float64(total) / float64(m.ClientsTotal)

	return m, nil
}

// collectPlatformBenchmark averages the weekly snapshots so a curator can see
// where they stand relative to everyone else.
func (s *Service) collectPlatformBenchmark(ctx context.Context, weekStart time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO platform_weekly_benchmarks (
			week_start, avg_kbzhu_percent, avg_response_time_hours,
			avg_task_completion_rate, avg_feedback_rate, avg_client_streak, curator_count)
		SELECT
			$1,
			COALESCE(AVG(avg_kbzhu_percent), 0),
			COALESCE(AVG(avg_response_time_hours), 0),
			COALESCE(AVG(task_completion_rate), 0),
			COALESCE(AVG(CASE WHEN clients_total > 0
				THEN clients_with_feedback::numeric * 100 / clients_total ELSE 0 END), 0),
			COALESCE(AVG(avg_client_streak), 0),
			COUNT(*)
		FROM curator_weekly_snapshots
		WHERE week_start = $1
		ON CONFLICT (week_start) DO UPDATE SET
			avg_kbzhu_percent = EXCLUDED.avg_kbzhu_percent,
			avg_response_time_hours = EXCLUDED.avg_response_time_hours,
			avg_task_completion_rate = EXCLUDED.avg_task_completion_rate,
			avg_feedback_rate = EXCLUDED.avg_feedback_rate,
			avg_client_streak = EXCLUDED.avg_client_streak,
			curator_count = EXCLUDED.curator_count`,
		weekStart)
	return err
}
