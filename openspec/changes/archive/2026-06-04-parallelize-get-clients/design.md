## Context

`GetClients` (`apps/api/internal/modules/curator/service.go`) runs a main JOIN query to fetch the base client list (well-indexed, fast), then enriches each client with 8 sequential helper calls at lines 168-186:

```
getUnreadCounts → getWeightData → getTargetWeights → getTodayWater
→ getActiveTaskCounts → getWeeklyKBZHUPercent → getLastActivityDates → getStreakDays
```

Each helper issues one or more DB queries and returns a map keyed by client ID. They are all independent — no helper's output is an input to another. Sequential execution means the wall-clock latency is the sum of all 8 helpers, not the max.

`golang.org/x/sync/errgroup` is already in `go.mod` at v0.18.0 (indirect dep).

Test tool: `github.com/DATA-DOG/go-sqlmock v1.5.2`. `sqlmock.New()` returns a mock with ordered expectations by default. After parallelization, goroutines may execute in any order, so the test helper must call `mock.MatchExpectationsInOrder(false)`.

## Goals / Non-Goals

**Goals:**
- Run all 8 helper calls concurrently, reducing wall-clock latency from sum to max
- Keep the function signature, response contract, and error-handling semantics identical
- Make tests pass reliably with the race detector (`-race`)

**Non-Goals:**
- Changing the helpers themselves or their SQL
- Adding new fields to the `GetClients` response
- Parallelizing the main JOIN query

## Decisions

**errgroup over raw goroutines + WaitGroup**

`errgroup.WithContext` is idiomatic Go for fan-out work that shares a context. It propagates context cancellation to all goroutines and makes error collection clean. Raw goroutines + `sync.WaitGroup` would require manual mutex or channel plumbing that adds noise without benefit.

**Each goroutine writes to its own variable — no mutex needed**

Each of the 8 helpers returns a distinct map type (e.g., `map[int64]int` vs `map[int64]*float64`). There is no shared write target. Each goroutine captures its own named local variable by pointer, so no synchronization is needed beyond `eg.Wait()`.

**`getUnreadCounts` error is non-fatal — log and continue with empty map**

The existing code already treats `getUnreadCounts` errors as non-fatal (original code checks `err` but only logs it and continues). This behavior is preserved in the errgroup goroutine: error → log → use empty map → return nil (so errgroup doesn't cancel other goroutines).

**`eg.Wait()` error ignored with `//nolint:errcheck`**

Because all goroutines always return `nil` (they handle their own errors internally), `eg.Wait()` will never return a non-nil error. The nolint comment makes this explicit rather than leaving a silently-ignored error.

**`mock.MatchExpectationsInOrder(false)` in test helper**

The ordered expectation model of sqlmock is incompatible with non-deterministic goroutine scheduling. A new `setupTestServiceUnordered(t)` helper is added alongside the existing `setupTestService(t)`. Tests that invoke only the main query (early-return paths) continue to use the ordered helper; tests that exercise the full 8-helper path switch to unordered.

## Risks / Trade-offs

- **Increased concurrent DB connections** → 8 connections opened simultaneously per `GetClients` call. Mitigation: the pgx connection pool handles concurrency; the pool size is set in `database/` config and is already sized for concurrent use across all handlers.
- **Race condition if a helper writes to a shared map** → No shared write targets exist (verified by inspection of all 8 helper return types). Mitigation: run tests with `-race` flag to confirm.
- **Test flakiness with ordered mocks** → Resolved by `MatchExpectationsInOrder(false)` in the new test helper.
