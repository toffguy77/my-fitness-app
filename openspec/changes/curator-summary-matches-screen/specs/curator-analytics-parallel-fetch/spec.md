# Spec Delta

## MODIFIED Requirements

### Requirement: GetAnalytics response contract is unchanged
`GetAnalytics` SHALL return the same `AnalyticsSummary` struct with the same field names as before the parallelization change. Семантика полей `AttentionClients` и `TotalClients` SHALL определяться способностью `curator-summary-consistency`; распараллеливание MUST NOT её менять.

#### Scenario: Response fields are present and correctly typed
- **WHEN** `GetAnalytics` returns successfully
- **THEN** `AnalyticsSummary` includes TotalClients, AttentionClients, AvgKBZHUPercent, TotalUnread, ClientsWaiting, ActiveTasks, OverdueTasks, CompletedToday

#### Scenario: Смысл величин не зависит от способа их получения
- **WHEN** величины сводки получены параллельно
- **THEN** `AttentionClients` и `TotalClients` совпадают с теми, что даёт последовательный подсчёт по тем же данным
