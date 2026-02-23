package users

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
)

// FullProfile is the complete profile response
type FullProfile struct {
	ID                  int64    `json:"id"`
	Email               string   `json:"email"`
	Name                string   `json:"name,omitempty"`
	Role                string   `json:"role"`
	AvatarURL           string   `json:"avatar_url,omitempty"`
	OnboardingCompleted bool     `json:"onboarding_completed"`
	Settings            Settings `json:"settings"`
}

// Settings represents user preferences
type Settings struct {
	Language           string `json:"language"`
	Units              string `json:"units"`
	TelegramUsername   string `json:"telegram_username,omitempty"`
	InstagramUsername  string `json:"instagram_username,omitempty"`
	AppleHealthEnabled bool   `json:"apple_health_enabled"`
}

// Service handles users business logic
type Service struct {
	db  *sql.DB
	s3  *storage.S3Client
	cfg *config.Config
	log *logger.Logger
}

// NewService creates a new users service
func NewService(db *sql.DB, s3 *storage.S3Client, cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		db:  db,
		s3:  s3,
		cfg: cfg,
		log: log,
	}
}

// GetProfile retrieves the full user profile with settings
func (s *Service) GetProfile(ctx context.Context, userID int64) (*FullProfile, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection not available")
	}
	query := `
		SELECT u.id, u.email, COALESCE(u.name, ''), u.role, COALESCE(u.avatar_url, ''), COALESCE(u.onboarding_completed, false),
		       COALESCE(s.language, 'ru'), COALESCE(s.units, 'metric'),
		       COALESCE(s.telegram_username, ''), COALESCE(s.instagram_username, ''), COALESCE(s.apple_health_enabled, false)
		FROM users u
		LEFT JOIN user_settings s ON s.user_id = u.id
		WHERE u.id = $1
	`

	var profile FullProfile
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&profile.ID,
		&profile.Email,
		&profile.Name,
		&profile.Role,
		&profile.AvatarURL,
		&profile.OnboardingCompleted,
		&profile.Settings.Language,
		&profile.Settings.Units,
		&profile.Settings.TelegramUsername,
		&profile.Settings.InstagramUsername,
		&profile.Settings.AppleHealthEnabled,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("пользователь не найден")
		}
		return nil, fmt.Errorf("ошибка при получении профиля: %w", err)
	}

	return &profile, nil
}

// UpdateProfile updates the user's name and returns the fresh full profile
func (s *Service) UpdateProfile(ctx context.Context, userID int64, name string) (*FullProfile, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection not available")
	}
	query := `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`

	result, err := s.db.ExecContext(ctx, query, name, userID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении профиля: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("ошибка при проверке обновления: %w", err)
	}
	if rowsAffected == 0 {
		return nil, fmt.Errorf("пользователь не найден")
	}

	return s.GetProfile(ctx, userID)
}

// UpdateSettings upserts user settings and returns the updated settings
func (s *Service) UpdateSettings(ctx context.Context, userID int64, settings Settings) (*Settings, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection not available")
	}
	query := `
		INSERT INTO user_settings (user_id, language, units, telegram_username, instagram_username, apple_health_enabled, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		  language = EXCLUDED.language,
		  units = EXCLUDED.units,
		  telegram_username = EXCLUDED.telegram_username,
		  instagram_username = EXCLUDED.instagram_username,
		  apple_health_enabled = EXCLUDED.apple_health_enabled,
		  updated_at = NOW()
		RETURNING language, units, telegram_username, instagram_username, apple_health_enabled
	`

	var result Settings
	err := s.db.QueryRowContext(ctx, query,
		userID,
		settings.Language,
		settings.Units,
		settings.TelegramUsername,
		settings.InstagramUsername,
		settings.AppleHealthEnabled,
	).Scan(
		&result.Language,
		&result.Units,
		&result.TelegramUsername,
		&result.InstagramUsername,
		&result.AppleHealthEnabled,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении настроек: %w", err)
	}

	return &result, nil
}

// UploadAvatar uploads a user avatar to S3 and updates the avatar URL
func (s *Service) UploadAvatar(ctx context.Context, userID int64, file io.Reader, contentType string, size int64) (string, error) {
	if s.s3 == nil {
		return "", fmt.Errorf("загрузка фото недоступна")
	}

	// Determine file extension from content type
	var ext string
	switch {
	case strings.Contains(contentType, "jpeg") || strings.Contains(contentType, "jpg"):
		ext = ".jpg"
	case strings.Contains(contentType, "png"):
		ext = ".png"
	case strings.Contains(contentType, "webp"):
		ext = ".webp"
	default:
		ext = ".jpg"
	}

	key := fmt.Sprintf("avatars/%d/avatar%s", userID, ext)

	url, err := s.s3.UploadFile(ctx, key, file, contentType, size)
	if err != nil {
		return "", fmt.Errorf("ошибка при загрузке аватара: %w", err)
	}

	// Update avatar URL in database
	query := `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`
	_, err = s.db.ExecContext(ctx, query, url, userID)
	if err != nil {
		return "", fmt.Errorf("ошибка при сохранении URL аватара: %w", err)
	}

	return url, nil
}

// DeleteAvatar removes the user's avatar from S3 and clears the URL in the database
func (s *Service) DeleteAvatar(ctx context.Context, userID int64) error {
	if s.db == nil {
		return fmt.Errorf("database connection not available")
	}
	// Get current avatar URL
	var avatarURL sql.NullString
	query := `SELECT avatar_url FROM users WHERE id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&avatarURL)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("пользователь не найден")
		}
		return fmt.Errorf("ошибка при получении аватара: %w", err)
	}

	if !avatarURL.Valid || avatarURL.String == "" {
		return nil // Nothing to delete
	}

	// Extract S3 key from URL
	// URL format: https://endpoint/bucket/key
	// We need to extract the key part
	if s.s3 != nil {
		urlStr := avatarURL.String
		// Find the key by looking for "avatars/" in the URL
		idx := strings.Index(urlStr, "avatars/")
		if idx >= 0 {
			key := urlStr[idx:]
			if err := s.s3.DeleteFile(ctx, key); err != nil {
				s.log.Errorw("Не удалось удалить аватар из S3", "error", err, "key", key)
				// Continue to clear the URL even if S3 delete fails
			}
		}
	}

	// Clear avatar URL in database
	updateQuery := `UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`
	_, err = s.db.ExecContext(ctx, updateQuery, userID)
	if err != nil {
		return fmt.Errorf("ошибка при удалении аватара: %w", err)
	}

	return nil
}

// CompleteOnboarding marks the user's onboarding as completed
func (s *Service) CompleteOnboarding(ctx context.Context, userID int64) error {
	if s.db == nil {
		return fmt.Errorf("database connection not available")
	}
	query := `UPDATE users SET onboarding_completed = true, updated_at = NOW() WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("ошибка при завершении онбординга: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("ошибка при проверке обновления: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("пользователь не найден")
	}

	return nil
}

// EnsureSettingsExist creates default settings for a user if they don't exist
func (s *Service) EnsureSettingsExist(ctx context.Context, userID int64) error {
	if s.db == nil {
		return fmt.Errorf("database connection not available")
	}
	query := `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`

	_, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("ошибка при создании настроек: %w", err)
	}

	return nil
}
