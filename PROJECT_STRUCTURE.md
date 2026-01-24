# BURCEV Project Structure

## 🏗️ Monorepo Architecture

Modern, scalable architecture with clear separation of concerns, feature-based organization, and comprehensive tooling.

## 📁 Directory Structure

```
burcev-monorepo/
│
├── 📱 apps/                          # Applications
│   ├── web/                          # Frontend (Next.js 16)
│   │   ├── src/
│   │   │   ├── app/                  # Next.js App Router
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── globals.css
│   │   │   ├── features/             # 🎯 Feature Modules
│   │   │   │   ├── auth/
│   │   │   │   │   ├── api/          # API client
│   │   │   │   │   ├── components/   # UI components
│   │   │   │   │   ├── hooks/        # React hooks
│   │   │   │   │   ├── store/        # State (Zustand)
│   │   │   │   │   ├── types/        # TypeScript types
│   │   │   │   │   └── index.ts      # Public API
│   │   │   │   ├── nutrition/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── profile/
│   │   │   │   └── reports/
│   │   │   ├── shared/               # 🔄 Shared Resources
│   │   │   │   ├── components/
│   │   │   │   │   ├── ui/           # Base components
│   │   │   │   │   ├── layout/       # Layout components
│   │   │   │   │   └── forms/        # Form components
│   │   │   │   ├── hooks/            # Shared hooks
│   │   │   │   ├── utils/            # Utilities
│   │   │   │   ├── types/            # Shared types
│   │   │   │   └── constants/        # Constants
│   │   │   ├── styles/               # 🎨 Design System
│   │   │   │   ├── tokens/
│   │   │   │   │   ├── colors.ts
│   │   │   │   │   ├── typography.ts
│   │   │   │   │   └── spacing.ts
│   │   │   │   └── themes/
│   │   │   ├── config/               # Configuration
│   │   │   └── lib/                  # Third-party libs
│   │   ├── public/                   # Static assets
│   │   ├── __tests__/                # Tests
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── __mocks__/                # MSW mocks
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── next.config.ts
│   │
│   └── api/                          # Backend (Express + TypeScript)
│       ├── src/
│       │   ├── modules/              # 📦 Business Modules
│       │   │   ├── auth/
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── auth.routes.ts
│       │   │   │   └── auth.types.ts
│       │   │   ├── users/
│       │   │   ├── nutrition/
│       │   │   └── reports/
│       │   ├── shared/               # 🔧 Shared Resources
│       │   │   ├── database/         # DB utilities
│       │   │   ├── logger/           # Winston logger
│       │   │   ├── middleware/       # Express middleware
│       │   │   │   ├── auth.ts
│       │   │   │   ├── errorHandler.ts
│       │   │   │   └── requestLogger.ts
│       │   │   ├── validation/       # Input validation
│       │   │   └── types/            # Shared types
│       │   ├── config/               # Configuration
│       │   │   └── index.ts
│       │   └── main.ts               # Entry point
│       ├── __tests__/                # Tests
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       ├── __mocks__/                # Test mocks
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── 📦 packages/                      # Shared Packages
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ui/                           # Shared UI components
│   │   ├── src/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── index.ts
│   │   └── package.json
│   ├── config/                       # Shared configurations
│   │   ├── eslint/
│   │   ├── typescript/
│   │   └── package.json
│   └── utils/                        # Shared utilities
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── 🚀 scripts/                       # CI/CD Scripts
│   ├── quality-gate-*.js
│   ├── security-scanner.js
│   ├── docker-*.sh
│   └── telegram-notify.js
│
├── 🌐 deploy/                        # Deployment Configs
│   ├── env/
│   │   ├── .env.dev.example
│   │   ├── .env.staging.example
│   │   └── .env.production.example
│   └── nginx/
│       ├── dev.burcev.team.conf
│       ├── beta.burcev.team.conf
│       └── burcev.team.conf
│
├── 📚 docs/                          # Documentation
│   ├── ARCHITECTURE.md
│   ├── MONOREPO_GUIDE.md
│   ├── API_Reference.md
│   └── README.md
│
├── 🔧 Configuration Files
│   ├── docker-compose.yml            # Container orchestration
│   ├── package.json                  # Root workspace
│   ├── .gitignore
│   ├── .dockerignore
│   └── README.md
│
└── 🤖 CI/CD
    └── .github/
        └── workflows/
            ├── ci.yml
            ├── cd.yml
            ├── security-scanning.yml
            └── quality-gates.yml
```

## 🎯 Key Features

### ✅ Modular Architecture
- **Feature-based organization**: Each feature is self-contained
- **Clear boundaries**: Separation between features and shared code
- **Easy to scale**: Add new features without affecting existing ones

### ✅ Monorepo Benefits
- **Code sharing**: Shared packages for types, UI, utils
- **Consistent tooling**: Same configs across all apps
- **Atomic changes**: Update multiple apps in single commit
- **Type safety**: End-to-end TypeScript

### ✅ Developer Experience
- **Hot reload**: Fast development with instant feedback
- **Type checking**: Catch errors before runtime
- **Linting**: Consistent code style
- **Testing**: Comprehensive test coverage

### ✅ Production Ready
- **Docker**: Containerized deployment
- **CI/CD**: Automated testing and deployment
- **Monitoring**: Logging and error tracking
- **Security**: Best practices implemented

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Docker development
docker-compose up
```

## 📊 Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **State**: Zustand
- **Testing**: Jest + React Testing Library + Playwright
- **Mocking**: MSW (Mock Service Worker)

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Logging**: Winston
- **Testing**: Jest + Supertest

### DevOps
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Deployment**: VPS with nginx
- **Monitoring**: Winston logs + Health checks

## 🎨 Design System

### Design Tokens
- **Colors**: Brand, semantic, neutral palettes
- **Typography**: Font sizes, weights, line heights
- **Spacing**: Consistent spacing scale
- **Breakpoints**: Responsive design system

### Component Library
- **Base Components**: Button, Input, Card, Modal
- **Layout Components**: Header, Footer, Sidebar
- **Form Components**: Form, Field, Validation
- **Fully Typed**: TypeScript interfaces
- **Accessible**: WCAG 2.1 compliant

## 🧪 Testing Strategy

### Unit Tests
- Component testing with React Testing Library
- Service testing with Jest
- 70% minimum coverage

### Integration Tests
- API endpoint testing
- Feature workflow testing
- Database integration

### E2E Tests
- Critical user flows with Playwright
- Authentication, nutrition logging, reports
- Cross-browser testing

### Mocking
- MSW for API mocking
- Jest mocks for modules
- Test fixtures for data

## 🔒 Security

- **Authentication**: JWT with secure cookies
- **Authorization**: Role-based access control
- **Input Validation**: Zod schemas
- **SQL Injection**: Parameterized queries
- **XSS Protection**: React escaping + CSP
- **Security Headers**: Helmet middleware

## 📈 Performance

### Frontend
- Code splitting (automatic)
- Image optimization (Next.js)
- Lazy loading (dynamic imports)
- Bundle analysis

### Backend
- Response compression
- Database indexing
- Connection pooling
- Caching strategy

## 🔄 State Management

### Global State (Zustand)
```typescript
const useAuthStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

### Server State (React Query)
```typescript
const { data } = useQuery({
  queryKey: ['nutrition'],
  queryFn: fetchNutrition,
})
```

### Local State (React)
```typescript
const [count, setCount] = useState(0)
```

## 📝 API Design

### REST Endpoints
```
POST   /auth/login
POST   /auth/register
GET    /auth/me
GET    /nutrition/entries
POST   /nutrition/entries
GET    /users/profile
PUT    /users/profile
```

### Response Format
```json
{
  "status": "success",
  "data": { ... },
  "message": "Optional message"
}
```

## 🌍 Deployment Environments

| Environment | URL | Branch | Port |
|-------------|-----|--------|------|
| Development | dev.burcev.team | dev | 3071 |
| Staging | beta.burcev.team | develop | 3070 |
| Production | burcev.team | main | 3069 |

## 📚 Documentation

- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Monorepo Guide](./docs/MONOREPO_GUIDE.md)
- [API Reference](./docs/API_Reference.md)
- [Component Library](./docs/COMPONENT_LIBRARY.md)

## 🎓 Learning Resources

### Frontend
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Zustand](https://zustand-demo.pmnd.rs)

### Backend
- [Express.js](https://expressjs.com)
- [TypeScript](https://www.typescriptlang.org)
- [Supabase](https://supabase.com/docs)

### Testing
- [Jest](https://jestjs.io)
- [React Testing Library](https://testing-library.com/react)
- [Playwright](https://playwright.dev)
- [MSW](https://mswjs.io)

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Write tests
4. Run linting and type checking
5. Submit pull request
6. Wait for CI checks
7. Get review and merge

## 📄 License

Private - All rights reserved
