# Technology Stack

## Framework & Runtime

- **Next.js 16** with App Router
- **React 19** with React Compiler enabled
- **TypeScript 5** with strict mode
- **Node.js 20+** runtime requirement

## Styling & UI

- **Tailwind CSS v4** with PostCSS
- **Lucide React** for icons
- **Geist fonts** (Sans & Mono) with system fallbacks
- **Responsive design** with mobile-first approach

## Backend & Database

- **Supabase** (PostgreSQL + Auth + Storage + Real-time)
- **Row Level Security (RLS)** for data protection
- **SQL migrations** in `migrations/` folder
- **Supabase Edge Functions** for serverless logic

## Key Libraries

- **@supabase/ssr** - Server-side rendering support
- **zod** - Runtime type validation
- **recharts** - Data visualization
- **tesseract.js** - OCR processing
- **jspdf** - PDF generation
- **papaparse** - CSV parsing
- **react-hot-toast** - Notifications
- **resend** - Email service

## Development Tools

- **ESLint** with Next.js config + security plugins
- **Jest** for unit/integration testing
- **Playwright** for E2E testing
- **MSW** for API mocking
- **Docker** for containerization

## Build & Deployment

### Common Commands

```bash
# Development
npm run dev                    # Start dev server (localhost:3069)

# Building
npm run build                  # Production build
npm start                      # Start production server
npm run type-check            # TypeScript validation

# Testing
npm test                      # Unit/integration tests (Jest)
npm run test:coverage         # Tests with coverage report
npm run test:e2e             # E2E tests (Playwright)
npm run test:all             # All tests

# Code Quality
npm run lint                  # ESLint validation
npm run lint:security        # Security-focused linting

# Docker
make build                    # Build Docker image
make deploy                   # Build and start containers
make update                   # Git pull + rebuild + restart
```

### Environment Variables

Required variables in `.env.local`:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Email (Optional - Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

# OCR Enhancement (Optional)
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-xxxxx

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3069
```

## Architecture Patterns

- **App Router** with file-based routing
- **Server Components** by default, Client Components when needed
- **Middleware** for authentication and role-based routing
- **Centralized logging** with `@/utils/logger`
- **Type-safe database** queries with Supabase TypeScript
- **Error boundaries** for graceful error handling
- **PWA** with service worker and offline support

## Performance

- **React Compiler** for automatic optimization
- **Next.js Image** optimization
- **Standalone output** for Docker
- **Bundle analysis** and code splitting
- **Metrics collection** with custom collector