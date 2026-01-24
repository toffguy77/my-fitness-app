# Golang Backend Guide

## Overview

Backend API построен на **Go 1.22** с использованием современных практик и библиотек.

## Technology Stack

- **Language**: Go 1.22
- **Web Framework**: Gin (высокопроизводительный HTTP router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT (golang-jwt/jwt)
- **Logging**: Zap (структурированное логирование)
- **Hot Reload**: Air (для разработки)

## Project Structure

```
apps/api/
├── cmd/
│   └── server/
│       └── main.go           # Application entry point
├── internal/
│   ├── modules/              # Business modules
│   │   ├── auth/
│   │   │   ├── handler.go    # HTTP handlers
│   │   │   └── service.go    # Business logic
│   │   ├── users/
│   │   └── nutrition/
│   ├── shared/               # Shared resources
│   │   ├── middleware/       # HTTP middleware
│   │   │   ├── auth.go
│   │   │   ├── logger.go
│   │   │   └── error.go
│   │   ├── logger/           # Logger setup
│   │   ├── response/         # Response helpers
│   │   └── database/         # Database utilities
│   └── config/               # Configuration
│       └── config.go
├── pkg/                      # Public packages
│   └── utils/
├── go.mod                    # Go modules
├── go.sum                    # Dependencies lock
├── Dockerfile                # Docker configuration
├── .air.toml                 # Hot reload config
└── Makefile                  # Build commands
```

## Key Features

### 🚀 Performance
- **Compiled language**: Быстрое выполнение
- **Goroutines**: Встроенная конкурентность
- **Small binary**: Маленький размер бинарника
- **Low memory**: Эффективное использование памяти

### 🏗️ Architecture
- **Clean Architecture**: Разделение на слои
- **Dependency Injection**: Через конструкторы
- **Interface-based**: Легкое тестирование
- **Modular**: Изолированные модули

### 🔒 Security
- **JWT Authentication**: Безопасная аутентификация
- **Middleware Stack**: Валидация и авторизация
- **Input Validation**: Gin binding
- **Error Handling**: Централизованная обработка

## Getting Started

### Prerequisites
```bash
# Install Go 1.22+
brew install go

# Install Air for hot reload
go install github.com/cosmtrek/air@latest

# Install golangci-lint for linting
brew install golangci-lint
```

### Development

```bash
# Navigate to API directory
cd apps/api

# Download dependencies
go mod download

# Run with hot reload
make dev
# or
air -c .air.toml

# Server starts on http://localhost:4000
```

### Building

```bash
# Build binary
make build

# Run binary
make run

# Or directly
go build -o bin/server ./cmd/server
./bin/server
```

### Testing

```bash
# Run tests
make test

# Run tests with coverage
make test-coverage

# Run specific package tests
go test ./internal/modules/auth/... -v
```

## Module Structure

Each module follows a consistent pattern:

### Handler Layer
```go
// handler.go
package auth

type Handler struct {
    cfg     *config.Config
    log     *logger.Logger
    service *Service
}

func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
    return &Handler{
        cfg:     cfg,
        log:     log,
        service: NewService(cfg, log),
    }
}

func (h *Handler) Login(c *gin.Context) {
    // 1. Parse request
    // 2. Validate input
    // 3. Call service
    // 4. Return response
}
```

### Service Layer
```go
// service.go
package auth

type Service struct {
    cfg *config.Config
    log *logger.Logger
}

func NewService(cfg *config.Config, log *logger.Logger) *Service {
    return &Service{cfg: cfg, log: log}
}

func (s *Service) Login(ctx context.Context, email, password string) (*LoginResult, error) {
    // Business logic here
    // Database queries
    // External API calls
}
```

## Adding a New Module

### 1. Create Module Directory
```bash
mkdir -p internal/modules/reports
```

### 2. Create Handler
```go
// internal/modules/reports/handler.go
package reports

import (
    "github.com/burcev/api/internal/config"
    "github.com/burcev/api/internal/shared/logger"
    "github.com/gin-gonic/gin"
)

type Handler struct {
    cfg     *config.Config
    log     *logger.Logger
    service *Service
}

func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
    return &Handler{
        cfg:     cfg,
        log:     log,
        service: NewService(cfg, log),
    }
}

func (h *Handler) GetReports(c *gin.Context) {
    // Implementation
}
```

### 3. Create Service
```go
// internal/modules/reports/service.go
package reports

import (
    "context"
    "github.com/burcev/api/internal/config"
    "github.com/burcev/api/internal/shared/logger"
)

type Service struct {
    cfg *config.Config
    log *logger.Logger
}

func NewService(cfg *config.Config, log *logger.Logger) *Service {
    return &Service{cfg: cfg, log: log}
}

func (s *Service) GetReports(ctx context.Context, userID string) ([]Report, error) {
    // Business logic
}
```

### 4. Register Routes
```go
// cmd/server/main.go
import "github.com/burcev/api/internal/modules/reports"

// In main function
reportsHandler := reports.NewHandler(cfg, log)
reportsGroup := v1.Group("/reports")
reportsGroup.Use(middleware.RequireAuth(cfg))
{
    reportsGroup.GET("/", reportsHandler.GetReports)
}
```

## Middleware

### Authentication
```go
// Protect routes
router.Use(middleware.RequireAuth(cfg))

// Role-based access
router.Use(middleware.RequireRole("admin", "coordinator"))
```

### Logging
```go
// Automatic request logging
router.Use(middleware.Logger(log))
```

### Error Handling
```go
// Centralized error handling
router.Use(middleware.ErrorHandler(log))
```

## Response Format

### Success Response
```go
response.Success(c, http.StatusOK, gin.H{
    "user": user,
})

// Output:
// {
//   "status": "success",
//   "data": {
//     "user": {...}
//   }
// }
```

### Error Response
```go
response.Error(c, http.StatusBadRequest, "Invalid input")

// Output:
// {
//   "status": "error",
//   "message": "Invalid input"
// }
```

## Configuration

### Environment Variables
```bash
# .env.local
NODE_ENV=development
PORT=4000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

### Loading Config
```go
cfg, err := config.Load()
if err != nil {
    log.Fatal("Failed to load config", err)
}
```

## Logging

### Structured Logging with Zap
```go
log.Info("User logged in", "user_id", userID)
log.Errorw("Failed to create entry", "error", err, "user_id", userID)
log.Debugw("Processing request", "path", path, "method", method)
```

## Testing

### Unit Tests
```go
// internal/modules/auth/service_test.go
package auth

import (
    "testing"
)

func TestLogin(t *testing.T) {
    // Arrange
    service := NewService(cfg, log)
    
    // Act
    result, err := service.Login(ctx, "test@example.com", "password")
    
    // Assert
    if err != nil {
        t.Errorf("Expected no error, got %v", err)
    }
    if result.User.Email != "test@example.com" {
        t.Errorf("Expected email test@example.com, got %s", result.User.Email)
    }
}
```

### Integration Tests
```go
func TestAuthEndpoints(t *testing.T) {
    router := setupRouter()
    
    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/api/v1/auth/login", body)
    router.ServeHTTP(w, req)
    
    assert.Equal(t, 200, w.Code)
}
```

## Docker

### Development
```bash
docker-compose up api
```

### Production Build
```bash
docker build -t burcev-api:latest -f apps/api/Dockerfile apps/api
docker run -p 4000:4000 --env-file .env burcev-api:latest
```

## Performance Tips

### 1. Use Goroutines for Concurrent Operations
```go
go func() {
    // Async operation
}()
```

### 2. Connection Pooling
```go
// Supabase client handles connection pooling automatically
```

### 3. Context for Timeouts
```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
```

### 4. Efficient JSON Parsing
```go
// Gin uses fast JSON parser by default
```

## Common Commands

```bash
# Development
make dev              # Run with hot reload
make build            # Build binary
make run              # Build and run

# Testing
make test             # Run tests
make test-coverage    # Tests with coverage

# Code Quality
make lint             # Run linter
make fmt              # Format code

# Docker
make docker-build     # Build Docker image
make docker-run       # Run Docker container

# Cleanup
make clean            # Remove build artifacts
```

## Best Practices

### 1. Error Handling
```go
if err != nil {
    log.Errorw("Operation failed", "error", err)
    return nil, fmt.Errorf("failed to do something: %w", err)
}
```

### 2. Context Usage
```go
func (s *Service) DoSomething(ctx context.Context, id string) error {
    // Always pass context
    // Check for cancellation
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Continue
    }
}
```

### 3. Dependency Injection
```go
// Use constructors
func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
    return &Handler{
        cfg: cfg,
        log: log,
        service: NewService(cfg, log),
    }
}
```

### 4. Interface-based Design
```go
type UserService interface {
    GetUser(ctx context.Context, id string) (*User, error)
    UpdateUser(ctx context.Context, user *User) error
}
```

## Troubleshooting

### Module Not Found
```bash
go mod tidy
go mod download
```

### Port Already in Use
```bash
lsof -ti:4000 | xargs kill -9
```

### Build Errors
```bash
go clean
go build ./...
```

## Resources

- [Go Documentation](https://go.dev/doc/)
- [Gin Framework](https://gin-gonic.com/docs/)
- [Zap Logger](https://github.com/uber-go/zap)
- [JWT Go](https://github.com/golang-jwt/jwt)
- [Air Hot Reload](https://github.com/cosmtrek/air)
