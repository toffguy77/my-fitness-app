# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BURCEV is a fitness and nutrition tracking platform. It's a monorepo with a **Next.js 16 frontend** (`apps/web`) and a **Go/Gin backend** (`apps/api`), connected by npm workspaces. Shared packages live in `packages/` (types, ui, config, utils).

## Common Commands

### Development
```bash
make dev          # Start both frontend (localhost:3069) and backend (localhost:4000)
make dev-web      # Frontend only
make dev-api      # Backend only (uses air for hot reload)
```

### Testing
```bash
# Frontend (Jest + React Testing Library)
cd apps/web && npx jest                           # All frontend tests
cd apps/web && npx jest --watch                   # Watch mode
cd apps/web && npx jest path/to/file.test.tsx     # Single test file
cd apps/web && npx jest --coverage                # With coverage

# Backend (Go)
cd apps/api && go test ./...                      # All backend tests
cd apps/api && go test ./internal/modules/auth/   # Single module
cd apps/api && go test ./... -v                   # Verbose

# E2E (Playwright)
npm run test:e2e        # Headless
npm run test:e2e:ui     # Interactive UI
```

### Linting & Type Checking
```bash
cd apps/web && npm run lint       # ESLint (eslint src)
cd apps/web && npm run lint:fix   # ESLint with auto-fix
cd apps/web && npm run type-check # TypeScript (tsc --noEmit)
cd apps/api && go fmt ./...       # Go formatting
```

### Building
```bash
make build-web    # Next.js production build (standalone output)
make build-api    # Go binary → apps/api/bin/server
```

## Architecture

### Monorepo Layout
- `apps/web/` — Next.js 16 with App Router, React 19, Tailwind CSS v4, Zustand
- `apps/api/` — Go 1.24, Gin framework, PostgreSQL (pgx/v5), JWT auth
- `packages/types/` — Shared TypeScript type definitions (@burcev/types)
- `packages/ui/` — Shared React UI components (@burcev/ui)
- `packages/utils/` — Shared utilities (@burcev/utils)
- `packages/config/` — Shared ESLint/TypeScript configs (@burcev/config)

### Frontend (`apps/web/src/`)
Uses a **feature-based modular architecture**. Path alias: `@/` → `src/`.

- `app/` — Next.js App Router pages and API routes
- `features/` — Self-contained feature modules: **auth**, **dashboard**, **food-tracker**, **notifications**
  - Each feature has: `api/`, `components/`, `hooks/`, `store/` (Zustand), `types/`, `index.ts`
- `shared/` — Cross-feature reusable code: `components/ui/`, `hooks/`, `utils/`, `types/`, `constants/`
- `styles/tokens/` — Design tokens (colors, typography, spacing)
- `lib/` — Third-party library integrations

### Backend (`apps/api/`)
Follows a **handler/service pattern** organized by domain module.

- `cmd/server/main.go` — Application entry point
- `internal/modules/` — Domain modules: **auth**, **dashboard**, **food-tracker**, **notifications**, **users**, **nutrition**, **logs**
  - Each module has: `handler.go` (HTTP handlers), `service.go` (business logic), `*_test.go`
- `internal/shared/` — Cross-cutting concerns:
  - `database/` — PostgreSQL connection, migrations
  - `middleware/` — Auth (JWT), error handling, logging, rate limiting
  - `email/` — SMTP service
  - `storage/` — S3 (Yandex Cloud) integration
  - `response/` — Standardized API response helpers
- `migrations/` — SQL migration files (numbered up/down pairs)

### Key Technical Details
- React Compiler is enabled (`reactCompiler: true` in next.config.ts)
- Frontend runs on port **3069**, backend on port **4000**
- Next.js standalone output mode for containerized deployment
- API proxied through Next.js rewrites in production
- Jest uses `jest-environment-jsdom` with MSW for API mocking
- Coverage thresholds: branches 50%, functions/lines/statements 60%
- Husky pre-commit hooks run linting and type checks
- Commit messages follow conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

### Deployment
- Docker multi-stage builds for both apps
- CI/CD via GitHub Actions (`.github/workflows/ci.yml` and `cd.yml`)
- Dev deploys from `dev` branch, production from `main`
- External services: PostgreSQL and S3 on Yandex Cloud, SMTP via Yandex Mail
