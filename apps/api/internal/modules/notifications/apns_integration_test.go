//go:build integration

package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAPNs answers like Apple: 200 for live tokens, 410 Unregistered for dead ones.
type fakeAPNs struct {
	mu     sync.Mutex
	dead   map[string]bool
	tokens []string
}

func (f *fakeAPNs) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.URL.Path, "/3/device/")
	f.mu.Lock()
	f.tokens = append(f.tokens, token)
	dead := f.dead[token]
	f.mu.Unlock()
	if dead {
		w.WriteHeader(http.StatusGone)
		_ = json.NewEncoder(w).Encode(map[string]string{"reason": "Unregistered"})
		return
	}
	w.WriteHeader(http.StatusOK)
}

func apnsService(t *testing.T, prefix string, fake *fakeAPNs) (*Service, func(string) int64) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	service := NewService(db, logger.New())
	pemKey, _ := testAPNSKey(t)
	require.NoError(t, service.WithAPNS(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "team.burcev.app"}))
	server := httptest.NewTLSServer(fake)
	t.Cleanup(server.Close)
	service.apns.client = server.Client()
	service.apns.hosts = map[string]string{APNSProduction: server.URL, APNSSandbox: server.URL}

	user := func(email string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(context.Background(),
			`INSERT INTO users (email,password,name,role) VALUES ($1,'x','И','client') RETURNING id`, email).Scan(&id))
		return id
	}
	return service, user
}

// Задача от куратора доходит до iPhone, а токен, который Apple назвал мёртвым,
// удаляется — повтор по нему никогда не сработает.
func TestPushReachesIPhoneAndDeadTokenIsDropped(t *testing.T) {
	live, dead := strings.Repeat("a", 64), strings.Repeat("b", 64)
	fake := &fakeAPNs{dead: map[string]bool{dead: true}}
	service, user := apnsService(t, "notif_apns", fake)
	ctx := context.Background()
	id := user("айфон@e.test")

	require.NoError(t, service.RegisterDevice(ctx, id, APNSDevice{Token: live, Environment: APNSProduction, InstallationID: phoneA}))
	require.NoError(t, service.RegisterDevice(ctx, id, APNSDevice{Token: dead, Environment: APNSSandbox, InstallationID: phoneB}))
	require.NoError(t, service.CreateNotification(ctx, &Notification{
		UserID: id, Category: CategoryMain, Type: TypeTaskAssigned, Title: "Новая задача", Content: "Выпить воды",
	}))

	delivered, err := service.SendDuePushes(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, delivered)
	assert.ElementsMatch(t, []string{live, dead}, fake.tokens)

	var left []string
	rows, err := service.db.QueryContext(ctx, `SELECT token FROM apns_devices WHERE user_id = $1`, id)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var token string
		require.NoError(t, rows.Scan(&token))
		left = append(left, token)
	}
	assert.Equal(t, []string{live}, left)

	var status string
	require.NoError(t, service.db.QueryRowContext(ctx,
		`SELECT status FROM notification_deliveries WHERE user_id = $1 AND channel = 'push'`, id).Scan(&status))
	assert.Equal(t, StatusSent, status)
}

const (
	phoneA = "11111111-1111-4111-8111-111111111111"
	phoneB = "22222222-2222-4222-8222-222222222222"
)

// Телефон, на котором вошли в другой аккаунт, уносит токен с собой: прежний
// владелец больше не получает на него уведомлений.
func TestDeviceMovesToTheAccountSignedInOnIt(t *testing.T) {
	service, user := apnsService(t, "notif_apns_move", &fakeAPNs{})
	ctx := context.Background()
	token := strings.Repeat("c", 64)
	first, second := user("первый@e.test"), user("второй@e.test")

	require.NoError(t, service.RegisterDevice(ctx, first, APNSDevice{Token: token, Environment: APNSProduction, InstallationID: phoneA}))
	require.NoError(t, service.RegisterDevice(ctx, second, APNSDevice{Token: strings.ToUpper(token), Environment: APNSProduction, InstallationID: phoneA}))

	devices, err := service.devicesFor(ctx, first)
	require.NoError(t, err)
	assert.Empty(t, devices)
	devices, err = service.devicesFor(ctx, second)
	require.NoError(t, err)
	assert.Len(t, devices, 1)

	require.NoError(t, service.UnregisterDevice(ctx, second, token))
	devices, _ = service.devicesFor(ctx, second)
	assert.Empty(t, devices)
}

// Знать чужой токен недостаточно: с другого телефона его не перехватить —
// иначе свои уведомления можно было бы слать на чужой телефон.
func TestForeignInstallationCannotTakeOverAToken(t *testing.T) {
	service, user := apnsService(t, "notif_apns_steal", &fakeAPNs{})
	ctx := context.Background()
	token := strings.Repeat("e", 64)
	owner, attacker := user("владелец@e.test"), user("чужой@e.test")

	require.NoError(t, service.RegisterDevice(ctx, owner, APNSDevice{Token: token, Environment: APNSProduction, InstallationID: phoneA}))
	err := service.RegisterDevice(ctx, attacker, APNSDevice{Token: token, Environment: APNSProduction, InstallationID: phoneB})
	require.ErrorIs(t, err, apperrors.ErrForbidden)

	devices, err := service.devicesFor(ctx, owner)
	require.NoError(t, err)
	assert.Len(t, devices, 1, "токен ушёл к чужому аккаунту")
	devices, _ = service.devicesFor(ctx, attacker)
	assert.Empty(t, devices)
}

func TestDeviceTokenIsValidated(t *testing.T) {
	service, user := apnsService(t, "notif_apns_bad", &fakeAPNs{})
	id := user("плохой@e.test")
	assert.Error(t, service.RegisterDevice(context.Background(), id, APNSDevice{Token: "https://evil", Environment: APNSProduction, InstallationID: phoneA}))
	assert.Error(t, service.RegisterDevice(context.Background(), id, APNSDevice{Token: strings.Repeat("d", 64), Environment: "staging", InstallationID: phoneA}))
	assert.Error(t, service.RegisterDevice(context.Background(), id, APNSDevice{Token: strings.Repeat("d", 64), Environment: APNSProduction}))
}
