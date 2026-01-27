# Database Migrations

All database migrations have been moved to `apps/api/migrations/` to follow the monorepo structure.

## Quick Start

```bash
# Run all migrations
make -f Makefile.db db-migrate

# Run specific migration
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/001_password_reset_schema_up.sql

# Rollback specific migration
psql "$DATABASE_URL" -f apps/api/migrations/001_password_reset_schema_down.sql
```

## Migration Files

Current migrations:
- `000_create_users_table_up.sql` / `000_create_users_table_down.sql` - Users and consents tables
- `001_password_reset_schema_up.sql` / `001_password_reset_schema_down.sql` - Password reset functionality

## Documentation

See `apps/api/migrations/README.md` for detailed migration documentation including:
- Migration naming conventions
- Running migrations
- Rollback procedures
- Security notes
- Troubleshooting

## Creating New Migrations

1. Create new migration files in `apps/api/migrations/`:
   ```bash
   touch apps/api/migrations/002_your_feature_up.sql
   touch apps/api/migrations/002_your_feature_down.sql
   ```

2. Follow naming convention: `{number}_{description}_{direction}.sql`
   - Number: Sequential (002, 003, etc.)
   - Description: snake_case description
   - Direction: `up` (apply) or `down` (rollback)

3. Test locally before production:
   ```bash
   # Apply
   psql "$DATABASE_URL" -f apps/api/migrations/002_your_feature_up.sql
   
   # Verify
   psql "$DATABASE_URL" -c "\dt"
   
   # Rollback if needed
   psql "$DATABASE_URL" -f apps/api/migrations/002_your_feature_down.sql
   ```

## Migration Structure

```
apps/api/migrations/
├── README.md                              # Detailed documentation
├── 000_create_users_table_up.sql         # Users table
├── 000_create_users_table_down.sql
├── 001_password_reset_schema_up.sql      # Password reset
├── 001_password_reset_schema_down.sql
└── 002_your_next_migration_up.sql        # Future migrations
```

## Best Practices

- Always create both `up` and `down` migrations
- Test rollback before deploying
- Use `IF EXISTS` / `IF NOT EXISTS` for idempotency
- Add comments explaining complex logic
- Include indexes for performance
- Document breaking changes
