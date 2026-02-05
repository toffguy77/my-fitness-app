# Project Structure & Conventions

## Monorepo Organization

Feature-based architecture with clear separation between apps and shared packages.

## Localization

**CRITICAL: All user-facing messages MUST be in Russian**

- Error messages in validation functions
- Form validation errors
- API error responses
- User notifications
- UI labels and text
- Toast messages
- Zod schema error messages

**Examples:**
```typescript
// ✅ CORRECT - Russian
error: 'Вес должен быть положительным'
error: 'Шаги должны быть не более 100,000'
error: 'Фото должно быть в формате JPEG, PNG или WebP'

// ❌ WRONG - English
error: 'Weight must be positive'
error: 'Steps must be 100,000 or less'
error: 'Photo must be JPEG, PNG, or WebP format'
```

**When writing validation:**
- Use Russian for all error messages
- Update tests to expect Russian messages
- Check both unit tests and property-based tests
- Verify Zod schema messages are in Russian

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
    notifications/  # Notifications feature module (FULLY IMPLEMENTED)
      components/   # NotificationsTabs, NotificationList, NotificationItem, etc.
      hooks/        # useNotifications, useNotificationPolling, useAutoMarkAsRead
      store/        # Zustand store for notification state
      utils/        # Date grouping, timestamp formatting, icon mapping
      types/        # TypeScript type definitions
      testing/      # Test generators for property-based tests
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
  modules/          # Business modules (auth, users, nutrition, notifications)
    notifications/  # Notifications module (FULLY IMPLEMENTED)
      handler.go    # HTTP endpoints (GET, POST for notifications)
      service.go    # Business logic (fetch, mark as read, polling)
      types.go      # Go type definitions and validation
      handler_test.go    # Handler tests
      service_test.go    # Service tests
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

## Layout Conventions

### Authenticated Pages
- **All pages behind authentication MUST use consistent header and footer**
- Use shared layout components from `shared/components/layout/`
- Header should include: logo, navigation, user menu
- Footer should include: links, copyright, version info
- Implement via Next.js layout.tsx for authenticated routes
- Ensures uniform user experience across all protected pages

## Component Patterns

### Feature Module Pattern (Notifications Example)

```typescript
// Feature structure following notifications module
features/notifications/
  components/       # UI components
    NotificationsTabs.tsx
    NotificationList.tsx
    NotificationItem.tsx
    NotificationIcon.tsx
    NotificationsLayout.tsx
    NotificationsPage.tsx
  hooks/           # Custom hooks
    useNotifications.ts
    useNotificationPolling.ts
    useAutoMarkAsRead.ts
  store/           # State management
    notificationsStore.ts
  utils/           # Utilities
    dateGrouping.ts
    formatTimestamp.ts
    iconMapping.ts
  types/           # Type definitions
    index.ts
  testing/         # Test utilities
    generators.ts
  index.ts         # Public API

// Usage
import { useNotifications, NotificationsTabs } from '@/features/notifications';
```

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

### Zustand Store Pattern (Notifications Example)

```typescript
// State management with Zustand
interface NotificationsState {
  notifications: Record<NotificationCategory, Notification[]>
  unreadCounts: Record<NotificationCategory, number>
  isLoading: boolean
  error: Error | null
  
  // Actions
  fetchNotifications: (category: NotificationCategory) => Promise<void>
  markAsRead: (id: string, category: NotificationCategory) => Promise<void>
  pollForUpdates: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  // Implementation with optimistic updates and rollback
}))
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

### Go Service Pattern (Notifications Example)

```go
// Service layer with business logic
type Service struct {
    db  *sql.DB
    log *logger.Logger
}

func (s *Service) GetNotifications(ctx context.Context, userID string, category string, limit, offset int) ([]Notification, int, error) {
    // Query database with pagination
    // Return notifications and total count
}

func (s *Service) MarkAsRead(ctx context.Context, userID, notificationID string) error {
    // Update notification read status
    // Verify user ownership
}
```

## Testing Conventions

### Frontend
- Test files: `*.test.tsx` or `*.test.ts`
- Location: Co-located with source or in `__tests__/`
- Use React Testing Library for components
- Use MSW for API mocking
- Minimum 60% coverage
- Property-based tests with fast-check for universal properties

### Frontend Testing Example (Notifications)
```typescript
// Unit test
describe('NotificationItem', () => {
  it('renders unread notification with correct styling', () => {
    const notification = { id: '1', title: 'Test', readAt: undefined }
    render(<NotificationItem notification={notification} onMarkAsRead={jest.fn()} />)
    expect(screen.getByText('Test')).toHaveClass('font-semibold')
  })
})

// Property-based test
describe('Property: Read Status Styling', () => {
  it('applies distinct styling for unread notifications', () => {
    fc.assert(
      fc.property(
        notificationGenerator(),
        (notification) => {
          const { container } = render(
            <NotificationItem notification={notification} onMarkAsRead={jest.fn()} />
          )
          // Verify property holds for all inputs
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### Backend
- Test files: `*_test.go`
- Location: Same package as source
- Use testify for assertions
- Table-driven tests preferred
- Test both success and error cases
- Property-based tests with gopter for universal properties

### Backend Testing Example (Notifications)
```go
// Unit test
func TestGetNotifications(t *testing.T) {
    tests := []struct {
        name     string
        userID   string
        category string
        want     int
        wantErr  bool
    }{
        {"valid request", "user-1", "main", 10, false},
        {"invalid category", "user-1", "invalid", 0, true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation
        })
    }
}

// Property-based test with gopter
func TestPaginationProperty(t *testing.T) {
    properties := gopter.NewProperties(nil)
    properties.Property("pagination returns at most limit items", prop.ForAll(
        func(limit int) bool {
            result := service.GetNotifications(ctx, userID, "main", limit, 0)
            return len(result) <= limit
        },
        gen.IntRange(1, 100),
    ))
    properties.TestingRun(t)
}
```

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
