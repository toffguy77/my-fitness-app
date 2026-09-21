//go:build integration

// Контакт из бота — та же заявка, что из мастера. Вторая таблица контактов
// означала бы вторую отписку, второй срок хранения и второе место, где можно
// забыть проверить согласие.
//
// Проверяется на живой базе намеренно: capture_source и связь
// support_conversations.lead_id пишутся прямым SQL, и на sqlmock подмена
// приняла бы любое значение, каким её попросили бы — разница между "заявка
// действительно создана и привязана" и "код вернул токен, ничего не сделав"
// не видна нигде, кроме настоящей строки.
package support

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newServiceForTest wires a support.Service backed by a real leads.Service
// over the same schema — SaveWebContact needs a writer that actually inserts,
// not a fake that would hide whether the write happened.
func newServiceForTest(t *testing.T, db *database.DB) *Service {
	t.Helper()
	leadsService := leads.NewService(db.DB, logger.New(), "test-secret")
	return NewService(db.DB, logger.New(), nil, nil, leadsService, 100)
}

// Контакт, оставленный в разговоре, обязан стать настоящей заявкой —
// найденной в leads, помеченной source='bot' и привязанной к разговору,
// который её породил.
func TestWebContactCreatesLeadAndAttachesIt(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_contact_creates")
	svc := newServiceForTest(t, db)
	ctx := context.Background()

	id, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	leadToken, err := svc.SaveWebContact(ctx, token, "bot@example.com",
		leads.Consents{DataProcessing: true, Contact: true}, "127.0.0.1", "test")
	require.NoError(t, err)
	assert.NotEmpty(t, leadToken)

	// Вырожденная проверка: доказательна только когда в таблице действительно
	// есть заявки — на пустой leads JOIN ниже провалился бы тривиально, и
	// провал ничего не значил бы.
	var totalLeads int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM leads`).Scan(&totalLeads))
	require.Greater(t, totalLeads, 0,
		"в таблице обязана быть настоящая заявка — иначе проверка ниже ничего не доказывает")

	var captureSource string
	var attached *string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT l.capture_source, c.lead_id::text
		   FROM support_conversations c JOIN leads l ON l.id = c.lead_id
		  WHERE c.id = $1`, id).Scan(&captureSource, &attached))

	assert.Equal(t, "bot", captureSource)
	require.NotNil(t, attached, "разговор обязан нести ссылку на заявку, которую породил")
}

// Без согласия на обработку заявки не возникает вовсе, а разговор продолжает
// жить — отказ не должен обрывать переписку.
func TestWebContactWithoutConsentSavesNothing(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_contact_no_consent")
	svc := newServiceForTest(t, db)
	ctx := context.Background()

	id, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	_, err = svc.SaveWebContact(ctx, token, "bot2@example.com",
		leads.Consents{DataProcessing: false}, "127.0.0.1", "test")
	require.Error(t, err)

	var leadID *string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT lead_id::text FROM support_conversations WHERE id = $1`, id).Scan(&leadID))
	assert.Nil(t, leadID, "без согласия заявка не должна была появиться и привязаться")

	var totalLeads int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM leads WHERE email = $1`, "bot2@example.com").Scan(&totalLeads))
	assert.Equal(t, 0, totalLeads, "без согласия строка в leads не должна была появиться вовсе")

	// Разговор жив — отказ не должен был его сломать.
	_, err = svc.WebConversationByToken(ctx, token)
	assert.NoError(t, err)
}

// Согласие обязано доехать до заявки таким, каким его дал посетитель, а не
// быть подставлено по дороге. «Согласен на обработку, но не на связь» не
// должно превратиться в «согласен на оба» — именно это решает, покажет ли
// кураторская очередь ссылку «Написать».
func TestWebContactPreservesEachConsentIndependently(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_contact_consents")
	svc := newServiceForTest(t, db)
	ctx := context.Background()

	_, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	_, err = svc.SaveWebContact(ctx, token, "bot3@example.com",
		leads.Consents{DataProcessing: true, Contact: false}, "127.0.0.1", "test")
	require.NoError(t, err)

	var dataConsent, contactConsent bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT data_consent, contact_consent FROM leads WHERE email = $1`, "bot3@example.com").
		Scan(&dataConsent, &contactConsent))

	assert.True(t, dataConsent)
	assert.False(t, contactConsent,
		"согласие на связь не должно подменяться на true по дороге от разговора до заявки")
}

// Второй контакт в уже привязанном разговоре не должен завести вторую заявку
// — иначе один посетитель оставляет два следа в очереди куратора.
func TestWebContactRefusesWhenConversationAlreadyHasALead(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_contact_twice")
	svc := newServiceForTest(t, db)
	ctx := context.Background()

	_, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	_, err = svc.SaveWebContact(ctx, token, "bot4@example.com",
		leads.Consents{DataProcessing: true, Contact: true}, "127.0.0.1", "test")
	require.NoError(t, err)

	_, err = svc.SaveWebContact(ctx, token, "bot4-second@example.com",
		leads.Consents{DataProcessing: true, Contact: true}, "127.0.0.1", "test")
	require.Error(t, err)

	var totalLeads int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM leads`).Scan(&totalLeads))
	assert.Equal(t, 1, totalLeads, "второй контакт в том же разговоре не должен завести вторую заявку")
}
