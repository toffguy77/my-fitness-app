# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o server ./cmd/server

# Development stage
FROM golang:1.24-alpine AS development

RUN apk add --no-cache git

# Install air for hot reload
RUN go install github.com/cosmtrek/air@latest

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

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -S -D -H -u 10001 appuser \
    && update-ca-certificates

WORKDIR /app
COPY --from=builder /app/server /app/server

ENV GIN_MODE=release
EXPOSE 4000
USER appuser
CMD ["./server"]
