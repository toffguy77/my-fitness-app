# Technical Stack & Build System

## Architecture

Monorepo with feature-based organization using npm workspaces.

## Localization Requirements

**CRITICAL: All user-facing content MUST be in Russian**

This includes:
- Validation error messages (frontend and backend)
- API error responses
- Form validation errors
- User notifications and toasts
- UI text and labels
- Zod schema validation messages
- Success/failure messages

**Code Examples:**

```typescript
// Frontend validation - CORRECT ✅
export function validateWeight(input: unknown): ValidationResult {
    if (input <= 0) {
        return {
            isValid: false,
            error: 'Вес должен быть положительным', // Russian
        }
    }
}

// Zod schema - CORRECT ✅
export const goalSchema = z.object({
    startDate: z.date(),
    endDate: z.date(),
}).refine(data => data.endDate >= data.startDate, {
    message: "Дата окончания должна быть не раньше даты начала", // Russian
    path: ["endDate"],
})

// WRONG ❌
error: 'Weight must be positive' // English - DO NOT USE
```

**Testing:**
- Update unit tests to expect Russian messages
- Update property-based tests to check Russian substrings
- Example: `expect(result.error).toContain('положительным')` not `'positive'`

## Frontend Stack

- **Framework**: Next.js 16 (App Router with SSR/CSR)
- **Language**: TypeScript 5
- **UI**: React 19 with React Compiler
- **Styling**: Tailwind CSS v4
- **State**: Zustand for global state, React hooks for local
- **Testing**: Jest, React Testing Library, Playwright (E2E)
- **Mocking**: MSW (Mock Service Worker)
- **Icons**: Lucide React
- **Charts**: Recharts
- **Notifications**: react-hot-toast

## Backend Stack

- **Language**: Go 1.22
- **Framework**: Gin (HTTP router)
- **Database**: PostgreSQL on Yandex.Cloud
- **Storage**: Yandex Cloud Object Storage (S3-compatible)
- **Auth**: JWT-based authentication
- **Logging**: Zap (structured logging)
- **Testing**: Go testing package with testify, gopter (property-based testing)
- **Services**: Notifications service, Photo upload service

## Infrastructure

- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: nginx
- **Object Storage**: Yandex Cloud S3 (weekly-progress-photos bucket)
- **CI/CD**: GitHub Actions (planned)
- **Deployment**: VPS with Docker

## Common Commands

### Development
```bash
make dev              # Start both frontend and backend
make dev-web          # Frontend only (port 3069)
make dev-api          # Backend only (port 4000)
npm run dev           # Alternative: start both apps
```

### Building
```bash
make build            # Build all
make build-web        # Build Next.js app
make build-api        # Build Go binary
```

### Testing
```bash
make test             # Run all tests
make test-web         # Frontend tests (Jest)
make test-api         # Backend tests (Go test)
make test-coverage    # Tests with coverage reports
npm test              # Alternative: run workspace tests
```

### Code Quality
```bash
make lint             # Lint all code
make type-check       # TypeScript type checking
npm run lint          # ESLint for frontend
```

### Docker
```bash
make docker-build     # Build images
make docker-up        # Start containers
make docker-down      # Stop containers
make docker-logs      # View logs
```

### Database
```bash
# Migrations managed through migration files
# Connection via DATABASE_URL or individual DB_* env vars
# PostgreSQL hosted on Yandex.Cloud

# Run migrations using Go script (recommended)
cd apps/api
go run run-migration-name.go

# Or using Makefile (if psql installed)
make -f Makefile.db db-migrate              # Run all migrations
make -f Makefile.db db-migrate-file FILE=... # Run specific migration
make -f Makefile.db db-tables               # List tables
make -f Makefile.db db-schema TABLE=...     # Show table schema
```

**See detailed migration guide:** `.kiro/steering/database-migrations.md` (English) or `.kiro/steering/database-migrations-ru.md` (Russian)

### S3 Storage
```bash
# Test S3 integration
cd apps/api
go run test-s3-upload.go      # Full test with real credentials
go run test-s3-mock.go         # Quick test without credentials

# Check S3 configuration
grep S3_ .env

# View uploaded files in console
# https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos
```

**See detailed S3 guide:** `.kiro/steering/s3-storage.md`

## Project Structure

```
apps/
  web/              # Next.js frontend
    src/
      app/          # App Router pages
      features/     # Feature modules (auth, nutrition, notifications, etc.)
      shared/       # Shared components, utils, hooks
      styles/       # Design tokens
  api/              # Go backend
    cmd/server/     # Entry point
    internal/
      modules/      # Business modules (auth, users, notifications, etc.)
      shared/       # Shared utilities (database, logger, middleware)
      config/       # Configuration
packages/           # Shared packages (types, ui, utils, config)
```

## Environment Variables

Required env vars in `.env.local`:
- `DATABASE_URL` or `DB_*` vars (PostgreSQL on Yandex.Cloud)
- `JWT_SECRET`
- `API_URL` / `NEXT_PUBLIC_API_URL`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (Yandex Cloud S3)
- `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT`

## Key Dependencies

**Frontend:**
- next@16.0.10
- react@19.2.1
- typescript@5
- tailwindcss@4
- zustand@5
- zod@4 (validation)

**Backend:**
- gin-gonic/gin@1.10
- lib/pq@1.10 (PostgreSQL driver)
- golang-jwt/jwt@5
- uber-go/zap@1.27 (logging)
- leanovate/gopter (property-based testing)
- aws-sdk-go-v2 (S3 client for Yandex Cloud)

## Development Workflow

1. Install: `make install` or `npm install`
2. Setup env: Copy `env.example` to `.env.local`
3. Start dev: `make dev`
4. Run tests: `make test`
5. Build: `make build`
6. Deploy: `make deploy-{dev|staging|prod}`

## Testing Guidelines

### Property-Based Testing with gopter

**ALWAYS use gopter for property-based testing in Go:**
- Import: `github.com/leanovate/gopter`
- Write properties that should hold for all inputs
- Use generators to create test data
- Example:
```go
import (
    "github.com/leanovate/gopter"
    "github.com/leanovate/gopter/gen"
    "github.com/leanovate/gopter/prop"
)

func TestProperty(t *testing.T) {
    properties := gopter.NewProperties(nil)
    properties.Property("description", prop.ForAll(
        func(input string) bool {
            // Property that should hold
            return true
        },
        gen.AnyString(),
    ))
    properties.TestingRun(t)
}
```

### Database Testing

**For tests involving database interactions:**
- Use mock servers instead of real database connections
- Use `httptest` for HTTP handler testing
- Mock database interfaces for service layer tests
- Example:
```go
// Mock database interface
type MockDB struct {
    mock.Mock
}

func (m *MockDB) Query(query string, args ...interface{}) (*sql.Rows, error) {
    args := m.Called(query, args)
    return args.Get(0).(*sql.Rows), args.Error(1)
}
```

### Notifications Service

**The notifications service is fully implemented and available:**

**Backend (Go):**
- Location: `apps/api/internal/modules/notifications/`
- Components:
  - `handler.go` - HTTP endpoints for notifications API
  - `service.go` - Business logic for notification management
  - `types.go` - Type definitions and validation
- Database: `notifications` table with RLS policies
- Migration: `002_create_notifications_table_up.sql`

**API Endpoints:**
- `GET /api/notifications` - Fetch notifications with pagination
  - Query params: `category` (main|content), `limit`, `offset`
- `POST /api/notifications/:id/read` - Mark notification as read
- `GET /api/notifications/unread-counts` - Get unread counts per category
- `POST /api/notifications/mark-all-read` - Mark all in category as read

**Frontend (TypeScript/React):**
- Location: `apps/web/src/features/notifications/`
- Structure:
  - `components/` - UI components (NotificationsTabs, NotificationList, NotificationItem, etc.)
  - `hooks/` - Custom hooks (useNotifications, useNotificationPolling, useAutoMarkAsRead)
  - `store/` - Zustand store for state management
  - `utils/` - Utilities (date grouping, timestamp formatting, icon mapping)
  - `types/` - TypeScript type definitions
- Features:
  - Two categories: Main (personal) and Content (system-wide)
  - Real-time polling (30-second interval)
  - Optimistic updates with rollback
  - Auto-mark as read after 2 seconds
  - Infinite scroll pagination
  - Responsive design (mobile/tablet/desktop)
  - Full keyboard navigation support
  - WCAG 2.1 accessibility compliance

**Testing:**
- Backend: Unit tests with testify, property-based tests with gopter
- Frontend: 266 tests with 95%+ coverage
  - Unit tests with Jest + React Testing Library
  - Property-based tests with fast-check
  - Integration tests with MSW mocks
- Test coverage: Components (95%), Hooks (92%), Store (100%), Utils (96%)

**Usage:**
```typescript
// Frontend usage
import { useNotifications } from '@/features/notifications';

function MyComponent() {
  const { notifications, unreadCount, markAsRead } = useNotifications('main');
  // ...
}
```

```go
// Backend usage
import "github.com/burcev/api/internal/modules/notifications"

// In your router setup
notifHandler := notifications.NewHandler(cfg, log, db)
router.GET("/api/notifications", authMiddleware, notifHandler.GetNotifications)
```

# Terminal Guidelines

## IMPORTANT: Avoid commands that cause output buffering issues
- DO NOT pipe output through head, tail, less, or more when monitoring or checking command output
- DO NOT use | head -n X or | tail -n X to truncate output - these cause buffering problems
- Instead, let commands complete fully, or use `- -max-lines` flags if the command supports them
- For log monitoring, prefer reading files directly rather than piping through filters

## When checking command output:
- Run commands directly without pipes when possible
- If you need to limit output, use command-specific flags (e.g., git log -n 10 instead of `git log | head -10`)
- Avoid chained pipes that can cause output to buffer indefinitely
