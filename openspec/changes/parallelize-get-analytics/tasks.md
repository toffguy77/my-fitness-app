## 1. Service implementation

- [x] 1.1 Confirm `"golang.org/x/sync/errgroup"` is in the import block in `apps/api/internal/modules/curator/service.go` (may already be present after `parallelize-get-clients`)
- [x] 1.2 Locate the end of the 2-query sequential preamble in `GetAnalytics` (after clientIDs are populated) — this is the insertion point for the errgroup block
- [x] 1.3 Replace the 6 independent sequential query blocks with an `errgroup.WithContext(ctx)` block; each goroutine handles one query and writes to distinct `AnalyticsSummary` fields
- [x] 1.4 Inside the unread goroutine: call `getUnreadCounts`, log any error, set `TotalUnread`/`ClientsWaiting` to 0 on error, return nil
- [x] 1.5 Add `eg.Wait()` with `//nolint:errcheck` comment after all goroutines are launched

## 2. Test updates

- [x] 2.1 Check if `setupTestServiceUnordered` already exists in `apps/api/internal/modules/curator/service_test.go` (present if `parallelize-get-clients` was already applied); add it only if absent
- [x] 2.2 In `TestGetAnalytics`, change the "returns analytics summary with clients" sub-test to use `setupTestServiceUnordered(t)` instead of `setupTestService(t)`
- [x] 2.3 In `TestCollectDailySnapshot`, change the "collects and upserts daily snapshot" sub-test to use `setupTestServiceUnordered(t)` instead of `setupTestService(t)`
- [x] 2.4 Leave "returns empty analytics when no clients" and "handles zero clients" sub-tests using `setupTestService(t)` (they hit the early-return path before the errgroup)

## 3. Verification

- [x] 3.1 Run `cd apps/api && go build ./...` to confirm no compile errors
- [x] 3.2 Run `cd apps/api && go test ./internal/modules/curator/ -v -race` to confirm all tests pass with the race detector
- [x] 3.3 Run `cd apps/api && go test ./...` to confirm no regressions across the full backend suite
