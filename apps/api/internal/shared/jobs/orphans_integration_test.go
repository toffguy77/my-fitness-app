//go:build integration

package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Запуск, у которого никогда не будет исхода.
//
// Таймаут задачи обработан: `finish` пишет результат своим контекстом. А
// внезапную смерть процесса — замену контейнера на выкатке — записать некому, и
// строка остаётся «running» навсегда. На проде таких накопилось шесть за две
// недели, и каждая утверждала, что задача идёт, когда ничего не шло.
//
// На настоящей базе: вопрос здесь про то, что осталось в строке, и подмена
// ответила бы «всё хорошо» на любой запрос.
func TestCloseOrphansMarksRunsNobodyWillFinish(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "job_orphans")
	ctx := context.Background()
	s := &store{db: db.DB}

	_, err := db.ExecContext(ctx, `
		INSERT INTO job_runs (job_name, started_at, status) VALUES
			('давно.осиротел', NOW() - INTERVAL '3 hours', 'running'),
			('только.начался', NOW() - INTERVAL '1 minute', 'running')`)
	require.NoError(t, err)

	closed, err := s.closeOrphans(ctx, time.Hour)

	require.NoError(t, err)
	assert.Equal(t, int64(1), closed, "закрыть надо только тот, что заведомо брошен")

	var status, errText string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT status, coalesce(error,'') FROM job_runs WHERE job_name = 'давно.осиротел'`).
		Scan(&status, &errText))
	assert.Equal(t, "interrupted", status)
	assert.NotEmpty(t, errText, "запись обязана объяснять, почему исхода нет")

	// Свежий запуск мог начать другой контейнер, который ещё доживает выкатку.
	// Обрывать его записью — такая же неправда, только наоборот.
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT status FROM job_runs WHERE job_name = 'только.начался'`).Scan(&status))
	assert.Equal(t, "running", status)
}
