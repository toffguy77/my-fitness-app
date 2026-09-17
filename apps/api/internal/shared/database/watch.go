package database

import (
	"context"
	"time"

	"github.com/burcev/api/internal/shared/telemetry"
)

// WatchInterval — как часто спрашивать базу.
//
// Часто, потому что база — не необязательная возможность, а условие работы.
// Проверка дешёвая: это `SELECT 1` по уже открытому соединению.
const WatchInterval = 30 * time.Second

// Watch следит за доступностью базы и пишет её в метрику.
//
// Существует по конкретному поводу: 2026-09-16 прод не видел базу шесть с
// половиной часов, и никто не узнал. Оповещения были только на необязательные
// возможности, а база в их число не входила — отказ самого важного оказался
// единственным, о котором не сообщали.
//
// Возвращается, когда контекст закрыт.
func Watch(ctx context.Context, db *DB, log interface {
	Error(msg string, keysAndValues ...any)
}) {
	ticker := time.NewTicker(WatchInterval)
	defer ticker.Stop()

	// Первое измерение сразу, не через интервал: иначе полминуты после старта
	// метрики нет вовсе, и отличить «не проверяли» от «лежит» нельзя.
	check(ctx, db, log)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			check(ctx, db, log)
		}
	}
}

func check(ctx context.Context, db *DB, log interface {
	Error(msg string, keysAndValues ...any)
}) {
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	err := db.PingContext(pingCtx)
	telemetry.SetDatabaseHealth(err == nil)
	if err != nil && log != nil {
		log.Error("База не отвечает", "error", err)
	}
}
