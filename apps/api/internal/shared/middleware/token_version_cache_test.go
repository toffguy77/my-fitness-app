package middleware

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Кеш версий читается на каждом аутентифицированном запросе, поэтому в нём
// оседает каждая учётка, когда-либо этот запрос сделавшая. Истёкшая запись
// перезаписывалась, но не удалялась: её никто больше не читал, её просто не
// отпускали. За время жизни процесса карта росла по числу побывавших
// пользователей и не убывала никогда.
//
// Проверяется наблюдаемое следствие — размер карты, — а не то, что внутри
// вызвался сбор: карта, которая не отпускает, снаружи неотличима от той,
// которая отпускает, ровно до того момента, когда кончается память.

func versionsForCache(t *testing.T, ttl time.Duration, sweepAt int) (*TokenVersions, sqlmock.Sqlmock) {
	t.Helper()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	// Каждое обращение мимо кеша идёт в базу; сколько их будет, тест не
	// предсказывает, поэтому ожидание переиспользуемое.
	mock.MatchExpectationsInOrder(false)

	v := NewTokenVersions(db)
	v.ttl = ttl
	v.sweepAt = sweepAt
	return v, mock
}

func TestTokenVersionCacheLetsGoOfExpiredEntries(t *testing.T) {
	const sweepAt = 8
	versions, mock := versionsForCache(t, 20*time.Millisecond, sweepAt)
	ctx := context.Background()

	for i := range int64(200) {
		mock.ExpectQuery("SELECT token_version").
			WithArgs(i).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(1))
	}

	// Первая волна: записи ещё свежие, кеш обязан их держать.
	for i := range int64(sweepAt) {
		_, err := versions.Current(ctx, i)
		require.NoError(t, err)
	}
	assert.Equal(t, sweepAt, versions.Size(), "свежие записи не выбрасываются")

	// Ждём, пока первая волна истечёт, и пускаем вторую, вдвое длиннее порога.
	time.Sleep(40 * time.Millisecond)
	for i := int64(100); i < 100+2*sweepAt; i++ {
		_, err := versions.Current(ctx, i)
		require.NoError(t, err)
	}

	// Без сбора здесь лежало бы sweepAt + 2*sweepAt записей.
	assert.LessOrEqual(t, versions.Size(), 2*sweepAt,
		"истёкшие записи первой волны должны быть отпущены")
	assert.Greater(t, versions.Size(), 0, "живые записи должны остаться")
}

// Сбор не должен задевать записи, срок которых ещё не вышел: выброшенная
// запись — это лишний поход в базу на следующем запросе, а не ошибка, поэтому
// заметить такое иначе нечем.
func TestTokenVersionCacheKeepsFreshEntriesThroughASweep(t *testing.T) {
	const sweepAt = 4
	versions, mock := versionsForCache(t, time.Hour, sweepAt)
	ctx := context.Background()

	for i := range int64(50) {
		mock.ExpectQuery("SELECT token_version").
			WithArgs(i).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(7))
	}

	for i := range int64(3 * sweepAt) {
		_, err := versions.Current(ctx, i)
		require.NoError(t, err)
	}

	assert.Equal(t, 3*sweepAt, versions.Size(),
		"при часовом сроке жизни сбор не имеет права выбросить ничего")

	// И они по-прежнему отвечают из кеша, а не из базы.
	version, err := versions.Current(ctx, 0)
	require.NoError(t, err)
	assert.Equal(t, 7, version)
}

// Отзыв обязан забывать запись немедленно, иначе смена пароля не закрывает
// уже выданные токены до конца TTL. Сбор не должен был это задеть.
func TestForgetStillDropsTheEntryAtOnce(t *testing.T) {
	versions, mock := versionsForCache(t, time.Hour, sweepThreshold)
	ctx := context.Background()

	mock.ExpectQuery("SELECT token_version").
		WithArgs(int64(42)).
		WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(1))

	_, err := versions.Current(ctx, 42)
	require.NoError(t, err)
	require.Equal(t, 1, versions.Size())

	versions.Forget(42)
	assert.Equal(t, 0, versions.Size(), "забытая учётка не остаётся в кеше")
}
