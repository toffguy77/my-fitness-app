package database

import (
	"context"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"
)

// migrationLogger is the subset of logger methods used by Migrator.
type migrationLogger interface {
	Infow(msg string, keysAndValues ...any)
	Warnw(msg string, keysAndValues ...any)
	Errorw(msg string, keysAndValues ...any)
}

// migration holds a parsed migration file ready to apply.
type migration struct {
	Version int
	Name    string
	SQL     string
}

// Migrator applies SQL migration files in version order and tracks applied
// versions in the schema_migrations table.
type Migrator struct {
	db  *DB
	fs  fs.FS
	log migrationLogger
}

// NewMigrator creates a Migrator. migrationsFS must contain *_up.sql files
// named with a numeric prefix, e.g. "001_init_up.sql".
func NewMigrator(db *DB, migrationsFS fs.FS, log migrationLogger) *Migrator {
	return &Migrator{db: db, fs: migrationsFS, log: log}
}

// Run ensures schema_migrations exists, optionally seeds it with a baseline,
// then applies all pending up-migrations in version order.
//
// baseline: if schema_migrations is empty and baseline > 0, all versions up to
// and including baseline are recorded as already applied without running their
// SQL (for brownfield databases that were migrated manually).
func (m *Migrator) Run(ctx context.Context, baseline int) error {
	if err := m.ensureMigrationsTable(ctx); err != nil {
		return err
	}

	applied, seeded, err := m.loadApplied(ctx)
	if err != nil {
		return err
	}

	pending, err := m.loadPending(applied)
	if err != nil {
		return err
	}

	if len(pending) == 0 {
		m.log.Infow("Migrations: all up to date", "applied", len(applied))
		return nil
	}

	// On first run with an empty table, seed baseline versions without executing SQL.
	if !seeded && baseline > 0 {
		if err := m.seedBaseline(ctx, pending, baseline); err != nil {
			return err
		}
		// Reload so we only apply truly pending migrations.
		applied, _, err = m.loadApplied(ctx)
		if err != nil {
			return err
		}
		pending, err = m.loadPending(applied)
		if err != nil {
			return err
		}
	}

	if len(pending) == 0 {
		m.log.Infow("Migrations: all up to date after baseline seed", "applied", len(applied))
		return nil
	}

	m.log.Infow("Migrations: applying pending", "count", len(pending))

	for _, mg := range pending {
		if err := m.apply(ctx, mg); err != nil {
			return fmt.Errorf("migration %03d_%s failed: %w", mg.Version, mg.Name, err)
		}
		m.log.Infow("Migration applied", "version", mg.Version, "name", mg.Name)
	}

	m.log.Infow("Migrations: complete", "applied", len(pending))
	return nil
}

// Applied returns all versions recorded in schema_migrations.
func (m *Migrator) Applied(ctx context.Context) ([]int, error) {
	applied, _, err := m.loadApplied(ctx)
	if err != nil {
		return nil, err
	}
	versions := make([]int, 0, len(applied))
	for v := range applied {
		versions = append(versions, v)
	}
	sort.Ints(versions)
	return versions, nil
}

// ensureMigrationsTable creates schema_migrations if it does not exist.
func (m *Migrator) ensureMigrationsTable(ctx context.Context) error {
	_, err := m.db.DB.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INTEGER     PRIMARY KEY,
			name       TEXT        NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	return nil
}

// loadApplied returns the set of applied versions and whether the table had
// any rows (seeded = true means the table was not brand new / empty).
func (m *Migrator) loadApplied(ctx context.Context) (map[int]struct{}, bool, error) {
	rows, err := m.db.DB.QueryContext(ctx,
		`SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, false, fmt.Errorf("query schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[int]struct{})
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, false, err
		}
		applied[v] = struct{}{}
	}
	return applied, len(applied) > 0, rows.Err()
}

// loadPending returns all up-migrations not yet in applied, sorted by version.
func (m *Migrator) loadPending(applied map[int]struct{}) ([]migration, error) {
	entries, err := fs.ReadDir(m.fs, ".")
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}

	var pending []migration
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), "_up.sql") {
			continue
		}
		mg, err := parseMigrationFile(m.fs, e.Name())
		if err != nil {
			m.log.Warnw("Skipping unparseable migration file", "file", e.Name(), "error", err)
			continue
		}
		if _, ok := applied[mg.Version]; !ok {
			pending = append(pending, mg)
		}
	}

	sort.Slice(pending, func(i, j int) bool {
		return pending[i].Version < pending[j].Version
	})
	return pending, nil
}

// seedBaseline records all pending migrations with version ≤ baseline as
// already applied, without executing their SQL.
func (m *Migrator) seedBaseline(ctx context.Context, pending []migration, baseline int) error {
	m.log.Infow("Migrations: seeding baseline", "baseline", baseline)

	tx, err := m.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin baseline tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	seeded := 0
	for _, mg := range pending {
		if mg.Version > baseline {
			continue
		}
		_, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)
			 ON CONFLICT (version) DO NOTHING`,
			mg.Version, mg.Name, time.Now())
		if err != nil {
			return fmt.Errorf("seed baseline version %d: %w", mg.Version, err)
		}
		seeded++
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit baseline seed: %w", err)
	}

	m.log.Infow("Migrations: baseline seeded", "count", seeded)
	return nil
}

// apply runs a single migration inside a transaction and records it.
func (m *Migrator) apply(ctx context.Context, mg migration) error {
	tx, err := m.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, mg.SQL); err != nil {
		return fmt.Errorf("exec sql: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`,
		mg.Version, mg.Name); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	return tx.Commit()
}

// parseMigrationFile reads and parses a *_up.sql file from the FS.
// Filename format: NNN_name_up.sql  (NNN = zero-padded integer version)
func parseMigrationFile(migrationsFS fs.FS, filename string) (migration, error) {
	// Strip "_up.sql" suffix, then split on first "_" to get version
	base := strings.TrimSuffix(filename, "_up.sql")
	parts := strings.SplitN(base, "_", 2)
	if len(parts) < 2 {
		return migration{}, fmt.Errorf("unexpected filename format: %s", filename)
	}

	version, err := strconv.Atoi(parts[0])
	if err != nil {
		return migration{}, fmt.Errorf("non-numeric version prefix in %s", filename)
	}

	sql, err := fs.ReadFile(migrationsFS, filename)
	if err != nil {
		return migration{}, fmt.Errorf("read %s: %w", filename, err)
	}

	return migration{
		Version: version,
		Name:    parts[1],
		SQL:     string(sql),
	}, nil
}
