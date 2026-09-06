# Build stage
FROM golang:1.26-alpine AS builder

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
FROM golang:1.26-alpine AS development

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
FROM alpine:3.19 AS production

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
