package middleware

import (
	"context"
	"database/sql"
	"errors"
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

// NewTokenVersions builds the cache.
func NewTokenVersions(db *sql.DB) *TokenVersions {
	return &TokenVersions{db: db, ttl: versionTTL, cached: map[int64]cachedVersion{}}
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

	t.mu.Lock()
	t.cached[userID] = cachedVersion{version: version, until: time.Now().Add(t.ttl)}
	t.mu.Unlock()
	return version, nil
}

// Forget drops one account from the cache, so the next request reads the
// database. Called by whatever just bumped the version.
func (t *TokenVersions) Forget(userID int64) {
	t.mu.Lock()
	delete(t.cached, userID)
	t.mu.Unlock()
}
