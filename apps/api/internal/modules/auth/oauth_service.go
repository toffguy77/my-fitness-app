package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"golang.org/x/crypto/bcrypt"
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
	// OAuthNeedsConsents: signing in would create an account, or would let in
	// one that never gave the mandatory consents. The attempt is parked and
	// finished by CompleteWithConsents.
	//
	// An account created first and asked afterwards would hold health data
	// nobody agreed to the processing of — exactly what the registration form
	// does not allow.
	OAuthNeedsConsents OAuthResult = "needs_consents"
)

// SignInLinked issues a session to the account an external identity is
// already linked to.
func (s *Service) SignInLinked(ctx context.Context, provider, providerUserID string, userID int64, ip, ua string) (*OAuthOutcome, error) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE external_identities SET last_login_at = NOW()
		 WHERE provider = $1 AND provider_user_id = $2`,
		provider, providerUserID); err != nil {
		s.log.Errorw("Failed to record external login", "error", err, "user_id", userID)
	}

	result, err := s.issueTokensForUser(ctx, userID, ip, ua)
	if err != nil {
		return nil, err
	}
	return &OAuthOutcome{Result: OAuthSignedIn, User: result}, nil
}

// SignInWithProvider completes an external sign-in.
func (s *Service) SignInWithProvider(ctx context.Context, provider string, profile *oauth.Profile, ip, ua string) (*OAuthOutcome, error) {
	// Identity is the (provider, provider_user_id) pair, so a person who
	// changes their address at the provider keeps their account here.
	userID, err := s.userIDForExternalIdentity(ctx, provider, profile.ProviderUserID)
	if err != nil {
		return nil, err
	}
	if userID != 0 {
		// Accounts created through a provider before consents were asked for
		// have none. They pass the same screen once, on the next sign-in.
		consented, err := s.hasRequiredConsents(ctx, userID)
		if err != nil {
			return nil, err
		}
		if !consented {
			return &OAuthOutcome{
				Result:         OAuthNeedsConsents,
				Provider:       provider,
				ProviderUserID: profile.ProviderUserID,
			}, nil
		}
		return s.SignInLinked(ctx, provider, profile.ProviderUserID, userID, ip, ua)
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

	// Nobody has this address: the account is created only once the person
	// has given the mandatory consents (CompleteWithConsents).
	return &OAuthOutcome{
		Result:         OAuthNeedsConsents,
		Provider:       provider,
		ProviderUserID: profile.ProviderUserID,
	}, nil
}

// requiredConsentTypes are the consents without which no account is created:
// the offer, the privacy policy and the processing of personal data, health
// data included. Marketing is optional.
var requiredConsentTypes = []string{"terms_of_service", "privacy_policy", "data_processing"}

// hasRequiredConsents reports whether the latest record of every mandatory
// consent is a grant. The table is an audit trail, so a later revocation
// outweighs an earlier grant.
func (s *Service) hasRequiredConsents(ctx context.Context, userID int64) (bool, error) {
	var granted int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
			SELECT DISTINCT ON (consent_type) consent_type, granted
			FROM user_consents
			WHERE user_id = $1
			  AND consent_type IN ('terms_of_service', 'privacy_policy', 'data_processing')
			ORDER BY consent_type, granted_at DESC
		) latest
		WHERE granted`, userID).Scan(&granted)
	if err != nil {
		return false, fmt.Errorf("check consents: %w", err)
	}
	return granted == len(requiredConsentTypes), nil
}

// consentsComplete reports whether every mandatory consent is given.
func consentsComplete(consents *ConsentsInput) bool {
	return consents != nil && consents.TermsOfService && consents.PrivacyPolicy && consents.DataProcessing
}

// CompleteWithConsents finishes an external sign-in parked for consents.
//
// The core is keyed by the pending id alone, so the browser (which carries it
// in the oauth_pending cookie) and a native client (which will send it in the
// body) finish the same attempt the same way.
//
// Without all mandatory consents it fails with ErrValidation and writes
// nothing. With them:
//   - an identity already linked to an account (one created before consents
//     were asked for) gets the consents recorded and a session: OAuthSignedIn;
//   - an address that belongs to an account by now goes to the ownership
//     proof, as in the callback: OAuthNeedsLinkConfirmation, attempt kept;
//   - otherwise the account is created with the consents in the same
//     transaction, a curator is assigned as on every other path in, and a
//     session is issued: OAuthRegistered.
func (s *Service) CompleteWithConsents(ctx context.Context, pendingID string, consents *ConsentsInput, ip, ua string) (*OAuthOutcome, error) {
	if !consentsComplete(consents) {
		return nil, fmt.Errorf("mandatory consents missing: %w", apperrors.ErrValidation)
	}

	provider, profile, emailFromProvider, err := s.pendingLink(ctx, pendingID)
	if err != nil {
		return nil, err
	}

	userID, err := s.userIDForExternalIdentity(ctx, provider, profile.ProviderUserID)
	if err != nil {
		return nil, err
	}
	if userID != 0 {
		if err := writeConsents(ctx, s.db, userID, consents, ip, ua); err != nil {
			return nil, err
		}
		if _, err := s.db.ExecContext(ctx,
			`UPDATE external_identities SET last_login_at = NOW()
			 WHERE provider = $1 AND provider_user_id = $2`,
			provider, profile.ProviderUserID); err != nil {
			s.log.Errorw("Failed to record external login", "error", err, "user_id", userID)
		}
		s.deletePendingLink(ctx, pendingID)
		result, err := s.issueTokensForUser(ctx, userID, ip, ua)
		if err != nil {
			return nil, err
		}
		return &OAuthOutcome{Result: OAuthSignedIn, User: result, Provider: provider}, nil
	}

	if profile.Email == "" {
		// The address is asked for before the consents; an attempt without one
		// did not come from the consents screen.
		return nil, fmt.Errorf("pending sign-in carries no address: %w", apperrors.ErrTokenInvalid)
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

	// An address the provider reported is treated as verified: the provider
	// authenticated the person against it, so sending our own confirmation
	// mail would ask them to prove something they just proved. An address the
	// person typed (the provider gave none) is not: nobody has proved it is
	// theirs, so the account starts unverified and goes through the usual
	// confirmation.
	result, err := s.createUserFromProvider(ctx, provider, profile, ip, ua, emailFromProvider, consents)
	if err != nil {
		return nil, err
	}
	s.deletePendingLink(ctx, pendingID)
	return &OAuthOutcome{Result: OAuthRegistered, User: result, Provider: provider}, nil
}

// createUserFromProvider creates a passwordless account linked to the
// provider. consents, when given, are written in the same transaction: an
// account gated on consents must not exist without them.
func (s *Service) createUserFromProvider(ctx context.Context, provider string, profile *oauth.Profile, ip, ua string, emailVerified bool, consents *ConsentsInput) (*LoginResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin registration: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var userID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified, onboarding_completed)
		VALUES ($1, NULL, $2, 'client', $3, false)
		RETURNING id`, profile.Email, nullIfEmpty(profile.Name), emailVerified).Scan(&userID); err != nil {
		if isUniqueViolation(err) {
			// Между колбэком и этим шагом адрес заняли другим путём.
			return nil, fmt.Errorf("адрес уже зарегистрирован: %w", apperrors.ErrConflict)
		}
		return nil, fmt.Errorf("create user: %w", err)
	}

	if err := insertIdentity(ctx, tx, userID, provider, profile); err != nil {
		return nil, err
	}

	if consents != nil {
		if err := writeConsents(ctx, tx, userID, consents, ip, ua); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit registration: %w", err)
	}

	// Тот же вызов, что и в Register: аккаунт, заведённый через провайдера,
	// иначе остаётся без куратора навсегда — назначение нигде не повторяется.
	s.assignCurator(ctx, userID, profile.Email)

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
	var password sql.NullString
	var linkCount int
	if err := s.db.QueryRowContext(ctx, `
		SELECT u.password,
		       (SELECT COUNT(*) FROM external_identities WHERE user_id = u.id)
		FROM users u WHERE u.id = $1`, userID).Scan(&password, &linkCount); err != nil {
		return fmt.Errorf("check sign-in methods: %w", err)
	}

	if !PasswordIsSet(password) && linkCount <= 1 {
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

// PasswordIsSet is the one rule for "does this account have a password" —
// every place in this codebase that asks the question calls it, so a second,
// silently different definition cannot appear again.
//
// An empty string does not count. That is not a hypothetical: the exact same
// column held the same trap once before. Login used to read it into a plain
// string and compare it with bcrypt regardless of whether it was empty, and
// an empty stored password there meant anyone typing an empty password long
// enough to reach bcrypt's own confusion signed in — a real production
// defect, fixed before this one. Nothing here guarantees the column is never
// empty; this predicate exists so that if it ever is, every caller agrees on
// what that means, instead of some treating it as "has a password" and
// others as "does not".
func PasswordIsSet(password sql.NullString) bool {
	return password.Valid && password.String != ""
}

// HasPassword reports whether a user can sign in with a password. The settings
// screen uses it to explain why unlinking is blocked, and the account
// deletion form uses it to decide what to ask for instead of a password.
func (s *Service) HasPassword(ctx context.Context, userID int64) (bool, error) {
	var password sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT password FROM users WHERE id = $1`, userID).Scan(&password)
	if err != nil {
		return false, err
	}
	return PasswordIsSet(password), nil
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
	return s.issueTokens(ctx, WebSession(false), userID, ip, ua)
}

// issueTokens is issueTokensForUser for a session of the kind spec describes.
func (s *Service) issueTokens(ctx context.Context, spec SessionSpec, userID int64, ip, ua string) (*LoginResult, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, COALESCE(name, ''), role,
		       COALESCE(email_verified, false), COALESCE(onboarding_completed, false), created_at, token_version
		FROM users WHERE id = $1`, userID).
		Scan(&user.ID, &user.Email, &user.Name, &user.Role,
			&user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt, &user.TokenVersion)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}

	token, err := s.generateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	refreshToken, expiresAt, err := s.createRefreshToken(ctx, user.ID, ip, ua, spec)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}

	return &LoginResult{User: &user, Token: token, RefreshToken: refreshToken, RefreshExpiresAt: expiresAt}, nil
}

// PendingLinkTTL bounds how long an unfinished external sign-in can be resumed.
const PendingLinkTTL = 15 * time.Minute

// storePendingLink parks a profile the callback could not finish with.
//
// The profile stays on the server: a client able to hand us a provider identity
// could claim anybody's. The browser carries only the row's id.
func (s *Service) storePendingLink(ctx context.Context, provider string, profile *oauth.Profile) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO oauth_pending_links
			(provider, provider_user_id, email, name, avatar_url, expires_at, email_from_provider)
		VALUES ($1, $2, $3, $4, $5, NOW() + $6::interval, $7)
		RETURNING id`,
		provider, profile.ProviderUserID,
		nullIfEmpty(profile.Email), nullIfEmpty(profile.Name), nullIfEmpty(profile.AvatarURL),
		fmt.Sprintf("%d seconds", int(PendingLinkTTL.Seconds())),
		// Адрес на этом шаге может прийти только от провайдера.
		profile.Email != "",
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("store pending link: %w", err)
	}
	return id, nil
}

// pendingLink loads an unfinished attempt. An expired row is treated as absent.
// rememberPendingEmail stores the address the person typed on the attempt.
//
// Без этого следующий шаг не знает, о каком адресе речь: он читает попытку из
// базы, а не продолжает работу с той же структурой в памяти.
func (s *Service) rememberPendingEmail(ctx context.Context, id, email string) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE oauth_pending_links SET email = $2, email_from_provider = false
		 WHERE id = $1 AND expires_at > NOW()`,
		id, email)
	if err != nil {
		return fmt.Errorf("remember pending email: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("remember pending email: %w", err)
	}
	if affected == 0 {
		// Попытки уже нет — вот теперь «истекла» будет правдой.
		return fmt.Errorf("pending link vanished: %w", apperrors.ErrTokenInvalid)
	}
	return nil
}

// emailFromProvider says whether the address on the attempt was reported by
// the provider (and is therefore verified) rather than typed by the person.
func (s *Service) pendingLink(ctx context.Context, id string) (provider string, profile *oauth.Profile, emailFromProvider bool, err error) {
	var p oauth.Profile
	var email, name, avatar sql.NullString

	err = s.db.QueryRowContext(ctx, `
		SELECT provider, provider_user_id, email, name, avatar_url, email_from_provider
		FROM oauth_pending_links
		WHERE id = $1 AND expires_at > NOW()`, id).
		Scan(&provider, &p.ProviderUserID, &email, &name, &avatar, &emailFromProvider)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, false, fmt.Errorf("pending link not found: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return "", nil, false, fmt.Errorf("load pending link: %w", err)
	}

	p.Email = email.String
	p.Name = name.String
	p.AvatarURL = avatar.String
	return provider, &p, emailFromProvider, nil
}

func (s *Service) deletePendingLink(ctx context.Context, id string) {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM oauth_pending_links WHERE id = $1`, id); err != nil {
		s.log.Errorw("Failed to delete pending link", "error", err)
	}
}

// PurgeExpiredPendingLinks drops attempts nobody came back to finish.
func (s *Service) PurgeExpiredPendingLinks(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM oauth_pending_links WHERE expires_at <= NOW()`)
	if err != nil {
		return 0, fmt.Errorf("purge pending links: %w", err)
	}
	affected, _ := result.RowsAffected()
	return affected, nil
}

// ConfirmLinkWithPassword finishes a sign-in whose address already had an
// account, once the person has proved they own it.
//
// The password is the proof. Without it, an attacker who can make a provider
// assert our user's address would be signing in as them.
func (s *Service) ConfirmLinkWithPassword(ctx context.Context, pendingID, password, ip, ua string) (*LoginResult, error) {
	provider, profile, _, err := s.pendingLink(ctx, pendingID)
	if err != nil {
		return nil, err
	}
	if profile.Email == "" {
		return nil, fmt.Errorf("pending link carries no address: %w", apperrors.ErrTokenInvalid)
	}

	var userID int64
	var hash sql.NullString
	err = s.db.QueryRowContext(ctx,
		`SELECT id, password FROM users WHERE email = $1`, profile.Email).Scan(&userID, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("no account for address: %w", apperrors.ErrInvalidCredentials)
	}
	if err != nil {
		return nil, fmt.Errorf("look up account: %w", err)
	}

	// An account created through another provider has no password, so there is
	// nothing to prove ownership with here. Signing in with the provider that
	// already owns it is the way in. PasswordIsSet, not hash.Valid alone: an
	// empty stored string is not a password either — see PasswordIsSet's
	// comment for why that used to matter here in a different function.
	if !PasswordIsSet(hash) {
		return nil, fmt.Errorf("account has no password: %w", apperrors.ErrConflict)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(password)); err != nil {
		return nil, fmt.Errorf("confirm link: %w", apperrors.ErrInvalidCredentials)
	}

	if err := insertIdentity(ctx, s.db, userID, provider, profile); err != nil {
		return nil, err
	}
	s.deletePendingLink(ctx, pendingID)
	s.log.Info("Linked external provider after password confirmation",
		"user_id", userID, "provider", provider)

	return s.issueTokensForUser(ctx, userID, ip, ua)
}

// CompleteWithEmail continues a sign-in whose provider returned no address.
//
// The address comes from the user, so it is unverified. It never creates an
// account by itself:
//   - an address that already has an account has to be claimed with that
//     account's password first — otherwise typing somebody else's address
//     would be enough to take their account: OAuthNeedsLinkConfirmation;
//   - a new address is remembered on the attempt, marked as typed, and the
//     account is created by CompleteWithConsents once the mandatory consents
//     are given — unverified, with the usual confirmation: OAuthNeedsConsents.
//
// In both cases the address is written to the attempt itself, not only to the
// structure read from it: the next step reads the attempt again.
func (s *Service) CompleteWithEmail(ctx context.Context, pendingID, email, _, _ string) (*OAuthOutcome, error) {
	provider, profile, _, err := s.pendingLink(ctx, pendingID)
	if err != nil {
		return nil, err
	}

	existingID, err := s.userIDForEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	// Без записи в попытку шаг подтверждения находил её без адреса, отвечал
	// ErrTokenInvalid, и человек видел «попытка входа истекла» — хотя ничего
	// не истекало. Ветка срабатывает только у провайдеров, не отдающих адрес:
	// у Яндекса он приходит сам, поэтому вход через него работал, а через VK — нет.
	if err := s.rememberPendingEmail(ctx, pendingID, email); err != nil {
		return nil, err
	}

	if existingID != 0 {
		return &OAuthOutcome{
			Result:         OAuthNeedsLinkConfirmation,
			Email:          email,
			Provider:       provider,
			ProviderUserID: profile.ProviderUserID,
		}, nil
	}

	return &OAuthOutcome{
		Result:         OAuthNeedsConsents,
		Email:          email,
		Provider:       provider,
		ProviderUserID: profile.ProviderUserID,
	}, nil
}
