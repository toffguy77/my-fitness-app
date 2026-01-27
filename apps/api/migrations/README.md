# Database Migrations

This directory contains SQL migration files for the BURCEV application database schema.

## Migration Naming Convention

Migrations follow the pattern: `{number}_{description}_{direction}.sql`

- **number**: Sequential number (000, 001, 002, etc.)
- **description**: Brief description of the migration (snake_case)
- **direction**: Either `up` (apply) or `down` (rollback)

Example: `001_password_reset_schema_up.sql`

## Available Migrations

### 000 - Create Users Table
- **Up**: `000_create_users_table_up.sql`
- **Down**: `000_create_users_table_down.sql`
- **Description**: Creates users and user_consents tables for authentication
- **Tables Created**:
  - `users` - User accounts with email, password, role
  - `user_consents` - Audit trail for user consent agreements

### 001 - Password Reset Schema
- **Up**: `001_password_reset_schema_up.sql`
- **Down**: `001_password_reset_schema_down.sql`
- **Description**: Creates tables and functions for password reset functionality
- **Tables Created**:
  - `reset_tokens` - Stores hashed password reset tokens with expiration
  - `password_reset_attempts` - Tracks reset attempts for rate limiting
- **Columns Added**:
  - `users.password_changed_at` - Tracks last password change timestamp
- **Functions Created**:
  - `cleanup_expired_reset_tokens()` - Removes expired tokens
  - `cleanup_old_reset_attempts()` - Removes old attempt records

## Running Migrations

### Using psql (Command Line)

```bash
# Apply migration (up)
psql "$DATABASE_URL" -f apps/api/migrations/001_password_reset_schema_up.sql

# Rollback migration (down)
psql "$DATABASE_URL" -f apps/api/migrations/001_password_reset_schema_down.sql
```

### Using Yandex Cloud PostgreSQL

```bash
# Connect to database
psql "postgresql://web-app-user:PASSWORD@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db?sslmode=require"

# Run migration
\i apps/api/migrations/001_password_reset_schema_up.sql

# Check tables
\dt

# Check indexes
\di
```

### Using Go Migration Script

```bash
# From apps/api directory
go run test-migration.go
```

## Migration Checklist

Before running a migration:
- [ ] Review the SQL file for correctness
- [ ] Ensure database backup exists
- [ ] Test on local/dev environment first
- [ ] Verify all dependencies (e.g., users table) exist
- [ ] Check for naming conflicts with existing tables/columns

After running a migration:
- [ ] Verify tables were created: `\dt`
- [ ] Verify indexes were created: `\di`
- [ ] Verify functions were created: `\df`
- [ ] Test rollback migration on dev environment
- [ ] Update application code to use new schema

## Rollback Procedure

If a migration causes issues:

1. **Immediate rollback**:
   ```bash
   psql "$DATABASE_URL" -f apps/api/migrations/001_password_reset_schema_down.sql
   ```

2. **Verify rollback**:
   ```sql
   -- Check tables are removed
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('reset_tokens', 'password_reset_attempts');
   
   -- Check column is removed
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name = 'password_changed_at';
   ```

3. **Fix the migration** and test again

## Maintenance Functions

The password reset migration includes maintenance functions that should be called periodically:

```sql
-- Clean up expired tokens (run daily)
SELECT cleanup_expired_reset_tokens();

-- Clean up old attempts (run daily)
SELECT cleanup_old_reset_attempts();
```

Consider setting up a cron job or scheduled task to run these functions.

## Security Notes

- Reset tokens are **always stored hashed** (SHA-256), never in plain text
- The `token_hash` column has a UNIQUE constraint to prevent duplicates
- Foreign key constraint ensures tokens are deleted when users are deleted
- Rate limiting tables track attempts by email and IP address
- All timestamps use server time (NOW()) for consistency

## Troubleshooting

### "relation 'users' does not exist"
The migration expects a `users` table to exist. Run migration 000 first to create the users table.

### "column 'password_changed_at' already exists"
The migration checks for existing columns and skips if already present. This is safe to ignore.

### Permission errors
Ensure the database user has sufficient privileges:
```sql
GRANT CREATE ON SCHEMA public TO "web-app-user";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "web-app-user";
```
