package metrika

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupService(t *testing.T) (*Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	return NewService(db, logger.New(), "token", "107159088"), mock
}

func pendingRows(rows ...pending) *sqlmock.Rows {
	r := sqlmock.NewRows([]string{"id", "metrika_client_id", "event_name", "occurred_at"})
	for _, p := range rows {
		r.AddRow(p.id, p.clientID, p.eventName, p.occurredAt)
	}
	return r
}

// Сценарий «Конверсия поставлена в очередь».
//
// Постановка идёт одним запросом с подзапросом по user_attribution, а не
// чтением с последующей вставкой: между ними мог бы влезть второй факт.
func TestQueue_TakesTheIdentifierFromTheStoredAttribution(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("INSERT INTO conversion_uploads").
		WithArgs(int64(42), "registered", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	service.Queue(context.Background(), 42, "registered", time.Now())

	assert.NoError(t, mock.ExpectationsWereMet())
}

// Сценарий «Идентификатор браузера отсутствует».
//
// Запрос вставляет ноль строк — так устроено условие. Конверсия без
// идентификатора не привязывается ни к какому визиту и только раздувает счёт
// достижений, делая отчёт по источникам хуже, чем он был.
func TestQueue_AddsNothingWhenTheBrowserIsUnknown(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("INSERT INTO conversion_uploads").
		WillReturnResult(sqlmock.NewResult(0, 0))

	service.Queue(context.Background(), 42, "registered", time.Now())

	assert.NoError(t, mock.ExpectationsWereMet())
}

// Постановка в очередь не может уронить то, что её вызвало: регистрация к
// этому моменту уже состоялась.
func TestQueue_SurvivesADatabaseFailure(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("INSERT INTO conversion_uploads").
		WillReturnError(sql.ErrConnDone)

	assert.NotPanics(t, func() {
		service.Queue(context.Background(), 42, "registered", time.Now())
	})
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Сценарий «Конверсия отправлена».
func TestUpload_SendsAndMarksThemSent(t *testing.T) {
	var received string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "OAuth token", r.Header.Get("Authorization"))
		require.NoError(t, r.ParseMultipartForm(1<<20))
		file, _, err := r.FormFile("file")
		require.NoError(t, err)
		defer func() { _ = file.Close() }()
		body := make([]byte, 1024)
		n, _ := file.Read(body)
		received = string(body[:n])
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	service, mock := setupService(t)
	service.uploadURL = server.URL

	occurred := time.Unix(1_700_000_000, 0)
	mock.ExpectQuery("FROM conversion_uploads").
		WillReturnRows(pendingRows(pending{1, "cid-42", "registered", occurred}))
	mock.ExpectExec("UPDATE conversion_uploads SET sent_at").
		WillReturnResult(sqlmock.NewResult(0, 1))

	sent, err := service.Upload(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 1, sent)
	assert.Contains(t, received, "ClientId,Target,DateTime")
	assert.Contains(t, received, "cid-42,registered,1700000000")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Сценарий «Повторный запуск не задваивает».
//
// Отметка — весь смысл таблицы: без неё перезапуск задачи загрузил бы те же
// конверсии снова, и счётчик показал бы две регистрации на одного человека.
// Отличить это потом от настоящего роста невозможно.
func TestUpload_SendsNothingWhenEverythingIsAlreadySent(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectQuery("FROM conversion_uploads").WillReturnRows(pendingRows())

	sent, err := service.Upload(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 0, sent)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Сценарий «Внешний сервис недоступен»: конверсии остаются неотправленными.
func TestUpload_LeavesThemQueuedWhenYandexRefuses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("что-то пошло не так"))
	}))
	defer server.Close()

	service, mock := setupService(t)
	service.uploadURL = server.URL

	mock.ExpectQuery("FROM conversion_uploads").
		WillReturnRows(pendingRows(pending{1, "cid-42", "registered", time.Now()}))
	// Попытка засчитана, отметки об отправке нет.
	mock.ExpectExec("UPDATE conversion_uploads").
		WillReturnResult(sqlmock.NewResult(0, 1))

	sent, err := service.Upload(context.Background())

	require.Error(t, err)
	assert.Equal(t, 0, sent)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Сценарий «Состав объявлен».
//
// Наружу уезжают три поля и ничего больше. Проверяется, а не оговаривается:
// «отправим на всякий случай» — обычный способ, которым медицинские данные
// попадают в аналитику.
func TestCSV_CarriesOnlyTheThreeDeclaredColumns(t *testing.T) {
	out := csvOf([]pending{{1, "cid-42", "registered", time.Unix(1_700_000_000, 0)}})

	lines := strings.Split(strings.TrimSpace(out), "\n")
	require.Len(t, lines, 2)
	assert.Equal(t, "ClientId,Target,DateTime", strings.TrimSpace(lines[0]))
	assert.Equal(t, "cid-42,registered,1700000000", strings.TrimSpace(lines[1]))
}

// Сценарий «Запрещённое поле в передаче».
func TestCSV_NamesNoForbiddenField(t *testing.T) {
	out := csvOf([]pending{{1, "cid-42", "registered", time.Now()}})
	header := strings.ToLower(strings.Split(out, "\n")[0])

	for _, column := range strings.Split(strings.TrimSpace(header), ",") {
		assert.False(t, analytics.IsForbidden(strings.TrimSpace(column)),
			"столбец %q запрещён к передаче", column)
	}
}

// Каждое передаваемое имя обязано быть в словаре: имя, которого сервер не
// знает, — это цель, которая никогда не наполнится, и ноль достижений выглядит
// как отсутствие конверсий.
func TestConversions_AreAllDeclaredInTheDictionary(t *testing.T) {
	for _, name := range Conversions {
		_, known := analytics.Dictionary[name]
		assert.True(t, known, "конверсия %q отсутствует в словаре событий", name)
	}
}
