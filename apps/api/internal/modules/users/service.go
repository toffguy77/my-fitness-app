package users

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"github.com/burcev/api/internal/shared/upload"
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
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	Timezone           string   `json:"timezone"`
	TelegramUsername   string   `json:"telegram_username,omitempty"`
	InstagramUsername  string   `json:"instagram_username,omitempty"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight,omitempty"`
	Height             *float64 `json:"height,omitempty"`
	BirthDate          *string  `json:"birth_date,omitempty"`
	BiologicalSex      *string  `json:"biological_sex,omitempty"`
	ActivityLevel      *string  `json:"activity_level,omitempty"`
	FitnessGoal        *string  `json:"fitness_goal,omitempty"`
}

// SettingsProvided marks which fields of a settings update actually
// appeared in the request body, as distinct from a field the request left
// out. Both an absent key and an explicit `null` unmarshal to the same Go
// zero value (empty string, nil pointer), so Settings alone cannot tell
// "the caller didn't mention this" from "the caller wants it cleared" —
// and a caller genuinely does mean the latter sometimes: SettingsBody on
// the client sends an explicit null to clear target_weight, birth_date,
// height, biological_sex, activity_level or fitness_goal, and clearing a
// linked telegram/instagram handle is a real action too. UpdateSettings
// uses this to decide, per column, whether to touch it at all.
type SettingsProvided struct {
	Language           bool
	Units              bool
	Timezone           bool
	TelegramUsername   bool
	InstagramUsername  bool
	AppleHealthEnabled bool
	TargetWeight       bool
	Height             bool
	BirthDate          bool
	BiologicalSex      bool
	ActivityLevel      bool
	FitnessGoal        bool
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
	// birth_date is scanned as a string, and pgx renders a DATE column as a
	// full RFC3339 timestamp ("2001-05-03T00:00:00Z") for a text scan target.
	// <input type="date"> on the client accepts only "YYYY-MM-DD" and silently
	// renders blank for anything else, so the calendar-date form is produced
	// here rather than relying on every caller to truncate it.
	query := `
		SELECT u.id, u.email, COALESCE(u.name, ''), u.role, COALESCE(u.avatar_url, ''), COALESCE(u.onboarding_completed, false),
		       COALESCE(s.language, 'ru'), COALESCE(s.units, 'metric'), COALESCE(s.timezone, 'Europe/Moscow'),
		       COALESCE(s.telegram_username, ''), COALESCE(s.instagram_username, ''), COALESCE(s.apple_health_enabled, false),
		       s.target_weight, s.height,
		       to_char(s.birth_date, 'YYYY-MM-DD'), s.biological_sex, s.activity_level, s.fitness_goal
		FROM users u
		LEFT JOIN user_settings s ON s.user_id = u.id
		WHERE u.id = $1
	`

	var profile FullProfile
	var targetWeight sql.NullFloat64
	var height sql.NullFloat64
	var birthDate, biologicalSex, activityLevel, fitnessGoal sql.NullString
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&profile.ID,
		&profile.Email,
		&profile.Name,
		&profile.Role,
		&profile.AvatarURL,
		&profile.OnboardingCompleted,
		&profile.Settings.Language,
		&profile.Settings.Units,
		&profile.Settings.Timezone,
		&profile.Settings.TelegramUsername,
		&profile.Settings.InstagramUsername,
		&profile.Settings.AppleHealthEnabled,
		&targetWeight,
		&height,
		&birthDate,
		&biologicalSex,
		&activityLevel,
		&fitnessGoal,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("пользователь не найден")
		}
		return nil, fmt.Errorf("ошибка при получении профиля: %w", err)
	}

	if targetWeight.Valid {
		profile.Settings.TargetWeight = &targetWeight.Float64
	}
	if height.Valid {
		profile.Settings.Height = &height.Float64
	}
	if birthDate.Valid {
		profile.Settings.BirthDate = &birthDate.String
	}
	if biologicalSex.Valid {
		profile.Settings.BiologicalSex = &biologicalSex.String
	}
	if activityLevel.Valid {
		profile.Settings.ActivityLevel = &activityLevel.String
	}
	if fitnessGoal.Valid {
		profile.Settings.FitnessGoal = &fitnessGoal.String
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

// UpdateSettings upserts user settings and returns the updated settings.
//
// A field with Provided false is left untouched: the incoming value (always
// the Go zero value for an omitted field) is never written, so a request
// carrying only one field — e.g. the Apple Health toggle sending just
// {"apple_health_enabled": true} — cannot wipe the rest of the row. A field
// with Provided true is written exactly as given, including a nil pointer,
// so a caller can still deliberately clear a nullable column (target_weight,
// birth_date, height, biological_sex, activity_level, fitness_goal,
// telegram_username, instagram_username all support this from the client).
//
// The registration flow always creates a bare user_settings row first
// (auth.Register: "INSERT INTO user_settings (user_id) VALUES ($1) ON
// CONFLICT DO NOTHING"), so in practice the ON CONFLICT branch is what runs.
// The plain INSERT branch below still has to produce a row that satisfies
// the NOT NULL columns (language, units, timezone) even if the very first
// call omits them, so it falls back to the same defaults as migration 014/022
// for those three; the rest fall back to NULL/false like their column
// defaults, which is safe because none of them are NOT NULL.
func (s *Service) UpdateSettings(ctx context.Context, userID int64, settings Settings, provided SettingsProvided) (*Settings, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection not available")
	}
	query := `
		INSERT INTO user_settings (user_id, language, units, timezone, telegram_username, instagram_username, apple_health_enabled, target_weight, height, birth_date, biological_sex, activity_level, fitness_goal, updated_at)
		VALUES (
		  $1,
		  CASE WHEN $14 THEN $2::text ELSE 'ru' END,
		  CASE WHEN $15 THEN $3::text ELSE 'metric' END,
		  CASE WHEN $16 THEN $4::text ELSE 'Europe/Moscow' END,
		  CASE WHEN $17 THEN $5::text ELSE NULL END,
		  CASE WHEN $18 THEN $6::text ELSE NULL END,
		  CASE WHEN $19 THEN $7::boolean ELSE false END,
		  CASE WHEN $20 THEN $8::numeric ELSE NULL END,
		  CASE WHEN $21 THEN $9::numeric ELSE NULL END,
		  CASE WHEN $22 THEN $10::date ELSE NULL END,
		  CASE WHEN $23 THEN $11::text ELSE NULL END,
		  CASE WHEN $24 THEN $12::text ELSE 'moderate' END,
		  CASE WHEN $25 THEN $13::text ELSE 'maintain' END,
		  NOW()
		)
		ON CONFLICT (user_id) DO UPDATE SET
		  language = CASE WHEN $14 THEN EXCLUDED.language ELSE user_settings.language END,
		  units = CASE WHEN $15 THEN EXCLUDED.units ELSE user_settings.units END,
		  timezone = CASE WHEN $16 THEN EXCLUDED.timezone ELSE user_settings.timezone END,
		  telegram_username = CASE WHEN $17 THEN EXCLUDED.telegram_username ELSE user_settings.telegram_username END,
		  instagram_username = CASE WHEN $18 THEN EXCLUDED.instagram_username ELSE user_settings.instagram_username END,
		  apple_health_enabled = CASE WHEN $19 THEN EXCLUDED.apple_health_enabled ELSE user_settings.apple_health_enabled END,
		  target_weight = CASE WHEN $20 THEN EXCLUDED.target_weight ELSE user_settings.target_weight END,
		  height = CASE WHEN $21 THEN EXCLUDED.height ELSE user_settings.height END,
		  birth_date = CASE WHEN $22 THEN EXCLUDED.birth_date ELSE user_settings.birth_date END,
		  biological_sex = CASE WHEN $23 THEN EXCLUDED.biological_sex ELSE user_settings.biological_sex END,
		  activity_level = CASE WHEN $24 THEN EXCLUDED.activity_level ELSE user_settings.activity_level END,
		  fitness_goal = CASE WHEN $25 THEN EXCLUDED.fitness_goal ELSE user_settings.fitness_goal END,
		  updated_at = NOW()
		RETURNING language, units, timezone, COALESCE(telegram_username, ''), COALESCE(instagram_username, ''), apple_health_enabled, target_weight, height, to_char(birth_date, 'YYYY-MM-DD'), biological_sex, activity_level, fitness_goal
	`

	var result Settings
	var targetWeight sql.NullFloat64
	var height sql.NullFloat64
	var birthDate, biologicalSex, activityLevel, fitnessGoal sql.NullString
	err := s.db.QueryRowContext(ctx, query,
		userID,
		settings.Language,
		settings.Units,
		settings.Timezone,
		settings.TelegramUsername,
		settings.InstagramUsername,
		settings.AppleHealthEnabled,
		settings.TargetWeight,
		settings.Height,
		settings.BirthDate,
		settings.BiologicalSex,
		settings.ActivityLevel,
		settings.FitnessGoal,
		provided.Language,
		provided.Units,
		provided.Timezone,
		provided.TelegramUsername,
		provided.InstagramUsername,
		provided.AppleHealthEnabled,
		provided.TargetWeight,
		provided.Height,
		provided.BirthDate,
		provided.BiologicalSex,
		provided.ActivityLevel,
		provided.FitnessGoal,
	).Scan(
		&result.Language,
		&result.Units,
		&result.Timezone,
		&result.TelegramUsername,
		&result.InstagramUsername,
		&result.AppleHealthEnabled,
		&targetWeight,
		&height,
		&birthDate,
		&biologicalSex,
		&activityLevel,
		&fitnessGoal,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении настроек: %w", err)
	}

	if targetWeight.Valid {
		result.TargetWeight = &targetWeight.Float64
	}
	if height.Valid {
		result.Height = &height.Float64
	}
	if birthDate.Valid {
		result.BirthDate = &birthDate.String
	}
	if biologicalSex.Valid {
		result.BiologicalSex = &biologicalSex.String
	}
	if activityLevel.Valid {
		result.ActivityLevel = &activityLevel.String
	}
	if fitnessGoal.Valid {
		result.FitnessGoal = &fitnessGoal.String
	}

	return &result, nil
}

// UploadAvatar uploads a user avatar to S3 and updates the avatar URL
func (s *Service) UploadAvatar(ctx context.Context, userID int64, file upload.File) (string, error) {
	if s.s3 == nil {
		return "", fmt.Errorf("загрузка фото недоступна")
	}

	// The key is server-generated and its extension follows the detected type,
	// so a crafted filename cannot influence where the object lands.
	key := upload.Key("avatars", userID, file.Kind)

	url, err := s.s3.UploadFile(ctx, key, bytes.NewReader(file.Data), file.ContentType(), int64(file.Size))
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
