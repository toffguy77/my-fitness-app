# curator-analytics-parallel-fetch Specification

## Purpose
TBD - created by archiving change parallelize-get-analytics. Update Purpose after archive.
## Requirements
### Requirement: GetAnalytics independent queries run concurrently
After the mandatory 2-query sequential preamble, `GetAnalytics` SHALL fetch the 6 independent analytics data sets (attention alerts, average KBZHU, unread counts, active tasks, overdue tasks, completed-today count) in parallel using `errgroup`.

#### Scenario: All goroutines complete and summary is fully populated
- **WHEN** `GetAnalytics` is called with a curator that has clients
- **THEN** the returned `AnalyticsSummary` contains non-zero values for ClientsNeedingAttention, AverageKBZHU, TotalUnread, ActiveTasks, OverdueTasks, and TasksCompletedToday (when the underlying data is present)
- **THEN** the values match what sequential execution would produce

#### Scenario: No data races under race detector
- **WHEN** `GetAnalytics` is executed under the Go race detector (`-race`)
- **THEN** no race conditions are reported

### Requirement: Sequential preamble is preserved
The first two queries in `GetAnalytics` SHALL remain sequential: count clients first, then fetch clientIDs. The clientIDs slice SHALL be available to all parallel goroutines before any goroutine starts.

#### Scenario: Preamble runs before parallel block
- **WHEN** `GetAnalytics` is called
- **THEN** the total-clients count query completes before the clientIDs query runs
- **THEN** the clientIDs query completes before the errgroup goroutines are launched

### Requirement: GetAnalytics response contract is unchanged
`GetAnalytics` SHALL return the same `AnalyticsSummary` struct with the same field names and semantics as before the parallelization change.

#### Scenario: Response fields are present and correctly typed
- **WHEN** `GetAnalytics` returns successfully
- **THEN** `AnalyticsSummary` includes TotalClients, ClientsNeedingAttention, AtRiskClients, AverageKBZHU, TotalUnread, ClientsWaiting, ActiveTasks, OverdueTasks, TasksCompletedToday

### Requirement: Unread counts error is non-fatal in analytics
If `getUnreadCounts` returns an error inside the analytics errgroup, `GetAnalytics` SHALL log the error and leave `TotalUnread` and `ClientsWaiting` as zero rather than returning an error to the caller.

#### Scenario: getUnreadCounts fails during analytics
- **WHEN** `getUnreadCounts` returns a database error
- **THEN** `GetAnalytics` does not return an error
- **THEN** `TotalUnread` and `ClientsWaiting` are 0 in the summary

### Requirement: TestGetAnalytics and TestCollectDailySnapshot use unordered mock expectations
The sub-tests of `TestGetAnalytics` and `TestCollectDailySnapshot` that exercise `GetAnalytics` with mock DB data SHALL use `setupTestServiceUnordered(t)` so that sqlmock expectations are matched regardless of goroutine execution order.

#### Scenario: TestGetAnalytics full-path sub-test passes consistently
- **WHEN** `TestGetAnalytics`'s "returns analytics summary with clients" sub-test runs repeatedly
- **THEN** it passes on every run without mock expectation order failures

#### Scenario: TestCollectDailySnapshot passes consistently
- **WHEN** `TestCollectDailySnapshot`'s "collects and upserts daily snapshot" sub-test runs repeatedly
- **THEN** it passes on every run without mock expectation order failures

