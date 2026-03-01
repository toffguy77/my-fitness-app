package auth

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Service handles auth business logic
type Service struct {
	db     *sql.DB
	cfg    *config.Config
	log    *logger.Logger
	tokens *TokenGenerator
}

// NewService creates a new auth service
func NewService(db *sql.DB, cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		db:     db,
		cfg:    cfg,
		log:    log,
		tokens: NewTokenGenerator(),
	}
}

// User represents a user
type User struct {
	ID                  int64     `json:"id"`
	Email               string    `json:"email"`
	Name                string    `json:"name,omitempty"`
	Role                string    `json:"role"`
	OnboardingCompleted bool      `json:"onboarding_completed"`
	CreatedAt           time.Time `json:"created_at"`
}

// LoginResult represents login response
type LoginResult struct {
	User         *User  `json:"user"`
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
}

// Register registers a new user and returns login result with tokens
func (s *Service) Register(ctx context.Context, email, password, name, ip, ua string) (*LoginResult, error) {
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
		RETURNING id, email, COALESCE(name, ''), role, COALESCE(onboarding_completed, false), created_at
	`

	var user User
	err = s.db.QueryRowContext(ctx, query, email, string(hashedPassword), name).Scan(
		&user.ID, &user.Email, &user.Name, &user.Role, &user.OnboardingCompleted, &user.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при регистрации: %w", err)
	}

	// Create default user settings
	_, _ = s.db.ExecContext(ctx, "INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", user.ID)

	// Auto-assign curator (coordinator with fewest active clients)
	s.assignCurator(ctx, user.ID)

	// Generate JWT token
	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Generate refresh token
	refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua)
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh token: %w", err)
	}

	return &LoginResult{
		User:         &user,
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// Login authenticates a user
func (s *Service) Login(ctx context.Context, email, password, ip, ua string) (*LoginResult, error) {
	s.log.Infow("User login", "email", email)

	// Look up user by email
	query := `
		SELECT id, email, COALESCE(name, ''), password, role, COALESCE(onboarding_completed, false), created_at
		FROM users
		WHERE email = $1
	`

	var user User
	var hashedPassword string
	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.Name, &hashedPassword, &user.Role, &user.OnboardingCompleted, &user.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("неверные учетные данные")
		}
		return nil, fmt.Errorf("ошибка при входе: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		// If stored password is not a bcrypt hash, try plaintext comparison
		// and migrate to bcrypt on success
		if strings.HasPrefix(hashedPassword, "$2") {
			return nil, fmt.Errorf("неверные учетные данные")
		}
		if hashedPassword != password {
			return nil, fmt.Errorf("неверные учетные данные")
		}
		// Migrate plaintext password to bcrypt
		newHash, hashErr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if hashErr == nil {
			_, _ = s.db.ExecContext(ctx, "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", string(newHash), user.ID)
			s.log.Infow("Migrated plaintext password to bcrypt", "user_id", user.ID)
		}
	}

	// Generate JWT token
	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Generate refresh token
	refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua)
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh token: %w", err)
	}

	return &LoginResult{
		User:         &user,
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// RefreshTokens validates a refresh token, rotates it, and returns new tokens
func (s *Service) RefreshTokens(ctx context.Context, plainToken, ip, ua string) (*LoginResult, error) {
	tokenHash := s.tokens.HashToken(plainToken)

	// Look up the refresh token
	var id, userID int64
	var expiresAt time.Time
	var revokedAt sql.NullTime

	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
		tokenHash,
	).Scan(&id, &userID, &expiresAt, &revokedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("invalid refresh token")
		}
		return nil, fmt.Errorf("failed to look up refresh token: %w", err)
	}

	// Reuse detection: if the token was already revoked, someone may have stolen it
	if revokedAt.Valid {
		s.log.Warnw("Refresh token reuse detected, revoking all tokens for user", "user_id", userID)
		s.revokeAllUserRefreshTokens(ctx, userID)
		return nil, fmt.Errorf("refresh token reuse detected")
	}

	// Check expiry
	if time.Now().After(expiresAt) {
		return nil, fmt.Errorf("refresh token expired")
	}

	// Token rotation in a transaction: revoke old, create new
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Generate new refresh token
	newPlain, newHash, err := s.tokens.GenerateToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate new refresh token: %w", err)
	}

	// Revoke old token and link to new one
	_, err = tx.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = $1 WHERE id = $2`,
		newHash, id,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to revoke old refresh token: %w", err)
	}

	// Insert new refresh token
	expiresAtNew := time.Now().Add(30 * 24 * time.Hour)
	_, err = tx.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, created_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())`,
		userID, newHash, expiresAtNew, ip, ua,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert new refresh token: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Look up user for JWT claims
	var user User
	err = s.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(name, ''), role, COALESCE(onboarding_completed, false), created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.OnboardingCompleted, &user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to look up user: %w", err)
	}

	// Generate new JWT
	accessToken, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	return &LoginResult{
		User:         &user,
		Token:        accessToken,
		RefreshToken: newPlain,
	}, nil
}

// RevokeRefreshToken revokes a single refresh token (for logout)
func (s *Service) RevokeRefreshToken(ctx context.Context, plainToken string) error {
	tokenHash := s.tokens.HashToken(plainToken)
	_, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
		tokenHash,
	)
	return err
}

// createRefreshToken generates and stores a new refresh token
func (s *Service) createRefreshToken(ctx context.Context, userID int64, ip, ua string) (string, error) {
	plainToken, hashedToken, err := s.tokens.GenerateToken()
	if err != nil {
		return "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, created_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())`,
		userID, hashedToken, expiresAt, ip, ua,
	)
	if err != nil {
		return "", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return plainToken, nil
}

// revokeAllUserRefreshTokens revokes all refresh tokens for a user (reuse detection)
func (s *Service) revokeAllUserRefreshTokens(ctx context.Context, userID int64) {
	_, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
		userID,
	)
	if err != nil {
		s.log.Errorw("Failed to revoke all refresh tokens", "user_id", userID, "error", err)
	}
}

// assignCurator assigns the least-loaded active coordinator to a new client.
// Creates both the curator_client_relationship and a conversation.
// Best-effort: registration succeeds even if no coordinator exists.
func (s *Service) assignCurator(ctx context.Context, clientID int64) {
	// Pick coordinator with fewest active clients
	var curatorID int64
	err := s.db.QueryRowContext(ctx, `
		SELECT u.id
		FROM users u
		LEFT JOIN curator_client_relationships ccr
			ON ccr.curator_id = u.id AND ccr.status = 'active'
		WHERE u.role = 'coordinator'
		GROUP BY u.id
		ORDER BY COUNT(ccr.client_id) ASC
		LIMIT 1
	`).Scan(&curatorID)
	if err != nil {
		s.log.Warnw("No coordinator available for auto-assignment", "client_id", clientID, "error", err)
		return
	}

	// Create relationship
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO curator_client_relationships (curator_id, client_id, status)
		VALUES ($1, $2, 'active')
		ON CONFLICT (curator_id, client_id) DO NOTHING
	`, curatorID, clientID)
	if err != nil {
		s.log.Errorw("Failed to assign curator", "curator_id", curatorID, "client_id", clientID, "error", err)
		return
	}

	// Create conversation
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO conversations (client_id, curator_id)
		VALUES ($1, $2)
		ON CONFLICT (client_id, curator_id) DO NOTHING
	`, clientID, curatorID)
	if err != nil {
		s.log.Errorw("Failed to create conversation", "curator_id", curatorID, "client_id", clientID, "error", err)
		return
	}

	s.log.Infow("Auto-assigned curator to new client", "curator_id", curatorID, "client_id", clientID)
}

// generateToken generates JWT token for user (15 min expiry)
func (s *Service) generateToken(user *User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     time.Now().Add(15 * time.Minute).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
