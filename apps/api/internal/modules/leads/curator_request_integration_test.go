//go:build integration

package leads_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Заявка на куратора от вошедшего человека — в ту же очередь, что и заявки
// гостей: у оператора должно быть одно место, куда он смотрит.

func TestCreateCuratorRequest_ПопадаетВОчередьСТочкойЗахвата(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "curator_request")
	service := leads.NewService(db.DB, logger.New(), "test-secret")

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('Client@Example.Test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&userID))

	lead, err := service.CreateCuratorRequest(ctx, userID, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	require.NotZero(t, lead.ID)

	var email, source string
	var contactConsent bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT email, capture_source, contact_consent FROM leads WHERE id = $1`, lead.ID).
		Scan(&email, &source, &contactConsent))

	assert.Equal(t, "client@example.test", email, "адрес берётся из учётной записи и приводится к нижнему регистру")
	assert.Equal(t, leads.CaptureCuratorOfferChat, source,
		"без точки захвата спрос из продукта неотличим от спроса с посадочной")
	assert.True(t, contactConsent, "нажатие «оставить заявку» и есть просьба связаться")
}

// Человек, нажавший дважды, не два человека, а очередь с дубликатами перестаёт
// читаться.
func TestCreateCuratorRequest_ПовторнаяОбновляетОткрытую(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "curator_request_twice")
	service := leads.NewService(db.DB, logger.New(), "test-secret")

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('twice@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&userID))

	first, err := service.CreateCuratorRequest(ctx, userID, leads.CaptureCuratorOfferDashboard)
	require.NoError(t, err)
	second, err := service.CreateCuratorRequest(ctx, userID, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)

	assert.Equal(t, first.ID, second.ID, "та же заявка, а не вторая")

	var count int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM leads WHERE email = 'twice@example.test'`).Scan(&count))
	assert.Equal(t, 1, count)

	var source string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT capture_source FROM leads WHERE id = $1`, first.ID).Scan(&source))
	assert.Equal(t, leads.CaptureCuratorOfferChat, source, "точка захвата — последняя")
}

// Обработанная заявка закрыта: новая просьба должна быть видна как новая.
func TestCreateCuratorRequest_ПослеОбработкиЗаводитНовую(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "curator_request_handled")
	service := leads.NewService(db.DB, logger.New(), "test-secret")

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('again@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&userID))

	first, err := service.CreateCuratorRequest(ctx, userID, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `UPDATE leads SET handled_at = now() WHERE id = $1`, first.ID)
	require.NoError(t, err)

	second, err := service.CreateCuratorRequest(ctx, userID, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)

	assert.NotEqual(t, first.ID, second.ID)
}

func TestCreateCuratorRequest_НеизвестнаяТочкаОтвергается(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "curator_request_bad_source")
	service := leads.NewService(db.DB, logger.New(), "test-secret")

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('bad@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&userID))

	_, err := service.CreateCuratorRequest(ctx, userID, "wherever")

	require.ErrorIs(t, err, apperrors.ErrValidation,
		"очередь группируется по этой точке: опечатка дала бы строку, которой не соответствует ни один отчёт")
}
