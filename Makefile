.PHONY: build up down logs restart clean deploy update docker-dev docker-security docker-scan docker-build-prod docker-build-dev docker-test

# Build Docker image (with --no-cache to ensure env vars are baked in)
build:
	docker compose build --no-cache

# Start containers
up:
	docker compose up -d

# Stop containers
down:
	docker compose down

# View logs
logs:
	docker compose logs -f app

# Restart containers
restart:
	docker compose restart

# Clean up (remove containers and volumes)
clean:
	docker compose down -v
	docker rmi my-fitness-app || true

# Build and start (always rebuilds to pick up env changes)
deploy: build up

# Update from git and redeploy
update:
	git pull
	docker compose build --no-cache
	docker compose up -d

# Docker CI/CD specific commands

# Build production image with optimized caching
docker-build-prod:
	docker build \
		--target runner \
		--build-arg NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
		--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
		--build-arg NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION} \
		-t my-fitness-app:latest \
		-t my-fitness-app:${NEXT_PUBLIC_APP_VERSION} \
		.

# Build development image
docker-build-dev:
	docker build \
		--target development \
		-t my-fitness-app:dev \
		.

# Start development environment with hot reload
docker-dev:
	docker compose --profile development up app-dev

# Run security scan on built image
docker-security:
	docker compose --profile security up security-scan

# Run comprehensive security scan with external tools
docker-scan:
	./scripts/docker-security-scan.sh my-fitness-app latest

# Test Docker build process
docker-test:
	docker build --target security-scan -t my-fitness-app:test .
	docker run --rm my-fitness-app:test npm test

# Build multi-architecture images for CI/CD
docker-build-multi:
	docker buildx build \
		--platform linux/amd64,linux/arm64 \
		--target runner \
		--build-arg NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
		--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
		--build-arg NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION} \
		-t my-fitness-app:latest \
		--push \
		.

# Container registry management commands

# Generate tags using tagging strategy
docker-tags:
	./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io ${GITHUB_REPOSITORY} generate-tags

# Build with comprehensive tagging strategy
docker-build-tagged:
	./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io ${GITHUB_REPOSITORY} build

# Push all tags to registry
docker-push-all:
	./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io ${GITHUB_REPOSITORY} push

# Clean up old images from registry (dry run)
docker-cleanup-dry:
	./scripts/container-registry-cleanup.sh ghcr ${GITHUB_REPOSITORY}/my-fitness-app 10 true

# Clean up old images from registry
docker-cleanup:
	./scripts/container-registry-cleanup.sh ghcr ${GITHUB_REPOSITORY}/my-fitness-app 10 false

# Generate tagging metadata
docker-metadata:
	./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io ${GITHUB_REPOSITORY} metadata

# Clean all Docker resources
docker-clean-all:
	docker compose down -v --remove-orphans
	docker system prune -af
	docker volume prune -f

