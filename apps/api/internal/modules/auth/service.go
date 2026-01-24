package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
)

// Service handles auth business logic
type Service struct {
	cfg *config.Config
	log *logger.Logger
}

// NewService creates a new auth service
func NewService(cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		cfg: cfg,
		log: log,
	}
}

// User represents a user
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name,omitempty"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// LoginResult represents login response
type LoginResult struct {
	User  *User  `json:"user"`
	Token string `json:"token"`
}

// Register registers a new user
func (s *Service) Register(ctx context.Context, email, password, name string) (*User, error) {
	// TODO: Implement Supabase user creation
	s.log.Infow("User registration", "email", email)

	// Placeholder implementation
	user := &User{
		ID:        "user-123",
		Email:     email,
		Name:      name,
		Role:      "client",
		CreatedAt: time.Now(),
	}

	return user, nil
}

// Login authenticates a user
func (s *Service) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	// TODO: Implement Supabase authentication
	s.log.Infow("User login", "email", email)

	// Placeholder implementation
	user := &User{
		ID:        "user-123",
		Email:     email,
		Role:      "client",
		CreatedAt: time.Now(),
	}

	// Generate JWT token
	token, err := s.generateToken(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &LoginResult{
		User:  user,
		Token: token,
	}, nil
}

// generateToken generates JWT token for user
func (s *Service) generateToken(user *User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
