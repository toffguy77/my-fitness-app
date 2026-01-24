# Monorepo Development Guide

## Quick Start

### Prerequisites
- Node.js 20+
- npm 10+
- Docker & Docker Compose (optional)

### Installation

```bash
# Install all dependencies
npm install

# This will install dependencies for:
# - Root workspace
# - apps/web
# - apps/api
# - All packages
```

### Development

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev:web    # Frontend only (port 3000)
npm run dev:api    # Backend only (port 4000)
```

### Using Docker

```bash
# Start development environment
docker-compose up

# Start production environment
docker-compose --profile production up

# Build images
docker-compose build

# View logs
docker-compose logs -f
```

## Project Structure

### Monorepo Layout

```
burcev-monorepo/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # Express backend
├── packages/
│   ├── types/            # Shared types
│   ├── ui/               # Shared components
│   ├── config/           # Shared configs
│   └── utils/            # Shared utilities
├── scripts/              # Build scripts
├── deploy/               # Deployment configs
└── docs/                 # Documentation
```

### Workspace Commands

```bash
# Run command in specific workspace
npm run <script> --workspace=apps/web
npm run <script> --workspace=apps/api

# Run command in all workspaces
npm run <script> --workspaces

# Examples
npm run build --workspace=apps/web
npm test --workspaces
```

## Frontend Development (apps/web)

### Structure

```
apps/web/src/
├── app/                  # Next.js routes
├── features/             # Feature modules
│   ├── auth/
│   ├── nutrition/
│   └── dashboard/
├── shared/               # Shared resources
│   ├── components/
│   ├── hooks/
│   └── utils/
└── styles/               # Global styles
```

### Adding a New Feature

1. **Create feature directory**:
```bash
mkdir -p apps/web/src/features/my-feature/{api,components,hooks,store,types}
```

2. **Create feature files**:
```typescript
// apps/web/src/features/my-feature/types/index.ts
export interface MyFeatureData {
  id: string
  name: string
}

// apps/web/src/features/my-feature/api/myFeatureApi.ts
export const myFeatureApi = {
  async getData() {
    const response = await fetch('/api/my-feature')
    return response.json()
  }
}

// apps/web/src/features/my-feature/hooks/useMyFeature.ts
export function useMyFeature() {
  // Hook logic
}

// apps/web/src/features/my-feature/index.ts
export * from './components'
export * from './hooks'
export * from './types'
```

3. **Use in app**:
```typescript
// apps/web/src/app/my-feature/page.tsx
import { useMyFeature } from '@/features/my-feature'

export default function MyFeaturePage() {
  const { data } = useMyFeature()
  return <div>{data}</div>
}
```

### Creating Shared Components

```typescript
// apps/web/src/shared/components/ui/MyComponent.tsx
import { cn } from '@/shared/utils/cn'

export interface MyComponentProps {
  variant?: 'primary' | 'secondary'
}

export function MyComponent({ variant = 'primary' }: MyComponentProps) {
  return (
    <div className={cn('base-styles', variant === 'primary' && 'primary-styles')}>
      Content
    </div>
  )
}

// Export from index
// apps/web/src/shared/components/ui/index.ts
export * from './MyComponent'
```

### State Management with Zustand

```typescript
// apps/web/src/features/my-feature/store/myFeatureStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MyFeatureStore {
  data: string[]
  addData: (item: string) => void
}

export const useMyFeatureStore = create<MyFeatureStore>()(
  persist(
    (set) => ({
      data: [],
      addData: (item) => set((state) => ({ 
        data: [...state.data, item] 
      })),
    }),
    { name: 'my-feature-storage' }
  )
)
```

### Testing

```bash
# Run tests
npm test --workspace=apps/web

# Watch mode
npm run test:watch --workspace=apps/web

# Coverage
npm run test:coverage --workspace=apps/web
```

Example test:
```typescript
// apps/web/src/features/auth/__tests__/LoginForm.test.tsx
import { render, screen } from '@testing-library/react'
import { LoginForm } from '../components/LoginForm'

describe('LoginForm', () => {
  it('renders login form', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
})
```

## Backend Development (apps/api)

### Structure

```
apps/api/src/
├── modules/              # Business modules
│   ├── auth/
│   ├── users/
│   └── nutrition/
├── shared/               # Shared resources
│   ├── database/
│   ├── logger/
│   └── middleware/
├── config/               # Configuration
└── main.ts               # Entry point
```

### Adding a New Module

1. **Create module directory**:
```bash
mkdir -p apps/api/src/modules/my-module
```

2. **Create module files**:
```typescript
// apps/api/src/modules/my-module/my-module.types.ts
export interface MyModuleData {
  id: string
  name: string
}

// apps/api/src/modules/my-module/my-module.service.ts
class MyModuleService {
  async getData() {
    // Business logic
    return []
  }
}

export const myModuleService = new MyModuleService()

// apps/api/src/modules/my-module/my-module.controller.ts
import { Request, Response, NextFunction } from 'express'
import { myModuleService } from './my-module.service'

class MyModuleController {
  async getData(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await myModuleService.getData()
      res.json({ status: 'success', data })
    } catch (error) {
      next(error)
    }
  }
}

export const myModuleController = new MyModuleController()

// apps/api/src/modules/my-module/my-module.routes.ts
import { Router } from 'express'
import { myModuleController } from './my-module.controller'
import { requireAuth } from '../../shared/middleware/auth'

export const myModuleRouter = Router()

myModuleRouter.use(requireAuth)
myModuleRouter.get('/', myModuleController.getData)
```

3. **Register routes**:
```typescript
// apps/api/src/main.ts
import { myModuleRouter } from './modules/my-module/my-module.routes'

app.use('/my-module', myModuleRouter)
```

### Testing

```bash
# Run tests
npm test --workspace=apps/api

# Watch mode
npm run test:watch --workspace=apps/api

# Coverage
npm run test:coverage --workspace=apps/api
```

Example test:
```typescript
// apps/api/src/modules/auth/__tests__/auth.service.test.ts
import { authService } from '../auth.service'

describe('AuthService', () => {
  it('registers a new user', async () => {
    const user = await authService.register({
      email: 'test@example.com',
      password: 'password123',
    })
    
    expect(user).toHaveProperty('id')
    expect(user.email).toBe('test@example.com')
  })
})
```

## Shared Packages

### Using Shared Types

```typescript
// packages/types/src/index.ts
export interface User {
  id: string
  email: string
  role: 'client' | 'coordinator' | 'admin'
}

// Use in frontend
import type { User } from '@burcev/types'

// Use in backend
import type { User } from '@burcev/types'
```

### Creating Shared UI Components

```typescript
// packages/ui/src/Button.tsx
export interface ButtonProps {
  variant?: 'primary' | 'secondary'
  children: React.ReactNode
}

export function Button({ variant = 'primary', children }: ButtonProps) {
  return <button className={variant}>{children}</button>
}

// packages/ui/src/index.ts
export * from './Button'

// Use in app
import { Button } from '@burcev/ui'
```

## Environment Variables

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Backend (.env.local)
```bash
NODE_ENV=development
PORT=4000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=http://localhost:3000
```

## Common Tasks

### Adding a Dependency

```bash
# Add to specific workspace
npm install <package> --workspace=apps/web
npm install <package> --workspace=apps/api

# Add to root (for tooling)
npm install <package> -D

# Add to shared package
npm install <package> --workspace=packages/ui
```

### Building for Production

```bash
# Build all
npm run build

# Build specific app
npm run build:web
npm run build:api

# Start production
npm start --workspace=apps/web
npm start --workspace=apps/api
```

### Linting and Type Checking

```bash
# Lint all
npm run lint

# Type check all
npm run type-check

# Fix linting issues
npm run lint --workspace=apps/web -- --fix
```

## Docker Development

### Development Mode
```bash
# Start with hot reload
docker-compose up

# Rebuild after dependency changes
docker-compose up --build
```

### Production Mode
```bash
# Build production images
docker-compose --profile production build

# Start production containers
docker-compose --profile production up -d

# View logs
docker-compose --profile production logs -f
```

## Troubleshooting

### Module Not Found
```bash
# Clear node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

### TypeScript Errors
```bash
# Clear TypeScript cache
rm -rf apps/web/.next apps/api/dist
npm run type-check
```

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 4000
lsof -ti:4000 | xargs kill -9
```

## Best Practices

### Code Organization
- Keep features self-contained
- Use barrel exports (index.ts)
- Separate concerns (components, logic, state)
- Follow naming conventions

### Git Workflow
- Create feature branches
- Write meaningful commit messages
- Keep commits atomic
- Review before merging

### Testing
- Write tests alongside code
- Test behavior, not implementation
- Use meaningful test descriptions
- Maintain coverage thresholds

### Performance
- Lazy load heavy components
- Optimize images
- Use React.memo for expensive renders
- Monitor bundle size

## Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Reference](./API_Reference.md)
- [Component Library](./COMPONENT_LIBRARY.md)
- [Testing Guide](./TESTING_GUIDE.md)
