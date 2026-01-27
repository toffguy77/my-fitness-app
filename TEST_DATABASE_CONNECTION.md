# Test Database Connection

## Terminal is Blocked

Терминал Kiro заблокирован фоновым процессом. Выполните проверку подключения в **системном терминале macOS**.

## Quick Test (in system terminal)

### Option 1: Using Go test script

```bash
cd ~/src/my-fitness-app/apps/api
go run test-db-connection.go
```

Expected output:
```
🔄 Testing PostgreSQL connection...
📍 Host: c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432
📦 Database: web-app-db

✅ Database connection established!

📊 Database Info:
   Version: PostgreSQL 18rc1b...
   Database: web-app-db
   User: web-app-user

📈 Connection Pool Stats:
   Open Connections: 1
   In Use: 0
   Idle: 1

📋 Existing Tables:
   (no tables yet - database is empty)

✅ Connection test successful!
```

### Option 2: Using psql directly

```bash
psql "postgresql://web-app-user:ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db?sslmode=require"
```

Then run:
```sql
-- Check version
SELECT version();

-- Check current database and user
SELECT current_database(), current_user;

-- List tables
\dt

-- Exit
\q
```

### Option 3: Using Makefile

```bash
cd ~/src/my-fitness-app
make -f Makefile.db db-status
```

## Troubleshooting

### "connection refused"

Check if host is reachable:
```bash
ping c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net
```

### "password authentication failed"

Verify credentials in `apps/api/.env`:
```bash
cat apps/api/.env | grep DATABASE_URL
```

### "SSL connection required"

Make sure `sslmode=require` is in connection string.

### "psql: command not found"

Install PostgreSQL client:
```bash
brew install postgresql@18
```

## After Successful Connection

Once connection is verified:

1. **Kill blocking processes:**
```bash
pkill -9 npm
pkill -9 jest
pkill -9 node
```

2. **Commit environment files:**
```bash
bash scripts/add-env-files.sh
git commit -m "chore: add development environment configuration"
git push origin dev
```

3. **Start development:**
```bash
make dev
```

## Connection Details

- **Host:** c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net
- **Port:** 6432
- **Database:** web-app-db
- **User:** web-app-user
- **SSL:** Required (SCRAM-SHA-256)
- **Max Connections:** 50

## Files Created

- `apps/api/test-db-connection.go` - Go script to test connection
- `apps/api/.env` - Backend environment with credentials
- `apps/web/.env.local` - Frontend environment
- `.env.local` - Root environment for Docker Compose

## Next Steps

After verifying connection:
1. Design database schema
2. Create migrations in `apps/api/migrations/`
3. Run migrations: `make -f Makefile.db db-migrate`
4. Start backend: `make dev-api`
5. Start frontend: `make dev-web`
