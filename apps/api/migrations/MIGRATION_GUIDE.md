# Migration Guide

## Location Change

All database migrations have been moved from root `migrations/` to `apps/api/migrations/` to follow monorepo best practices.

## Quick Commands

```bash
# From project root
make -f Makefile.db db-migrate

# From apps/api directory
psql "$DATABASE_URL" -f migrations/000_create_users_table_up.sql
psql "$DATABASE_URL" -f migrations/001_password_reset_schema_up.sql

# Test connection
cd apps/api && go run test-db-connection.go

# Run specific migration
cd apps/api && go run run-users-migration.go
cd apps/api && go run test-password-reset-migration.go
```

## Migration Files

### 000 - Users Table
Creates base users and user_consents tables:
- `users` - User accounts with email, password, role
- `user_consents` - GDPR consent tracking

### 001 - Password Reset
Adds password reset functionality:
- `reset_tokens` - Hashed tokens with expiration
- `password_reset_attempts` - Rate limiting
- `users.password_changed_at` - Audit column
- Cleanup functions for maintenance

## Current Database State

```
Tables:
- users (from migration 000)
- user_consents (from migration 000)
- reset_tokens (from migration 001)
- password_reset_attempts (from migration 001)
```

## Next Steps

When creating new migrations:

1. **Create files**:
   ```bash
   touch apps/api/migrations/002_your_feature_up.sql
   touch apps/api/migrations/002_your_feature_down.sql
   ```

2. **Follow naming**: `{number}_{description}_{direction}.sql`

3. **Test locally first**:
   ```bash
   psql "$DATABASE_URL" -f apps/api/migrations/002_your_feature_up.sql
   ```

4. **Always create rollback**:
   ```bash
   psql "$DATABASE_URL" -f apps/api/migrations/002_your_feature_down.sql
   ```

## Updated References

All documentation has been updated to reference `apps/api/migrations/`:
- ✅ Makefile
- ✅ Makefile.db
- ✅ ENV_SETUP.md
- ✅ TEST_DATABASE_CONNECTION.md
- ✅ docs/POSTGRESQL_SETUP.md
- ✅ docs/MAKEFILE_GUIDE.md
- ✅ docs/PASSWORD_RESET_FEATURE.md
- ✅ PROJECT_STRUCTURE.md
- ✅ Go migration scripts

## Rollback Old Structure

The old `migrations/` directory in project root has been removed. All migrations are now in `apps/api/migrations/`.
