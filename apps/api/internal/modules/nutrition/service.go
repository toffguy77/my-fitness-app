package nutrition

import (
	"context"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
)

// Service handles nutrition business logic
type Service struct {
	cfg *config.Config
	log *logger.Logger
}

// NewService creates a new nutrition service
func NewService(cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		cfg: cfg,
		log: log,
	}
}

// Entry represents a nutrition entry
type Entry struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Date      string    `json:"date"`
	Meal      string    `json:"meal"`
	Food      string    `json:"food"`
	Calories  float64   `json:"calories"`
	Protein   float64   `json:"protein"`
	Carbs     float64   `json:"carbs"`
	Fat       float64   `json:"fat"`
	CreatedAt time.Time `json:"created_at"`
}

// GetEntries retrieves nutrition entries for user
func (s *Service) GetEntries(ctx context.Context, userID string) ([]*Entry, error) {
	// TODO: Implement Supabase query
	s.log.Infow("Get entries", "user_id", userID)

	// Placeholder
	return []*Entry{
		{
			ID:        "entry-1",
			UserID:    userID,
			Date:      time.Now().Format("2006-01-02"),
			Meal:      "breakfast",
			Food:      "Oatmeal",
			Calories:  150,
			Protein:   5,
			Carbs:     27,
			Fat:       3,
			CreatedAt: time.Now(),
		},
	}, nil
}

// CreateEntry creates a new nutrition entry
func (s *Service) CreateEntry(ctx context.Context, userID string, req *CreateEntryRequest) (*Entry, error) {
	// TODO: Implement Supabase insert
	s.log.Infow("Create entry", "user_id", userID, "food", req.Food)

	// Placeholder
	return &Entry{
		ID:        "entry-new",
		UserID:    userID,
		Date:      req.Date,
		Meal:      req.Meal,
		Food:      req.Food,
		Calories:  req.Calories,
		Protein:   req.Protein,
		Carbs:     req.Carbs,
		Fat:       req.Fat,
		CreatedAt: time.Now(),
	}, nil
}

// GetEntry retrieves a single nutrition entry
func (s *Service) GetEntry(ctx context.Context, userID, entryID string) (*Entry, error) {
	// TODO: Implement Supabase query
	s.log.Infow("Get entry", "user_id", userID, "entry_id", entryID)

	// Placeholder
	return &Entry{
		ID:        entryID,
		UserID:    userID,
		Date:      time.Now().Format("2006-01-02"),
		Meal:      "lunch",
		Food:      "Chicken Breast",
		Calories:  165,
		Protein:   31,
		Carbs:     0,
		Fat:       3.6,
		CreatedAt: time.Now(),
	}, nil
}

// UpdateEntry updates a nutrition entry
func (s *Service) UpdateEntry(ctx context.Context, userID, entryID string, req *CreateEntryRequest) (*Entry, error) {
	// TODO: Implement Supabase update
	s.log.Infow("Update entry", "user_id", userID, "entry_id", entryID)

	// Placeholder
	return &Entry{
		ID:        entryID,
		UserID:    userID,
		Date:      req.Date,
		Meal:      req.Meal,
		Food:      req.Food,
		Calories:  req.Calories,
		Protein:   req.Protein,
		Carbs:     req.Carbs,
		Fat:       req.Fat,
		CreatedAt: time.Now(),
	}, nil
}

// DeleteEntry deletes a nutrition entry
func (s *Service) DeleteEntry(ctx context.Context, userID, entryID string) error {
	// TODO: Implement Supabase delete
	s.log.Infow("Delete entry", "user_id", userID, "entry_id", entryID)

	return nil
}
