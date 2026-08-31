package jobs

import (
	"context"
	"database/sql"
	"fmt"
	"hash/fnv"
)

// lockKey derives a stable 64-bit key from a job name.
//
// PostgreSQL advisory locks are keyed by integer, so the name has to be hashed.
// FNV-1a is used because it is stable across processes and Go versions — the
// key must be identical on every instance, or two instances would take
// different locks and both run the job.
func lockKey(jobName string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte("burcev.job:" + jobName))
	return int64(h.Sum64())
}

// locker takes a session-scoped advisory lock for the duration of a job.
//
// Advisory locks are used rather than a row with an expiry because PostgreSQL
// releases them automatically when the connection drops. An instance that dies
// mid-job therefore frees the lock without any lease renewal or recovery
// logic — the failure mode a table-based lock has to be written to survive.
type locker struct {
	db *sql.DB
}

// lockHandle holds the connection the lock lives on. The lock is session-scoped
// so it must be released on the same connection it was taken on.
type lockHandle struct {
	conn *sql.Conn
	key  int64
}

// tryLock attempts to take the lock without waiting.
//
// Returns (nil, nil) when another instance holds it: that is not an error, it
// is the expected outcome on every instance except one.
func (l *locker) tryLock(ctx context.Context, jobName string) (*lockHandle, error) {
	conn, err := l.db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire connection: %w", err)
	}

	key := lockKey(jobName)
	var acquired bool
	if err := conn.QueryRowContext(ctx, "SELECT pg_try_advisory_lock($1)", key).Scan(&acquired); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("try advisory lock: %w", err)
	}
	if !acquired {
		_ = conn.Close()
		return nil, nil
	}

	return &lockHandle{conn: conn, key: key}, nil
}

// release unlocks and returns the connection to the pool. It uses a caller
// supplied context so release still happens when the job's context has expired.
func (h *lockHandle) release(ctx context.Context) {
	if h == nil {
		return
	}
	_, _ = h.conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", h.key)
	_ = h.conn.Close()
}
