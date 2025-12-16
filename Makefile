.PHONY: build up down logs restart clean deploy update

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

