# Design Document: Notifications Page

## Overview

The notifications page feature provides a centralized interface for users to view and manage two categories of notifications: personal (Main) notifications and general (Content) notifications. The design follows a tab-based architecture with real-time updates, optimistic UI patterns, and comprehensive accessibility support.

### Key Design Principles

1. **Separation of Concerns**: Clear distinction between Main and Content notifications
2. **Real-time Responsiveness**: Polling mechanism ensures users see new notifications within 5 seconds
3. **Performance First**: Virtual scrolling, pagination, and caching for smooth UX
4. **Accessibility**: WCAG 2.1 compliant with keyboard navigation and screen reader support
5. **Progressive Enhancement**: Graceful degradation for offline scenarios

### Technology Stack

- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **State Management**: Zustand for notification state, React hooks for local UI state
- **Backend**: Go (Gin framework) with PostgreSQL
- **Real-time**: HTTP polling (30-second interval)
- **Styling**: Tailwind CSS with design tokens from `styles/tokens/`

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Notifications Page                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationsLayout (App Router)                     │  │
│  │  - Authentication check                               │  │
│  │  - Page header with settings icon                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationsTabs Component                          │  │
│  │  - Tab switching logic                                │  │
│  │  - Badge display for unread counts                    │  │
│  └───────────────────────────────────────────────────────┘  │
│              │                              │                │
│  ┌───────────────────────┐    ┌───────────────────────┐    │
│  │  MainNotifications    │    │  ContentNotifications │    │
│  │  - Personal notifs    │    │  - System notifs      │    │
│  │  - Trainer feedback   │    │  - New features       │    │
│  └───────────────────────┘    └───────────────────────┘    │
│              │                              │                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationList Component                           │  │
│  │  - Virtual scrolling                                  │  │
│  │  - Date grouping                                      │  │
│  │  - Infinite scroll pagination                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationItem Component                           │  │
│  │  - Icon/image display                                 │  │
│  │  - Timestamp formatting                               │  │
│  │  - Read/unread styling                                │  │
│  │  - Click handler for mark as read                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Zustand Notification Store                      │
│  - notifications: Map<category, Notification[]>             │
│  - unreadCounts: Map<category, number>                      │
│  - fetchNotifications()                                      │
│  - markAsRead()                                              │
│  - pollForUpdates()                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Go Backend)                    │
│  GET  /api/notifications?category=main&limit=50&offset=0    │
│  POST /api/notifications/:id/read                           │
│  GET  /api/notifications/unread-counts                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│  notifications table:                                        │
│  - id, user_id, category, type, title, content              │
│  - icon_url, created_at, read_at                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initial Load**: Page component fetches notifications via Zustand store
2. **Display**: Notifications grouped by date, rendered with virtual scrolling
3. **Interaction**: User clicks notification → optimistic UI update → API call
4. **Polling**: Background polling every 30 seconds checks for new notifications
5. **Real-time Update**: New notifications prepended to list, badge updated

## Components and Interfaces

### Frontend Components

#### 1. NotificationsPage (App Router Page)

**Location**: `apps/web/src/app/notifications/page.tsx`

**Responsibilities**:
- Server-side authentication check
- Initial data fetching (optional SSR)
- Page metadata and SEO

**Interface**:
```typescript
export default async function NotificationsPage() {
  // Server component - authentication check
  // Render NotificationsLayout
}
```

#### 2. NotificationsLayout Component

**Location**: `apps/web/src/features/notifications/components/NotificationsLayout.tsx`

**Responsibilities**:
- Page header with title and settings icon
- Tab container
- Layout structure

**Interface**:
```typescript
interface NotificationsLayoutProps {
  children: React.ReactNode
}

export function NotificationsLayout({ children }: NotificationsLayoutProps): JSX.Element
```

#### 3. NotificationsTabs Component

**Location**: `apps/web/src/features/notifications/components/NotificationsTabs.tsx`

**Responsibilities**:
- Tab switching between Main and Content
- Display unread badges
- Active tab state management

**Interface**:
```typescript
type NotificationCategory = 'main' | 'content'

interface NotificationsTabsProps {
  activeTab: NotificationCategory
  onTabChange: (tab: NotificationCategory) => void
  unreadCounts: Record<NotificationCategory, number>
}

export function NotificationsTabs(props: NotificationsTabsProps): JSX.Element
```

#### 4. NotificationList Component

**Location**: `apps/web/src/features/notifications/components/NotificationList.tsx`

**Responsibilities**:
- Virtual scrolling for performance
- Date grouping logic
- Infinite scroll pagination
- Loading and error states
- Empty state display

**Interface**:
```typescript
interface NotificationListProps {
  category: NotificationCategory
  notifications: Notification[]
  isLoading: boolean
  error: Error | null
  onLoadMore: () => void
  hasMore: boolean
}

export function NotificationList(props: NotificationListProps): JSX.Element
```

#### 5. NotificationItem Component

**Location**: `apps/web/src/features/notifications/components/NotificationItem.tsx`

**Responsibilities**:
- Display single notification
- Icon/image rendering
- Timestamp formatting (relative)
- Read/unread styling
- Click handler for marking as read

**Interface**:
```typescript
interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
}

export function NotificationItem(props: NotificationItemProps): JSX.Element
```

#### 6. NotificationIcon Component

**Location**: `apps/web/src/features/notifications/components/NotificationIcon.tsx`

**Responsibilities**:
- Render appropriate icon based on notification type
- Support custom images
- Fallback icon for unknown types

**Interface**:
```typescript
interface NotificationIconProps {
  type: NotificationType
  iconUrl?: string
  className?: string
}

export function NotificationIcon(props: NotificationIconProps): JSX.Element
```

### State Management (Zustand Store)

**Location**: `apps/web/src/features/notifications/store/notificationsStore.ts`

**Store Interface**:
```typescript
interface NotificationsState {
  // State
  notifications: Record<NotificationCategory, Notification[]>
  unreadCounts: Record<NotificationCategory, number>
  isLoading: boolean
  error: Error | null
  hasMore: Record<NotificationCategory, boolean>
  
  // Actions
  fetchNotifications: (category: NotificationCategory, offset?: number) => Promise<void>
  markAsRead: (id: string, category: NotificationCategory) => Promise<void>
  markAllAsRead: (category: NotificationCategory) => Promise<void>
  pollForUpdates: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}
```

**Store Behavior**:
- Optimistic updates for mark as read
- Automatic rollback on API failure
- Polling lifecycle management
- Cache invalidation strategy

### Custom Hooks

#### useNotifications Hook

**Location**: `apps/web/src/features/notifications/hooks/useNotifications.ts`

**Interface**:
```typescript
interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: Error | null
  hasMore: boolean
  fetchMore: () => void
  markAsRead: (id: string) => void
  refresh: () => void
}

export function useNotifications(category: NotificationCategory): UseNotificationsReturn
```

#### useNotificationPolling Hook

**Location**: `apps/web/src/features/notifications/hooks/useNotificationPolling.ts`

**Interface**:
```typescript
interface UseNotificationPollingOptions {
  interval?: number // Default: 30000ms
  enabled?: boolean // Default: true
}

export function useNotificationPolling(options?: UseNotificationPollingOptions): void
```

#### useAutoMarkAsRead Hook

**Location**: `apps/web/src/features/notifications/hooks/useAutoMarkAsRead.ts`

**Interface**:
```typescript
interface UseAutoMarkAsReadOptions {
  delay?: number // Default: 2000ms
  enabled?: boolean // Default: true
}

export function useAutoMarkAsRead(
  notifications: Notification[],
  category: NotificationCategory,
  options?: UseAutoMarkAsReadOptions
): void
```

### Backend API Handlers

#### 1. Get Notifications Handler

**Location**: `apps/api/internal/modules/notifications/handler.go`

**Endpoint**: `GET /api/notifications`

**Query Parameters**:
- `category`: "main" | "content" (required)
- `limit`: number (default: 50, max: 100)
- `offset`: number (default: 0)

**Response**:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "category": "main",
      "type": "trainer_feedback",
      "title": "New feedback from trainer",
      "content": "Your trainer left feedback on your progress",
      "icon_url": null,
      "created_at": "2024-01-15T10:30:00Z",
      "read_at": null
    }
  ],
  "total": 150,
  "has_more": true
}
```

#### 2. Mark Notification as Read Handler

**Location**: `apps/api/internal/modules/notifications/handler.go`

**Endpoint**: `POST /api/notifications/:id/read`

**Response**:
```json
{
  "success": true,
  "read_at": "2024-01-15T10:35:00Z"
}
```

#### 3. Get Unread Counts Handler

**Location**: `apps/api/internal/modules/notifications/handler.go`

**Endpoint**: `GET /api/notifications/unread-counts`

**Response**:
```json
{
  "main": 5,
  "content": 12
}
```

#### 4. Mark All as Read Handler

**Location**: `apps/api/internal/modules/notifications/handler.go`

**Endpoint**: `POST /api/notifications/mark-all-read`

**Request Body**:
```json
{
  "category": "main"
}
```

**Response**:
```json
{
  "success": true,
  "marked_count": 5
}
```

### Backend Service Layer

**Location**: `apps/api/internal/modules/notifications/service.go`

**Service Interface**:
```go
type Service struct {
    db  *sql.DB
    log *logger.Logger
}

func (s *Service) GetNotifications(ctx context.Context, userID string, category string, limit, offset int) ([]Notification, int, error)
func (s *Service) MarkAsRead(ctx context.Context, userID, notificationID string) error
func (s *Service) MarkAllAsRead(ctx context.Context, userID, category string) (int, error)
func (s *Service) GetUnreadCounts(ctx context.Context, userID string) (map[string]int, error)
func (s *Service) CreateNotification(ctx context.Context, notification *Notification) error
```

## Data Models

### Frontend Types

**Location**: `apps/web/src/features/notifications/types/index.ts`

```typescript
export type NotificationCategory = 'main' | 'content'

export type NotificationType = 
  | 'trainer_feedback'
  | 'achievement'
  | 'reminder'
  | 'system_update'
  | 'new_feature'
  | 'general'

export interface Notification {
  id: string
  userId: string
  category: NotificationCategory
  type: NotificationType
  title: string
  content: string
  iconUrl?: string
  createdAt: string // ISO 8601
  readAt?: string // ISO 8601
}

export interface NotificationGroup {
  date: string // "Today", "Yesterday", "Last Week", or ISO date
  notifications: Notification[]
}

export interface UnreadCounts {
  main: number
  content: number
}
```

### Backend Types

**Location**: `apps/api/internal/modules/notifications/types.go`

```go
type NotificationCategory string

const (
    CategoryMain    NotificationCategory = "main"
    CategoryContent NotificationCategory = "content"
)

type NotificationType string

const (
    TypeTrainerFeedback NotificationType = "trainer_feedback"
    TypeAchievement     NotificationType = "achievement"
    TypeReminder        NotificationType = "reminder"
    TypeSystemUpdate    NotificationType = "system_update"
    TypeNewFeature      NotificationType = "new_feature"
    TypeGeneral         NotificationType = "general"
)

type Notification struct {
    ID        string               `json:"id" db:"id"`
    UserID    string               `json:"user_id" db:"user_id"`
    Category  NotificationCategory `json:"category" db:"category"`
    Type      NotificationType     `json:"type" db:"type"`
    Title     string               `json:"title" db:"title"`
    Content   string               `json:"content" db:"content"`
    IconURL   *string              `json:"icon_url,omitempty" db:"icon_url"`
    CreatedAt time.Time            `json:"created_at" db:"created_at"`
    ReadAt    *time.Time           `json:"read_at,omitempty" db:"read_at"`
}

type GetNotificationsRequest struct {
    Category NotificationCategory `form:"category" binding:"required,oneof=main content"`
    Limit    int                  `form:"limit" binding:"omitempty,min=1,max=100"`
    Offset   int                  `form:"offset" binding:"omitempty,min=0"`
}

type GetNotificationsResponse struct {
    Notifications []Notification `json:"notifications"`
    Total         int            `json:"total"`
    HasMore       bool           `json:"has_more"`
}

type MarkAllAsReadRequest struct {
    Category NotificationCategory `json:"category" binding:"required,oneof=main content"`
}

type UnreadCountsResponse struct {
    Main    int `json:"main"`
    Content int `json:"content"`
}
```

### Database Schema

**Table**: `notifications`

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(20) NOT NULL CHECK (category IN ('main', 'content')),
    type VARCHAR(50) NOT NULL CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    icon_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_notifications_user_category (user_id, category, created_at DESC),
    INDEX idx_notifications_user_unread (user_id, read_at) WHERE read_at IS NULL
);
```

**Indexes**:
- `idx_notifications_user_category`: Optimizes fetching notifications by category
- `idx_notifications_user_unread`: Optimizes unread count queries

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Read/Unread Styling (2.4, 2.5)**: These can be combined into one property about styling based on read status
2. **Icon Mapping (8.1-8.5)**: Individual icon examples can be combined into one property about type-to-icon mapping
3. **Responsive Design (6.1-6.3)**: These are specific viewport examples, best kept as unit tests
4. **Accessibility Attributes (6.5, 6.6, 6.7)**: Can be combined into comprehensive accessibility property
5. **Error Handling (7.2, 7.3, 7.4)**: These are specific error scenarios, best as unit tests
6. **Authentication Flow (10.1, 10.4)**: Can be combined into one property about authentication requirements

### Properties

#### Property 1: Tab Switching Displays Correct Notifications

*For any* notification category (main or content) and any set of notifications, when a user switches to that category's tab, the system should display only notifications belonging to that category.

**Validates: Requirements 1.2**

#### Property 2: Unread Badge Visibility

*For any* notification category, when that category contains one or more unread notifications, the system should display a badge with the unread count on the corresponding tab.

**Validates: Requirements 1.3**

#### Property 3: Timestamp Formatting

*For any* notification with a valid timestamp, the system should display the timestamp in relative format (e.g., "2 hours ago", "Yesterday", "Last week").

**Validates: Requirements 2.1**

#### Property 4: Notification Type Icon Mapping

*For any* notification with a valid type, the system should display an appropriate icon corresponding to that type (trainer_feedback → trainer icon, achievement → trophy icon, etc.).

**Validates: Requirements 2.2, 8.1, 8.2, 8.3, 8.4, 8.5**

#### Property 5: Preview Text Display

*For any* notification, the system should display preview text that summarizes the notification content.

**Validates: Requirements 2.3**

#### Property 6: Read Status Styling

*For any* notification, the system should apply distinct visual styling when read status is false (bold, highlighted) and muted styling when read status is true.

**Validates: Requirements 2.4, 2.5**

#### Property 7: Date Grouping

*For any* list of notifications with various timestamps, the system should group them by date categories (Today, Yesterday, Last Week, or specific dates) in chronological order.

**Validates: Requirements 2.6**

#### Property 8: Click Marks as Read

*For any* unread notification, when a user clicks on it, the system should mark its read status as true and persist this change to the database.

**Validates: Requirements 3.1, 3.5**

#### Property 9: Visual Update on Read Status Change

*For any* notification whose read status changes from false to true, the system should immediately update its visual styling to reflect the read state.

**Validates: Requirements 3.2**

#### Property 10: Badge Removal When All Read

*For any* notification category, when all notifications in that category are marked as read, the system should remove the unread badge from the corresponding tab.

**Validates: Requirements 3.3**

#### Property 11: Auto-Mark Visible Notifications

*For any* set of visible notifications in a tab, after the user views the tab for 2 seconds, the system should mark all visible unread notifications as read.

**Validates: Requirements 3.4**

#### Property 12: Pagination Limit

*For any* notification fetch request, the system should return at most 50 notifications per request, ordered by creation date (most recent first).

**Validates: Requirements 4.2**

#### Property 13: Infinite Scroll Loading

*For any* notification list with more than 50 total notifications, when the user scrolls to the bottom, the system should load the next batch of up to 50 notifications.

**Validates: Requirements 4.3**

#### Property 14: New Notification Badge Update

*For any* new notification that arrives, the system should immediately increment the unread count badge for the corresponding category.

**Validates: Requirements 5.2**

#### Property 15: New Notification Prepending

*For any* new notification that arrives while the user is viewing the notifications page, the system should prepend it to the top of the appropriate category list.

**Validates: Requirements 5.3**

#### Property 16: Keyboard Navigation Support

*For any* interactive element on the notifications page (tabs, notification items, buttons), the system should support keyboard navigation with visible focus indicators.

**Validates: Requirements 6.4, 6.7**

#### Property 17: Accessibility Compliance

*For any* component on the notifications page, the system should provide appropriate ARIA labels and roles, and maintain minimum 4.5:1 contrast ratio for text elements.

**Validates: Requirements 6.5, 6.6**

#### Property 18: Empty State Display

*For any* notification category with zero notifications, the system should display an empty state message with an appropriate icon.

**Validates: Requirements 7.1**

#### Property 19: Offline Caching

*For any* successfully loaded set of notifications, the system should cache them locally so they remain viewable when the user goes offline.

**Validates: Requirements 7.5**

#### Property 20: Authentication Verification

*For any* request to fetch notifications, the system should verify the user's authentication token and only return notifications belonging to that authenticated user.

**Validates: Requirements 10.1, 10.3, 10.4**

## Error Handling

### Frontend Error Handling

**Network Errors**:
- Display user-friendly error messages
- Provide retry button for failed requests
- Show offline indicator when network is unavailable
- Gracefully degrade to cached data

**Authentication Errors**:
- Detect expired tokens (401 responses)
- Redirect to login page with return URL
- Clear local state on authentication failure
- Display session expired message

**Validation Errors**:
- Validate category parameter before API calls
- Handle invalid notification IDs gracefully
- Provide fallback icons for unknown types
- Log validation errors for debugging

**State Management Errors**:
- Rollback optimistic updates on API failure
- Maintain consistency between UI and server state
- Handle race conditions in concurrent updates
- Prevent duplicate notifications in list

### Backend Error Handling

**Database Errors**:
- Log database errors with context
- Return 500 status with generic message
- Implement retry logic for transient failures
- Use transactions for atomic operations

**Authentication Errors**:
- Return 401 for missing/invalid tokens
- Return 403 for insufficient permissions
- Log authentication failures
- Rate limit authentication attempts

**Validation Errors**:
- Return 400 for invalid parameters
- Provide specific error messages
- Validate category enum values
- Validate pagination parameters

**Not Found Errors**:
- Return 404 for non-existent notifications
- Verify notification ownership before operations
- Handle deleted notifications gracefully

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string // "UNAUTHORIZED", "NOT_FOUND", "VALIDATION_ERROR"
    message: string // User-friendly message
    details?: Record<string, string> // Field-specific errors
  }
}
```

## Testing Strategy

### Dual Testing Approach

The notifications page feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, error conditions, and UI interactions
- **Property tests**: Verify universal properties across all inputs using randomized data

Both testing approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide range of inputs.

### Property-Based Testing

**Library**: fast-check (TypeScript/JavaScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: notifications-page, Property {N}: {property description}`

**Test Organization**:
- Property tests co-located with components in `__tests__` directories
- Shared generators in `apps/web/src/features/notifications/testing/generators.ts`
- Mock API responses using MSW (Mock Service Worker)

**Example Property Test Structure**:

```typescript
import fc from 'fast-check'
import { render, screen } from '@testing-library/react'
import { notificationGenerator } from '../testing/generators'

describe('NotificationList', () => {
  it('Feature: notifications-page, Property 7: Date Grouping', () => {
    fc.assert(
      fc.property(
        fc.array(notificationGenerator(), { minLength: 1, maxLength: 100 }),
        (notifications) => {
          const { container } = render(
            <NotificationList 
              notifications={notifications}
              category="main"
              isLoading={false}
              error={null}
              onLoadMore={() => {}}
              hasMore={false}
            />
          )
          
          // Verify notifications are grouped by date
          // Verify groups are in chronological order
          // Verify each notification appears in correct group
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

**Generators**:

```typescript
// Notification generator for property tests
export const notificationGenerator = (): fc.Arbitrary<Notification> => {
  return fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    category: fc.constantFrom('main', 'content'),
    type: fc.constantFrom(
      'trainer_feedback',
      'achievement',
      'reminder',
      'system_update',
      'new_feature',
      'general'
    ),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    content: fc.string({ minLength: 10, maxLength: 500 }),
    iconUrl: fc.option(fc.webUrl(), { nil: undefined }),
    createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date() }).map(d => d.toISOString()),
    readAt: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined })
  })
}
```

### Unit Testing

**Framework**: Jest with React Testing Library

**Coverage Areas**:
- Component rendering with specific props
- User interactions (clicks, keyboard navigation)
- Error states and empty states
- Responsive design breakpoints
- Accessibility attributes
- API integration with MSW mocks

**Example Unit Test**:

```typescript
describe('NotificationItem', () => {
  it('displays trainer icon for trainer_feedback type', () => {
    const notification: Notification = {
      id: '123',
      userId: 'user-1',
      category: 'main',
      type: 'trainer_feedback',
      title: 'New feedback',
      content: 'Your trainer left feedback',
      createdAt: new Date().toISOString()
    }
    
    render(<NotificationItem notification={notification} onMarkAsRead={() => {}} />)
    
    expect(screen.getByRole('img', { name: /trainer/i })).toBeInTheDocument()
  })
  
  it('shows loading indicator while fetching', () => {
    render(
      <NotificationList
        category="main"
        notifications={[]}
        isLoading={true}
        error={null}
        onLoadMore={() => {}}
        hasMore={false}
      />
    )
    
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })
})
```

### Backend Testing

**Framework**: Go testing package with testify

**Coverage Areas**:
- Handler input validation
- Service layer business logic
- Database queries and transactions
- Authentication and authorization
- Error handling and edge cases

**Example Backend Test**:

```go
func TestGetNotifications(t *testing.T) {
    // Table-driven test
    tests := []struct {
        name           string
        userID         string
        category       string
        limit          int
        offset         int
        expectedCount  int
        expectedError  error
    }{
        {
            name:          "fetch main notifications",
            userID:        "user-1",
            category:      "main",
            limit:         50,
            offset:        0,
            expectedCount: 10,
            expectedError: nil,
        },
        // More test cases...
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation
        })
    }
}
```

### Integration Testing

**Framework**: Playwright for E2E tests

**Coverage Areas**:
- Complete user flows (login → view notifications → mark as read)
- Real-time polling behavior
- Cross-browser compatibility
- Mobile responsive behavior
- Accessibility with screen readers

### Test Coverage Goals

- **Frontend**: Minimum 80% code coverage
- **Backend**: Minimum 85% code coverage
- **Property tests**: All 20 correctness properties implemented
- **E2E tests**: Critical user paths covered

### Continuous Integration

- Run all tests on pull requests
- Block merges on test failures
- Generate coverage reports
- Run accessibility audits (axe-core)
- Performance budgets for page load
