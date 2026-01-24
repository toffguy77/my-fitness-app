# Architecture Documentation

## Overview

BURCEV is built as a modern monorepo with clear separation between frontend and backend, using a feature-based modular architecture for scalability and maintainability.

## Project Structure

```
burcev-monorepo/
├── apps/
│   ├── web/              # Frontend (Next.js 16)
│   └── api/              # Backend (Express + TypeScript)
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── ui/               # Shared UI components
│   ├── config/           # Shared configurations
│   └── utils/            # Shared utilities
├── scripts/              # CI/CD and build scripts
├── deploy/               # Deployment configurations
└── docs/                 # Documentation
```

## Frontend Architecture (apps/web)

### Technology Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **API Client**: Native Fetch with MSW for testing
- **Testing**: Jest + React Testing Library + Playwright

### Directory Structure

```
apps/web/src/
├── app/                  # Next.js App Router
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── (routes)/         # Route groups
├── features/             # Feature modules
│   ├── auth/
│   │   ├── api/          # API client
│   │   ├── components/   # Feature components
│   │   ├── hooks/        # Feature hooks
│   │   ├── store/        # State management
│   │   ├── types/        # Feature types
│   │   └── index.ts      # Public API
│   ├── nutrition/
│   ├── dashboard/
│   └── profile/
├── shared/               # Shared resources
│   ├── components/       # Reusable components
│   │   ├── ui/           # Base UI components
│   │   ├── layout/       # Layout components
│   │   └── forms/        # Form components
│   ├── hooks/            # Shared hooks
│   ├── utils/            # Utility functions
│   ├── types/            # Shared types
│   └── constants/        # Constants
├── styles/               # Global styles
│   ├── tokens/           # Design tokens
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   └── spacing.ts
│   └── themes/           # Theme configurations
├── config/               # App configuration
└── lib/                  # Third-party integrations
```

### Feature Module Pattern

Each feature is self-contained with:
- **api/**: API client functions
- **components/**: Feature-specific components
- **hooks/**: Feature-specific hooks
- **store/**: State management (Zustand)
- **types/**: TypeScript types
- **utils/**: Feature utilities
- **index.ts**: Public API exports

Example:
```typescript
// features/auth/index.ts
export * from './components'
export * from './hooks'
export * from './types'
export { useAuthStore } from './store'
```

### Design System

**Design Tokens** provide a single source of truth for:
- Colors (brand, semantic, neutral)
- Typography (sizes, weights, line heights)
- Spacing (consistent scale)
- Breakpoints (responsive design)

**Component Library** built on design tokens:
- Button, Input, Card, Modal, etc.
- Consistent styling and behavior
- Accessible by default
- Fully typed with TypeScript

## Backend Architecture (apps/api)

### Technology Stack
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Logging**: Winston
- **Testing**: Jest + Supertest

### Directory Structure

```
apps/api/src/
├── modules/              # Business modules
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.routes.ts
│   │   └── auth.types.ts
│   ├── users/
│   ├── nutrition/
│   └── reports/
├── shared/               # Shared resources
│   ├── database/         # Database utilities
│   ├── logger/           # Logging setup
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts
│   │   ├── errorHandler.ts
│   │   └── requestLogger.ts
│   ├── validation/       # Input validation
│   └── types/            # Shared types
├── config/               # Configuration
│   └── index.ts
└── main.ts               # Application entry point
```

### Module Pattern

Each module follows MVC-like pattern:
- **Controller**: Request handling, validation
- **Service**: Business logic
- **Routes**: Route definitions
- **Types**: Module-specific types

Example:
```typescript
// modules/auth/auth.controller.ts
class AuthController {
  async login(req, res, next) {
    // Handle request
    const result = await authService.login(req.body)
    res.json({ status: 'success', data: result })
  }
}
```

### Middleware Stack

1. **Security**: Helmet (security headers)
2. **CORS**: Configured for frontend origin
3. **Body Parsing**: JSON and URL-encoded
4. **Compression**: Response compression
5. **Request Logging**: Winston logger
6. **Authentication**: JWT verification
7. **Error Handling**: Centralized error handler

## Shared Packages

### @burcev/types
Shared TypeScript types used across frontend and backend.

### @burcev/ui
Reusable UI components with:
- Consistent styling
- TypeScript types
- Storybook documentation (optional)

### @burcev/utils
Shared utility functions:
- Date formatting
- Validation helpers
- Common algorithms

### @burcev/config
Shared configurations:
- ESLint configs
- TypeScript configs
- Jest configs

## State Management

### Frontend State
- **Global State**: Zustand stores (auth, user preferences)
- **Server State**: React Query (API data caching)
- **Local State**: React useState/useReducer
- **Form State**: React Hook Form

### State Organization
```typescript
// features/auth/store/authStore.ts
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearAuth: () => set({ user: null }),
    }),
    { name: 'auth-storage' }
  )
)
```

## API Communication

### REST API Design
- **Base URL**: `http://localhost:4000` (dev)
- **Authentication**: JWT tokens in cookies
- **Response Format**:
```json
{
  "status": "success" | "error",
  "data": { ... },
  "message": "Optional message"
}
```

### Error Handling
- Consistent error responses
- HTTP status codes
- Error logging
- User-friendly messages

## Testing Strategy

### Unit Tests
- **Frontend**: Jest + React Testing Library
- **Backend**: Jest + Supertest
- **Coverage**: 70% minimum

### Integration Tests
- API endpoint testing
- Database integration
- Feature workflows

### E2E Tests
- Playwright for critical user flows
- Authentication flow
- Nutrition logging
- Report generation

### Mocking
- **MSW**: API mocking for frontend tests
- **Jest mocks**: Module and function mocking
- **Test fixtures**: Reusable test data

## Performance Optimization

### Frontend
- **Code Splitting**: Automatic with Next.js
- **Image Optimization**: Next.js Image component
- **Bundle Analysis**: webpack-bundle-analyzer
- **Lazy Loading**: Dynamic imports for heavy components
- **Caching**: React Query for API responses

### Backend
- **Response Compression**: gzip/brotli
- **Database Indexing**: Optimized queries
- **Connection Pooling**: Supabase connection pool
- **Caching**: Redis for session/data caching (future)

## Security

### Frontend
- **XSS Protection**: React's built-in escaping
- **CSRF Protection**: SameSite cookies
- **Content Security Policy**: Helmet configuration
- **Input Validation**: Zod schemas

### Backend
- **Authentication**: JWT with secure cookies
- **Authorization**: Role-based access control
- **Input Validation**: Zod schemas
- **SQL Injection**: Parameterized queries
- **Rate Limiting**: Express rate limiter (future)
- **Security Headers**: Helmet middleware

## Deployment

### Docker Compose
- **Development**: Hot reload for both apps
- **Production**: Optimized builds
- **Networking**: Internal network for services
- **Volumes**: Persistent data storage

### CI/CD Pipeline
- **Linting**: ESLint for code quality
- **Type Checking**: TypeScript compiler
- **Testing**: Automated test suites
- **Building**: Docker image creation
- **Deployment**: Automated to dev/staging/prod

## Scalability Considerations

### Horizontal Scaling
- Stateless API design
- Load balancer ready
- Session storage in database

### Vertical Scaling
- Efficient database queries
- Caching strategies
- Resource optimization

### Monitoring
- Application logs (Winston)
- Error tracking (future: Sentry)
- Performance metrics (future: Prometheus)
- Health checks

## Development Workflow

### Getting Started
```bash
# Install dependencies
npm install

# Start development servers
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Adding a New Feature
1. Create feature directory in `apps/web/src/features/`
2. Implement components, hooks, API client
3. Add tests
4. Export public API from `index.ts`
5. Use in app routes

### Adding a New API Endpoint
1. Create module in `apps/api/src/modules/`
2. Implement controller, service, routes
3. Add to main router in `main.ts`
4. Add tests
5. Update API documentation

## Best Practices

### Code Organization
- Feature-based structure
- Single responsibility principle
- DRY (Don't Repeat Yourself)
- Clear naming conventions

### TypeScript
- Strict mode enabled
- Explicit types for public APIs
- Type inference for internal logic
- Avoid `any` type

### Testing
- Test behavior, not implementation
- Mock external dependencies
- Maintain high coverage
- Write meaningful test descriptions

### Git Workflow
- Feature branches
- Conventional commits
- Pull request reviews
- CI checks before merge

## Future Enhancements

- [ ] GraphQL API option
- [ ] Real-time features with WebSockets
- [ ] Redis caching layer
- [ ] Microservices architecture
- [ ] Kubernetes deployment
- [ ] Advanced monitoring and alerting
