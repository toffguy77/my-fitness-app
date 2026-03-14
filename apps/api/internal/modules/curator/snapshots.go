package curator

import (
	"context"
	"fmt"
	"time"
)

// CollectDailySnapshot collects current analytics metrics and saves them as a daily snapshot.
// Uses the same metric computation as GetAnalytics, plus avg_client_streak.
func (s *Service) CollectDailySnapshot(ctx context.Context, curatorID int64) error {
	startTime := time.Now()

	// Get current analytics (reuse existing logic)
	analytics, err := s.GetAnalytics(ctx, curatorID)
	if err != nil {
		return fmt.Errorf("failed to get analytics for snapshot: %w", err)
	}

	// Compute avg client streak
	var avgStreak float64
	clientIDs, err := s.getActiveClientIDs(ctx, curatorID)
	if err != nil {
		return fmt.Errorf("failed to get client IDs for snapshot: %w", err)
	}

	if len(clientIDs) > 0 {
		streakMap := s.getStreakDays(ctx, clientIDs)
		totalStreak := 0
		for _, streak := range streakMap {
			totalStreak += streak
		}
		avgStreak = float64(totalStreak) / float64(len(clientIDs))
	}

	// Upsert into curator_daily_snapshots
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO curator_daily_snapshots (curator_id, date, total_clients, attention_clients, avg_kbzhu_percent, total_unread, active_tasks, overdue_tasks, completed_tasks, avg_client_streak)
		VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (curator_id, date) DO UPDATE SET
			total_clients = EXCLUDED.total_clients,
			attention_clients = EXCLUDED.attention_clients,
			avg_kbzhu_percent = EXCLUDED.avg_kbzhu_percent,
			total_unread = EXCLUDED.total_unread,
			active_tasks = EXCLUDED.active_tasks,
			overdue_tasks = EXCLUDED.overdue_tasks,
			completed_tasks = EXCLUDED.completed_tasks,
			avg_client_streak = EXCLUDED.avg_client_streak
	`, curatorID, analytics.TotalClients, analytics.AttentionClients, analytics.AvgKBZHUPercent,
		analytics.TotalUnread, analytics.ActiveTasks, analytics.OverdueTasks, analytics.CompletedToday, avgStreak)
	if err != nil {
		return fmt.Errorf("failed to upsert daily snapshot: %w", err)
	}

	s.log.LogDatabaseQuery("CollectDailySnapshot", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
	})

	return nil
}

// GetAnalyticsHistory returns historical analytics data for the given period.
// period can be "daily" or "weekly". count limits the number of results.
func (s *Service) GetAnalyticsHistory(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
	startTime := time.Now()

	if period == "daily" {
		return s.getDailySnapshots(ctx, curatorID, count, startTime)
	}
	return s.getWeeklySnapshots(ctx, curatorID, count, startTime)
}

func (s *Service) getDailySnapshots(ctx context.Context, curatorID int64, count int, startTime time.Time) ([]DailySnapshot, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT date, total_clients, attention_clients, avg_kbzhu_percent, total_unread,
			active_tasks, overdue_tasks, completed_tasks, avg_client_streak
		FROM curator_daily_snapshots
		WHERE curator_id = $1
		ORDER BY date DESC
		LIMIT $2
	`, curatorID, count)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily snapshots: %w", err)
	}
	defer rows.Close()

	snapshots := make([]DailySnapshot, 0)
	for rows.Next() {
		var snap DailySnapshot
		var d time.Time
		if err := rows.Scan(&d, &snap.TotalClients, &snap.AttentionClients, &snap.AvgKBZHUPercent,
			&snap.TotalUnread, &snap.ActiveTasks, &snap.OverdueTasks, &snap.CompletedTasks, &snap.AvgClientStreak); err != nil {
			return nil, fmt.Errorf("failed to scan daily snapshot: %w", err)
		}
		snap.Date = d.Format("2006-01-02")
		snapshots = append(snapshots, snap)
	}

	s.log.LogDatabaseQuery("GetDailySnapshots", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"count":      len(snapshots),
	})

	return snapshots, rows.Err()
}

func (s *Service) getWeeklySnapshots(ctx context.Context, curatorID int64, count int, startTime time.Time) ([]WeeklySnapshot, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT week_start, avg_kbzhu_percent, avg_response_time_hours, clients_with_feedback,
			clients_total, task_completion_rate, clients_on_track, clients_off_track, avg_client_streak
		FROM curator_weekly_snapshots
		WHERE curator_id = $1
		ORDER BY week_start DESC
		LIMIT $2
	`, curatorID, count)
	if err != nil {
		return nil, fmt.Errorf("failed to query weekly snapshots: %w", err)
	}
	defer rows.Close()

	snapshots := make([]WeeklySnapshot, 0)
	for rows.Next() {
		var snap WeeklySnapshot
		var ws time.Time
		if err := rows.Scan(&ws, &snap.AvgKBZHUPercent, &snap.AvgResponseTimeHours, &snap.ClientsWithFeedback,
			&snap.ClientsTotal, &snap.TaskCompletionRate, &snap.ClientsOnTrack, &snap.ClientsOffTrack, &snap.AvgClientStreak); err != nil {
			return nil, fmt.Errorf("failed to scan weekly snapshot: %w", err)
		}
		snap.WeekStart = ws.Format("2006-01-02")
		snapshots = append(snapshots, snap)
	}

	s.log.LogDatabaseQuery("GetWeeklySnapshots", time.Since(startTime), nil, map[string]interface{}{
		"curator_id": curatorID,
		"count":      len(snapshots),
	})

	return snapshots, rows.Err()
}

// GetBenchmark returns the curator's own weekly snapshots alongside platform-wide benchmarks.
func (s *Service) GetBenchmark(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
	startTime := time.Now()

	// Get curator's own weekly snapshots
	ownSnapshots, err := s.getWeeklySnapshots(ctx, curatorID, weeks, startTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get own weekly snapshots: %w", err)
	}

	// Get platform benchmarks
	rows, err := s.db.QueryContext(ctx, `
		SELECT week_start, avg_kbzhu_percent, avg_response_time_hours, avg_task_completion_rate,
			avg_feedback_rate, avg_client_streak, curator_count
		FROM platform_weekly_benchmarks
		ORDER BY week_start DESC
		LIMIT $1
	`, weeks)
	if err != nil {
		return nil, fmt.Errorf("failed to query platform benchmarks: %w", err)
	}
	defer rows.Close()

	benchmarks := make([]PlatformBenchmark, 0)
	for rows.Next() {
		var b PlatformBenchmark
		var ws time.Time
		if err := rows.Scan(&ws, &b.AvgKBZHUPercent, &b.AvgResponseTimeHours, &b.AvgTaskCompletionRate,
			&b.AvgFeedbackRate, &b.AvgClientStreak, &b.CuratorCount); err != nil {
			return nil, fmt.Errorf("failed to scan platform benchmark: %w", err)
		}
		b.WeekStart = ws.Format("2006-01-02")
		benchmarks = append(benchmarks, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate platform benchmarks: %w", err)
	}

	s.log.LogDatabaseQuery("GetBenchmark", time.Since(startTime), nil, map[string]interface{}{
		"curator_id":    curatorID,
		"own_snapshots": len(ownSnapshots),
		"benchmarks":    len(benchmarks),
	})

	return &BenchmarkData{
		OwnSnapshots:       ownSnapshots,
		PlatformBenchmarks: benchmarks,
	}, nil
}
