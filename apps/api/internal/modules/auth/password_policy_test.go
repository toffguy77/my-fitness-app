package auth

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

const validPassword = "Str0ng!Passw0rd"

// Registration must apply the same policy as reset and change. Before this the
// validator existed but was only wired into the reset flow, so a weak password
// was rejected when recovering an account and accepted when creating one.
func TestRegister_WeakPassword(t *testing.T) {
	cases := map[string]string{
		"too short":            "Ab1!x",
		"no uppercase":         "str0ng!passw0rd",
		"no lowercase":         "STR0NG!PASSW0RD",
		"no digit":             "Strong!Password",
		"no special character": "Str0ngPassw0rd",
	}

	for name, password := range cases {
		t.Run(name, func(t *testing.T) {
			service, _, cleanup := setupTestService(t)
			defer cleanup()

			_, err := service.Register(context.Background(), "user@example.com", password, "User", "127.0.0.1", "agent", nil)

			require.Error(t, err)
			assert.ErrorIs(t, err, apperrors.ErrPasswordPolicy)
		})
	}
}

// The ceiling protects against a request body that is expensive to hash; bcrypt
// itself truncates at 72 bytes, so 128 is a UX limit well above that.
func TestRegister_PasswordTooLong(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	long := "Aa1!" + strings.Repeat("x", 130)

	_, err := service.Register(context.Background(), "user@example.com", long, "User", "127.0.0.1", "agent", nil)

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrPasswordPolicy)
}

func TestPasswordValidator_RejectsOverMaxLength(t *testing.T) {
	result := NewPasswordValidator().Validate("Aa1!" + strings.Repeat("x", 130))

	assert.False(t, result.Valid)
	assert.NotEmpty(t, result.Errors)
}

// changePasswordFixture stubs the stored-hash lookup every ChangePassword call
// starts with.
func changePasswordFixture(t *testing.T, currentPassword string) (*Service, sqlmock.Sqlmock, func()) {
	t.Helper()
	service, mock, cleanup := setupTestService(t)

	hash, err := bcrypt.GenerateFromPassword([]byte(currentPassword), bcrypt.MinCost)
	require.NoError(t, err)

	mock.ExpectQuery("SELECT password FROM users").
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"password"}).AddRow(string(hash)))

	return service, mock, cleanup
}

func TestChangePassword_Success(t *testing.T) {
	service, mock, cleanup := changePasswordFixture(t, "0ld!Passw0rd")
	defer cleanup()

	mock.ExpectExec("UPDATE users SET password").WillReturnResult(sqlmock.NewResult(0, 1))
	// Changing the password must end every other session: refresh tokens
	// revoked so no new access token can be minted, and the version bumped so
	// the ones already minted stop being accepted. Both, or the fifteen
	// minutes an access token lives are fifteen minutes of stolen session.
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec("UPDATE users SET token_version").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	// ...except the session that asked for the change: signing somebody out of
	// the device they are standing at, as a reward for changing their password,
	// teaches them not to.
	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
		}).AddRow(1, "user@example.com", "User", "client", true, true, time.Now(), 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	var replacement LoginResult
	err := service.ChangePassword(context.Background(), 1, "0ld!Passw0rd", validPassword, &replacement)

	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet(), "all sessions must be revoked on password change")
	assert.NotEmpty(t, replacement.Token, "the caller keeps a working session")
	assert.NotEmpty(t, replacement.RefreshToken)
}

func TestChangePassword_WrongCurrentPassword(t *testing.T) {
	service, _, cleanup := changePasswordFixture(t, "0ld!Passw0rd")
	defer cleanup()

	err := service.ChangePassword(context.Background(), 1, "wrong-password", validPassword, &LoginResult{})

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrInvalidCredentials)
}

func TestChangePassword_WeakNewPassword(t *testing.T) {
	service, _, cleanup := changePasswordFixture(t, "0ld!Passw0rd")
	defer cleanup()

	err := service.ChangePassword(context.Background(), 1, "0ld!Passw0rd", "weak", &LoginResult{})

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrPasswordPolicy)
}

func TestChangePassword_SamePassword(t *testing.T) {
	service, _, cleanup := changePasswordFixture(t, validPassword)
	defer cleanup()

	err := service.ChangePassword(context.Background(), 1, validPassword, validPassword, &LoginResult{})

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrPasswordUnchanged)
}
