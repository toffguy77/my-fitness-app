# Build stage
# Базовые образы тянутся через зеркало, а не напрямую с Docker Hub.
#
# За один день 2026-09-12 семь сборок из десяти упали на `registry-1.docker.io`:
# то отказ разрешения имени, то обрыв соединения, то ответ по IPv6, до которого
# с этого хоста не достучаться. Код был ни при чём ни разу.
#
# mirror.gcr.io — сквозной кэш Docker Hub, который держит Google: те же самые
# образы, тот же протокол. Значение вынесено в аргумент: вернуться на Docker Hub
# — это `--build-arg BASE_REGISTRY=docker.io` и ничего больше.
ARG BASE_REGISTRY=mirror.gcr.io

FROM ${BASE_REGISTRY}/library/golang:1.26-alpine AS builder

# Install build dependencies
# DL3018 asks for pinned apk versions. We deliberately do not pin: the base
# image tag already fixes the Alpine release, and `apk upgrade` exists to pull
# security patches — pinning would defeat that and break the build whenever
# Alpine rotates a package version out of the repository. Recorded in
# .security-exceptions.yml.
# Retried for the same reason as every other apk step here: the build depends
# on the Alpine mirror answering, and a network blip on the build host is not a
# reason to fail a deployment.
# hadolint ignore=DL3018
RUN ok=0; \
    for attempt in 1 2 3; do \
        if apk add --no-cache git; then ok=1; break; fi; \
        echo "apk failed on attempt ${attempt}; retrying in 5s"; \
        sleep 5; \
    done; \
    [ "$ok" = 1 ] || { echo "apk still failing after three attempts"; exit 1; }

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o server ./cmd/server

# Development stage
FROM ${BASE_REGISTRY}/library/golang:1.26-alpine AS development

# DL3018 asks for pinned apk versions. We deliberately do not pin: the base
# image tag already fixes the Alpine release, and `apk upgrade` exists to pull
# security patches — pinning would defeat that and break the build whenever
# Alpine rotates a package version out of the repository. Recorded in
# .security-exceptions.yml.
# Retried for the same reason as every other apk step here: the build depends
# on the Alpine mirror answering, and a network blip on the build host is not a
# reason to fail a deployment.
# hadolint ignore=DL3018
RUN ok=0; \
    for attempt in 1 2 3; do \
        if apk add --no-cache git; then ok=1; break; fi; \
        echo "apk failed on attempt ${attempt}; retrying in 5s"; \
        sleep 5; \
    done; \
    [ "$ok" = 1 ] || { echo "apk still failing after three attempts"; exit 1; }

# Install air for hot reload
RUN go install github.com/air-verse/air@v1.61.7

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

EXPOSE 4000

# Use air for hot reload
CMD ["air", "-c", ".air.toml"]

# Production runtime
FROM ${BASE_REGISTRY}/library/alpine:3.19 AS production

# DL3018 asks for pinned apk versions. We deliberately do not pin: the base
# image tag already fixes the Alpine release, and `apk upgrade` exists to pull
# security patches — pinning would defeat that and break the build whenever
# Alpine rotates a package version out of the repository. Recorded in
# .security-exceptions.yml.
# Retried for the same reason as every other apk step here: the build depends
# on the Alpine mirror answering, and a network blip on the build host is not a
# reason to fail a deployment.
# hadolint ignore=DL3018
RUN ok=0; \
    for attempt in 1 2 3; do \
        if apk add --no-cache ca-certificates tzdata; then ok=1; break; fi; \
        echo "apk failed on attempt ${attempt}; retrying in 5s"; \
        sleep 5; \
    done; \
    [ "$ok" = 1 ] || { echo "apk still failing after three attempts"; exit 1; } \
    && adduser -S -D -H -u 10001 appuser \
    && update-ca-certificates

WORKDIR /app
COPY --from=builder /app/server /app/server

ENV GIN_MODE=release
EXPOSE 4000
USER appuser
CMD ["./server"]
