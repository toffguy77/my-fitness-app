# Technical Stack & Build System

## Architecture

Monorepo with feature-based organization using npm workspaces.

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
- **Auth**: JWT-based authentication
- **Logging**: Zap (structured logging)
- **Testing**: Go testing package with testify

## Infrastructure

- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: nginx
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
```

## Project Structure

```
apps/
  web/              # Next.js frontend
    src/
      app/          # App Router pages
      features/     # Feature modules (auth, nutrition, etc.)
      shared/       # Shared components, utils, hooks
      styles/       # Design tokens
  api/              # Go backend
    cmd/server/     # Entry point
    internal/
      modules/      # Business modules (auth, users, etc.)
      shared/       # Shared utilities (database, logger, middleware)
      config/       # Configuration
packages/           # Shared packages (types, ui, utils, config)
```

## Environment Variables

Required env vars in `.env.local`:
- `DATABASE_URL` or `DB_*` vars (PostgreSQL on Yandex.Cloud)
- `JWT_SECRET`
- `API_URL` / `NEXT_PUBLIC_API_URL`

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

## Development Workflow

1. Install: `make install` or `npm install`
2. Setup env: Copy `env.example` to `.env.local`
3. Start dev: `make dev`
4. Run tests: `make test`
5. Build: `make build`
6. Deploy: `make deploy-{dev|staging|prod}`

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
