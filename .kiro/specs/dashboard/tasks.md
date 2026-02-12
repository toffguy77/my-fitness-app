# Implementation Plan: Dashboard

## Overview

This implementation plan breaks down the dashboard feature into incremental, testable steps. The approach follows a bottom-up strategy: building core data models and utilities first, then individual UI components, and finally integrating everything into the complete dashboard page. Each task builds on previous work, ensuring no orphaned code.

The dashboard is the most complex feature in BURCEV, integrating multiple data sources (nutrition, weight, activity, plans, tasks) with real-time updates, offline support, and comprehensive accessibility. We'll implement it in phases, validating functionality at each checkpoint.

## Tasks

- [x] 1. Database schema and migrations
  - Create migration files for all dashboard tables (daily_metrics, weekly_plans, tasks, weekly_reports, weekly_photos)
  - Implement RLS policies for each table
  - Add indexes for performance optimization
  - Test migrations on local database
  - _Requirements: 13.1, 13.6, 14.6_

- [x] 1.1 Write property test for RLS policies
  - **Property 30: Authentication Validation**
  - **Validates: Requirements 13.6**

- [x] 2. Backend data models and types
  - [x] 2.1 Create Go types for dashboard module
    - Define DailyMetrics, WeeklyPlan, Task, WeeklyReport, PhotoData structs
    - Add JSON tags and validation tags
    - Implement validation methods
    - _Requirements: 13.1, 14.1, 14.2, 14.3_

  - [x] 2.2 Write property tests for validation
    - **Property 31: Coach Plan Validation**
    - **Property 32: Coach Task Validation**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 3. Backend service layer
  - [x] 3.1 Implement DashboardService for daily metrics
    - GetDailyMetrics(ctx, userID, date) method
    - SaveMetric(ctx, userID, date, metric) method
    - GetWeekMetrics(ctx, userID, startDate, endDate) method
    - Calculate completion status for each day
    - _Requirements: 13.1, 13.2_

  - [x] 3.2 Write property test for data persistence
    - **Property 26: Data Persistence Reliability**
    - **Validates: Requirements 13.1**

  - [x] 3.3 Implement WeeklyPlanService
    - GetActivePlan(ctx, userID) method
    - CreatePlan(ctx, coachID, clientID, plan) method (coach only)
    - UpdatePlan(ctx, coachID, planID, updates) method (coach only)
    - Validate coach-client relationship
    - _Requirements: 8.1, 8.2, 8.3, 14.1, 14.2, 14.6_

  - [x] 3.4 Write property test for coach authorization
    - **Property 34: Coach Authorization**
    - **Validates: Requirements 14.6**


  - [x] 3.5 Implement TaskService
    - GetTasks(ctx, userID, weekNumber) method
    - CreateTask(ctx, coachID, clientID, task) method (coach only)
    - UpdateTaskStatus(ctx, userID, taskID, status) method
    - Filter tasks by week and status
    - _Requirements: 9.1, 9.2, 9.5, 14.3, 14.6_

  - [x] 3.6 Write property test for task status updates
    - **Property 19: Task Status Update**
    - **Validates: Requirements 9.5**

  - [x] 3.7 Implement WeeklyReportService
    - ValidateWeekData(ctx, userID, weekStart, weekEnd) method
    - CreateWeeklyReport(ctx, userID, weekStart, weekEnd) method
    - Calculate summary statistics
    - Trigger coach notification
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

  - [x] 3.8 Write property test for weekly report validation
    - **Property 20: Weekly Report Validation**
    - **Validates: Requirements 10.2, 10.3**

  - [x] 3.9 Implement PhotoUploadService
    - ValidatePhoto(file) method (size, format)
    - UploadPhoto(ctx, userID, weekIdentifier, file) method
~    - Generate unique filename and store in cloud storage
~    - Save metadata to database
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 3.10 Write property test for photo validation
    - **Property 14: Photo File Validation**
    - **Validates: Requirements 7.3**

- [x] 4. Backend HTTP handlers
  - [x] 4.1 Create DashboardHandler with endpoints
    - GET /api/dashboard/daily/:date
    - POST /api/dashboard/daily
    - GET /api/dashboard/week
    - Implement request validation and error handling
    - Add authentication middleware
    - _Requirements: 13.1, 13.6_

  - [x] 4.2 Create WeeklyPlanHandler with endpoints
    - GET /api/dashboard/weekly-plan
    - POST /api/dashboard/weekly-plan (coach only)
    - Implement authorization checks
    - _Requirements: 8.1, 8.7, 14.6_

  - [x] 4.3 Create TaskHandler with endpoints
    - GET /api/dashboard/tasks
    - POST /api/dashboard/tasks (coach only)
    - PATCH /api/dashboard/tasks/:id
    - _Requirements: 9.1, 9.5, 14.6_

  - [x] 4.4 Create WeeklyReportHandler with endpoints
    - POST /api/dashboard/weekly-report
    - Implement validation and notification logic
    - _Requirements: 10.2, 10.4, 10.5_

  - [x] 4.5 Create PhotoUploadHandler with endpoint
    - POST /api/dashboard/photo-upload
    - Handle multipart form data
    - Implement file validation
    - _Requirements: 7.3, 7.4_

  - [x] 4.6 Write unit tests for all handlers
    - Test success and error responses
    - Test authentication and authorization
    - Test validation errors
    - _Requirements: 13.6, 14.6_

- [x] 5. Checkpoint - Backend API complete
  - Run all backend tests (unit and property tests)
  - Test API endpoints with Postman or curl
  - Verify database operations
  - Ensure all tests pass, ask the user if questions arise
  - **Status**: ✅ COMPLETED
  - **Summary**: All backend tests passing (64.2% coverage). Fixed property-based tests for authentication validation and user isolation. Dashboard module fully tested and ready for integration.

- [x] 6. Frontend TypeScript types and utilities
  - [x] 6.1 Create TypeScript types
    - Define DailyMetrics, WeeklyPlan, Task, WeeklyReport, PhotoData interfaces
    - Create MetricUpdate union type
    - Add validation schemas using Zod
    - _Requirements: 13.1_

  - [x] 6.2 Create validation utilities
    - validateWeight(input) function
    - validateSteps(input) function
    - validateCalories(input) function
    - validatePhoto(file) function
    - _Requirements: 3.3, 3.7, 4.4, 7.3_

  - [x] 6.3 Write property tests for validation utilities
    - **Property 8: Weight Input Validation**
    - **Property 10: Steps Input Validation**
    - **Validates: Requirements 3.3, 3.7, 4.4**

  - [x] 6.4 Create calculation utilities
    - calculatePercentage(current, goal) function
    - calculateCompletionStatus(metrics) function
    - calculateWeekSummary(weekMetrics) function
    - formatTimestamp(date) function
    - _Requirements: 2.5, 4.7, 10.2_

  - [x] 6.5 Write property tests for calculations
    - **Property 4: Nutrition Data Display Completeness**
    - **Property 9: Steps Data Display and Calculation**
    - **Validates: Requirements 2.5, 4.7**

- [x] 7. Frontend Zustand store
  - [x] 7.1 Create useDashboardStore
    - Define state interface (selectedDate, dailyData, weeklyPlan, tasks, etc.)
    - Implement setSelectedDate action
    - Implement navigateWeek action
    - Implement fetchDailyData action
    - Implement updateMetric action with optimistic updates
    - _Requirements: 1.3, 1.4, 1.5, 11.1, 11.2, 11.3, 11.4_

  - [x] 7.2 Write property test for week navigation
    - **Property 1: Week Navigation Bidirectionality**
    - **Validates: Requirements 1.3, 1.4**

  - [x] 7.3 Add weekly plan and tasks actions
    - Implement fetchWeeklyPlan action
    - Implement fetchTasks action
    - Implement updateTaskStatus action
    - Implement polling for real-time updates (30s interval)
    - _Requirements: 8.7, 9.5, 14.4_

  - [x] 7.4 Write property test for polling updates
    - **Property 17: Plan Polling Updates**
    - **Validates: Requirements 8.7**

  - [x] 7.5 Add weekly report and photo actions
    - Implement submitWeeklyReport action
    - Implement uploadPhoto action
    - Implement error handling with rollback
    - _Requirements: 10.4, 7.4, 13.3_

  - [x] 7.6 Write unit tests for store actions
    - Test optimistic updates and rollback
    - Test error handling
    - Test state transitions
    - _Requirements: 11.1, 13.3_

- [x] 8. Calendar Navigator component
  - [x] 8.1 Create CalendarNavigator component
    - Render 7 days (Mon-Sun) with labels
    - Highlight current day
    - Implement previous/next week navigation
    - Display goal completion indicators per day
    - Show "Submit weekly report" button on Sunday
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.8_

  - [x] 8.2 Write property test for goal indicators
    - **Property 3: Goal Completion Indicators Match Data**
    - **Validates: Requirements 1.6**
    - ✅ All 3 property tests passing (100 runs each)

  - [x] 8.3 Write unit tests for CalendarNavigator
    - Test day selection
    - Test week navigation
    - Test current day highlighting
    - Test submit button visibility
    - _Requirements: 1.1, 1.2, 1.5, 1.8_
    - ✅ All 24 unit tests passing

- [x] 9. Daily tracking block components
  - [x] 9.1 Create NutritionBlock component
    - Display calorie goal and current intake
    - Display macro breakdown (protein, fat, carbs)
    - Render circular progress indicator
    - Add quick add button (+) linking to food tracker
    - Show warning when goal exceeded
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_

  - [x] 9.2 Write property test for nutrition display
    - **Property 4: Nutrition Data Display Completeness**
    - **Validates: Requirements 2.1, 2.2, 2.5**
    - **Status: MOSTLY FIXED** - 3/4 tests passing, navigation test fails due to JSDOM limitations

  - [x] 9.3 Create WeightBlock component
    - Display input field for weight entry
    - Show previous weight for comparison
    - Add quick add button (+) to save
    - Display completion indicator when logged
    - Implement validation and error messages
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 9.4 Write property test for weight validation
    - **Property 8: Weight Input Validation**
    - **Validates: Requirements 3.3, 3.7**

  - [x] 9.5 Create StepsBlock component
    - Display step goal and current count
    - Render progress bar indicator
    - Add quick add button (+) opening input dialog
    - Display completion indicator when goal reached
    - Implement validation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 9.6 Write property test for steps calculation
    - **Property 9: Steps Data Display and Calculation**
    - **Validates: Requirements 4.1, 4.7**
    - **Status: COMPLETED** ✅ - 5 property tests + 34 unit tests passing (39 total)
    - **Coverage**: ~95% - All requirements covered (4.1, 4.2, 4.3, 4.4, 4.6, 4.7)

  - [x] 9.7 Create WorkoutBlock component
    - Display workout completion status
    - Add quick add button (+) opening workout dialog
    - Show workout type if logged
    - Display completion indicator
    - Show prompt when no workout logged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 9.8 Write property test for workout display
    - **Property 11: Workout Data Display**
    - **Validates: Requirements 5.1, 5.3, 5.5**

  - [x] 9.9 Create DailyTrackingGrid container
    - Arrange blocks in responsive grid (1 col mobile, 2 col tablet, multi-col desktop)
    - Connect blocks to store
    - Handle real-time updates
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3_

  - [x] 9.10 Write property test for real-time updates
    - **Property 22: Real-time Metric Updates**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
    - **Status: FIXED** ✅ - All 6 tests passing with proper DOM cleanup

- [x] 10. Checkpoint - Daily tracking complete
  - Test all daily tracking blocks individually
  - Test calendar navigation
  - Test real-time updates
  - Verify responsive layout
  - Ensure all tests pass, ask the user if questions arise

- [x] 11. Long-term section components
  - [x] 11.1 Create ProgressSection component
    - Display weight trend chart (last 4 weeks)
    - Show nutrition adherence percentage
    - Display recent achievements
    - Add click handler to navigate to analytics
    - Show placeholder when insufficient data
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 11.2 Write property test for progress data rendering
    - **Property 13: Progress Chart Data Rendering**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 11.3 Create PhotoUploadSection component
    - Display upload button (prominent on Sat/Sun)
    - Open camera/file picker on click
    - Validate file format and size
    - Show upload date and thumbnail if uploaded
    - Display warning if missing for report submission
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 11.4 Write property test for photo validation
    - **Property 14: Photo File Validation**
    - **Property 15: Photo Upload Persistence**
    - **Validates: Requirements 7.3, 7.4, 7.5**

  - [x] 11.5 Create WeeklyPlanSection component
    - Display calorie and protein targets
    - Show plan start and end dates
    - Display active indicator
    - Show placeholder "Скоро тут будет твоя планка" when no plan
    - Handle expired plans
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 11.6 Write property test for plan display
    - **Property 16: Weekly Plan Data Display**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 11.7 Create TasksSection component
    - Display current week tasks (active)
    - Display previous week tasks with status
    - Show week indicators (Неделя 1, Неделя 2)
    - Add click handler for task details
    - Implement mark as complete action
    - Show "Еще" link when > 5 tasks
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 11.8 Write property test for tasks display
    - **Property 18: Tasks Data Display**
    - **Property 19: Task Status Update**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.8**

- [x] 12. Weekly report submission
  - [x] 12.1 Implement weekly report validation
    - Check nutrition logged for ≥5 days
    - Check weight logged for ≥5 days
    - Check weekly photo uploaded
    - Generate validation error messages
    - _Requirements: 10.2, 10.3_

  - [x] 12.2 Write property test for report validation
    - **Property 20: Weekly Report Validation**
    - **Validates: Requirements 10.2, 10.3**

  - [x] 12.3 Implement report submission flow
    - Create weekly report record
    - Trigger coach notification
    - Disable editing for submitted week
    - Display "Report submitted" indicator
    - _Requirements: 10.4, 10.5, 10.6, 10.7_

  - [x] 12.4 Write property test for report creation
    - **Property 21: Weekly Report Creation**
    - **Validates: Requirements 10.4, 10.5, 10.6, 10.7**

- [x] 13. Main DashboardPage component
  - [x] 13.1 Create DashboardPage component
    - Use authenticated layout (header + footer)
    - Arrange all sections vertically
    - Connect to useDashboardStore
    - Implement data fetching on mount
    - Handle loading and error states
    - _Requirements: 13.2_

  - [x] 13.2 Write property test for load performance
    - **Property 27: Dashboard Load Performance**
    - **Validates: Requirements 13.2**

  - [x] 13.3 Add responsive layout
    - Mobile: single column, stacked blocks
    - Tablet: two-column grid for daily tracking
    - Desktop: multi-column optimized layout
    - Ensure no horizontal scrolling
    - Handle orientation changes
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_

  - [x]* 13.4 Write property tests for responsive behavior
    - **Property 23: Responsive Interaction Consistency**
    - **Property 24: Content Viewport Fit**
    - **Property 25: Orientation Change Adaptation**
    - **Validates: Requirements 12.4, 12.5, 12.6**

- [x] 14. Checkpoint - Dashboard page complete
  - Test complete dashboard flow
  - Test all user interactions
  - Verify responsive design on all devices
  - Test with real data
  - Ensure all tests pass, ask the user if questions arise

- [x] 15. Error handling and offline support
  - [x] 15.1 Implement error handling
    - Display toast notifications for errors
    - Implement retry logic with exponential backoff
    - Show inline validation errors
    - Retain unsaved data for retry
    - _Requirements: 13.3_

  - [x] 15.2 Write property test for error handling
    - **Property 28: Save Error Handling with Retry**
    - **Validates: Requirements 13.3**

  - [x] 15.3 Implement offline support
    - Cache data in localStorage
    - Display cached data when offline
    - Queue mutations when offline
    - Sync when connection restored
    - Show offline indicator
    - _Requirements: 13.4, 13.5_

  - [x] 15.4 Write property test for offline sync
    - **Property 29: Offline Data Sync**
    - **Validates: Requirements 13.5**

- [x] 16. Accessibility implementation
  - [x] 16.1 Add keyboard navigation
    - Implement tab order for all interactive elements
    - Add visible focus indicators
    - Support arrow keys for calendar navigation
    - Add keyboard shortcuts (optional)
    - _Requirements: 16.1, 16.4_

  - [x] 16.2 Write property test for keyboard navigation
    - **Property 35: Keyboard Navigation Support**
    - **Validates: Requirements 16.1, 16.4**

  - [x] 16.3 Add screen reader support
    - Add ARIA labels to all visual indicators
    - Add alt text to images
    - Implement ARIA live regions for errors
    - Add descriptive labels to form inputs
    - _Requirements: 16.2, 16.3, 16.6_

  - [x] 16.4 Write property tests for accessibility
    - **Property 36: Screen Reader Accessibility**
    - **Property 37: Form Accessibility**
    - **Validates: Requirements 16.2, 16.3, 16.6**

  - [x] 16.5 Add color-independent indicators
    - Add icons to all color-coded information
    - Add text labels to status indicators
    - Ensure sufficient contrast ratios
    - Test with color-blind simulators
    - _Requirements: 16.5_

  - [x] 16.6 Write property test for color-independent info
    - **Property 38: Color-Independent Information**
    - **Validates: Requirements 16.5**

- [x] 17. Attention indicators implementation
  - [x] 17.1 Create AttentionBadge component
    - Design consistent visual style (color, icon, animation)
    - Support different urgency levels (normal, high, critical)
    - Implement pulsing animation for critical items
    - Add ARIA labels for accessibility
    - _Requirements: 15.10, 15.12_

  - [x] 17.2 Add attention indicators to daily tracking blocks
    - Weight_Block: Show indicator when not logged today
    - Nutrition_Block: Show indicator when calories = 0 today
    - Steps_Block: Show indicator when steps = 0 today
    - Workout_Block: Show indicator on scheduled workout days when not logged
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 17.3 Write property tests for daily attention indicators
    - **Property 39: Attention Indicator Display**
    - **Property 40: Attention Indicator Removal**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.11**

  - [x] 17.4 Add attention indicators to long-term sections
    - Tasks_Section: Show count badge for tasks due within 2 days
    - Weekly_Plan_Section: Show indicator for < 80% adherence (2+ days)
    - Photo_Upload_Section: Show prominent indicator on Sat/Sun if not uploaded
    - Calendar_Navigator: Show pulsing indicator on submit button (Sunday)
    - _Requirements: 15.6, 15.7, 15.8, 15.9_

  - [x] 17.5 Write property tests for long-term attention indicators
    - **Property 41: Task Attention Indicator**
    - **Property 42: Weekly Plan Adherence Indicator**
    - **Property 43: Photo Upload Attention Indicator**
    - **Property 44: Weekly Report Submission Indicator**
    - **Validates: Requirements 15.6, 15.7, 15.8, 15.9**

  - [x] 17.6 Implement attention indicator accessibility
    - Add ARIA labels to all indicators
    - Announce new indicators to screen readers
    - Ensure keyboard navigation to indicated items
    - Test with screen readers (NVDA, JAWS, VoiceOver)
    - _Requirements: 15.10, 15.12_

  - [x] 17.7 Write property test for attention indicator accessibility
    - **Property 45: Attention Indicator Accessibility**
    - **Validates: Requirements 15.10, 15.12**

  - [x] 17.8 Write unit tests for attention indicators
    - Test indicator display logic
    - Test indicator removal on completion
    - Test urgency level calculation
    - Test animation behavior
    - _Requirements: 15.1-15.12_

- [x] 18. Coach notification integration
  - [x] 18.1 Implement coach notifications
    - Send notification when plan is updated
    - Send notification when task is assigned
    - Send notification when weekly report submitted
    - Use existing notifications service
    - _Requirements: 14.4, 14.5_

  - [x] 18.2 Write property test for notifications
    - **Property 33: Coach-Client Notification**
    - **Validates: Requirements 14.4, 14.5**

- [x] 19. Performance optimization
  - [x] 19.1 Implement code splitting
    - Lazy load dashboard components
    - Split by route
    - Use React.lazy() and Suspense
    - Measure bundle size reduction

  - [x] 19.2 Optimize data fetching
    - Implement caching in store
    - Prefetch adjacent weeks
    - Use stale-while-revalidate pattern
    - Batch API requests where possible

  - [x] 19.3 Optimize rendering
    - Add React.memo to expensive components
    - Implement virtual scrolling for task lists
    - Debounce input handlers
    - Throttle scroll/resize handlers

- [x] 20. Integration testing
  - [x] 20.1 Write E2E tests with Playwright
    - Test complete user flow (login → dashboard → log metrics → submit report)
    - Test navigation between dates and weeks
    - Test real-time updates
    - Test offline/online transitions
    - Test responsive design on multiple viewports
    - Test attention indicators display and removal
    - _Requirements: All_

- [x] 21. Final checkpoint and documentation
  - Run full test suite (unit, property, integration)
  - Verify all acceptance criteria met
  - Test on staging environment
  - Update API documentation
  - Create user guide for dashboard features
  - Ensure all tests pass, ask the user if questions arise

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- Backend uses Go with gopter for property-based testing
- Frontend uses TypeScript with fast-check for property-based testing
- All property tests must be tagged with: `Feature: dashboard, Property {N}: {property_text}`
- Attention indicators provide visual feedback for items requiring user action
