# Dashboard Migrations Testing Guide

## Overview

This document provides instructions for testing the dashboard migrations (003 and 004) on the local or staging database.

## Migration Files

### 003: Dashboard Tables
- **Up**: `003_create_dashboard_tables_up.sql`
- **Down**: `003_create_dashboard_tables_down.sql`

Creates the following tables:
1. `coach_client_relationships` - Relationships between coaches and clients
2. `daily_metrics` - Daily tracking metrics (nutrition, weight, activity)
3. `weekly_plans` - Coach-assigned weekly plans
4. `tasks` - Coach-assigned tasks
5. `weekly_reports` - Weekly progress reports
6. `weekly_photos` - Weekly body form photos

### 004: RLS Policies
- **Up**: `004_dashboard_rls_policies_up.sql`
- **Down**: `004_dashboard_rls_policies_down.sql`

Implements Row Level Security policies for all dashboard tables.

## Prerequisites

1. PostgreSQL client (`psql`) installed
2. Access to the database (local or remote)
3. Database connection string in `apps/api/.env`

## Testing Steps

### 1. Check Database Connection

```bash
make -f Makefile.db db-status
```

### 2. Run Dashboard Table Migrations

```bash
# Run migration 003 (create tables)
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/003_create_dashboard_tables_up.sql
```

### 3. Verify Tables Created

```bash
# List all tables
make -f Makefile.db db-tables

# Check specific table schemas
make -f Makefile.db db-schema TABLE=daily_metrics
make -f Makefile.db db-schema TABLE=weekly_plans
make -f Makefile.db db-schema TABLE=tasks
make -f Makefile.db db-schema TABLE=weekly_reports
make -f Makefile.db db-schema TABLE=weekly_photos
make -f Makefile.db db-schema TABLE=coach_client_relationships
```

### 4. Run RLS Policy Migrations

```bash
# Run migration 004 (RLS policies)
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/004_dashboard_rls_policies_up.sql
```

### 5. Verify RLS Policies

```bash
# Check RLS is enabled on tables
make -f Makefile.db db-query SQL="SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('daily_metrics', 'weekly_plans', 'tasks', 'weekly_reports', 'weekly_photos', 'coach_client_relationships');"

# List policies for a specific table
make -f Makefile.db db-query SQL="SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE tablename = 'daily_metrics';"
```

### 6. Test Data Operations

#### Insert Test Data

```bash
# Create a test user (if not exists)
make -f Makefile.db db-query SQL="INSERT INTO users (email, password, name, role) VALUES ('test@example.com', 'hashed_password', 'Test User', 'client') ON CONFLICT (email) DO NOTHING RETURNING id;"

# Insert test daily metrics
make -f Makefile.db db-query SQL="INSERT INTO daily_metrics (user_id, date, calories, protein, fat, carbs, weight, steps) VALUES (1, '2026-01-29', 2000, 150, 60, 200, 75.5, 10000);"

# Insert test coach-client relationship
make -f Makefile.db db-query SQL="INSERT INTO coach_client_relationships (coach_id, client_id, status) VALUES (2, 1, 'active');"

# Insert test weekly plan
make -f Makefile.db db-query SQL="INSERT INTO weekly_plans (user_id, coach_id, calories_goal, protein_goal, start_date, end_date, created_by) VALUES (1, 2, 2000, 150, '2026-01-27', '2026-02-02', 2);"
```

#### Query Test Data

```bash
# Query daily metrics
make -f Makefile.db db-query SQL="SELECT * FROM daily_metrics WHERE user_id = 1;"

# Query weekly plans
make -f Makefile.db db-query SQL="SELECT * FROM weekly_plans WHERE user_id = 1;"

# Query coach-client relationships
make -f Makefile.db db-query SQL="SELECT * FROM coach_client_relationships WHERE client_id = 1;"
```

### 7. Test Indexes

```bash
# Check indexes on daily_metrics
make -f Makefile.db db-query SQL="SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'daily_metrics';"

# Check indexes on weekly_plans
make -f Makefile.db db-query SQL="SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'weekly_plans';"

# Check indexes on tasks
make -f Makefile.db db-query SQL="SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tasks';"
```

### 8. Rollback Testing (Optional)

```bash
# Rollback RLS policies
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/004_dashboard_rls_policies_down.sql

# Rollback tables
make -f Makefile.db db-migrate-file FILE=apps/api/migrations/003_create_dashboard_tables_down.sql

# Verify tables are dropped
make -f Makefile.db db-tables
```

## Expected Results

### Tables Created
- ✅ `coach_client_relationships` with UUID primary key
- ✅ `daily_metrics` with UUID primary key and unique constraint on (user_id, date)
- ✅ `weekly_plans` with UUID primary key and date range validation
- ✅ `tasks` with UUID primary key and status enum
- ✅ `weekly_reports` with UUID primary key and JSONB summary
- ✅ `weekly_photos` with UUID primary key and unique constraint on (user_id, week_identifier)

### Indexes Created
- ✅ `idx_coach_client_coach` on coach_client_relationships(coach_id, status)
- ✅ `idx_coach_client_client` on coach_client_relationships(client_id, status)
- ✅ `idx_daily_metrics_user_date` on daily_metrics(user_id, date DESC)
- ✅ `idx_daily_metrics_date` on daily_metrics(date DESC)
- ✅ `idx_weekly_plans_user_active` on weekly_plans(user_id, is_active, start_date DESC)
- ✅ `idx_weekly_plans_dates` on weekly_plans(start_date, end_date)
- ✅ `idx_weekly_plans_coach` on weekly_plans(coach_id, created_at DESC)
- ✅ `idx_tasks_user_status` on tasks(user_id, status, due_date DESC)
- ✅ `idx_tasks_week` on tasks(user_id, week_number DESC)
- ✅ `idx_tasks_coach` on tasks(coach_id, created_at DESC)
- ✅ `idx_weekly_reports_user_week` on weekly_reports(user_id, week_start DESC)
- ✅ `idx_weekly_reports_coach` on weekly_reports(coach_id, submitted_at DESC)
- ✅ `idx_weekly_reports_summary` on weekly_reports using GIN (summary)
- ✅ `idx_weekly_photos_user_week` on weekly_photos(user_id, week_start DESC)

### RLS Policies Created
- ✅ All tables have RLS enabled
- ✅ Users can view/manage own data
- ✅ Coaches can view/manage client data (with active relationship check)
- ✅ All policies use parameterized queries

## Property-Based Tests

The RLS policies are validated by property-based tests in `apps/api/internal/modules/dashboard/properties_test.go`:

### Property 30: Authentication Validation
- ✅ All queries include user_id in WHERE clause
- ✅ Queries use parameterized statements (SQL injection prevention)
- ✅ Users can only access their own data
- ✅ Results always belong to the requesting user

Run tests:
```bash
cd apps/api
go test -v -run TestAuthenticationValidationProperty ./internal/modules/dashboard/
go test -v -run TestUserIsolationProperty ./internal/modules/dashboard/
```

## Troubleshooting

### Connection Issues
If you get connection errors:
1. Check `apps/api/.env` file exists and has correct DATABASE_URL
2. Verify database is accessible (firewall, network)
3. Check credentials are correct

### Migration Errors
If migrations fail:
1. Check if tables already exist: `make -f Makefile.db db-tables`
2. Review error messages for constraint violations
3. Rollback and retry if needed

### RLS Policy Issues
If RLS policies fail:
1. Verify tables exist before applying policies
2. Check that referenced tables (users, coach_client_relationships) exist
3. Ensure current_setting function is available

## Performance Considerations

### Index Usage
Monitor query performance with:
```bash
make -f Makefile.db db-query SQL="EXPLAIN ANALYZE SELECT * FROM daily_metrics WHERE user_id = 1 AND date = '2026-01-29';"
```

### Connection Pooling
Verify connection pool settings in `apps/api/.env`:
- `DB_MAX_OPEN_CONNS=10`
- `DB_MAX_IDLE_CONNS=2`

## Next Steps

After successful migration testing:
1. ✅ Verify all tables and indexes created
2. ✅ Verify RLS policies applied
3. ✅ Run property-based tests
4. ⏭️ Implement backend service layer (Task 2)
5. ⏭️ Implement backend HTTP handlers (Task 4)
6. ⏭️ Implement frontend components (Tasks 6-13)

## References

- Design Document: `.kiro/specs/dashboard/design.md`
- Requirements: `.kiro/specs/dashboard/requirements.md`
- Tasks: `.kiro/specs/dashboard/tasks.md`
- Migration Guide: `apps/api/migrations/MIGRATION_GUIDE.md`
