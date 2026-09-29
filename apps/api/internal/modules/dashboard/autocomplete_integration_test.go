//go:build integration

package dashboard

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// AutoCompleteMatchingTasks runs on every metric save, and it used to issue its
// writes while the cursor that produced the task list was still open.
//
// In database/sql an open *sql.Rows pins its connection. A write issued from
// inside the loop therefore takes a *second* connection out of the pool, and a
// request holding one while waiting for another is the shape of a deadlock:
// with enough concurrent savers every connection is held by a request waiting
// for a connection nobody will release. It presents as "the database is slow",
// not as an error, which is why nothing caught it.
//
// Both tests below would pass against a pool large enough to hide the problem.
// They constrain the pool instead, so they are about the access pattern rather
// than about this machine's timing.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/dashboard/

func autoCompleteSchema(t *testing.T) *database.DB {
	t.Helper()
	return testsupport.SchemaWithMigrations(t, "autocomplete")
}

var autoCompleteSeq int

// taskOwner creates the client and the curator their tasks are assigned by.
func taskOwner(t *testing.T, db *database.DB) (clientID, curatorID int64) {
	t.Helper()
	ctx := context.Background()

	mk := func(role string) int64 {
		autoCompleteSeq++
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, created_at, updated_at)
			 VALUES ($1, 'x', 'Кто-то', $2, NOW(), NOW()) RETURNING id`,
			fmt.Sprintf("autocomplete-%d-%d@burcev.example", os.Getpid(), autoCompleteSeq),
			role,
		).Scan(&id))
		return id
	}

	return mk("client"), mk("coordinator")
}

// habit adds one task of the given recurrence, due today.
func habit(t *testing.T, db *database.DB, clientID, curatorID int64, recurrence string) string {
	t.Helper()

	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO tasks (user_id, curator_id, title, type, week_number, due_date, status, recurrence)
		 VALUES ($1, $2, 'Зарядка', 'workout', 1, CURRENT_DATE, 'active', $3)
		 RETURNING id`,
		clientID, curatorID, recurrence,
	).Scan(&id))
	return id
}

// roundTrips counts statements the database committed while fn ran.
//
// Every autocommit statement is its own transaction, so xact_commit counts
// round trips for a pool that is not doing anything else — which is the case
// here: the schema is this test's own and the pool is capped at one connection.
//
// Reading the counter costs statements of its own, and how many is a detail of
// the driver and the server version rather than something to hard-code. So the
// instrumentation is run once around an empty function and the result
// subtracted: whatever the overhead is, it cancels.
func roundTrips(t *testing.T, db *database.DB, fn func()) int64 {
	t.Helper()

	read := func() int64 {
		ctx := context.Background()
		// Statistics reach pg_stat_database asynchronously, at most once a
		// second. Without forcing the flush the counter shows no movement at
		// all on this timescale and the assertion below would mean nothing.
		// The pool is capped at one connection, so the backend flushed here is
		// the one that did the work.
		_, err := db.ExecContext(ctx, `SELECT pg_stat_force_next_flush()`)
		require.NoError(t, err)

		var n int64
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()`).Scan(&n))
		return n
	}

	measure := func(f func()) int64 {
		before := read()
		f()
		return read() - before
	}

	overhead := measure(func() {})
	return measure(fn) - overhead
}

// A single connection is all this needs. Holding a cursor open across a write
// asks for a second one, and then this never returns.
func TestAutoCompleteMatchingTasks_SurvivesASingleConnection(t *testing.T) {
	db := autoCompleteSchema(t)
	clientID, curatorID := taskOwner(t, db)

	once := habit(t, db, clientID, curatorID, "once")
	daily := habit(t, db, clientID, curatorID, "daily")

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	svc := NewService(db, logger.New(), nil, nil)

	// A deadline rather than an open-ended wait: a regression should fail the
	// test, not hang the suite until the CI job is killed.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := svc.AutoCompleteMatchingTasks(ctx, clientID, "workout", time.Now())
	require.NoError(t, err, "auto-completion could not finish on a single connection")

	var status string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT status FROM tasks WHERE id = $1`, once).Scan(&status))
	assert.Equal(t, "completed", status, "a one-off task should be marked completed")

	var completions int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM task_completions WHERE task_id = $1 AND completed_date = CURRENT_DATE`,
		daily).Scan(&completions))
	assert.Equal(t, 1, completions, "a recurring task should get one completion row for today")
}

// The work is bounded, so the number of statements should be too: one to find
// the tasks and one to record them, whether there are three or thirty.
func TestAutoCompleteMatchingTasks_CostDoesNotGrowWithTaskCount(t *testing.T) {
	db := autoCompleteSchema(t)
	clientID, curatorID := taskOwner(t, db)

	const recurring = 30
	for range recurring {
		habit(t, db, clientID, curatorID, "daily")
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	svc := NewService(db, logger.New(), nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	statements := roundTrips(t, db, func() {
		err = svc.AutoCompleteMatchingTasks(ctx, clientID, "workout", time.Now())
	})
	require.NoError(t, err)

	t.Logf("%d recurring tasks completed in %d statements", recurring, statements)

	// One SELECT, one INSERT. The bound is loose enough not to be a trip hazard
	// for an honest change, and far below the 31 a per-task write would cost.
	assert.LessOrEqual(t, statements, int64(4),
		"auto-completion should batch its writes, not issue one per task")

	var completions int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM task_completions WHERE completed_date = CURRENT_DATE`).Scan(&completions))
	assert.Equal(t, recurring, completions, "every recurring task should be recorded")
}
