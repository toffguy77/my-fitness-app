.PHONY: build up down logs restart clean

# Build Docker image
build:
	docker-compose build

# Start containers
up:
	docker-compose up -d

# Stop containers
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f app

# Restart containers
restart:
	docker-compose restart

# Clean up (remove containers and volumes)
clean:
	docker-compose down -v
	docker rmi my-fitness-app || true

# Build and start
deploy: build up

# Update from git and redeploy
update:
	git pull
	docker-compose up -d --build

