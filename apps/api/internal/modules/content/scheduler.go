package content

import (
	"context"
	"time"
)

// RunScheduler starts a background goroutine that publishes scheduled articles every minute.
// It blocks until the provided context is cancelled.
func (s *Service) RunScheduler(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	s.log.Info("Content scheduler started")

	for {
		select {
		case <-ticker.C:
			if err := s.PublishScheduledArticles(ctx); err != nil {
				s.log.Error("Failed to publish scheduled articles", "error", err)
			}
		case <-ctx.Done():
			s.log.Info("Content scheduler stopped")
			return
		}
	}
}
