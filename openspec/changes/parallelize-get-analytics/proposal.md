## Why

`GetAnalytics` in `apps/api/internal/modules/curator/service.go` runs 8 sequential DB queries. The first 2 are necessarily sequential (count clients → derive clientIDs for IN clauses). The remaining 6 are fully independent and can run concurrently. Under load, serial execution of all 6 independent queries is the dominant latency cost of the curator analytics dashboard.

## What Changes

- After the mandatory 2-query preamble in `GetAnalytics`, replace the 6 independent sequential query blocks with a parallel `errgroup` block.
- Add `setupTestServiceUnordered` test helper to `service_test.go` (or reuse it if already added by the `parallelize-get-clients` change) and update two test functions that mock `GetAnalytics` with ordered expectations: `TestGetAnalytics` and `TestCollectDailySnapshot`.

## Capabilities

### New Capabilities

- `curator-analytics-parallel-fetch`: concurrent fetching of 6 independent analytics queries in `GetAnalytics` — attention alerts, average KBZHU, unread counts, active tasks, overdue tasks, and completed-today count run in parallel.

### Modified Capabilities

None. The `GetAnalytics` response contract, field names, and HTTP status codes are unchanged.

## Impact

- **File**: `apps/api/internal/modules/curator/service.go` (lines ~1889-1969 replaced)
- **File**: `apps/api/internal/modules/curator/service_test.go` (new helper if not present + 2 test updates)
- **Dependency**: `golang.org/x/sync/errgroup` — same dep as `parallelize-get-clients`; already in `go.mod`.
- **No API contract change**: analytics response struct, field names, and HTTP status codes are identical.
