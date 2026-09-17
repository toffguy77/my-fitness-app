//go:build integration

package account_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Проверяется на живой базе намеренно: NULL в password не воспроизводится на
// sqlmock (оно отдаёт ровно то, что ему велено, и про NULL в столбце ничего
// не знает). RequestDeletion читал пароль в string тем же способом, каким это
// делал Login до соседней правки: для аккаунта, заведённого через внешнего
// провайдера или по ссылке входа (password = NULL), Scan падал с
// "converting NULL to string is unsupported", и удаление собственного
// аккаунта было полностью сломано в проде для всех таких пользователей.
//
// Задача 5а меняет контракт дальше: пустой пароль у беспарольного аккаунта
// больше не пропуск — нужен код с почты. Этот тест теперь охраняет более
// узкое свойство соседней задачи: отказ без кода обязан быть понятным
// сентинелом (ErrValidation), а не тем самым падением на NULL и не случайным
// ErrInvalidCredentials.
func TestRequestDeletionForPasswordlessAccount(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "account_deletion_passwordless")
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ('passwordless-deletion@example.test', NULL, 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`).Scan(&userID))

	_, err := service.RequestDeletion(ctx, userID, "", "")

	require.Error(t, err,
		"у беспарольного аккаунта без кода запрос на удаление обязан отказать")
	assert.True(t, errors.Is(err, apperrors.ErrValidation),
		"отказ обязан быть понятным сентинелом — не падением на NULL и не сквозным пропуском")
	assert.False(t, errors.Is(err, apperrors.ErrInvalidCredentials))
}

// capturingCodeSender records the codes VerificationService would have
// e-mailed, so a test can use the real plaintext code without a live SMTP
// server — the same role auth's capturingSender plays for magic links.
// verificationCalls exists so a test can also get its hands on a code issued
// for e-mail confirmation, not just for deletion — needed to prove the two
// purposes cannot confirm each other.
type capturingCodeSender struct {
	verificationCalls []email.VerificationEmailData
	deletionCalls     []email.VerificationEmailData
}

func (c *capturingCodeSender) SendVerificationEmail(_ context.Context, data email.VerificationEmailData) error {
	c.verificationCalls = append(c.verificationCalls, data)
	return nil
}

func (c *capturingCodeSender) SendAccountDeletionCode(_ context.Context, data email.VerificationEmailData) error {
	c.deletionCalls = append(c.deletionCalls, data)
	return nil
}

// newAccountServiceForTest wires a real account.Service to a real
// auth.VerificationService sharing the same schema, with a capturing sender
// standing in for SMTP. The point of the tests below is that account's
// deletion path and auth's existing code mechanism (hashing, rate limiting,
// attempt counting) actually work together against real SQL — a fake
// DeletionCodeService would prove nothing about that. The verifier itself is
// returned too: some tests need to issue an e-mail-verification code
// directly (SendCode), which is not something account.Service ever calls.
func newAccountServiceForTest(t *testing.T, db *database.DB) (*account.Service, *auth.VerificationService, *capturingCodeSender) {
	t.Helper()
	sender := &capturingCodeSender{}
	verifier := auth.NewVerificationService(db.DB, logger.New(), nil).WithCodeSender(sender)
	svc := account.NewService(db, logger.New(), nil).WithCodeVerifier(verifier)
	return svc, verifier, sender
}

func seedPasswordlessUser(t *testing.T, db *database.DB, userEmail string) int64 {
	t.Helper()
	var userID int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, NULL, 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`, userEmail).Scan(&userID))
	return userID
}

func seedUserWithPassword(t *testing.T, db *database.DB, userEmail, password string) int64 {
	t.Helper()
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)

	var userID int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, $2, 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`, userEmail, string(hashed)).Scan(&userID))
	return userID
}

// requestDeletionCode sends a deletion code through the real service and
// returns the plaintext — pulled out of the captured letter, never read back
// out of the hash the database actually stores.
func requestDeletionCode(t *testing.T, svc *account.Service, sender *capturingCodeSender, userID int64) string {
	t.Helper()
	before := len(sender.deletionCalls)
	require.NoError(t, svc.RequestDeletionCode(context.Background(), userID, "127.0.0.1", "test"))
	require.Greater(t, len(sender.deletionCalls), before, "код обязан быть отправлен письмом")
	return sender.deletionCalls[len(sender.deletionCalls)-1].Code
}

func deletionRequestedAt(t *testing.T, db *database.DB, userID int64) sql.NullTime {
	t.Helper()
	var requestedAt sql.NullTime
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT deletion_requested_at FROM users WHERE id = $1`, userID).Scan(&requestedAt))
	return requestedAt
}

func assertScheduledForDeletion(t *testing.T, db *database.DB, userID int64) {
	t.Helper()
	assert.True(t, deletionRequestedAt(t, db, userID).Valid, "аккаунт должен быть помечен к удалению")
}

func assertNotScheduledForDeletion(t *testing.T, db *database.DB, userID int64) {
	t.Helper()
	assert.False(t, deletionRequestedAt(t, db, userID).Valid, "отказ не должен помечать аккаунт к удалению")
}

// Необратимое действие для беспарольного аккаунта подтверждается кодом с
// почты, а не одной действующей сессией: для аккаунта с паролем угнанной
// сессии мало, и беспарольный не должен защищаться слабее — это и есть
// асимметрия, которую нашло ревью и которую чинит вся задача 5а.
func TestPasswordlessDeletionRequiresEmailedCode(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code")
	svc, _, sender := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "nopass@example.test")

	// Без кода — отказ, и аккаунт не помечен к удалению.
	_, err := svc.RequestDeletion(context.Background(), userID, "", "")
	require.Error(t, err)
	assertNotScheduledForDeletion(t, db, userID)

	code := requestDeletionCode(t, svc, sender, userID)

	_, err = svc.RequestDeletion(context.Background(), userID, "", code)
	require.NoError(t, err)
	assertScheduledForDeletion(t, db, userID)
}

// Перебор шести цифр закрывается счётчиком попыток, как у подтверждения
// почты — это тот же email_verification_codes и тот же VerifyCode-механизм,
// только другой вызывающий и другое письмо.
func TestPasswordlessDeletionCodeIsRateLimited(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code_bruteforce")
	svc, _, sender := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "brute@example.test")
	requestDeletionCode(t, svc, sender, userID)

	var lastErr error
	for i := 0; i < 6; i++ {
		_, lastErr = svc.RequestDeletion(context.Background(), userID, "", "000000")
	}

	assert.True(t, errors.Is(lastErr, apperrors.ErrTooManyAttempts))
	assertNotScheduledForDeletion(t, db, userID)
}

// Аккаунт с паролем не меняет поведения: код ему не нужен и не спрашивается.
// Этот тест охраняет починку задачи 5 от самой задачи 5а.
func TestDeletionWithPasswordIsUnchanged(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_with_password")
	svc, _, _ := newAccountServiceForTest(t, db)

	userID := seedUserWithPassword(t, db, "haspass@example.test", "верный пароль")

	_, err := svc.RequestDeletion(context.Background(), userID, "верный пароль", "")
	require.NoError(t, err)
	assertScheduledForDeletion(t, db, userID)
}

// Отправка кода отказывает аккаунту с паролем: код ему не нужен, а
// разрешить его слал бы письмо на действие, которое не требует подтверждения
// этим способом.
func TestRequestDeletionCode_RefusesForAccountWithPassword(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code_has_password")
	svc, _, sender := newAccountServiceForTest(t, db)

	userID := seedUserWithPassword(t, db, "haspass-code@example.test", "верный пароль")

	err := svc.RequestDeletionCode(context.Background(), userID, "127.0.0.1", "test")

	require.Error(t, err)
	assert.True(t, errors.Is(err, apperrors.ErrConflict))
	assert.Empty(t, sender.deletionCalls, "письмо не должно уйти аккаунту с паролем")
}

// requestEmailVerificationCode issues a code for the *other* purpose —
// confirming the address, exactly what happens after registration — through
// the same VerificationService, and returns its plaintext.
func requestEmailVerificationCode(t *testing.T, verifier *auth.VerificationService, sender *capturingCodeSender, userID int64, userEmail string) string {
	t.Helper()
	before := len(sender.verificationCalls)
	require.NoError(t, verifier.SendCode(context.Background(), userID, userEmail, "127.0.0.1", "test"))
	require.Greater(t, len(sender.verificationCalls), before, "код подтверждения почты обязан быть отправлен письмом")
	return sender.verificationCalls[len(sender.verificationCalls)-1].Code
}

// A code sent to confirm an e-mail address is not proof for anything else.
// Before the fix, latestUnusedCode picked "the most recent unused code for
// this user" with no notion of what it was issued for, so this exact code —
// requested for a completely different, much less consequential reason —
// deleted the account.
func TestEmailVerificationCodeDoesNotConfirmDeletion(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code_purpose_cross_1")
	svc, verifier, sender := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "cross-purpose-1@example.test")

	code := requestEmailVerificationCode(t, verifier, sender, userID, "cross-purpose-1@example.test")

	_, err := svc.RequestDeletion(context.Background(), userID, "", code)

	require.Error(t, err, "код почты не должен подтверждать удаление")
	assert.True(t, errors.Is(err, apperrors.ErrInvalidCredentials))
	assertNotScheduledForDeletion(t, db, userID)
}

// The other direction: a code sent to confirm a deletion must not confirm the
// address either. Less dangerous than the first direction (deleting nothing
// on a wrong pairing that at worst marks an address verified), but the same
// missing scope would have allowed it before the fix.
func TestDeletionCodeDoesNotConfirmEmailVerification(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code_purpose_cross_2")
	svc, verifier, sender := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "cross-purpose-2@example.test")

	code := requestDeletionCode(t, svc, sender, userID)

	err := verifier.VerifyCode(context.Background(), userID, code)

	require.Error(t, err, "код удаления не должен подтверждать почту")

	var verified bool
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT email_verified FROM users WHERE id = $1`, userID).Scan(&verified))
	assert.False(t, verified, "почта не должна оказаться подтверждённой кодом, выданным на удаление")
}
