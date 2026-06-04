## 1. Service implementation

- [x] 1.1 Add `"golang.org/x/sync/errgroup"` to the import block in `apps/api/internal/modules/curator/service.go`
- [x] 1.2 Declare local variables for all 8 helper return values above the errgroup block (unreadMap, weightMap, trendMap, targetMap, waterMap, activeTaskMap, overdueTaskMap, weeklyKBZHUMap, lastActivityMap, streakMap)
- [x] 1.3 Replace the sequential helper calls at lines 168-186 with an `errgroup.WithContext(ctx)` block containing 8 goroutines — each goroutine calls one helper and assigns to its pre-declared variable
- [x] 1.4 Handle `getUnreadCounts` error inside its goroutine: log the error and assign an empty map, return nil so the errgroup does not cancel siblings
- [x] 1.5 Call `eg.Wait()` with `//nolint:errcheck` comment after the goroutine block
- [x] 1.6 Confirm the client assembly loop below the errgroup block reads from the same variable names (no reference changes needed since variables are pre-declared)

## 2. Test updates

- [x] 2.1 Add `setupTestServiceUnordered(t *testing.T)` helper in `apps/api/internal/modules/curator/service_test.go` after `setupTestService` — same as `setupTestService` but calls `mock.MatchExpectationsInOrder(false)` after `sqlmock.New()`
- [x] 2.2 In `TestGetClients`, change the sub-test(s) that set up all 8 helper mock expectations to use `setupTestServiceUnordered(t)` instead of `setupTestService(t)`
- [x] 2.3 Leave the "returns empty list" sub-test (which returns before the helper block) using `setupTestService(t)`

## 3. Verification

- [x] 3.1 Run `cd apps/api && go build ./...` to confirm no compile errors
- [x] 3.2 Run `cd apps/api && go test ./internal/modules/curator/ -v -race` to confirm all tests pass with the race detector
- [x] 3.3 Run `cd apps/api && go test ./...` to confirm no regressions in other modules
