package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Service handles auth business logic
type Service struct {
	db  *sql.DB
	cfg *config.Config
	log *logger.Logger
}

// NewService creates a new auth service
func NewService(db *sql.DB, cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		db:  db,
		cfg: cfg,
		log: log,
	}
}

// User represents a user
type User struct {
	ID        int64     `json:"id"`
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
	s.log.Infow("User registration", "email", email)

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("ошибка при хешировании пароля: %w", err)
	}

	// Insert user into database
	query := `
		INSERT INTO users (email, password, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, 'client', NOW(), NOW())
		RETURNING id, email, name, role, created_at
	`

	var user User
	err = s.db.QueryRowContext(ctx, query, email, string(hashedPassword), name).Scan(
		&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при регистрации: %w", err)
	}

	return &user, nil
}

// Login authenticates a user
func (s *Service) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	s.log.Infow("User login", "email", email)

	// Look up user by email
	query := `
		SELECT id, email, name, password, role, created_at
		FROM users
		WHERE email = $1
	`

	var user User
	var hashedPassword string
	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.Name, &hashedPassword, &user.Role, &user.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("неверные учетные данные")
		}
		return nil, fmt.Errorf("ошибка при входе: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		return nil, fmt.Errorf("неверные учетные данные")
	}

	// Generate JWT token
	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &LoginResult{
		User:  &user,
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
