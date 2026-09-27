# curator-analytics-parallel-fetch Specification

## Purpose
Держит подсчёт сводки куратора быстрым и его результат независимым от того, каким
способом он получен: независимые величины считаются параллельно, а набор активных
клиентов — до них и один раз. Смысл самих величин задаёт `curator-summary-consistency`.

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
Набор активных клиентов SHALL определяться до запуска параллельного блока, одним запросом: он даёт и число клиентов, и их идентификаторы. Отдельный подсчёт MUST NOT существовать — это второе определение слова «активный», и оно расходилось с тем, по которому строится список клиентов. Идентификаторы SHALL быть готовы до старта всех горутин.

#### Scenario: Preamble runs before parallel block
- **WHEN** вызван подсчёт сводки
- **THEN** запрос активных клиентов завершается до запуска горутин
- **AND** число активных клиентов равно размеру полученного набора
- **AND** отдельного запроса, считающего клиентов, не выполняется

### Requirement: GetAnalytics response contract is unchanged
`GetAnalytics` SHALL return the same `AnalyticsSummary` struct with the same field names as before the parallelization change. Семантика полей `AttentionClients` и `TotalClients` SHALL определяться способностью `curator-summary-consistency`; распараллеливание MUST NOT её менять.

#### Scenario: Response fields are present and correctly typed
- **WHEN** `GetAnalytics` returns successfully
- **THEN** `AnalyticsSummary` includes TotalClients, AttentionClients, AvgKBZHUPercent, TotalUnread, ClientsWaiting, ActiveTasks, OverdueTasks, CompletedToday

#### Scenario: Смысл величин не зависит от способа их получения
- **WHEN** величины сводки получены параллельно
- **THEN** `AttentionClients` и `TotalClients` совпадают с теми, что даёт последовательный подсчёт по тем же данным

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
