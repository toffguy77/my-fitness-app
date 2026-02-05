# Implementation Plan: Notifications Page

## Overview

This implementation plan breaks down the notifications page feature into discrete, incremental coding tasks. The approach follows a bottom-up strategy: building core data models and utilities first, then components, then integration, and finally testing. Each task builds on previous work to ensure no orphaned code.

## Tasks

- [x] 1. Set up notifications feature structure and types
  - Create feature directory structure at `apps/web/src/features/notifications/`
  - Create subdirectories: `components/`, `hooks/`, `store/`, `types/`, `utils/`, `testing/`
  - Define TypeScript types in `types/index.ts` (Notification, NotificationCategory, NotificationType, NotificationGroup, UnreadCounts)
  - Create barrel export in `features/notifications/index.ts`
  - _Requirements: 1.1, 2.1, 2.2, 8.1-8.5_

- [x] 2. Implement backend database schema and migrations
  - Create migration file for `notifications` table with all required columns
  - Add indexes: `idx_notifications_user_category` and `idx_notifications_user_unread`
  - Define Go types in `apps/api/internal/modules/notifications/types.go`
  - Include validation for category and type enums
  - _Requirements: 3.5, 10.3_

- [x] 3. Implement backend service layer
  - [x] 3.1 Create notifications service in `apps/api/internal/modules/notifications/service.go`
    - Implement `GetNotifications()` with pagination and filtering
    - Implement `MarkAsRead()` for single notification
    - Implement `MarkAllAsRead()` for category
    - Implement `GetUnreadCounts()` for both categories
    - Implement `CreateNotification()` for testing/admin use
    - Use parameterized queries for all database operations
    - _Requirements: 3.5, 4.2, 10.3_
  
  - [x] 3.2 Write property test for GetNotifications pagination
    - **Property 12: Pagination Limit**
    - **Validates: Requirements 4.2**
  
  - [x] 3.3 Write unit tests for service layer
    - Test GetNotifications with various filters
    - Test MarkAsRead with valid/invalid IDs
    - Test GetUnreadCounts accuracy
    - Test user isolation (can't access other users' notifications)
    - _Requirements: 3.5, 4.2, 10.3_

- [x] 4. Implement backend API handlers
  - [x] 4.1 Create handlers in `apps/api/internal/modules/notifications/handler.go`
    - Implement GET `/api/notifications` handler with query validation
    - Implement POST `/api/notifications/:id/read` handler
    - Implement GET `/api/notifications/unread-counts` handler
    - Implement POST `/api/notifications/mark-all-read` handler
    - Add authentication middleware to all routes
    - Use structured error responses
    - _Requirements: 4.2, 4.5, 10.1, 10.4_
  
  - [x] 4.2 Write property test for authentication verification
    - **Property 20: Authentication Verification**
    - **Validates: Requirements 10.1, 10.3, 10.4**
  
  - [x] 4.3 Write unit tests for handlers
    - Test request validation (invalid category, limits)
    - Test authentication failures (401 responses)
    - Test authorization (can't mark others' notifications as read)
    - Test error responses format
    - _Requirements: 4.5, 10.1, 10.2_

- [x] 5. Checkpoint - Backend complete
  - Run all backend tests and ensure they pass
  - Test API endpoints manually with curl or Postman
  - Verify database schema is correct
  - Ask the user if questions arise

- [-] 6. Implement
    - [x] 6.1 Create store in `apps/web/src/features/notifications/store/notificationsStore.ts`
    - Define state interface (notifications map, unreadCounts, isLoading, error, hasMore)
    - Implement `fetchNotifications()` with pagination
    - Implement `markAsRead()` with optimistic updates
    - Implement `markAllAsRead()` with optimistic updates
    - Implement `pollForUpdates()` for real-time updates
    - Implement `startPolling()` and `stopPolling()` lifecycle methods
    - Add error handling with rollback for failed optimistic updates
    - _Requirements: 3.1, 3.2, 3.5, 4.2, 5.2, 5.3_
  
  - [x] 6.2 Write property test for optimistic updates rollback
    - **Property 8: Click Marks as Read**
    - **Validates: Requirements 3.1, 3.5**
  
  - [x] 6.3 Write unit tests for store
    - Test fetchNotifications success and error cases
    - Test optimistic update and rollback
    - Test polling start/stop lifecycle
    - Test state updates on new notifications
    - _Requirements: 3.1, 3.5, 5.2_

- [x] 7. Implement utility functions
  - [x] 7.1 Create date grouping utility in `apps/web/src/features/notifications/utils/dateGrouping.ts`
    - Implement `groupNotificationsByDate()` function
    - Handle "Today", "Yesterday", "Last Week", and specific dates
    - Sort groups chronologically (newest first)
    - _Requirements: 2.6_
  
  - [x] 7.2 Create timestamp formatting utility in `apps/web/src/features/notifications/utils/formatTimestamp.ts`
    - Implement `formatRelativeTime()` function
    - Handle "just now", "X minutes ago", "X hours ago", "Yesterday", etc.
    - Use Intl.RelativeTimeFormat for internationalization
    - _Requirements: 2.1_
  
  - [x] 7.3 Create icon mapping utility in `apps/web/src/features/notifications/utils/iconMapping.ts`
    - Implement `getNotificationIcon()` function
    - Map notification types to Lucide React icons
    - Provide fallback icon for unknown types
    - _Requirements: 2.2, 8.1-8.5_
  
  - [x] 7.4 Write property test for date grouping
    - **Property 7: Date Grouping**
    - **Validates: Requirements 2.6**
  
  - [x] 7.5 Write property test for timestamp formatting
    - **Property 3: Timestamp Formatting**
    - **Validates: Requirements 2.1**
  
  - [x] 7.6 Write property test for icon mapping
    - **Property 4: Notification Type Icon Mapping**
    - **Validates: Requirements 2.2, 8.1-8.5**

- [x] 8. Implement base notification components
  - [x] 8.1 Create NotificationIcon component in `apps/web/src/features/notifications/components/NotificationIcon.tsx`
    - Accept type and optional iconUrl props
    - Render appropriate Lucide icon based on type
    - Support custom image URLs
    - Apply consistent sizing and styling
    - _Requirements: 2.2, 8.1-8.5_
  
  - [x] 8.2 Create NotificationItem component in `apps/web/src/features/notifications/components/NotificationItem.tsx`
    - Display icon, title, content preview, and timestamp
    - Apply read/unread styling based on read status
    - Handle click to mark as read
    - Support keyboard interaction (Enter/Space)
    - Add ARIA attributes for accessibility
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 6.4, 6.5_
  
  - [x] 8.3 Write property test for read status styling
    - **Property 6: Read Status Styling**
    - **Validates: Requirements 2.4, 2.5**
  
  - [x] 8.4 Write unit tests for NotificationItem
    - Test rendering with read/unread notifications
    - Test click handler invocation
    - Test keyboard interaction (Enter key)
    - Test ARIA attributes presence
    - Test icon rendering for different types
    - _Requirements: 2.1-2.5, 3.1, 6.4, 6.5_

- [x] 9. Implement NotificationList component
  - [x] 9.1 Create NotificationList component in `apps/web/src/features/notifications/components/NotificationList.tsx`
    - Accept notifications array, loading state, error state
    - Implement date grouping using utility function
    - Render NotificationItem components
    - Display loading indicator while fetching
    - Display error message with retry button on failure
    - Display empty state when no notifications
    - Implement infinite scroll with intersection observer
    - Add virtual scrolling for lists > 100 items (use react-window)
    - _Requirements: 2.6, 4.3, 4.4, 4.5, 7.1_
  
  - [x] 9.2 Write property test for empty state display
    - **Property 18: Empty State Display**
    - **Validates: Requirements 7.1**
  
  - [x] 9.3 Write property test for infinite scroll
    - **Property 13: Infinite Scroll Loading**
    - **Validates: Requirements 4.3**
  
  - [x] 9.4 Write unit tests for NotificationList
    - Test loading state rendering
    - Test error state with retry button
    - Test empty state rendering
    - Test date grouping display
    - Test infinite scroll trigger
    - _Requirements: 4.3, 4.4, 4.5, 7.1_

- [x] 10. Implement NotificationsTabs component
  - [x] 10.1 Create NotificationsTabs component in `apps/web/src/features/notifications/components/NotificationsTabs.tsx`
    - Render two tabs: "Основные" and "Контент"
    - Display unread badge on tabs when count > 0
    - Handle tab switching with keyboard support
    - Apply active tab styling
    - Add ARIA attributes (role="tablist", aria-selected)
    - _Requirements: 1.1, 1.2, 1.3, 6.4, 6.5_
  
  - [x] 10.2 Write property test for tab switching
    - **Property 1: Tab Switching Displays Correct Notifications**
    - **Validates: Requirements 1.2**
  
  - [x] 10.3 Write property test for badge visibility
    - **Property 2: Unread Badge Visibility**
    - **Validates: Requirements 1.3**
  
  - [x] 10.4 Write unit tests for NotificationsTabs
    - Test tab rendering with correct labels
    - Test badge display when unread count > 0
    - Test badge hidden when unread count = 0
    - Test tab switching callback
    - Test keyboard navigation (Arrow keys)
    - Test ARIA attributes
    - _Requirements: 1.1, 1.2, 1.3, 6.4, 6.5_

- [x] 11. Implement custom hooks
  - [x] 11.1 Create useNotifications hook in `apps/web/src/features/notifications/hooks/useNotifications.ts`
    - Connect to Zustand store
    - Return notifications, unreadCount, loading, error, hasMore
    - Provide fetchMore, markAsRead, refresh functions
    - Handle initial data fetching on mount
    - _Requirements: 3.1, 4.2, 4.3_
  
  - [x] 11.2 Create useNotificationPolling hook in `apps/web/src/features/notifications/hooks/useNotificationPolling.ts`
    - Start polling on mount with 30-second interval
    - Stop polling on unmount
    - Accept enabled flag to control polling
    - Call store's pollForUpdates method
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 11.3 Create useAutoMarkAsRead hook in `apps/web/src/features/notifications/hooks/useAutoMarkAsRead.ts`
    - Accept notifications array and category
    - Mark visible unread notifications as read after 2-second delay
    - Use intersection observer to detect visibility
    - Debounce mark as read calls
    - _Requirements: 3.4_
  
  - [x] 11.4 Write property test for auto-mark as read
    - **Property 11: Auto-Mark Visible Notifications**
    - **Validates: Requirements 3.4**
  
  - [x] 11.5 Write unit tests for hooks
    - Test useNotifications data fetching
    - Test useNotificationPolling lifecycle
    - Test useAutoMarkAsRead timing and visibility detection
    - _Requirements: 3.1, 3.4, 5.4_

- [x] 12. Implement main notifications page layout
  - [x] 12.1 Create NotificationsLayout component in `apps/web/src/features/notifications/components/NotificationsLayout.tsx`
    - Render page header with title "Уведомления"
    - Add settings icon button (placeholder for future)
    - Apply responsive layout (mobile/tablet/desktop)
    - Use design tokens for spacing and colors
    - _Requirements: 1.1, 1.4, 6.1, 6.2, 6.3_
  
  - [x] 12.2 Create main page component in `apps/web/src/features/notifications/components/NotificationsPage.tsx`
    - Integrate NotificationsLayout, NotificationsTabs, NotificationList
    - Manage active tab state
    - Connect to useNotifications hook for both categories
    - Connect to useNotificationPolling hook
    - Connect to useAutoMarkAsRead hook
    - Handle tab switching logic
    - _Requirements: 1.1, 1.2, 1.5, 5.4_
  
  - [x] 12.3 Write unit tests for NotificationsPage integration
    - Test initial render with default tab
    - Test tab switching updates displayed notifications
    - Test polling starts on mount
    - Test auto-mark as read triggers after delay
    - _Requirements: 1.2, 1.5, 3.4, 5.4_

- [x] 13. Create Next.js App Router page
  - [x] 13.1 Create page at `apps/web/src/app/notifications/page.tsx`
    - Implement server component with authentication check
    - Redirect to login if not authenticated
    - Set page metadata (title, description)
    - Render NotificationsPage client component
    - _Requirements: 10.1, 10.2_
  
  - [x] 13.2 Create layout at `apps/web/src/app/notifications/layout.tsx` (if needed)
    - Apply consistent layout with main app
    - Add navigation breadcrumbs
    - _Requirements: 1.1_
  
  - [x] 13.3 Write unit test for authentication redirect
    - Test unauthenticated user redirects to login
    - Test authenticated user sees page
    - _Requirements: 10.1, 10.2_

- [x] 14. Implement responsive design and accessibility
  - [x] 14.1 Add responsive styles to all components
    - Mobile (< 768px): Single column, touch-friendly spacing
    - Tablet (768px - 1024px): Optimized spacing, larger touch targets
    - Desktop (>= 1024px): Optimal reading width, hover states
    - Use Tailwind responsive prefixes (sm:, md:, lg:)
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 14.2 Enhance accessibility features
    - Add focus-visible styles to all interactive elements
    - Verify ARIA labels on all components
    - Test keyboard navigation flow
    - Ensure 4.5:1 contrast ratio for all text
    - Add skip links if needed
    - _Requirements: 6.4, 6.5, 6.6, 6.7_
  
  - [x] 14.3 Write unit tests for responsive breakpoints
    - Test mobile layout rendering
    - Test tablet layout rendering
    - Test desktop layout rendering
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 14.4 Write property test for keyboard navigation
    - **Property 16: Keyboard Navigation Support**
    - **Validates: Requirements 6.4, 6.7**
  
  - [x] 14.5 Write property test for accessibility compliance
    - **Property 17: Accessibility Compliance**
    - **Validates: Requirements 6.5, 6.6**

- [x] 15. Implement error handling and offline support
  - [x] 15.1 Add comprehensive error handling to store
    - Handle network errors with user-friendly messages
    - Implement retry logic for transient failures
    - Add offline detection
    - Rollback optimistic updates on failure
    - _Requirements: 4.5, 7.2, 7.3, 7.4_
  
  - [x] 15.2 Implement offline caching
    - Cache notifications in localStorage
    - Load cached data when offline
    - Sync when connection restored
    - Show offline indicator in UI
    - _Requirements: 7.4, 7.5_
  
  - [x] 15.3 Write property test for offline caching
    - **Property 19: Offline Caching**
    - **Validates: Requirements 7.5**
  
  - [x] 15.4 Write unit tests for error handling
    - Test network error display
    - Test retry button functionality
    - Test offline indicator display
    - Test cached data loading
    - _Requirements: 4.5, 7.2, 7.3, 7.4, 7.5_

- [x] 16. Implement property test generators
  - [x] 16.1 Create test generators in `apps/web/src/features/notifications/testing/generators.ts`
    - Implement `notificationGenerator()` using fast-check
    - Implement `notificationArrayGenerator()` with configurable size
    - Implement `unreadCountsGenerator()`
    - Implement `timestampGenerator()` with various date ranges
    - _Requirements: All (testing infrastructure)_
  
  - [x] 16.2 Write remaining property tests
    - **Property 5: Preview Text Display** (Requirements 2.3)
    - **Property 9: Visual Update on Read Status Change** (Requirements 3.2)
    - **Property 10: Badge Removal When All Read** (Requirements 3.3)
    - **Property 14: New Notification Badge Update** (Requirements 5.2)
    - **Property 15: New Notification Prepending** (Requirements 5.3)


- [x] 17. Checkpoint - Frontend complete
  - Run all frontend tests and ensure they pass
  - Test all components in Storybook (if available)
  - Verify responsive design on different devices
  - Test keyboard navigation thoroughly
  - Run accessibility audit with axe-core
  - Ask the user if questions arise

- [x] 18. Integration and end-to-end testing
  - [x] 18.1 Set up MSW mocks for API endpoints
    - Mock GET `/api/notifications` with various responses
    - Mock POST `/api/notifications/:id/read`
    - Mock GET `/api/notifications/unread-counts`
    - Mock error scenarios (401, 404, 500)
    - _Requirements: All (testing infrastructure)_
  
  - [x] 18.2 Write integration tests
    - Test complete flow: load page → view notifications → mark as read
    - Test tab switching with real data
    - Test pagination with scrolling
    - Test polling updates
    - Test error recovery
    - _Requirements: 1.2, 3.1, 4.3, 5.2, 5.3_
  
  - [x] 18.3 Write E2E tests with Playwright
    - Test user login → navigate to notifications → interact
    - Test real-time updates across tabs
    - Test mobile responsive behavior
    - Test keyboard-only navigation
    - _Requirements: All (E2E validation)_

- [x] 19. Performance optimization
  - [x] 19.1 Implement virtual scrolling for large lists
    - Use react-window for lists > 100 items
    - Configure proper item heights
    - Test scroll performance
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 19.2 Add image caching and lazy loading
    - Implement lazy loading for notification icons
    - Cache images in browser
    - Add loading placeholders
    - _Requirements: 9.5_
  
  - [x] 19.3 Optimize bundle size
    - Code split notifications feature
    - Lazy load heavy dependencies
    - Analyze bundle with webpack-bundle-analyzer
    - _Requirements: 9.1_

- [x] 20. Final integration and polish
  - [x] 20.1 Wire up notifications page to main navigation
    - Add notifications link to main menu
    - Add notification bell icon with badge in header
    - Link bell icon to notifications page
    - _Requirements: 1.1_
  
  - [x] 20.2 Add toast notifications for user feedback
    - Show toast when marking as read fails
    - Show toast when going offline/online
    - Use react-hot-toast library
    - _Requirements: 4.5, 7.4_
  
  - [x] 20.3 Final polish and refinements
    - Review all animations and transitions
    - Verify design token usage
    - Check for console errors/warnings
    - Optimize loading states
    - _Requirements: All_

- [x] 21. Final checkpoint - Complete feature
  - Run full test suite (unit + property + integration + E2E)
  - Verify all 20 correctness properties are tested
  - Check test coverage meets goals (80% frontend, 85% backend)
  - Test on multiple browsers (Chrome, Firefox, Safari)
  - Test on multiple devices (mobile, tablet, desktop)
  - Run accessibility audit and fix any issues
  - Review code for security issues
  - Ask the user for final review and approval
  - Update steering documentation if needed

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples, edge cases, and error conditions
- Integration tests validate complete user flows
- The implementation follows bottom-up approach: data → logic → UI → integration
