# Test Coverage Improvement: 80-90%+ Design

## Goal
Raise test coverage from ~50% to 80-90%+ with quality tests that catch real bugs.

## Approach
Systematic feature-by-feature coverage (Approach 1) with business-logic-first ordering within each feature (Approach 2). Unit + integration tests priority, E2E stays as-is.

## Scope

### Frontend (apps/web) — 6 untested features to cover from scratch
- **onboarding** — store, wizard, step indicator, API
- **settings** — store, useSettings hook, 6 components, API
- **chat** — WebSocketProvider, MessageList, ChatInput, store
- **nutrition-calc** — store, KBJUWeeklyChart, ProfileBanner, API
- **admin** — ConversationList, UserDetail, UserList, store
- **curator** — components and store

### Frontend — existing features to strengthen
- auth, dashboard, food-tracker, notifications, content — add edge case and property-based tests

### Backend (apps/api) — gaps to fill
- **admin** — handler_test.go + service_test.go (from scratch)
- **chat** — handler_test.go (WebSocket)
- **content** — handler_test.go
- **curator** — handler_test.go
- **logs** — service_test.go
- **nutrition-calc** — handler_test.go + service_test.go

## Test ordering within each feature
1. `store/` — Zustand business logic, state management
2. `hooks/` — custom hooks
3. `api/` — API layer (mocks, error handling)
4. `types/` — runtime validation if applicable
5. `components/` — rendering, interaction, accessibility

## Test patterns (matching existing conventions)
- Unit tests for each component/hook/store
- Property-based tests (fast-check) for validation and calculations
- Accessibility tests for interactive components
- Test data generators in `testing/generators.ts`

## Coverage targets
```
branches: 80%
functions: 85%
lines: 85%
statements: 85%
```

## CI stability requirements
- All tests deterministic — no raw `Date.now()`, mocked timers
- WebSocket tests via mock WebSocket (no real connections)
- Property-based tests with fixed seed for reproducibility
- Coverage threshold raised only after tests are committed
- All mocks via `jest.mock()` and `jest.spyOn()` — no external dependencies

## Work organization — independent commits
1. Tests onboarding (frontend)
2. Tests settings (frontend)
3. Tests chat (frontend + backend)
4. Tests nutrition-calc (frontend + backend)
5. Tests admin (frontend + backend)
6. Tests curator (frontend + backend)
7. Strengthen existing tests + content
8. Raise coverage thresholds

Each commit: tests pass, CI green.

## Branch
`feat/test-coverage-improvement` from `dev`
