.PHONY: help install dev build test lint clean docker-up docker-down deploy

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

# Environment setup for Go
export GOROOT := /opt/homebrew/opt/go/libexec
export GOPATH := $(HOME)/src/go
export PATH := /opt/homebrew/bin:$(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

help: ## Show this help message
	@echo "$(BLUE)BURCEV Fitness App - Development Commands$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'

# =============================================================================
# Installation & Setup
# =============================================================================

install: ## Install all dependencies (frontend + backend)
	@echo "$(BLUE)Installing dependencies...$(RESET)"
	@echo "$(YELLOW)→ Installing frontend dependencies$(RESET)"
	cd apps/web && npm install
	@echo "$(YELLOW)→ Installing backend dependencies$(RESET)"
	cd apps/api && go mod download && go mod tidy
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

setup-env: ## Setup environment variables
	@echo "$(BLUE)Setting up environment...$(RESET)"
	@if [ ! -f .env.local ]; then \
		cp env.example .env.local; \
		echo "$(YELLOW)→ Created .env.local from env.example$(RESET)"; \
		echo "$(RED)⚠ Please update .env.local with your values$(RESET)"; \
	else \
		echo "$(GREEN)✓ .env.local already exists$(RESET)"; \
	fi

# =============================================================================
# Development
# =============================================================================

dev: ## Start development servers (frontend + backend)
	@echo "$(BLUE)Starting development servers...$(RESET)"
	@echo "$(YELLOW)→ Frontend: http://localhost:3069$(RESET)"
	@echo "$(YELLOW)→ Backend: http://localhost:4000$(RESET)"
	@trap 'kill 0' EXIT; \
	(cd apps/web && NODE_OPTIONS='--max-old-space-size=4096' npm run dev) & \
	(cd apps/api && air -c .air.toml)

dev-web: ## Start frontend development server only
	@echo "$(BLUE)Starting frontend dev server...$(RESET)"
	cd apps/web && NODE_OPTIONS='--max-old-space-size=4096' npm run dev

dev-api: ## Start backend development server only
	@echo "$(BLUE)Starting backend dev server...$(RESET)"
	cd apps/api && air -c .air.toml

# =============================================================================
# Building
# =============================================================================

build: build-web build-api ## Build frontend and backend

build-web: ## Build frontend for production
	@echo "$(BLUE)Building frontend...$(RESET)"
	cd apps/web && NODE_OPTIONS='--max-old-space-size=4096' npm run build
	@echo "$(GREEN)✓ Frontend built$(RESET)"

build-api: ## Build backend binary
	@echo "$(BLUE)Building backend...$(RESET)"
	cd apps/api && go build -o bin/server ./cmd/server
	@echo "$(GREEN)✓ Backend built$(RESET)"

# =============================================================================
# Testing
# =============================================================================

test: test-web test-api ## Run all tests

test-web: ## Run frontend tests
	@echo "$(BLUE)Running frontend tests...$(RESET)"
	cd apps/web && npm test -- --passWithNoTests
	@echo "$(GREEN)✓ Frontend tests passed$(RESET)"

test-api: ## Run backend tests
	@echo "$(BLUE)Running backend tests...$(RESET)"
	cd apps/api && go test ./... -v
	@echo "$(GREEN)✓ Backend tests passed$(RESET)"

test-coverage: test-coverage-web test-coverage-api ## Run tests with coverage

test-coverage-web: ## Run frontend tests with coverage
	@echo "$(BLUE)Running frontend tests with coverage...$(RESET)"
	cd apps/web && npm test -- --coverage --passWithNoTests \
		--collectCoverageFrom='src/**/*.{ts,tsx}' \
		--collectCoverageFrom='!src/**/*.d.ts' \
		--collectCoverageFrom='!src/**/__tests__/**' \
		--collectCoverageFrom='!src/app/**' \
		--collectCoverageFrom='!src/styles/**' \
		--collectCoverageFrom='!src/**/*.example.tsx'

test-coverage-api: ## Run backend tests with coverage
	@echo "$(BLUE)Running backend tests with coverage...$(RESET)"
	cd apps/api && go test ./... -coverprofile=coverage.out -covermode=atomic
	@cd apps/api && go tool cover -func=coverage.out | tail -1

test-watch-web: ## Run frontend tests in watch mode
	cd apps/web && npm test -- --watch

# =============================================================================
# Code Quality
# =============================================================================

lint: lint-web lint-api ## Run linters for frontend and backend

lint-web: ## Lint frontend code
	@echo "$(BLUE)Linting frontend...$(RESET)"
	cd apps/web && npm run lint
	@echo "$(GREEN)✓ Frontend linted$(RESET)"

lint-api: ## Format backend code
	@echo "$(BLUE)Formatting backend...$(RESET)"
	cd apps/api && go fmt ./...
	@echo "$(GREEN)✓ Backend formatted$(RESET)"

type-check: ## Run TypeScript type checking
	@echo "$(BLUE)Type checking frontend...$(RESET)"
	cd apps/web && npm run type-check
	@echo "$(GREEN)✓ Type check passed$(RESET)"

# =============================================================================
# Docker
# =============================================================================

docker-build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(RESET)"
	docker compose build --no-cache
	@echo "$(GREEN)✓ Docker images built$(RESET)"

docker-up: ## Start Docker containers
	@echo "$(BLUE)Starting Docker containers...$(RESET)"
	docker compose up -d
	@echo "$(GREEN)✓ Containers started$(RESET)"

docker-down: ## Stop Docker containers
	@echo "$(BLUE)Stopping Docker containers...$(RESET)"
	docker compose down
	@echo "$(GREEN)✓ Containers stopped$(RESET)"

docker-logs: ## View Docker logs
	docker compose logs -f

docker-restart: ## Restart Docker containers
	docker compose restart

docker-clean: ## Clean Docker resources
	@echo "$(BLUE)Cleaning Docker resources...$(RESET)"
	docker compose down -v
	docker system prune -f
	@echo "$(GREEN)✓ Docker cleaned$(RESET)"

# =============================================================================
# Deployment
# =============================================================================

deploy-dev: ## Deploy to dev environment
	@echo "$(BLUE)Deploying to dev.burcev.team...$(RESET)"
	git push origin dev
	@echo "$(GREEN)✓ Pushed to dev branch - CI/CD will deploy$(RESET)"

deploy-staging: ## Deploy to staging environment
	@echo "$(BLUE)Deploying to beta.burcev.team...$(RESET)"
	git push origin staging
	@echo "$(GREEN)✓ Pushed to staging branch - CI/CD will deploy$(RESET)"

deploy-prod: ## Deploy to production environment
	@echo "$(BLUE)Deploying to burcev.team...$(RESET)"
	@echo "$(RED)⚠ This will deploy to production!$(RESET)"
	@read -p "Are you sure? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		git push origin main; \
		echo "$(GREEN)✓ Pushed to main branch - CI/CD will deploy$(RESET)"; \
	else \
		echo "$(YELLOW)Deployment cancelled$(RESET)"; \
	fi

# =============================================================================
# Database
# =============================================================================

db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(RESET)"
	@echo "$(YELLOW)→ Connect to database and run migrations from apps/api/migrations/ folder$(RESET)"

db-reset: ## Reset database (WARNING: destructive)
	@echo "$(RED)⚠ This will reset the database!$(RESET)"
	@read -p "Are you sure? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		echo "$(YELLOW)→ Connect to Supabase dashboard to reset$(RESET)"; \
	else \
		echo "$(YELLOW)Reset cancelled$(RESET)"; \
	fi

# =============================================================================
# Maintenance
# =============================================================================

clean: ## Clean build artifacts and dependencies
	@echo "$(BLUE)Cleaning project...$(RESET)"
	@echo "$(YELLOW)→ Cleaning frontend$(RESET)"
	cd apps/web && rm -rf .next node_modules coverage
	@echo "$(YELLOW)→ Cleaning backend$(RESET)"
	cd apps/api && rm -rf bin tmp coverage.out
	@echo "$(GREEN)✓ Project cleaned$(RESET)"

clean-install: clean install ## Clean and reinstall dependencies

update-deps: ## Update dependencies
	@echo "$(BLUE)Updating dependencies...$(RESET)"
	@echo "$(YELLOW)→ Updating frontend$(RESET)"
	cd apps/web && npm update
	@echo "$(YELLOW)→ Updating backend$(RESET)"
	cd apps/api && go get -u ./... && go mod tidy
	@echo "$(GREEN)✓ Dependencies updated$(RESET)"

# =============================================================================
# Utilities
# =============================================================================

logs-web: ## View frontend logs (when running in background)
	@echo "$(BLUE)Frontend logs:$(RESET)"
	tail -f apps/web/.next/trace

logs-api: ## View backend logs (when running in background)
	@echo "$(BLUE)Backend logs:$(RESET)"
	tail -f apps/api/tmp/*.log 2>/dev/null || echo "No logs found"

status: ## Show project status
	@echo "$(BLUE)Project Status:$(RESET)"
	@echo ""
	@echo "$(YELLOW)Frontend:$(RESET)"
	@cd apps/web && npm list --depth=0 2>/dev/null | head -5 || echo "  Not installed"
	@echo ""
	@echo "$(YELLOW)Backend:$(RESET)"
	@cd apps/api && go version 2>/dev/null || echo "  Go not found"
	@cd apps/api && go list -m 2>/dev/null | head -1 || echo "  Not initialized"
	@echo ""
	@echo "$(YELLOW)Docker:$(RESET)"
	@docker compose ps 2>/dev/null || echo "  Not running"

version: ## Show version information
	@echo "$(BLUE)Version Information:$(RESET)"
	@echo "Node: $$(node --version 2>/dev/null || echo 'not installed')"
	@echo "npm: $$(npm --version 2>/dev/null || echo 'not installed')"
	@echo "Go: $$(go version 2>/dev/null || echo 'not installed')"
	@echo "Docker: $$(docker --version 2>/dev/null || echo 'not installed')"

# =============================================================================
# CI/CD Helpers
# =============================================================================

ci-test: ## Run tests in CI mode
	@echo "$(BLUE)Running CI tests...$(RESET)"
	cd apps/web && npm test -- --ci --coverage --passWithNoTests
	cd apps/api && go test ./... -coverprofile=coverage.out -covermode=atomic

ci-build: ## Build for CI
	@echo "$(BLUE)Building for CI...$(RESET)"
	cd apps/web && npm run build
	cd apps/api && go build -o bin/server ./cmd/server

ci-lint: ## Run linters in CI mode
	@echo "$(BLUE)Running CI linters...$(RESET)"
	cd apps/web && npm run lint
	cd apps/api && go fmt ./...
