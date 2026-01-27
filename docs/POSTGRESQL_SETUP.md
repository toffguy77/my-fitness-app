# PostgreSQL Setup Guide

## Database Information

**Provider**: Yandex.Cloud Managed PostgreSQL  
**Cluster ID**: `c9q1384cb8tqrg09o8n4`  
**Environment**: PRESTABLE  
**Version**: PostgreSQL 18rc1b-ods5kpicmkpjaebt  
**Status**: MASTER ALIVE

## Connection Details

### Database Credentials

- **Host**: `c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net`
- **Port**: `6432`
- **Database**: `web-app-db`
- **User**: `web-app-user`
- **Password**: `ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G`
- **SSL Mode**: `require` (SCRAM-SHA-256)
- **Max Connections**: 50

### Connection URL

```
postgresql://web-app-user:ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db?sslmode=require
```

## Backend Configuration

### Environment Variables

Create `apps/api/.env` file:

```bash
# PostgreSQL Database
DATABASE_URL=postgresql://web-app-user:ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db?sslmode=require

# Or use individual parameters
DB_HOST=c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net
DB_PORT=6432
DB_NAME=web-app-db
DB_USER=web-app-user
DB_PASSWORD=ycDoQH[YqDBz<Uq^#w:d)%ct6RY3~XA>iN\G
DB_SSL_MODE=require

# Connection Pool
DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=5
```

### Go Dependencies

The PostgreSQL driver is already added to `go.mod`:

```go
github.com/lib/pq v1.10.9
```

Install dependencies:

```bash
cd apps/api
go mod download
```

## Usage in Code

### Database Connection

The database connection is initialized in `cmd/server/main.go`:

```go
import "github.com/burcev/api/internal/shared/database"

// Initialize database
db, err := database.NewPostgresFromURL(
    cfg.DatabaseURL,
    cfg.MaxOpenConns,
    cfg.MaxIdleConns,
)
```

### Health Check

Database health is checked in the `/health` endpoint:

```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-24T23:30:00+03:00",
  "environment": "development",
  "database": "ok"
}
```

### Query Examples

```go
// Simple query
rows, err := db.Query("SELECT id, name FROM users WHERE active = $1", true)
if err != nil {
    return err
}
defer rows.Close()

// Query with context
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

var user User
err = db.QueryRowContext(ctx, 
    "SELECT id, email, name FROM users WHERE id = $1", 
    userID,
).Scan(&user.ID, &user.Email, &user.Name)

// Transaction
tx, err := db.Begin()
if err != nil {
    return err
}
defer tx.Rollback()

_, err = tx.Exec("INSERT INTO users (email, name) VALUES ($1, $2)", email, name)
if err != nil {
    return err
}

if err = tx.Commit(); err != nil {
    return err
}
```

## MCP Integration

### PostgreSQL MCP Server

The MCP server for PostgreSQL is configured in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "/opt/homebrew/bin/uvx",
      "args": [
        "mcp-server-postgres",
        "postgresql://web-app-user:PASSWORD@HOST:6432/web-app-db?sslmode=require"
      ],
      "autoApprove": [
        "read-query",
        "list-tables",
        "describe-table"
      ]
    }
  }
}
```

### Available MCP Tools

- `read-query` - Execute SELECT queries
- `write-query` - Execute INSERT/UPDATE/DELETE queries
- `create-table` - Create new tables
- `list-tables` - List all tables
- `describe-table` - Get table schema
- `append-insight` - Add insights about schema

### Using MCP in Kiro

```bash
# List all tables
@postgres list-tables

# Describe table structure
@postgres describe-table users

# Execute query
@postgres read-query "SELECT * FROM users LIMIT 10"
```

## Database Migrations

### Migration Files

Store migrations in `apps/api/migrations/` directory:

```
apps/api/migrations/
├── 000_create_users_table_up.sql
├── 000_create_users_table_down.sql
├── 001_password_reset_schema_up.sql
├── 001_password_reset_schema_down.sql
└── v1.2_add_nutrition_tables.sql
```

### Running Migrations

```bash
# Using psql
psql "postgresql://web-app-user:PASSWORD@HOST:6432/web-app-db?sslmode=require" -f apps/api/migrations/000_create_users_table_up.sql

# Using make
make -f Makefile.db db-migrate
```

## Connection Pool Settings

### Recommended Settings

- **Development**: 
  - `DB_MAX_OPEN_CONNS=10`
  - `DB_MAX_IDLE_CONNS=2`

- **Production**:
  - `DB_MAX_OPEN_CONNS=25`
  - `DB_MAX_IDLE_CONNS=5`

### Monitoring

Check connection pool stats:

```go
stats := db.Stats()
log.Info("Database stats",
    "open_connections", stats.OpenConnections,
    "in_use", stats.InUse,
    "idle", stats.Idle,
)
```

## Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Use SSL/TLS** - Always set `sslmode=require`
3. **Limit permissions** - Use role-based access control
4. **Connection pooling** - Prevent connection exhaustion
5. **Prepared statements** - Prevent SQL injection
6. **Timeouts** - Always use context with timeouts

## Troubleshooting

### Connection Refused

```bash
# Check if host is reachable
ping c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net

# Test connection with psql
psql "postgresql://web-app-user:PASSWORD@HOST:6432/web-app-db?sslmode=require"
```

### SSL Certificate Issues

```bash
# Download Yandex.Cloud CA certificate
wget "https://storage.yandexcloud.net/cloud-certs/CA.pem" -O ~/.postgresql/root.crt

# Update connection string
DATABASE_URL=postgresql://...?sslmode=verify-full&sslrootcert=~/.postgresql/root.crt
```

### Too Many Connections

- Reduce `DB_MAX_OPEN_CONNS`
- Check for connection leaks (missing `defer rows.Close()`)
- Monitor with `db.Stats()`

## Testing

### Unit Tests

```go
func TestDatabaseConnection(t *testing.T) {
    db, err := database.NewPostgres(database.PostgresConfig{
        Host:     "localhost",
        Port:     5432,
        Database: "test_db",
        User:     "test_user",
        Password: "test_pass",
        SSLMode:  "disable",
    })
    
    assert.NoError(t, err)
    assert.NotNil(t, db)
    
    err = db.Health(context.Background())
    assert.NoError(t, err)
}
```

### Integration Tests

Use Docker for local PostgreSQL:

```bash
docker run -d \
  --name postgres-test \
  -e POSTGRES_DB=test_db \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_pass \
  -p 5432:5432 \
  postgres:18-alpine
```

## Resources

- [Yandex.Cloud PostgreSQL Docs](https://cloud.yandex.ru/docs/managed-postgresql/)
- [lib/pq Documentation](https://pkg.go.dev/github.com/lib/pq)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)
