# Environment Setup Guide

## Development Branch Strategy

В **dev** ветке мы коммитим `.env` файлы для упрощения совместной разработки. Это позволяет всем разработчикам использовать одинаковую конфигурацию без необходимости ручной настройки.

⚠️ **ВАЖНО**: Эти файлы содержат credentials для **development** окружения в Yandex.Cloud. Никогда не используйте эти credentials в production!

## Environment Files

### Backend API (`apps/api/.env`)

```bash
# PostgreSQL Database (Yandex.Cloud Development)
DATABASE_URL=postgresql://web-app-user:PASSWORD@HOST:6432/web-app-db?sslmode=require

# Server Configuration
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3069

# Connection Pool (development settings)
DB_MAX_OPEN_CONNS=10
DB_MAX_IDLE_CONNS=2

# JWT Secret (development only!)
JWT_SECRET=dev-secret-key-change-in-production-2026

# Logging
LOG_LEVEL=debug
```

### Frontend Web (`apps/web/.env.local`)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_VERSION=v1

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3069
NEXT_PUBLIC_APP_NAME=BURCEV
NEXT_PUBLIC_APP_ENV=development

# Feature Flags (disabled in dev)
NEXT_PUBLIC_ENABLE_OCR=false
NEXT_PUBLIC_ENABLE_PREMIUM=false
NEXT_PUBLIC_ENABLE_CHAT=false
```

### Root (`.env.local`)

Используется для docker-compose и общих настроек.

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd my-fitness-app
git checkout dev
```

### 2. Install Dependencies

```bash
make install
```

### 3. Verify Database Connection

```bash
make -f Makefile.db db-status
```

Вы должны увидеть:
```
✓ Database connection successful
```

### 4. Start Development Servers

```bash
# Start both frontend and backend
make dev

# Or start separately
make dev-web   # Frontend only (port 3069)
make dev-api   # Backend only (port 4000)
```

### 5. Access Application

- **Frontend**: http://localhost:3069
- **Backend API**: http://localhost:4000
- **Health Check**: http://localhost:4000/health

## Database Access

### Using Makefile Commands

```bash
# Check database status
make -f Makefile.db db-status

# List all tables
make -f Makefile.db db-tables

# Show table schema
make -f Makefile.db db-schema TABLE=users

# Run migrations
make -f Makefile.db db-migrate

# Connect to database (psql)
make -f Makefile.db db-connect
```

### Using MCP in Kiro

```bash
# List tables
@postgres list-tables

# Describe table
@postgres describe-table users

# Run query
@postgres read-query "SELECT * FROM users LIMIT 10"
```

### Direct Connection (psql)

```bash
psql "postgresql://web-app-user:ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db?sslmode=require"
```

## Branch-Specific Configuration

### Dev Branch (current)

- `.env` files **ARE** committed
- Uses development database in Yandex.Cloud
- Debug logging enabled
- Feature flags disabled by default
- Lower connection pool limits

### Staging/Production Branches

- `.env` files **ARE NOT** committed
- Uses separate databases
- Production logging
- Feature flags enabled
- Higher connection pool limits
- Requires manual `.env` setup from secure storage

## Security Notes

### Development Credentials

Текущие credentials в `.env` файлах:
- ✅ Используются только для development окружения
- ✅ База данных изолирована от production
- ✅ Доступ ограничен только к development кластеру
- ✅ Можно безопасно коммитить в dev ветку

### Production Credentials

Production credentials:
- ❌ **НИКОГДА** не коммитятся в git
- ✅ Хранятся в GitHub Secrets
- ✅ Используются только в CI/CD
- ✅ Ротируются регулярно

## Troubleshooting

### Database Connection Failed

```bash
# Check if database is accessible
make -f Makefile.db db-status

# Check environment variables
cat apps/api/.env | grep DATABASE_URL

# Test connection manually
psql "$DATABASE_URL" -c "SELECT 1"
```

### Port Already in Use

```bash
# Check what's using the port
lsof -i :4000  # Backend
lsof -i :3069  # Frontend

# Kill the process
kill -9 <PID>
```

### Go Environment Issues

```bash
# Setup Go environment
source scripts/setup-env.sh

# Or use Makefile (automatically sets up Go)
make dev-api
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:port/db` |
| `PORT` | Backend server port | `4000` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3069` |
| `JWT_SECRET` | JWT signing secret | `dev-secret-key-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment name | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `DB_MAX_OPEN_CONNS` | Max open connections | `25` |
| `DB_MAX_IDLE_CONNS` | Max idle connections | `5` |

## Next Steps

1. ✅ Environment files created
2. ✅ Database connection verified
3. ⏭️ Create database migrations in `apps/api/migrations/`
4. ⏭️ Run migrations: `make -f Makefile.db db-migrate`
5. ⏭️ Start development: `make dev`

## Support

Если возникли проблемы:
1. Проверьте `docs/POSTGRESQL_SETUP.md`
2. Проверьте `docs/ENVIRONMENT_SETUP.md`
3. Запустите `make status` для диагностики
