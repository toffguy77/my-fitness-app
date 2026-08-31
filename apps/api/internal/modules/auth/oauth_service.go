package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
)

// OAuthOutcome describes what an external sign-in resulted in.
type OAuthOutcome struct {
	// Result tells the caller which screen to show.
	Result OAuthResult
	// User is set when sign-in succeeded.
	User *LoginResult
	// Email is set when the address already belongs to an account, so the
	// linking screen can name it.
	Email string
	// Provider and ProviderUserID identify the external account awaiting a
	// link, so the confirmation step knows what to attach.
	Provider       string
	ProviderUserID string
}

// OAuthResult enumerates the outcomes of an external sign-in.
type OAuthResult string

const (
	// OAuthSignedIn: the external account is linked and the user is in.
	OAuthSignedIn OAuthResult = "signed_in"
	// OAuthRegistered: a new account was created.
	OAuthRegistered OAuthResult = "registered"
	// OAuthNeedsLinkConfirmation: the address already belongs to an account.
	//
	// Signing in automatically on a matching address is a known account
	// takeover: it makes our security depend on the provider's assertion about
	// an address we did not verify. The user proves they own the account first.
	OAuthNeedsLinkConfirmation OAuthResult = "needs_link_confirmation"
	// OAuthNeedsEmail: the provider returned no address.
	OAuthNeedsEmail OAuthResult = "needs_email"
)

// SignInWithProvider completes an external sign-in.
func (s *Service) SignInWithProvider(ctx context.Context, provider string, profile *oauth.Profile, ip, ua string) (*OAuthOutcome, error) {
	// Identity is the (provider, provider_user_id) pair, so a person who
	// changes their address at the provider keeps their account here.
	userID, err := s.userIDForExternalIdentity(ctx, provider, profile.ProviderUserID)
	if err != nil {
		return nil, err
	}
	if userID != 0 {
		if _, err := s.db.ExecContext(ctx,
			`UPDATE external_identities SET last_login_at = NOW()
			 WHERE provider = $1 AND provider_user_id = $2`,
			provider, profile.ProviderUserID); err != nil {
			s.log.Errorw("Failed to record external login", "error", err, "user_id", userID)
		}

		result, err := s.issueTokensForUser(ctx, userID, ip, ua)
		if err != nil {
			return nil, err
		}
		return &OAuthOutcome{Result: OAuthSignedIn, User: result}, nil
	}

	if profile.Email == "" {
		// Not every provider returns an address, and some need extra scopes for
		// it. The caller asks the user instead of inventing one.
		return &OAuthOutcome{
			Result:         OAuthNeedsEmail,
			Provider:       provider,
			ProviderUserID: profile.ProviderUserID,
		}, nil
	}

	existingID, err := s.userIDForEmail(ctx, profile.Email)
	if err != nil {
		return nil, err
	}
	if existingID != 0 {
		return &OAuthOutcome{
			Result:         OAuthNeedsLinkConfirmation,
			Email:          profile.Email,
			Provider:       provider,
			ProviderUserID: profile.ProviderUserID,
		}, nil
	}

	result, err := s.registerFromProvider(ctx, provider, profile, ip, ua)
	if err != nil {
		return nil, err
	}
	return &OAuthOutcome{Result: OAuthRegistered, User: result}, nil
}

// registerFromProvider creates an account without a password.
//
// The address is treated as verified: the provider authenticated the person
// against it, so sending our own confirmation mail would ask them to prove
// something they just proved.
func (s *Service) registerFromProvider(ctx context.Context, provider string, profile *oauth.Profile, ip, ua string) (*LoginResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin registration: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var userID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified, onboarding_completed)
		VALUES ($1, NULL, $2, 'client', true, false)
		RETURNING id`, profile.Email, nullIfEmpty(profile.Name)).Scan(&userID); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	if err := insertIdentity(ctx, tx, userID, provider, profile); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit registration: %w", err)
	}

	s.log.Info("Registered via external provider", "user_id", userID, "provider", provider)
	return s.issueTokensForUser(ctx, userID, ip, ua)
}

// LinkProvider attaches an external account to an existing user.
//
// Used both from settings and after the user has proved ownership of an account
// whose address matched.
func (s *Service) LinkProvider(ctx context.Context, userID int64, provider string, profile *oauth.Profile) error {
	var ownerID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM external_identities WHERE provider = $1 AND provider_user_id = $2`,
		provider, profile.ProviderUserID).Scan(&ownerID)
	switch {
	case err == nil && ownerID == userID:
		return nil // already linked
	case err == nil:
		return fmt.Errorf("external account belongs to another user: %w", apperrors.ErrConflict)
	case !errors.Is(err, sql.ErrNoRows):
		return fmt.Errorf("check external identity: %w", err)
	}

	if err := insertIdentity(ctx, s.db, userID, provider, profile); err != nil {
		return err
	}

	s.log.Info("Linked external provider", "user_id", userID, "provider", provider)
	return nil
}

// UnlinkProvider removes a link.
//
// Refuses to remove the last way in: a user with no password and one provider
// would lose access to a year of data with a single click.
func (s *Service) UnlinkProvider(ctx context.Context, userID int64, provider string) error {
	var hasPassword bool
	var linkCount int
	if err := s.db.QueryRowContext(ctx, `
		SELECT u.password IS NOT NULL,
		       (SELECT COUNT(*) FROM external_identities WHERE user_id = u.id)
		FROM users u WHERE u.id = $1`, userID).Scan(&hasPassword, &linkCount); err != nil {
		return fmt.Errorf("check sign-in methods: %w", err)
	}

	if !hasPassword && linkCount <= 1 {
		return fmt.Errorf("cannot remove the only sign-in method: %w", apperrors.ErrConflict)
	}

	result, err := s.db.ExecContext(ctx,
		`DELETE FROM external_identities WHERE user_id = $1 AND provider = $2`, userID, provider)
	if err != nil {
		return fmt.Errorf("unlink provider: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("provider not linked: %w", apperrors.ErrNotFound)
	}
	return nil
}

// LinkedProvider describes one connection shown in settings.
type LinkedProvider struct {
	Provider    string     `json:"provider"`
	Email       string     `json:"email,omitempty"`
	Name        string     `json:"name,omitempty"`
	LinkedAt    time.Time  `json:"linked_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
}

// LinkedProviders lists a user's connections.
func (s *Service) LinkedProviders(ctx context.Context, userID int64) ([]LinkedProvider, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT provider, COALESCE(email, ''), COALESCE(name, ''), created_at, last_login_at
		FROM external_identities WHERE user_id = $1 ORDER BY provider`, userID)
	if err != nil {
		return nil, fmt.Errorf("list linked providers: %w", err)
	}
	defer rows.Close()

	linked := make([]LinkedProvider, 0)
	for rows.Next() {
		var p LinkedProvider
		if err := rows.Scan(&p.Provider, &p.Email, &p.Name, &p.LinkedAt, &p.LastLoginAt); err != nil {
			return nil, fmt.Errorf("scan linked provider: %w", err)
		}
		linked = append(linked, p)
	}
	return linked, rows.Err()
}

// HasPassword reports whether a user can sign in with a password. The settings
// screen uses it to explain why unlinking is blocked.
func (s *Service) HasPassword(ctx context.Context, userID int64) (bool, error) {
	var has bool
	err := s.db.QueryRowContext(ctx, `SELECT password IS NOT NULL FROM users WHERE id = $1`, userID).Scan(&has)
	return has, err
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertIdentity(ctx context.Context, db execer, userID int64, provider string, profile *oauth.Profile) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO external_identities
			(user_id, provider, provider_user_id, email, name, avatar_url, last_login_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		userID, provider, profile.ProviderUserID,
		nullIfEmpty(profile.Email), nullIfEmpty(profile.Name), nullIfEmpty(profile.AvatarURL))
	if err != nil {
		return fmt.Errorf("create external identity: %w", err)
	}
	return nil
}

func (s *Service) userIDForExternalIdentity(ctx context.Context, provider, providerUserID string) (int64, error) {
	var userID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM external_identities WHERE provider = $1 AND provider_user_id = $2`,
		provider, providerUserID).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("look up external identity: %w", err)
	}
	return userID, nil
}

func (s *Service) userIDForEmail(ctx context.Context, email string) (int64, error) {
	var userID int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("look up user by email: %w", err)
	}
	return userID, nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// issueTokensForUser loads a user and mints the same token pair a password
// login would, so an external sign-in produces an identical session.
func (s *Service) issueTokensForUser(ctx context.Context, userID int64, ip, ua string) (*LoginResult, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, COALESCE(name, ''), role,
		       COALESCE(email_verified, false), COALESCE(onboarding_completed, false), created_at
		FROM users WHERE id = $1`, userID).
		Scan(&user.ID, &user.Email, &user.Name, &user.Role,
			&user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}

	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua, false)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}

	return &LoginResult{User: &user, Token: token, RefreshToken: refreshToken}, nil
}
