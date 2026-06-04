## ADDED Requirements

### Requirement: GetClients enrichment helpers run concurrently
`GetClients` SHALL fetch all 8 per-client enrichment data sets (unread counts, weight, target weight, water, active tasks, overdue tasks, weekly KBZHU, last activity, streak) in parallel using `errgroup`, not sequentially.

#### Scenario: All helpers complete successfully
- **WHEN** `GetClients` is called with a curator ID that has clients
- **THEN** all 8 enrichment maps are populated in the response
- **THEN** the response contains the same fields and values as the sequential implementation

#### Scenario: Concurrent execution does not cause data races
- **WHEN** `GetClients` is executed under the Go race detector (`-race`)
- **THEN** no race conditions are reported

### Requirement: GetClients response contract is unchanged
The `GetClients` function SHALL return the same response structure, field names, HTTP status codes, and error behavior as before the parallelization change.

#### Scenario: Response fields are identical to sequential version
- **WHEN** `GetClients` is called
- **THEN** the returned `[]ClientView` structs contain all enrichment fields (UnreadCount, CurrentWeight, WeightTrend, TargetWeight, WaterToday, ActiveTasks, OverdueTasks, WeeklyKBZHUPercent, LastActivity, StreakDays)

### Requirement: Unread counts error is non-fatal
If `getUnreadCounts` returns an error, `GetClients` SHALL log the error and continue with an empty unread counts map rather than returning an error to the caller.

#### Scenario: getUnreadCounts fails
- **WHEN** `getUnreadCounts` returns a database error
- **THEN** `GetClients` does not return an error
- **THEN** all clients in the response have `UnreadCount` of 0

### Requirement: Test helper supports unordered mock expectations
A `setupTestServiceUnordered` test helper SHALL exist in `service_test.go` that creates a sqlmock instance with `MatchExpectationsInOrder(false)`, enabling tests that cover the concurrent helper path to set up expectations in any order.

#### Scenario: TestGetClients full-path sub-test uses unordered helper
- **WHEN** the `TestGetClients` sub-test that exercises all 8 helpers runs
- **THEN** it uses `setupTestServiceUnordered(t)` and passes consistently under repeated execution
