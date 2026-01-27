# Project Structure & Conventions

## Monorepo Organization

Feature-based architecture with clear separation between apps and shared packages.

## Directory Structure

```
apps/web/src/
  app/              # Next.js App Router (routes, layouts)
  features/         # Feature modules (self-contained)
    auth/
      components/   # Feature-specific UI
      hooks/        # Feature-specific hooks
      utils/        # Feature-specific utilities
      index.ts      # Public API exports
  shared/           # Cross-feature shared code
    components/
      ui/           # Base components (Button, Input, Card)
      layout/       # Layout components
      forms/        # Form components
    hooks/          # Shared React hooks
    utils/          # Utility functions
    types/          # TypeScript types
    constants/      # Constants
  styles/
    tokens/         # Design tokens (colors, typography, spacing)
  config/           # Configuration
  lib/              # Third-party library wrappers

apps/api/internal/
  modules/          # Business modules (auth, users, nutrition)
    {module}/
      handler.go    # HTTP handlers
      service.go    # Business logic
      types.go      # Module types
  shared/           # Shared utilities
    database/       # Database utilities
    logger/         # Logging
    middleware/     # HTTP middleware (auth, error, logger)
    response/       # Response helpers
  config/           # Configuration
  cmd/server/       # Entry point

packages/           # Shared across apps
  types/            # Shared TypeScript types
  ui/               # Shared UI components
  utils/            # Shared utilities
  config/           # Shared configs (eslint, typescript)
```

## Naming Conventions

### Files
- **Components**: PascalCase (`UserProfile.tsx`, `LoginForm.tsx`)
- **Utilities**: camelCase (`formatDate.ts`, `validation.ts`)
- **Types**: camelCase (`userTypes.ts`, `apiTypes.ts`)
- **Routes**: lowercase (`page.tsx`, `layout.tsx`)
- **Go files**: snake_case (`auth_handler.go`, `user_service.go`)

### Code
- **React Components**: PascalCase (`<Button />`, `<UserProfile />`)
- **Functions**: camelCase (`getUserProfile()`, `formatDate()`)
- **Constants**: UPPER_SNAKE_CASE (`API_URL`, `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`User`, `LoginRequest`)
- **Go types**: PascalCase (`Handler`, `Service`)
- **Go functions**: PascalCase for exported, camelCase for private

## Code Style

### TypeScript/React
- Use TypeScript for all files (no `.js` or `.jsx`)
- Prefer functional components with hooks
- Use `forwardRef` for components that need refs
- Export interfaces for component props
- Use `cn()` utility for conditional classes (from `clsx` + `tailwind-merge`)
- Prefer named exports over default exports (except pages)

### Go
- Follow standard Go conventions
- Use structured logging with Zap
- Return errors, don't panic
- Use context for cancellation
- Validate input at handler level
- Business logic in service layer

### Styling
- Tailwind CSS utility classes
- Design tokens from `styles/tokens/`
- Responsive design with mobile-first approach
- Consistent spacing scale
- Accessibility (WCAG 2.1)

## Component Patterns

### UI Components
```typescript
// Base component with variants
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', ...props }, ref) => {
    // Implementation
  }
)
```

### Custom Hooks
```typescript
// Reusable logic in hooks
export function useUserProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Implementation
  return { profile, loading, refetch }
}
```

### Go Handlers
```go
// Handler pattern
type Handler struct {
    cfg     *config.Config
    log     *logger.Logger
    service *Service
}

func (h *Handler) HandleRequest(c *gin.Context) {
    // Bind request
    // Validate
    // Call service
    // Return response
}
```

## Testing Conventions

### Frontend
- Test files: `*.test.tsx` or `*.test.ts`
- Location: Co-located with source or in `__tests__/`
- Use React Testing Library for components
- Use MSW for API mocking
- Minimum 60% coverage

### Backend
- Test files: `*_test.go`
- Location: Same package as source
- Use testify for assertions
- Table-driven tests preferred
- Test both success and error cases

## Import Organization

### TypeScript
```typescript
// 1. External imports
import { useState } from 'react'
import { Button } from '@/shared/components/ui'

// 2. Internal imports
import { useAuth } from '@/features/auth'
import { logger } from '@/shared/utils/logger'

// 3. Types
import type { User } from '@/shared/types'
```

### Go
```go
// 1. Standard library
import (
    "context"
    "fmt"
)

// 2. External packages
import (
    "github.com/gin-gonic/gin"
)

// 3. Internal packages
import (
    "github.com/burcev/api/internal/config"
)
```

## Error Handling

### Frontend
- Try-catch for async operations
- Toast notifications for user-facing errors
- Structured logging with context
- Optimistic updates with rollback

### Backend
- Return errors, don't panic
- Structured error responses
- Log errors with context
- Use appropriate HTTP status codes

## State Management

- **Local state**: `useState` for component-specific state
- **Shared state**: Zustand stores for cross-component state
- **Server state**: React Query patterns (planned)
- **Form state**: Controlled components with validation

## Security Practices

- Row Level Security (RLS) in database
- JWT authentication with secure cookies
- Input validation (client + server)
- Parameterized queries (use prepared statements)
- CORS configuration
- Environment variables for secrets
