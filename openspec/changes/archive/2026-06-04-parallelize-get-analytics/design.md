## Context

`GetAnalytics` (`apps/api/internal/modules/curator/service.go`, lines ~1866-1977) produces a summary for the curator dashboard. Its execution is structured as:

1. **Sequential preamble** (must stay sequential):
   - Query 1: count total clients for the curator → populate `TotalClients`
   - Query 2: fetch all clientIDs → needed for `IN (...)` placeholders in subsequent queries

2. **Independent queries** (candidates for parallelization):
   - Attention alerts query → `ClientsNeedingAttention`, `AtRiskClients`
   - Average KBZHU query → `AverageKBZHU`
   - `getUnreadCounts` helper → `TotalUnread`, `ClientsWaiting`
   - Active tasks count → `ActiveTasks`
   - Overdue tasks count → `OverdueTasks`
   - Completed-today count → `TasksCompletedToday`

All 6 independent queries use the `clientIDs` slice from the preamble. They write to distinct fields of the `AnalyticsSummary` struct. No goroutine touches another goroutine's output fields.

Two tests mock `GetAnalytics` with ordered sqlmock expectations and need updating:
- `TestGetAnalytics` ("returns analytics summary with clients" sub-test, line ~1259)
- `TestCollectDailySnapshot` ("collects and upserts daily snapshot" sub-test, line ~1612)

`setupTestServiceUnordered` may already exist if `parallelize-get-clients` was applied first. The implementation MUST use `if` to avoid declaring a duplicate helper.

## Goals / Non-Goals

**Goals:**
- Run the 6 independent analytics queries concurrently, reducing wall-clock latency from sum to max
- Keep the `AnalyticsSummary` response contract and all field names identical
- Keep tests deterministic under `-race`

**Non-Goals:**
- Parallelizing the 2-query sequential preamble (clientIDs dependency is real)
- Changing any of the 6 query texts or their aggregation logic
- Modifying the `AnalyticsSummary` struct shape

## Decisions

**errgroup over raw goroutines**

Same rationale as `parallelize-get-clients`: idiomatic, context-aware, clean. All goroutines always return nil (they handle errors internally via logging), so `eg.Wait()` never returns an error.

**Write directly to `AnalyticsSummary` fields inside goroutines — no mutex**

Each goroutine writes to a distinct set of fields. The unread goroutine is the only one that writes `TotalUnread` and `ClientsWaiting`; no other goroutine touches those fields. Verified by inspection: no field is written by more than one goroutine. No mutex is needed.

**`getUnreadCounts` error handling: log + set zero values, return nil**

Consistent with `GetClients` treatment: unread data is non-critical; a failure leaves the summary fields at zero rather than failing the entire analytics call.

**`setupTestServiceUnordered` is guarded against double-declaration**

Since both changes touch the same test file, the implementation task MUST check whether the helper already exists before adding it (e.g., using `grep` before writing). Only one declaration should exist in the final file.

## Risks / Trade-offs

- **More concurrent DB connections per analytics call** → Mitigation: pgx pool is already sized for concurrent use; analytics is a lower-frequency endpoint than `GetClients`.
- **`AnalyticsSummary` struct written from multiple goroutines** → No race: each goroutine writes to distinct fields. Verified by field-level inspection and confirmed by `-race` tests.
- **`TestCollectDailySnapshot` uses `GetAnalytics` internally** → The `ExpectExec` for the INSERT upsert is a different sqlmock expectation type from all `ExpectQuery` calls and will not accidentally match; `MatchExpectationsInOrder(false)` is safe here.
