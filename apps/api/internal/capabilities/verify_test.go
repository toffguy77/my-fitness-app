package capabilities

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type recordingReporter struct {
	seen map[string]bool
	n    int
}

func (r *recordingReporter) SetCapabilityHealth(capability string, healthy bool) {
	if r.seen == nil {
		r.seen = map[string]bool{}
	}
	r.seen[capability] = healthy
	r.n++
}

type recordingLogger struct{ lines []string }

func (l *recordingLogger) Warn(msg string, _ ...any) { l.lines = append(l.lines, msg) }

func ok(context.Context) error   { return nil }
func fail(context.Context) error { return errors.New("535 Invalid user or password") }

// Три состояния, а не два: работает, настроено и не работает, не настроено.
// Последнее сюда просто не попадает — отсутствие метрики и есть его запись.
func TestReportsEachCapability(t *testing.T) {
	report := &recordingReporter{}
	v := New(report, &recordingLogger{},
		Check{Name: "email", Verify: fail},
		Check{Name: "food_recognition", Verify: ok},
	)

	broken, err := v.Run(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 1, broken)
	assert.False(t, report.seen["email"])
	assert.True(t, report.seen["food_recognition"])
}

// Ежечасное предупреждение об одной и той же поломке — это то, как журнал
// перестают читать. Пишем на переходе, а не на каждом круге.
func TestWarnsOncePerTransition(t *testing.T) {
	log := &recordingLogger{}
	v := New(&recordingReporter{}, log, Check{Name: "email", Verify: fail})

	for range 3 {
		_, _ = v.Run(context.Background())
	}

	assert.Len(t, log.lines, 1, "о поломке сказано один раз, а не трижды")
}

// Восстановление стоит строки не меньше поломки: иначе единственный след
// происшествия в журнале — его начало.
func TestWarnsOnRecovery(t *testing.T) {
	log := &recordingLogger{}
	failing := true
	v := New(&recordingReporter{}, log, Check{
		Name: "email",
		Verify: func(context.Context) error {
			if failing {
				return errors.New("нет")
			}
			return nil
		},
	})

	_, _ = v.Run(context.Background())
	failing = false
	_, _ = v.Run(context.Background())

	require.Len(t, log.lines, 2)
	assert.Contains(t, log.lines[1], "works again")
}

// Проверка не должна ронять службу: недоступное на минуту хранилище — повод
// показать это, а не остановить приложение.
func TestBrokenCapabilityIsNotAnError(t *testing.T) {
	v := New(&recordingReporter{}, &recordingLogger{}, Check{Name: "s3", Verify: fail})

	broken, err := v.Run(context.Background())

	assert.NoError(t, err)
	assert.Equal(t, 1, broken)
}
