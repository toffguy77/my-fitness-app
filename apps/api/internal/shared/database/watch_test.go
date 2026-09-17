package database

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/telemetry"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type noteLogger struct{ errors int }

func (n *noteLogger) Error(string, ...any) { n.errors++ }

// Первое измерение делается сразу, а не через интервал.
//
// Иначе первые полминуты после старта метрики нет вовсе, и «не проверяли» не
// отличить от «лежит» — а именно в эти полминуты чаще всего и смотрят.
func TestWatchMeasuresImmediately(t *testing.T) {
	telemetry.SetDatabaseHealth(true)

	ctx, cancel := context.WithCancel(context.Background())
	log := &noteLogger{}

	done := make(chan struct{})
	go func() {
		// Закрытая база: ping обязан провалиться и это обязано попасть в журнал
		// до первого тика, а не после.
		Watch(ctx, closedDB(t), log)
		close(done)
	}()

	require.Eventually(t, func() bool { return log.errors > 0 }, 3*time.Second, 20*time.Millisecond,
		"за три секунды не было ни одного измерения — значит ждали тикер")

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("наблюдение не остановилось по закрытию контекста")
	}
}

// Наблюдение обязано прекращаться: иначе оно переживёт остановку приложения.
func TestWatchStopsWithTheContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() { Watch(ctx, closedDB(t), nil); close(done) }()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("наблюдение не остановилось")
	}
}

func TestWatchIntervalIsFrequentEnough(t *testing.T) {
	// База — условие работы, и выдержка тревоги у неё пять минут. Проверка
	// реже минуты сделала бы эту выдержку бессмысленной.
	assert.LessOrEqual(t, WatchInterval, time.Minute)
}

// closedDB — база, до которой заведомо не достучаться.
//
// Закрытое соединение, а не подмена: проверяется настоящий путь ping, тот же,
// что побежит в бою.
func closedDB(t *testing.T) *DB {
	t.Helper()
	raw, err := sql.Open("pgx", "postgres://nobody@127.0.0.1:1/none?sslmode=disable")
	require.NoError(t, err)
	require.NoError(t, raw.Close())
	return &DB{DB: raw}
}
