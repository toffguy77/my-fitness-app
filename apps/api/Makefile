.PHONY: build test test-race test-coverage-ci test-integration-ci coverage-gate lint vet sync-knowledge

# Minimum statement coverage.
#
# Меряется на прогоне **с тегом integration** — том, который гоняет и обычные
# тесты, и те, что ходят в живую базу. Раньше порог считался по прогону без
# тега и видел на четыре пункта меньше: всё, что проверяется против настоящей
# схемы, для него не существовало.
#
# Это било по самому нужному. В этом коде инфраструктурное намеренно
# проверяется на живой базе, а не на подменах — подмены здесь уже пропускали
# живые дефекты. Порог, не считающий такие тесты, требовал добирать число
# обычными — то есть ровно теми, которым тут доверия меньше.
#
# Цель прежняя: запретить ухудшение, а не выбить число, о котором никто не
# договаривался. Поднимать осознанно и отдельным изменением.
COVERAGE_MIN ?= 50.0

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

# Прогон с живой базой: и обычные тесты, и интеграционные. Порог проверяется
# здесь, потому что только здесь видно всё.
test-integration-ci:
	go test -race -tags=integration ./... -coverprofile=coverage.out -covermode=atomic -count=1
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

# The support bot answers from docs/user-guide, embedded in the binary because
# go:embed cannot reach outside the module. This refreshes the copy; the drift
# between the two is a test failure, not a silent staleness.
sync-knowledge:
	rm -f internal/modules/support/knowledge/*.md
	cp ../../docs/user-guide/*.md internal/modules/support/knowledge/
