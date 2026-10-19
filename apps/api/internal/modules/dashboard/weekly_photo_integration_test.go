//go:build integration

package dashboard

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Неделя фото и отчёта на настоящей базе: раньше фото записывалось в неделю
// с воскресенья, а отчёт искал его в неделе с понедельника — проверка «фото
// недели загружено» не сходилась никогда.

type weekFixture struct {
	db      *database.DB
	service *Service
	client  int64
	zone    *time.Location
}

func newWeekFixture(t *testing.T, prefix, timezone string) weekFixture {
	t.Helper()
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, prefix)
	log := logger.New()
	user := func(email, role string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'И', $2) RETURNING id`, email, role).Scan(&id))
		return id
	}
	curator, client := user("cur-"+prefix+"@example.test", "coordinator"), user("cli-"+prefix+"@example.test", "client")
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1, $2, 'active')`,
		curator, client)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO user_settings (user_id, timezone) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone`, client, timezone)
	require.NoError(t, err)
	zone, err := time.LoadLocation(timezone)
	require.NoError(t, err)
	return weekFixture{db: db, service: NewService(db, log, nil, notifications.NewService(db, log)), client: client, zone: zone}
}

// fillWeek — питание и вес за все семь дней недели с этого понедельника.
func (f weekFixture) fillWeek(t *testing.T, monday string) {
	t.Helper()
	start := day(t, monday)
	for i := 0; i < 7; i++ {
		_, err := f.db.ExecContext(context.Background(),
			`INSERT INTO daily_metrics (user_id, date, calories, weight) VALUES ($1, $2, 1800, 78.4)`,
			f.client, start.AddDate(0, 0, i).Format(weekDateLayout))
		require.NoError(t, err)
	}
}

func (f weekFixture) photo(t *testing.T, at time.Time, url string) *PhotoData {
	t.Helper()
	photo, err := f.service.recordWeeklyPhoto(context.Background(), f.client, at, url, 1024, "image/jpeg")
	require.NoError(t, err)
	return photo
}

// Отчёт через настоящий обработчик: тело — как его шлют веб и приложение.
func (f weekFixture) submit(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	log := logger.New()
	handler := NewHandler(&config.Config{Env: "test"}, log, f.db, nil, notifications.NewService(f.db, log), nil)
	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", f.client)
		handler.SubmitWeeklyReport(c)
	})
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestWeeklyReportFindsPhotoUploadedOnTuesday(t *testing.T) {
	f := newWeekFixture(t, "weekphoto_tue", "Asia/Yekaterinburg")
	f.fillWeek(t, "2026-10-12")
	photo := f.photo(t, time.Date(2026, 10, 13, 10, 0, 0, 0, f.zone), "https://s3.example/tue.jpg")

	assert.Equal(t, "2026-10-12", photo.WeekStart.Format(weekDateLayout))
	assert.Equal(t, "2026-10-18", photo.WeekEnd.Format(weekDateLayout))
	assert.Equal(t, "2026-W42", photo.WeekIdentifier)

	// Веб: даты без времени.
	w := f.submit(t, `{"week_start":"2026-10-12","week_end":"2026-10-18"}`)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var answer struct {
		Data WeeklyReport `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &answer))
	require.NotNil(t, answer.Data.PhotoURL)
	assert.Equal(t, "https://s3.example/tue.jpg", *answer.Data.PhotoURL)
	assert.Equal(t, "2026-10-12", answer.Data.WeekStart.Format(weekDateLayout))
	assert.Equal(t, "2026-10-18", answer.Data.WeekEnd.Format(weekDateLayout))
}

// Приложение шлёт полночь в поясе профиля (RFC 3339); фото — в воскресенье
// вечером по местному времени, когда по UTC ещё воскресенье, а по серверу,
// считавшему неделю с воскресенья, — уже новая неделя.
func TestWeeklyReportFindsPhotoUploadedOnSundayRFC3339(t *testing.T) {
	f := newWeekFixture(t, "weekphoto_sun", "Asia/Yekaterinburg")
	f.fillWeek(t, "2026-10-12")
	photo := f.photo(t, time.Date(2026, 10, 18, 23, 30, 0, 0, f.zone), "https://s3.example/sun.jpg")
	assert.Equal(t, "2026-10-12", photo.WeekStart.Format(weekDateLayout))

	w := f.submit(t, `{"week_start":"2026-10-12T00:00:00+05:00","week_end":"2026-10-18T00:00:00+05:00"}`)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
}

// Полночь понедельника по местному времени — ещё воскресенье по UTC; фото
// принадлежит новой неделе, и отчёт за прошлую его не засчитывает.
func TestPhotoAfterLocalMidnightBelongsToNextWeek(t *testing.T) {
	f := newWeekFixture(t, "weekphoto_mon", "Asia/Yekaterinburg")
	f.fillWeek(t, "2026-10-12")
	photo := f.photo(t, time.Date(2026, 10, 19, 0, 30, 0, 0, f.zone), "https://s3.example/mon.jpg")
	assert.Equal(t, "2026-10-19", photo.WeekStart.Format(weekDateLayout))

	valid, problems, err := f.service.ValidateWeekData(context.Background(), f.client, day(t, "2026-10-12"), day(t, "2026-10-18"))
	require.NoError(t, err)
	assert.False(t, valid)
	assert.Contains(t, problems, "weekly photo not uploaded")
}

// Повторная загрузка за ту же неделю заменяет фото, а не добавляет второе.
func TestReuploadReplacesWeekPhoto(t *testing.T) {
	f := newWeekFixture(t, "weekphoto_again", "Europe/Moscow")
	first := f.photo(t, time.Date(2026, 10, 13, 10, 0, 0, 0, f.zone), "https://s3.example/1.jpg")
	second := f.photo(t, time.Date(2026, 10, 16, 10, 0, 0, 0, f.zone), "https://s3.example/2.jpg")
	assert.Equal(t, first.ID, second.ID)
	var count int
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM weekly_photos WHERE user_id = $1`, f.client).Scan(&count))
	assert.Equal(t, 1, count)
	assert.Equal(t, "https://s3.example/2.jpg", second.PhotoURL)
}

// Миграция 105 переносит записанные до неё фото в неделю с понедельника по
// дате загрузки в поясе профиля; из двух фото одной недели остаётся последнее.
func TestMigration105NormalisesStoredWeeks(t *testing.T) {
	f := newWeekFixture(t, "weekphoto_mig", "Europe/Moscow")
	ctx := context.Background()
	f.fillWeek(t, "2026-09-21")
	legacy := func(weekStart, identifier, uploaded, url string) {
		_, err := f.db.ExecContext(ctx, `INSERT INTO weekly_photos
			(user_id, week_start, week_end, week_identifier, photo_url, file_size, mime_type, uploaded_at)
			VALUES ($1, $2::date, $2::date + 6, $3, $4, 1, 'image/jpeg', $5::timestamptz)`,
			f.client, weekStart, identifier, url, uploaded)
		require.NoError(t, err)
	}
	// Как на dev: загрузка в 01:25 понедельника по Москве записана в неделю
	// с воскресенья 20 сентября.
	legacy("2026-09-20", "2026-W02", "2026-09-21 01:25:31+03", "https://s3.example/old.jpg")
	legacy("2026-09-27", "2026-W39", "2026-09-23 12:00:00+03", "https://s3.example/newer.jpg")
	// Другая неделя, чей прежний идентификатор совпадает с новым первой.
	legacy("2026-03-01", "2026-W40", "2026-03-03 19:41:09+03", "https://s3.example/march.jpg")

	valid, _, err := f.service.ValidateWeekData(ctx, f.client, day(t, "2026-09-21"), day(t, "2026-09-27"))
	require.NoError(t, err)
	require.False(t, valid, "до миграции фото в неделе с понедельника не находится")

	up, err := migrations.FS.ReadFile("105_weekly_photos_monday_week_up.sql")
	require.NoError(t, err)
	tx, err := f.db.BeginTx(ctx, nil)
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, string(up))
	require.NoError(t, err)
	require.NoError(t, tx.Commit())

	rows, err := f.db.QueryContext(ctx, `SELECT week_start::text, week_end::text, week_identifier, photo_url
		FROM weekly_photos WHERE user_id = $1 ORDER BY week_start`, f.client)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var got []string
	for rows.Next() {
		var start, end, identifier, url string
		require.NoError(t, rows.Scan(&start, &end, &identifier, &url))
		got = append(got, fmt.Sprintf("%s..%s %s %s", start, end, identifier, url))
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, []string{
		"2026-03-02..2026-03-08 2026-W10 https://s3.example/march.jpg",
		"2026-09-21..2026-09-27 2026-W39 https://s3.example/newer.jpg",
	}, got)

	valid, problems, err := f.service.ValidateWeekData(ctx, f.client, day(t, "2026-09-21"), day(t, "2026-09-27"))
	require.NoError(t, err)
	assert.True(t, valid, problems)
}
