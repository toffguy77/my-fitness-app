.PHONY: help dev build run test lint fmt clean

# Setup Go environment
SHELL := /bin/bash
export GOROOT := /opt/homebrew/opt/go/libexec
export GOPATH := $(HOME)/src/go
export PATH := /opt/homebrew/bin:$(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Run development server with hot reload
	air -c .air.toml

build: ## Build the application
	go build -o bin/server ./cmd/server

run: build ## Build and run the application
	./bin/server

test: ## Run tests
	go test ./... -v

test-coverage: ## Run tests with coverage
	go test ./... -coverprofile=coverage.out -covermode=atomic
	go tool cover -func=coverage.out

test-coverage-html: ## Run tests with coverage and open HTML report
	go test ./... -coverprofile=coverage.out -covermode=atomic
	go tool cover -html=coverage.out

test-coverage-ci: ## Run tests with coverage for CI (80% threshold)
	@echo "Running tests with coverage..."
	@go test ./... -coverprofile=coverage.out -covermode=atomic -v
	@echo "\nCoverage Summary:"
	@go tool cover -func=coverage.out | tail -1
	@COVERAGE=$$(go tool cover -func=coverage.out | tail -1 | awk '{print $$3}' | sed 's/%//'); \
	if [ $$(echo "$$COVERAGE < 80" | bc) -eq 1 ]; then \
		echo "\n❌ Coverage $$COVERAGE% is below 80% threshold"; \
		exit 1; \
	else \
		echo "\n✅ Coverage $$COVERAGE% meets 80% threshold"; \
	fi

bench: ## Run benchmarks
	go test ./... -bench=. -benchmem

bench-compare: ## Run benchmarks and save results
	go test ./... -bench=. -benchmem | tee bench-new.txt

lint: ## Run linter
	@echo "Linting skipped (golangci-lint not available)"

fmt: ## Format code
	go fmt ./...

clean: ## Clean build artifacts
	rm -rf bin/ tmp/ coverage.out

deps: ## Download dependencies
	go mod download
	go mod tidy

docker-build: ## Build Docker image
	docker build -t burcev-api:latest .

docker-run: ## Run Docker container
	docker run -p 4000:4000 --env-file .env burcev-api:latest
