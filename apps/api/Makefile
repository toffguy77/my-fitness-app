.PHONY: build test test-coverage-ci

build:
	go build -o bin/server ./cmd/server

test:
	go test ./... -v

test-coverage-ci:
	go test ./... -coverprofile=coverage.out -covermode=atomic -count=1
