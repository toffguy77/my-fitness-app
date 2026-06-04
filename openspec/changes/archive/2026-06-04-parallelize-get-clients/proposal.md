## Why

`GetClients` in `apps/api/internal/modules/curator/service.go` fetches 8 independent data sets (unread counts, weight, target weight, water, task counts, weekly KBZHU, last activity, streak) sequentially after its main JOIN. Each call is a separate DB round-trip; their combined latency is the dominant cost of every curator dashboard load and risks exceeding the 1-second `LogDatabaseQuery` warning threshold.

## What Changes

- Replace the 8 sequential helper calls in `GetClients` (lines 168-186) with a parallel `errgroup` block — all 8 helpers run concurrently and the function waits for all of them before assembling the result.
- Add a `setupTestServiceUnordered` helper to `service_test.go` that configures `sqlmock` with `MatchExpectationsInOrder(false)`, and update the `TestGetClients` sub-tests that exercise all 8 helpers to use it.

## Capabilities

### New Capabilities

- `curator-clients-parallel-fetch`: concurrent fetching of per-client enrichment data in `GetClients` — 8 independent DB helpers run in parallel instead of sequentially.

### Modified Capabilities

None. The `GetClients` response contract, field names, and business logic are unchanged.

## Impact

- **File**: `apps/api/internal/modules/curator/service.go` (lines 168-186 replaced)
- **File**: `apps/api/internal/modules/curator/service_test.go` (new helper + test updates)
- **Dependency**: `golang.org/x/sync/errgroup` — already present in `go.mod` v0.18.0 as an indirect dep; promoted to direct use.
- **No API contract change**: response shape, field names, and HTTP status codes are identical.
