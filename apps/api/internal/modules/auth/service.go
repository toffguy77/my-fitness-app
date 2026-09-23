package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"strings"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	RefreshTokenTTLDefault    = 24 * time.Hour
	RefreshTokenTTLRememberMe = 30 * 24 * time.Hour
)

// Default display names for users who register without a name.
// Format: "Цвет Животное" — deterministic by user ID.
var defaultColors = []string{
	"Синий", "Зелёный", "Красный", "Оранжевый", "Фиолетовый",
	"Золотой", "Серебряный", "Бирюзовый", "Розовый", "Белый",
}

var defaultAnimals = []string{
	"Кот", "Ёж", "Лис", "Медведь", "Волк", "Тигр",
	"Сокол", "Дельфин", "Панда", "Кролик", "Лев", "Олень",
}

// Maps animal name to SVG filename for default avatars
var animalAvatarFile = map[string]string{
	"Кот": "cat", "Ёж": "hedgehog", "Лис": "fox", "Медведь": "bear",
	"Волк": "wolf", "Тигр": "tiger", "Сокол": "falcon", "Дельфин": "dolphin",
	"Панда": "panda", "Кролик": "rabbit", "Лев": "lion", "Олень": "deer",
}

// generateDefaultIdentity returns a display name and avatar URL for a new user.
func generateDefaultIdentity(userID int64) (name, avatarURL string) {
	color := defaultColors[userID%int64(len(defaultColors))]
	animal := defaultAnimals[(userID/int64(len(defaultColors)))%int64(len(defaultAnimals))]
	name = color + " " + animal
	avatarURL = "/avatars/default/" + animalAvatarFile[animal] + ".svg"
	return name, avatarURL
}

// Service handles auth business logic
type Service struct {
	db          *sql.DB
	cfg         *config.Config
	log         *logger.Logger
	tokens      *TokenGenerator
	passwordVal *PasswordValidator
	// sessions lets a revocation take effect at once rather than within the
	// middleware's cache TTL. Optional: without it the revocation is still
	// correct, just up to half a minute late.
	sessions SessionCache
	// emailService sends the letters this service triggers (magic links
	// today). Optional: when the email capability is off, this is nil, and
	// that is the normal state in an environment with no SMTP credentials —
	// not an error.
	emailService MagicLinkSender
}

// SessionCache is the narrow part of middleware.TokenVersions this service
// needs, declared here so the auth module does not depend on the middleware
// package for one method.
//
// Bumping the version and dropping the cached one are one call, not two: when
// they were separate the cache kept answering with the old version for half a
// minute after a password change, and every request in that window — including
// ones carrying a token minted a second earlier — was refused.
type SessionCache interface {
	BumpVersion(ctx context.Context, tx *sql.Tx, userID int64) error
}

// WithSessionCache supplies the cache to invalidate on a revocation.
func (s *Service) WithSessionCache(cache SessionCache) *Service {
	s.sessions = cache
	return s
}

// MagicLinkSender is the narrow part of email.Service this service needs,
// declared here so the auth module does not depend on the whole email
// package — its SMTP configuration and its five other letters — for the one
// method a magic link needs to send. *email.Service satisfies it on its own.
type MagicLinkSender interface {
	SendMagicLink(ctx context.Context, data email.MagicLinkEmailData) error
}

// WithEmailService supplies the sender for letters this service triggers.
// Separate from the constructor for the same reason as WithSessionCache: the
// service is built at startup before the email capability's availability is
// known, and the two would otherwise have to agree on construction order.
func (s *Service) WithEmailService(sender MagicLinkSender) *Service {
	s.emailService = sender
	return s
}

// NewService creates a new auth service
func NewService(db *sql.DB, cfg *config.Config, log *logger.Logger) *Service {
	return &Service{
		db:          db,
		cfg:         cfg,
		log:         log,
		tokens:      NewTokenGenerator(),
		passwordVal: NewPasswordValidator(),
	}
}

// User represents a user
type User struct {
	ID                  int64     `json:"id"`
	Email               string    `json:"email"`
	Name                string    `json:"name,omitempty"`
	Role                string    `json:"role"`
	EmailVerified       bool      `json:"email_verified"`
	OnboardingCompleted bool      `json:"onboarding_completed"`
	CreatedAt           time.Time `json:"created_at"`
	// TokenVersion is not sent to the client; it travels inside the access
	// token so the server can tell a token issued before a password change
	// from one issued after.
	TokenVersion int `json:"-"`
}

// LoginResult represents login response
type LoginResult struct {
	User  *User  `json:"user"`
	Token string `json:"token"`
	// RefreshToken живёт только внутри: обработчик кладёт его в HttpOnly-cookie
	// и не показывает в теле ответа.
	//
	// Токен в теле можно записать в журнал, оставить в кэше посредника или
	// прочитать из ответа любым сценарием на странице — ровно от этого и
	// уводил переезд в cookie, а тело ответа сводило его на нет. Клиент его
	// не читал ни разу: он был объявлен в типе и больше нигде.
	RefreshToken string `json:"-"`
	// PendingDeletion is set when this account is inside its cancellation
	// window. Somebody who signs in during those thirty days has almost
	// certainly changed their mind, and the app has to be able to say so
	// instead of behaving as though nothing is about to happen.
	PendingDeletion *PendingDeletion `json:"pending_deletion,omitempty"`
}

// PendingDeletion describes an account waiting to be erased.
type PendingDeletion struct {
	RequestedAt  time.Time `json:"requested_at"`
	ScheduledFor time.Time `json:"scheduled_for"`
}

// Register registers a new user and returns login result with tokens
// isUniqueViolation reports a PostgreSQL unique-constraint violation.
//
// По коду, а не по тексту: текст меняется от версии к версии и от языка
// сообщений, а 23505 — часть протокола.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *Service) Register(ctx context.Context, email, password, name, ip, ua string, consents *ConsentsInput) (*LoginResult, error) {
	s.log.Infow("User registration", "email", email)

	// Validate password policy
	if result := s.passwordVal.Validate(password); !result.Valid {
		return nil, &PolicyError{Reasons: result.Errors}
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("ошибка при хешировании пароля: %w", err)
	}

	// Insert user into database
	query := `
		INSERT INTO users (email, password, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, 'client', NOW(), NOW())
		RETURNING id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at
	`

	var user User
	startTime := time.Now()
	err = s.db.QueryRowContext(ctx, query, email, string(hashedPassword), name).Scan(
		&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt,
	)
	s.log.LogDatabaseQuery("Register.InsertUser", time.Since(startTime), err, map[string]any{"email": email})
	if err != nil {
		// Занятый адрес — обычный исход, а не неисправность. Различать его
		// здесь, а не отдавать наружу текст ошибки базы: обработчик пересказывал
		// его дословно, и человек получал
		// «duplicate key value violates unique constraint "users_email_key"» —
		// вместе с устройством нашей базы.
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("адрес уже зарегистрирован: %w", apperrors.ErrConflict)
		}
		return nil, fmt.Errorf("ошибка при регистрации: %w", err)
	}

	// Assign default name and avatar when user registered without a name
	if strings.TrimSpace(name) == "" {
		defaultName, avatarURL := generateDefaultIdentity(user.ID)
		_, err = s.db.ExecContext(ctx,
			"UPDATE users SET name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3",
			defaultName, avatarURL, user.ID,
		)
		if err != nil {
			s.log.Warnw("Failed to set default identity", "user_id", user.ID, "error", err)
		} else {
			user.Name = defaultName
		}
	}

	// Create default user settings
	_, _ = s.db.ExecContext(ctx, "INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", user.ID)

	// Store consents
	s.storeConsents(ctx, user.ID, consents, ip, ua)

	// Auto-assign curator (coordinator with fewest active clients)
	s.assignCurator(ctx, user.ID)

	// Generate JWT token
	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Generate refresh token
	refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua, false)
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh token: %w", err)
	}

	return &LoginResult{
		User:         &user,
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// storeConsents records each consent flag as its own row.
//
// Extracted out of Register so the magic-link account path (createAccountFromMagicLink)
// writes consents the exact same way: a divergence here would mean some
// accounts have no record of what they agreed to, invisible on a mock that
// does not keep rows.
//
// Best effort, as Register always treated it: a row failing to write is
// logged, not fatal — the account is real either way, and refusing it over a
// consent log entry would be a strange kind of protection.
func (s *Service) storeConsents(ctx context.Context, userID int64, consents *ConsentsInput, ip, ua string) {
	if consents == nil {
		return
	}
	consentTypes := []struct {
		ctype   string
		granted bool
	}{
		{"terms_of_service", consents.TermsOfService},
		{"privacy_policy", consents.PrivacyPolicy},
		{"data_processing", consents.DataProcessing},
		{"marketing", consents.Marketing},
	}
	for _, c := range consentTypes {
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO user_consents (user_id, consent_type, granted, granted_at, ip_address, user_agent)
			 VALUES ($1, $2, $3, NOW(), $4::inet, $5)`,
			userID, c.ctype, c.granted, ip, ua,
		)
		if err != nil {
			s.log.Warnw("Failed to store consent", "user_id", userID, "type", c.ctype, "error", err)
		}
	}
}

// dummyBcryptHash: хэш, с которым сравнивают, когда сравнивать не с чем: он
// нужен только затем, чтобы отказ беспарольному аккаунту занимал столько же
// времени, сколько неверный пароль.
const dummyBcryptHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

// Login authenticates a user
func (s *Service) Login(ctx context.Context, email, password, ip, ua string, rememberMe bool) (*LoginResult, error) {
	s.log.Infow("User login", "email", email)

	// Look up user by email
	query := `
		SELECT id, email, COALESCE(name, ''), password, role, email_verified, COALESCE(onboarding_completed, false), created_at, deletion_requested_at, token_version
		FROM users
		WHERE email = $1
	`

	var user User
	var storedPassword sql.NullString
	var deletionRequestedAt sql.NullTime
	startTime := time.Now()
	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.Name, &storedPassword, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt, &deletionRequestedAt, &user.TokenVersion,
	)
	s.log.LogDatabaseQuery("Login.LookupUser", time.Since(startTime), err, map[string]any{"email": email})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("Login.LookupUser: %w", apperrors.ErrInvalidCredentials)
		}
		return nil, fmt.Errorf("ошибка при входе: %w", err)
	}

	// Пароля нет вовсе (аккаунт заведён внешним провайдером или ссылкой входа)
	// либо сохранена пустая строка. И то и другое — не пароль, а его
	// отсутствие, и отвечать на это надо тем же, чем на неверный пароль:
	// разница в ответе сообщила бы, каким способом человек регистрировался.
	// PasswordIsSet, а не проверка на месте: то же самое правило уже было
	// написано вручную здесь и параллельно расходилось в HasPassword,
	// ConfirmLinkWithPassword и UnlinkProvider — именно параллельность и
	// породила расхождения. Здесь оно было верным и до этой правки, но
	// оставлять его пятым отдельным выражением значит первым, кто исправит
	// правило в одном месте, забыть про это.
	//
	// Сравнение с фиктивным хэшем — чтобы отказ стоил столько же времени,
	// сколько неверный пароль; разница в скорости говорит то же самое, что
	// разница в тексте.
	if !PasswordIsSet(storedPassword) {
		_ = bcrypt.CompareHashAndPassword([]byte(dummyBcryptHash), []byte(password))
		return nil, fmt.Errorf("Login.NoPassword: %w", apperrors.ErrInvalidCredentials)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(storedPassword.String), []byte(password)); err != nil {
		// If stored password is not a bcrypt hash, try plaintext comparison
		// and migrate to bcrypt on success
		if strings.HasPrefix(storedPassword.String, "$2") {
			return nil, fmt.Errorf("Login.VerifyPassword: %w", apperrors.ErrInvalidCredentials)
		}
		if storedPassword.String != password {
			return nil, fmt.Errorf("Login.VerifyPassword: %w", apperrors.ErrInvalidCredentials)
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
	refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua, rememberMe)
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh token: %w", err)
	}

	result := &LoginResult{
		User:         &user,
		Token:        token,
		RefreshToken: refreshToken,
	}

	// Signing in during the cancellation window is almost always somebody
	// changing their mind. The app can only offer them the way back if it is
	// told there is something to come back from.
	if deletionRequestedAt.Valid {
		result.PendingDeletion = &PendingDeletion{
			RequestedAt:  deletionRequestedAt.Time,
			ScheduledFor: deletionRequestedAt.Time.Add(accountCancellationWindow),
		}
	}

	return result, nil
}

// accountCancellationWindow mirrors account.CancellationWindow. Duplicated
// rather than imported: auth must not depend on the account module to answer
// "when does this disappear", and the two are checked against each other by
// TestCancellationWindowsAgree.
const accountCancellationWindow = 30 * 24 * time.Hour

// RefreshTokens validates a refresh token, rotates it, and returns new tokens
func (s *Service) RefreshTokens(ctx context.Context, plainToken, ip, ua string) (*LoginResult, error) {
	tokenHash := s.tokens.HashToken(plainToken)

	// Look up the refresh token
	var id, userID int64
	var expiresAt time.Time
	var revokedAt sql.NullTime
	var replacedBy sql.NullString
	var rememberMe bool

	startTime := time.Now()
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me
		 FROM refresh_tokens WHERE token_hash = $1`,
		tokenHash,
	).Scan(&id, &userID, &expiresAt, &revokedAt, &replacedBy, &rememberMe)
	s.log.LogDatabaseQuery("Refresh.LookupToken", time.Since(startTime), err, nil)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("Refresh.LookupToken: %w", apperrors.ErrTokenInvalid)
		}
		return nil, fmt.Errorf("failed to look up refresh token: %w", err)
	}

	// Reuse detection: if the token was already revoked, check if it was a recent
	// rotation (grace period for concurrent requests from multiple tabs).
	if revokedAt.Valid {
		gracePeriod := 30 * time.Second
		// Only a rotation earns the grace period, and a rotation is what set
		// replaced_by_hash. A revocation made for safety — a password change,
		// a reset, reuse detection itself — leaves it empty.
		//
		// Without that distinction the grace period undid the thing it sat
		// next to: for thirty seconds after somebody changed their password,
		// the old refresh token still bought a working session, which is
		// exactly the token they changed their password to defeat.
		rotated := replacedBy.Valid && replacedBy.String != ""
		if rotated && time.Since(revokedAt.Time) < gracePeriod {
			// Recent revocation — likely a race condition from multiple tabs.
			// Look up the replacement token's result instead of revoking everything.
			s.log.Infow("Refresh token reuse within grace period, looking up replacement",
				"user_id", userID, "revoked_ago_ms", time.Since(revokedAt.Time).Milliseconds())
			return s.handleGracefulReuse(ctx, id, userID, ip, ua, rememberMe)
		}
		s.log.Warnw("Refresh token reuse detected, revoking all tokens for user", "user_id", userID)
		s.revokeAllUserRefreshTokens(ctx, userID)
		return nil, fmt.Errorf("refresh token reuse detected")
	}

	// Check expiry
	if time.Now().After(expiresAt) {
		return nil, fmt.Errorf("Refresh.CheckExpiry: %w", apperrors.ErrTokenExpired)
	}

	// Use a detached context with timeout for token rotation.
	// The HTTP request context can be canceled if the client disconnects
	// (e.g. mobile browser resuming from background), but token rotation
	// must complete to avoid leaving the old token revoked without a replacement.
	dbCtx, dbCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer dbCancel()

	// Token rotation in a transaction: revoke old, create new
	tx, err := s.db.BeginTx(dbCtx, nil)
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
	_, err = tx.ExecContext(dbCtx,
		`UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = $1 WHERE id = $2`,
		newHash, id,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to revoke old refresh token: %w", err)
	}

	// Insert new refresh token
	ttl := RefreshTokenTTLDefault
	if rememberMe {
		ttl = RefreshTokenTTLRememberMe
	}
	expiresAtNew := time.Now().Add(ttl)
	_, err = tx.ExecContext(dbCtx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, remember_me, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		userID, newHash, expiresAtNew, ip, ua, rememberMe,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert new refresh token: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Look up user for JWT claims
	var user User
	err = s.db.QueryRowContext(dbCtx,
		`SELECT id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at, token_version
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt, &user.TokenVersion)
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

// handleGracefulReuse handles the case where a refresh token was recently rotated
// (e.g., by another browser tab). Instead of revoking all tokens, it issues new
// tokens for the user, treating it as a benign race condition.
func (s *Service) handleGracefulReuse(ctx context.Context, oldTokenID, userID int64, ip, ua string, rememberMe bool) (*LoginResult, error) {
	// Issue a brand new refresh token for this client
	newPlain, err := s.createRefreshToken(ctx, userID, ip, ua, rememberMe)
	if err != nil {
		return nil, fmt.Errorf("failed to create replacement refresh token: %w", err)
	}

	// Look up user for JWT claims
	var user User
	err = s.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at, token_version
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt, &user.TokenVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to look up user: %w", err)
	}

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

// ChangePassword allows an authenticated user to update their password.
// It verifies the current password, validates the new one against policy,
// and updates the stored bcrypt hash.
// ChangePassword changes the password and ends every other session.
//
// `replacement` is filled with a fresh token pair for the caller's own session:
// see endAllSessions for why every other one is destroyed and this one is not.
func (s *Service) ChangePassword(ctx context.Context, userID int64, currentPassword, newPassword string, replacement *LoginResult) error {
	var storedHash sql.NullString
	startTime := time.Now()
	err := s.db.QueryRowContext(ctx,
		`SELECT password FROM users WHERE id = $1`,
		userID,
	).Scan(&storedHash)
	s.log.LogDatabaseQuery("ChangePassword.GetHash", time.Since(startTime), err, map[string]any{"user_id": userID})
	if err != nil {
		return fmt.Errorf("ошибка при получении данных пользователя: %w", err)
	}

	// An account created through an external provider or a magic link has no
	// password (password = NULL) to change. Unlike RequestDeletion, there is
	// no fallback proof that would make "change" meaningful here: the form
	// asks for a *current* password to confirm against, and none exists to
	// confirm against. The honest answer is the same one already used for the
	// identical situation in oauth_service.ConfirmLinkWithPassword — a clear
	// conflict, not an internal error and not a silent skip that would let
	// anyone with a live session set a password on someone else's provider-only
	// account.
	if !PasswordIsSet(storedHash) {
		return fmt.Errorf("аккаунт без пароля: нечего менять: %w", apperrors.ErrConflict)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash.String), []byte(currentPassword)); err != nil {
		return fmt.Errorf("ChangePassword.verify: %w", apperrors.ErrInvalidCredentials)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash.String), []byte(newPassword)); err == nil {
		return fmt.Errorf("новый пароль должен отличаться от текущего: %w", apperrors.ErrPasswordUnchanged)
	}

	if result := s.passwordVal.Validate(newPassword); !result.Valid {
		return &PolicyError{Reasons: result.Errors}
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("ошибка при хешировании пароля: %w", err)
	}

	startTime2 := time.Now()
	_, err = s.db.ExecContext(ctx,
		`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`,
		string(newHash), userID,
	)
	s.log.LogDatabaseQuery("ChangePassword.UpdateHash", time.Since(startTime2), err, map[string]any{"user_id": userID})
	if err != nil {
		return fmt.Errorf("ошибка при обновлении пароля: %w", err)
	}

	// End every session: a stolen refresh token must not survive the very
	// action a user takes to recover from the theft. Bumping the version does
	// the same for access tokens already issued, which otherwise keep working
	// for their full fifteen minutes.
	if err := s.endAllSessions(ctx, userID); err != nil {
		return err
	}

	// ...except this one. Signing somebody out of the device they are standing
	// at, as a reward for changing their password, teaches them not to.
	var user User
	err = s.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at, token_version
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt, &user.TokenVersion)
	if err != nil {
		return fmt.Errorf("failed to look up user after password change: %w", err)
	}

	accessToken, err := s.generateToken(&user)
	if err != nil {
		return fmt.Errorf("failed to issue a replacement access token: %w", err)
	}
	refreshToken, err := s.createRefreshToken(ctx, userID, "", "", false)
	if err != nil {
		return fmt.Errorf("failed to issue a replacement refresh token: %w", err)
	}

	*replacement = LoginResult{User: &user, Token: accessToken, RefreshToken: refreshToken}
	return nil
}

// endAllSessions revokes every refresh token and invalidates every access token
// already issued, in one transaction.
//
// Two mechanisms because they cover different halves of the problem: revoking
// refresh tokens stops new access tokens being minted, and the version bump
// stops the ones already minted from being accepted.
func (s *Service) endAllSessions(ctx context.Context, userID int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin session invalidation: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
		userID); err != nil {
		return fmt.Errorf("revoke refresh tokens: %w", err)
	}
	// Loud rather than silent: without this the refresh tokens are revoked and
	// the access tokens are not, which is a revocation that does not revoke.
	if s.sessions == nil {
		return fmt.Errorf("session invalidation needs a token-version cache: %w", apperrors.ErrValidation)
	}
	if err := s.sessions.BumpVersion(ctx, tx, userID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit session invalidation: %w", err)
	}
	return nil
}

// RevokeRefreshToken revokes a single refresh token (for logout)
func (s *Service) RevokeRefreshToken(ctx context.Context, plainToken string) error {
	tokenHash := s.tokens.HashToken(plainToken)
	startTime := time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
		tokenHash,
	)
	s.log.LogDatabaseQuery("Logout.RevokeToken", time.Since(startTime), err, nil)
	return err
}

// createRefreshToken generates and stores a new refresh token
func (s *Service) createRefreshToken(ctx context.Context, userID int64, ip, ua string, rememberMe bool) (string, error) {
	plainToken, hashedToken, err := s.tokens.GenerateToken()
	if err != nil {
		return "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	ttl := RefreshTokenTTLDefault
	if rememberMe {
		ttl = RefreshTokenTTLRememberMe
	}
	expiresAt := time.Now().Add(ttl)

	startTime := time.Now()
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, remember_me, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		userID, hashedToken, expiresAt, ip, ua, rememberMe,
	)
	s.log.LogDatabaseQuery("RefreshToken.Insert", time.Since(startTime), err, map[string]any{"user_id": userID})
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
	// Кого нельзя ставить куратором новому человеку:
	//
	//   • служебные учётки прогона. На проде они живут постоянно и всегда
	//     пусты — а выбирается наименее загруженный, то есть они всегда
	//     первые в очереди. Клиент достался бы куратору, который никогда не
	//     ответит. На 23 сентября из трёх кандидатов с нулём клиентов два
	//     были тестовыми;
	//   • ушедших. Учётка с запрошенным удалением деактивирована и через 30
	//     дней исчезнет вовсе, но кандидатом оставалась: у владельца продукта
	//     такая висела с 15 сентября и всё это время могла получить клиента;
	//   • удалённых.
	//
	// Шаблон служебных адресов повторён в SQL, а не вызван из Go, потому что
	// выбор делает один запрос: вытащить всех координаторов и отсеять в коде
	// значило бы читать таблицу целиком ради одной строки. Совпадение с
	// testaccounts.IsTest стережёт TestAssignmentSkipsTestAccounts.
	var curatorID int64
	err := s.db.QueryRowContext(ctx, `
		SELECT u.id
		FROM users u
		LEFT JOIN curator_client_relationships ccr
			ON ccr.curator_id = u.id AND ccr.status = 'active'
		WHERE u.role = 'coordinator'
		  AND u.deleted_at IS NULL
		  AND u.deletion_requested_at IS NULL
		  AND LOWER(u.email) NOT LIKE '%@burcev.test'
		  AND NOT (LOWER(u.email) LIKE 'e2e-%' AND LOWER(u.email) LIKE '%@burcev.team')
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
		ON CONFLICT (client_id, curator_id) WHERE anonymized_at IS NULL DO NOTHING
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
		// The version the account had when this token was issued. Revoking a
		// refresh token closes the future; without this, an access token
		// already in an attacker's hands keeps working for its full fifteen
		// minutes — exactly the fifteen minutes the password change was meant
		// to take away.
		"tv":  user.TokenVersion,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
