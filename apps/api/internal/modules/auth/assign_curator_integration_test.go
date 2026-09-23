//go:build integration

package auth_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// Новому человеку назначается живой куратор, а не служебная учётка и не тот,
// кто уже уходит.
//
// Назначение выбирает координатора с наименьшим числом активных клиентов —
// и обе эти категории всегда наименее загружены. Служебные учётки прогона на
// проде живут постоянно и всегда пусты; учётка с запрошенным удалением новых
// клиентов уже не ведёт. 23 сентября на проде из трёх кандидатов с нулём
// клиентов два были тестовыми, а третий — уходящим с 15 сентября: живой
// клиент с вероятностью три к трём достался бы тому, кто никогда не ответит.
func TestAssignCuratorSkipsTestAndDepartingCurators(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "assign_curator")
	ctx := context.Background()
	service := auth.NewService(db.DB, &config.Config{}, logger.New())

	// Три негодных кандидата, все с нулём клиентов, и один живой с клиентом —
	// то есть заведомо более загруженный.
	for _, email := range []string{
		"e2e-curator@burcev.team", // служебная на домене продукта
		"stand-42@burcev.test",    // одноразовый домен
	} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ($1, 'x', 'Служебный', 'coordinator', true)`, email)
		require.NoError(t, err)
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified, deletion_requested_at)
		 VALUES ('leaving@example.test', 'x', 'Уходит', 'coordinator', true, NOW())`)
	require.NoError(t, err)

	var liveCuratorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('live@example.test', 'x', 'Живой', 'coordinator', true) RETURNING id`).Scan(&liveCuratorID))

	var existingClientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('old-client@example.test', 'x', 'Старый', 'client', true) RETURNING id`).Scan(&existingClientID))
	_, err = db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, liveCuratorID, existingClientID)
	require.NoError(t, err)

	result, err := service.Register(ctx, "newcomer@example.test", "Passw0rd!x", "Новичок",
		"127.0.0.1", "test", &auth.ConsentsInput{
			TermsOfService: true, PrivacyPolicy: true, DataProcessing: true,
		})
	require.NoError(t, err)
	require.NotNil(t, result.User)

	var assignedEmail string
	err = db.QueryRowContext(ctx, `
		SELECT u.email FROM curator_client_relationships r
		  JOIN users u ON u.id = r.curator_id
		 WHERE r.client_id = $1 AND r.status = 'active'`, result.User.ID).Scan(&assignedEmail)
	require.NoError(t, err, "новичок остался без куратора")

	require.Equal(t, "live@example.test", assignedEmail,
		"куратором стал не живой человек, хотя он единственный годный кандидат")
}

// Служебному клиенту служебный куратор достаётся — иначе прогон остаётся без
// кураторов вовсе.
//
// В прогоне (CI, .github/workflows/e2e.yml) все учётки на @burcev.test,
// включая кураторские. Правило «служебные не кураторы» без оговорки оставило
// бы без куратора каждого, кого заводит registration.spec.ts, и сломало бы
// проверки переписки — при том, что на проде оно ничего бы не изменило.
// Поэтому запрет односторонний: служебный куратор не достаётся живому
// человеку, но служебному клиенту достаётся.
func TestAssignCuratorGivesTestCuratorToTestClient(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "assign_curator_test_client")
	ctx := context.Background()
	service := auth.NewService(db.DB, &config.Config{}, logger.New())

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('e2e-curator@burcev.test', 'x', 'Служебный', 'coordinator', true)`)
	require.NoError(t, err)

	result, err := service.Register(ctx, "e2e-client-17@burcev.test", "Passw0rd!x", "Служебный клиент",
		"127.0.0.1", "test", &auth.ConsentsInput{
			TermsOfService: true, PrivacyPolicy: true, DataProcessing: true,
		})
	require.NoError(t, err)
	require.NotNil(t, result.User)

	var assignedEmail string
	err = db.QueryRowContext(ctx, `
		SELECT u.email FROM curator_client_relationships r
		  JOIN users u ON u.id = r.curator_id
		 WHERE r.client_id = $1 AND r.status = 'active'`, result.User.ID).Scan(&assignedEmail)
	require.NoError(t, err, "служебный клиент остался без куратора — прогон так работать не сможет")
	require.Equal(t, "e2e-curator@burcev.test", assignedEmail)
}
