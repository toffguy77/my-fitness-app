# BURCEV - Fitness & Nutrition Tracking Platform

Modern, scalable monorepo architecture for nutrition tracking and fitness curation application.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development servers (frontend + backend)
npm run dev

# Frontend: http://localhost:3000
# Backend: http://localhost:4000
```

## 📁 Project Structure

```
burcev-monorepo/
├── apps/
│   ├── web/          # Frontend (Next.js 16)
│   └── api/          # Backend (Express + TypeScript)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── ui/           # Shared UI components
│   ├── config/       # Shared configurations
│   └── utils/        # Shared utilities
├── scripts/          # CI/CD scripts
├── deploy/           # Deployment configs
└── docs/             # Documentation
```

## 🎯 Key Features

### Architecture
- ✅ **Monorepo**: Efficient code sharing and management
- ✅ **Feature-based**: Modular, scalable organization
- ✅ **Type-safe**: End-to-end TypeScript
- ✅ **Testable**: Comprehensive testing setup with MSW

### Frontend (Next.js)
- ✅ **App Router**: Modern Next.js routing
- ✅ **Design System**: Tokens-based styling
- ✅ **State Management**: Zustand for global state
- ✅ **Component Library**: Reusable UI components

### Backend (Express)
- ✅ **Modular**: Feature-based modules
- ✅ **Middleware**: Auth, logging, error handling
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Scalable**: Ready for horizontal scaling

## 🛠️ Technology Stack

### Frontend
- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS v4
- Zustand (state management)
- MSW (API mocking)

### Backend
- Node.js 20
- Express.js
- TypeScript 5
- Supabase (PostgreSQL)
- Winston (logging)
- Jest + Supertest

### DevOps
- Docker + Docker Compose
- GitHub Actions (CI/CD)
- nginx (reverse proxy)
- Health checks & monitoring

## 📚 Documentation

- [📖 Project Structure](./PROJECT_STRUCTURE.md) - Complete directory structure
- [🏗️ Architecture Guide](./docs/ARCHITECTURE.md) - Detailed architecture documentation
- [👨‍💻 Monorepo Guide](./docs/MONOREPO_GUIDE.md) - Development workflow and best practices
- [🔌 API Reference](./docs/API_Reference.md) - API endpoints documentation

## 🚀 Development

### Prerequisites
- Node.js 20+
- npm 10+
- Docker & Docker Compose (optional)

### Commands

```bash
# Development
npm run dev              # Start both apps
npm run dev:web          # Frontend only
npm run dev:api          # Backend only

# Building
npm run build            # Build all apps
npm run build:web        # Build frontend
npm run build:api        # Build backend

# Testing
npm test                 # Run all tests
npm run test:web         # Frontend tests
npm run test:api         # Backend tests

# Linting & Type Checking
npm run lint             # Lint all code
npm run type-check       # TypeScript validation

# Docker
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:build     # Build images
npm run docker:logs      # View logs
```

## 🐳 Docker Development

### Development Mode
```bash
docker-compose up
```
- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- Hot reload enabled

### Production Mode
```bash
docker-compose --profile production up
```
- Optimized builds
- Production configurations

## 🧪 Testing

### Unit Tests
```bash
npm test --workspace=apps/web
npm test --workspace=apps/api
```

### E2E Tests
```bash
npm run test:e2e --workspace=apps/web
```

### Coverage
```bash
npm run test:coverage --workspaces
```

## 📦 Adding Features

### Frontend Feature
```bash
# Create feature structure
mkdir -p apps/web/src/features/my-feature/{api,components,hooks,store,types}

# Implement feature
# Export from index.ts
# Use in app routes
```

### Backend Module
```bash
# Create module structure
mkdir -p apps/api/src/modules/my-module

# Implement controller, service, routes
# Register in main.ts
```

See [Monorepo Guide](./docs/MONOREPO_GUIDE.md) for detailed instructions.

## 🌍 Deployment

### Environments

| Environment | URL | Branch | Port |
|-------------|-----|--------|------|
| Development | dev.burcev.team | dev | 3071 |
| Staging | beta.burcev.team | develop | 3070 |
| Production | burcev.team | main | 3069 |

### CI/CD Pipeline
- ✅ Automated testing
- ✅ Type checking
- ✅ Security scanning
- ✅ Docker image building
- ✅ Automated deployment
- ✅ Health checks
- ✅ Rollback on failure

## 🔒 Security

- JWT authentication with secure cookies
- Role-based access control (RBAC)
- Input validation with Zod
- SQL injection protection
- XSS protection
- Security headers (Helmet)
- CORS configuration

## 📈 Performance

### Frontend
- Code splitting (automatic)
- Image optimization
- Lazy loading
- Bundle analysis

### Backend
- Response compression
- Database indexing
- Connection pooling
- Efficient queries

## 🎨 Design System

### Design Tokens
- Colors (brand, semantic, neutral)
- Typography (sizes, weights, line heights)
- Spacing (consistent scale)
- Breakpoints (responsive)

### Component Library
- Button, Input, Card, Modal
- Layout components
- Form components
- Fully typed with TypeScript

## 🤝 Contributing

1. Create feature branch from `dev`
2. Make changes following conventions
3. Write tests (70% coverage minimum)
4. Run linting and type checking
5. Submit pull request
6. Wait for CI checks
7. Get review and merge

## 📝 Conventions

### File Naming
- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Types: camelCase (`userTypes.ts`)
- Routes: lowercase (`page.tsx`)

### Git Commits
```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update dependencies
```

## 🐛 Troubleshooting

### Module Not Found
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

### Port Already in Use
```bash
lsof -ti:3000 | xargs kill -9  # Frontend
lsof -ti:4000 | xargs kill -9  # Backend
```

### TypeScript Errors
```bash
rm -rf apps/web/.next apps/api/dist
npm run type-check
```

## 📞 Support

- 📧 Email: support@burcev.team
- 📚 Documentation: [docs/](./docs/)
- 🐛 Issues: GitHub Issues

## 📄 License

Private - All rights reserved

---

**Built with ❤️ for fitness and nutrition tracking**
