package users

import (
	"context"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
)

// Service handles users business logic
type Service struct {
	cfg *config.Config
	log *logger.Logger
}

// NewService creates a new users service
func NewService(cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		cfg: cfg,
		log: log,
	}
}

// Profile represents user profile
type Profile struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// GetProfile retrieves user profile
func (s *Service) GetProfile(ctx context.Context, userID string) (*Profile, error) {
	// TODO: Implement Supabase query
	s.log.Infow("Get profile", "user_id", userID)

	// Placeholder
	return &Profile{
		ID:    userID,
		Email: "user@example.com",
		Name:  "Test User",
		Role:  "client",
	}, nil
}

// UpdateProfile updates user profile
func (s *Service) UpdateProfile(ctx context.Context, userID, name string) (*Profile, error) {
	// TODO: Implement Supabase update
	s.log.Infow("Update profile", "user_id", userID, "name", name)

	// Placeholder
	return &Profile{
		ID:    userID,
		Email: "user@example.com",
		Name:  name,
		Role:  "client",
	}, nil
}
