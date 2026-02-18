# Database Migrations Guide

## Overview

This guide describes how to create, test, and apply database migrations in the BURCEV project. All migrations are stored in `apps/api/migrations/` and use PostgreSQL on Yandex.Cloud.

## Migration File Structure

### Naming Convention

Migrations follow a sequential numbering pattern:
```
XXX_description_up.sql    # Apply migration
XXX_description_down.sql  # Rollback migration
```

**Examples:**
- `000_create_users_table_up.sql` / `000_create_users_table_down.sql`
- `001_password_reset_schema_up.sql` / `001_password_reset_schema_down.sql`
- `002_create_notifications_table_up.sql` / `002_create_notifications_table_down.sql`
- `003_create_dashboard_tables_up.sql` / `003_create_dashboard_tables_down.sql`

### Migration File Template

```sql
-- Migration: [Description]
-- Description: [Detailed description of what this migration does]
-- Version: XXX
-- Date: YYYY-MM-DD

-- ============================================================================
-- 1. [Section Name]
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);

-- Add comments
COMMENT ON TABLE table_name IS 'Description';
COMMENT ON COLUMN table_name.column IS 'Description';

-- ============================================================================
-- Migration complete
-- ============================================================================
```

## Creating New Migrations

### Step 1: Determine Migration Number

Check the latest migration number:
```bash
ls apps/api/migrations/ | grep _up.sql | tail -1
```

Use the next sequential number (e.g., if last is 003, use 004).

### Step 2: Create UP Migration

Create `XXX_description_up.sql` with:
1. **Header comment** with description, version, date
2. **Table creation** with `CREATE TABLE IF NOT EXISTS`
3. **Indexes** with `CREATE INDEX IF NOT EXISTS`
4. **Comments** for documentation
5. **Constraints** (CHECK, UNIQUE, FOREIGN KEY)

**Key Requirements:**
- Use `UUID` for primary keys with `gen_random_uuid()`
- Use `TIMESTAMPTZ` for timestamps
- Add `created_at` and `updated_at` to all tables
- Use `IF NOT EXISTS` for idempotency
- Add indexes for frequently queried columns
- Add comments for documentation

### Step 3: Create DOWN Migration

Create `XXX_description_down.sql` with:
1. **Header comment**
2. **DROP statements** in reverse order
3. Use `CASCADE` to handle dependencies

```sql
-- Migration: Drop [Description]
-- Description: Rollback migration XXX
-- Version: XXX
-- Date: YYYY-MM-DD

DROP TABLE IF EXISTS table_name CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
```

### Step 4: Create RLS Policies (if needed)

For tables with user data, create separate RLS migration:

**XXX_table_rls_policies_up.sql:**
```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Users can view own data
CREATE POLICY "Users can view own data"
  ON table_name FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Users can insert own data
CREATE POLICY "Users can insert own data"
  ON table_name FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id')::BIGINT);
```

**XXX_table_rls_policies_down.sql:**
```sql
DROP POLICY IF EXISTS "Policy name" ON table_name;
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

## Running Migrations

### Method 1: Using Go Script (Recommended)

Create a migration runner script (see `apps/api/run-dashboard-migrations.go` as example):

```go
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	_ "github.com/lib/pq"
)

func main() {
	// Load .env file
	loadEnv(".env")
	
	// Get DATABASE_URL
	dbURL := os.Getenv("DATABASE_URL")
	
	// Connect to database
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	
	// Read and execute migration file
	content, err := os.ReadFile("migrations/XXX_migration_up.sql")
	if err != nil {
		log.Fatal(err)
	}
	
	_, err = db.Exec(string(content))
	if err != nil {
		log.Fatal(err)
	}
	
	fmt.Println("✓ Migration completed")
}

func loadEnv(filename string) error {
	content, err := os.ReadFile(filename)
	if err != nil {
		return err
	}
	
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			os.Setenv(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
		}
	}
	return nil
}
```

**Run migration:**
```bash
cd apps/api
go run run-migration-name.go
```

### Method 2: Using Makefile (if psql installed)

```bash
# Run specific migration
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/XXX_migration_up.sql

# Run all migrations
make -f Makefile.db db-migrate
```

### Method 3: Manual psql (if psql installed)

```bash
cd apps/api
source .env
psql "$DATABASE_URL" -f migrations/XXX_migration_up.sql
```

## Testing Migrations

### Step 1: Create Property-Based Tests

For RLS policies and authorization, create property tests in `apps/api/internal/modules/[module]/properties_test.go`:

```go
package module

import (
	"testing"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Property: Authentication Validation
func TestAuthenticationValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)
	
	properties.Property("queries include user_id check", prop.ForAll(
		func(userID int64) bool {
			// Test that queries include user_id in WHERE clause
			// Use sqlmock to verify parameterized queries
			return true
		},
		gen.Int64Range(1, 1000000),
	))
	
	properties.TestingRun(t)
}
```

**Run property tests:**
```bash
cd apps/api
go test -v ./internal/modules/[module]/
```

### Step 2: Verify Migration Applied

Create verification script in migration runner:

```go
func verifyTablesCreated(db *sql.DB) {
	tables := []string{"table1", "table2"}
	
	for _, table := range tables {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_name = $1
			)
		`, table).Scan(&exists)
		
		if exists {
			fmt.Printf("  ✓ %s\n", table)
		} else {
			fmt.Printf("  ✗ %s (not found)\n", table)
		}
	}
}

func verifyIndexes(db *sql.DB) {
	// Check indexes exist
}

func verifyRLSPolicies(db *sql.DB) {
	// Check RLS enabled and policies created
}
```

### Step 3: Test Data Operations

```go
// Insert test data
_, err := db.Exec(`
	INSERT INTO table_name (user_id, data) 
	VALUES ($1, $2)
`, userID, testData)

// Query test data
var result string
err = db.QueryRow(`
	SELECT data FROM table_name 
	WHERE user_id = $1
`, userID).Scan(&result)

// Clean up
db.Exec("DELETE FROM table_name WHERE user_id = $1", userID)
```

## Migration Best Practices

### Database Design

1. **Use UUID for primary keys**
   ```sql
   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   ```

2. **Add timestamps to all tables**
   ```sql
   created_at TIMESTAMPTZ DEFAULT NOW(),
   updated_at TIMESTAMPTZ DEFAULT NOW()
   ```

3. **Use proper data types**
   - `BIGINT` for user IDs (matches users table)
   - `TEXT` for strings (no length limit)
   - `INTEGER` for numbers
   - `DECIMAL(p,s)` for precise decimals
   - `TIMESTAMPTZ` for timestamps with timezone
   - `JSONB` for flexible JSON data

4. **Add constraints**
   ```sql
   -- Check constraints
   status TEXT CHECK (status IN ('active', 'inactive'))
   
   -- Unique constraints
   UNIQUE(user_id, date)
   
   -- Foreign keys
   user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
   
   -- Date validation
   CHECK (end_date >= start_date)
   ```

### Indexing Strategy

1. **Index frequently queried columns**
   ```sql
   CREATE INDEX idx_table_user ON table_name(user_id);
   CREATE INDEX idx_table_date ON table_name(date DESC);
   ```

2. **Composite indexes for multi-column queries**
   ```sql
   CREATE INDEX idx_table_user_date ON table_name(user_id, date DESC);
   ```

3. **GIN indexes for JSONB**
   ```sql
   CREATE INDEX idx_table_json ON table_name USING GIN (json_column);
   ```

4. **Partial indexes for filtered queries**
   ```sql
   CREATE INDEX idx_table_active ON table_name(user_id) 
   WHERE is_active = true;
   ```

### Security (RLS Policies)

1. **Enable RLS on all user data tables**
   ```sql
   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
   ```

2. **Users can only access own data**
   ```sql
   CREATE POLICY "Users can view own data"
     ON table_name FOR SELECT
     USING (user_id = current_setting('app.current_user_id')::BIGINT);
   ```

3. **Curators can access client data**
   ```sql
   CREATE POLICY "Curators can view client data"
     ON table_name FOR SELECT
     USING (
       EXISTS (
         SELECT 1 FROM curator_client_relationships
         WHERE curator_id = current_setting('app.current_user_id')::BIGINT
         AND client_id = table_name.user_id
         AND status = 'active'
       )
     );
   ```

4. **Separate policies for operations**
   - `FOR SELECT` - Read access
   - `FOR INSERT` - Create access
   - `FOR UPDATE` - Modify access
   - `FOR DELETE` - Delete access
   - `FOR ALL` - All operations

### Performance

1. **Use IF NOT EXISTS for idempotency**
   ```sql
   CREATE TABLE IF NOT EXISTS table_name (...);
   CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);
   ```

2. **Add comments for documentation**
   ```sql
   COMMENT ON TABLE table_name IS 'Description';
   COMMENT ON COLUMN table_name.column IS 'Description';
   ```

3. **Use ON DELETE CASCADE for cleanup**
   ```sql
   user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
   ```

## Rollback Procedure

### Step 1: Create Rollback Script

```bash
cd apps/api
go run rollback-migration.go
```

### Step 2: Verify Rollback

```bash
# Check tables dropped
make -f Makefile.db db-tables

# Check policies removed
make -f Makefile.db db-query SQL="SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"
```

### Step 3: Re-apply if Needed

```bash
go run run-migration.go
```

## Common Issues

### Issue: Connection Failed

**Solution:**
1. Check `apps/api/.env` file exists
2. Verify `DATABASE_URL` is set correctly
3. Check database is accessible (firewall, network)
4. Verify credentials are correct

### Issue: Table Already Exists

**Solution:**
1. Use `IF NOT EXISTS` in CREATE statements
2. Or drop table first: `DROP TABLE IF EXISTS table_name CASCADE;`
3. Or skip if intentional (idempotent migrations)

### Issue: RLS Policy Conflicts

**Solution:**
1. Drop existing policies first
2. Use unique policy names
3. Check policy already exists: `SELECT * FROM pg_policies WHERE tablename = 'table_name';`

### Issue: Foreign Key Violation

**Solution:**
1. Ensure referenced tables exist first
2. Check data integrity
3. Use `ON DELETE CASCADE` if appropriate

## Migration Checklist

Before applying migration:
- [ ] Migration number is sequential
- [ ] UP and DOWN files created
- [ ] Tables use UUID primary keys
- [ ] Timestamps (created_at, updated_at) added
- [ ] Indexes created for queried columns
- [ ] Comments added for documentation
- [ ] Constraints added (CHECK, UNIQUE, FK)
- [ ] RLS policies created (if user data)
- [ ] Property tests written
- [ ] Migration tested locally
- [ ] Rollback tested

After applying migration:
- [ ] Tables created successfully
- [ ] Indexes created successfully
- [ ] RLS policies applied (if applicable)
- [ ] Property tests pass
- [ ] Data operations work
- [ ] Performance acceptable

## Examples

### Example 1: Simple Table Migration

See: `apps/api/migrations/002_create_notifications_table_up.sql`

### Example 2: Complex Multi-Table Migration

See: `apps/api/migrations/003_create_dashboard_tables_up.sql`

### Example 3: RLS Policies Migration

See: `apps/api/migrations/004_dashboard_rls_policies_up.sql`

### Example 4: Migration Runner Script

See: `apps/api/run-dashboard-migrations.go`

### Example 5: Property-Based Tests

See: `apps/api/internal/modules/dashboard/properties_test.go`

## References

- Migration Guide: `apps/api/migrations/MIGRATION_GUIDE.md`
- Database Schema: `docs/Database_Schema.md`
- PostgreSQL Docs: https://www.postgresql.org/docs/
- RLS Documentation: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
