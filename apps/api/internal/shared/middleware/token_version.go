package middleware

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"
)

// TokenVersions answers "is this access token still current?".
//
// Revoking a refresh token closes the future; it does nothing about an access
// token already issued, which keeps working for its full fifteen minutes. After
// a password change those are exactly the fifteen minutes the person was trying
// to take away from whoever had their session.
//
// Every access token carries the version the account had when it was minted.
// Bumping the version makes every token issued before it invalid at once.
//
// The version is read on every authenticated request, so it is cached. The
// cache is short-lived and cleared on a bump, which means a revocation takes
// effect immediately on the instance that performed it and within the TTL
// everywhere else.
type TokenVersions struct {
	db  *sql.DB
	ttl time.Duration

	// sweepAt is how many entries may accumulate before expired ones are
	// dropped. A field rather than the constant so a test can reach it.
	sweepAt int

	mu     sync.RWMutex
	cached map[int64]cachedVersion
}

type cachedVersion struct {
	version int
	until   time.Time
}

// versionTTL bounds how stale a cached version can be. Thirty seconds: a
// revoked session survives at most that long on an instance that did not
// perform the revocation, against a database read on every request otherwise.
const versionTTL = 30 * time.Second

// sweepThreshold is how many entries accumulate before expired ones are
// dropped.
//
// An expired entry used to be overwritten but never removed, so the map held
// every account that had made a request since the process started, for as long
// as it ran. Nothing read those entries again; they were simply never let go.
//
// Sweeping on write, past a threshold, keeps it to the accounts actually
// asking — which is what the cache is for. If more than this many are active
// within one TTL the sweep frees nothing and the map grows: that is a real
// working set, not a leak, and it shrinks on its own when they stop.
const sweepThreshold = 4096

// NewTokenVersions builds the cache.
func NewTokenVersions(db *sql.DB) *TokenVersions {
	return &TokenVersions{
		db:      db,
		ttl:     versionTTL,
		sweepAt: sweepThreshold,
		cached:  map[int64]cachedVersion{},
	}
}

// Current returns the account's version, from cache when it is fresh.
func (t *TokenVersions) Current(ctx context.Context, userID int64) (int, error) {
	t.mu.RLock()
	entry, ok := t.cached[userID]
	t.mu.RUnlock()
	if ok && time.Now().Before(entry.until) {
		return entry.version, nil
	}

	var version int
	err := t.db.QueryRowContext(ctx,
		`SELECT token_version FROM users WHERE id = $1`, userID).Scan(&version)
	if errors.Is(err, sql.ErrNoRows) {
		// No such account. Nothing this token names still exists.
		return 0, sql.ErrNoRows
	}
	if err != nil {
		return 0, err
	}

	t.remember(userID, version)
	return version, nil
}

// remember stores the version, dropping expired entries once enough have piled
// up to be worth walking the map for.
func (t *TokenVersions) remember(userID int64, version int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	if len(t.cached) >= t.sweepAt {
		for id, entry := range t.cached {
			if now.After(entry.until) {
				delete(t.cached, id)
			}
		}
	}

	t.cached[userID] = cachedVersion{version: version, until: now.Add(t.ttl)}
}

// Size reports how many entries the cache holds. For tests: the sweep is
// invisible from the outside otherwise, and a cache that never lets go looks
// exactly like one that does until the process runs out of memory.
func (t *TokenVersions) Size() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.cached)
}

// BumpVersion invalidates every access token issued so far for this account.
//
// Writing the new version and forgetting the cached one happen here, together,
// because they are one act. Splitting them is how the cache went on answering
// with the old version for half a minute after a password change — during
// which every request, including those carrying a token minted seconds ago,
// was refused. The tokens were right; the cache was stale.
func (t *TokenVersions) BumpVersion(ctx context.Context, tx *sql.Tx, userID int64) error {
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("bump token version: %w", err)
	}
	t.Forget(userID)
	return nil
}

// Forget drops one account from the cache, so the next request reads the
// database.
func (t *TokenVersions) Forget(userID int64) {
	t.mu.Lock()
	delete(t.cached, userID)
	t.mu.Unlock()
}
