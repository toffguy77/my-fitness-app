.PHONY: build test test-race test-coverage-ci coverage-gate lint vet

# Minimum statement coverage. Set to the level measured when the gate was
# introduced (49.5%): the purpose is to forbid regression, not to force a number
# nobody agreed to. Raise it deliberately, in its own change.
COVERAGE_MIN ?= 49.0

build:
	go build -o bin/server ./cmd/server

# -race everywhere: the WebSocket hub is shared across goroutines and the
# curator analytics fan out through errgroup. Those races surface under
# production load and not on a developer's laptop.
test:
	go test -race ./... -v

test-race:
	go test -race ./...

test-coverage-ci:
	go test -race ./... -coverprofile=coverage.out -covermode=atomic -count=1
	$(MAKE) coverage-gate

# Fails the build when coverage drops below the agreed floor. Previously CI
# printed a green "coverage meets threshold" line without measuring anything.
coverage-gate:
	@total=$$(go tool cover -func=coverage.out | awk '/^total:/ {gsub(/%/,"",$$3); print $$3}'); \
	echo "Statement coverage: $$total% (minimum $(COVERAGE_MIN)%)"; \
	awk -v t="$$total" -v m="$(COVERAGE_MIN)" 'BEGIN { if (t+0 < m+0) { printf "coverage %.1f%% is below the %.1f%% minimum\n", t, m; exit 1 } }'

vet:
	go vet ./...

lint: vet
	golangci-lint run ./...
