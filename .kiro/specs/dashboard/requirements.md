# Requirements Document: Dashboard

## Introduction

The Dashboard is the central hub of the BURCEV fitness tracking platform where users monitor daily progress, log key metrics (nutrition, weight, steps, workouts), view weekly plans from coaches, and track long-term progress. It serves as the primary interface for daily engagement and goal tracking.

## Glossary

- **Dashboard**: The main page displaying daily tracking, weekly plans, and progress overview
- **Daily_Tracker**: Component for logging daily metrics (nutrition, weight, steps, workouts)
- **Calendar_Navigator**: Week view component with day indicators and navigation
- **Nutrition_Block**: Component displaying daily calorie and macro tracking
- **Weight_Block**: Component for logging morning weight
- **Steps_Block**: Component for tracking daily step count
- **Workout_Block**: Component for logging workout completion
- **Progress_Section**: Component displaying trends and analytics preview
- **Photo_Upload_Section**: Component for weekly body form photo uploads
- **Weekly_Plan_Section**: Component displaying coach-assigned nutrition plan
- **Tasks_Section**: Component displaying coach-assigned tasks
- **Goal_Completion_Status**: Visual indicator showing if daily goals are met
- **Weekly_Report**: Summary submitted to coach at end of week
- **Coach**: Trainer or nutritionist who sets plans and assigns tasks
- **Client**: End user tracking their fitness and nutrition

## Requirements

### Requirement 1: Calendar Navigation

**User Story:** As a client, I want to navigate between days and weeks, so that I can view and log data for different dates.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Calendar_Navigator SHALL display the current week with days Monday through Sunday
2. WHEN the current day is displayed, THE Calendar_Navigator SHALL highlight it with a distinct visual indicator
3. WHEN a user clicks the previous week arrow, THE Calendar_Navigator SHALL navigate to the previous week and update all daily data displays
4. WHEN a user clicks the next week arrow, THE Calendar_Navigator SHALL navigate to the next week and update all daily data displays
5. WHEN a user clicks on a specific day, THE Dashboard SHALL update all daily tracking blocks to show data for that selected date
6. FOR ALL days in the Calendar_Navigator, THE System SHALL display goal completion indicators (nutrition filled, weight logged, physical activity completed)
7. WHEN all daily goals are met for a day, THE Calendar_Navigator SHALL display a green checkmark for that day
8. WHEN the week ends (Sunday), THE Calendar_Navigator SHALL display a "Submit weekly report" button

### Requirement 2: Nutrition Tracking Display

**User Story:** As a client, I want to see my daily calorie and macro intake, so that I can monitor my nutrition goals.

#### Acceptance Criteria

1. WHEN the Nutrition_Block loads, THE System SHALL display the daily calorie goal and current intake
2. WHEN the Nutrition_Block loads, THE System SHALL display the macronutrient breakdown (protein, fat, carbs) with current values and goals
3. WHEN calorie or macro data is updated, THE Nutrition_Block SHALL update the visual progress indicator in real-time
4. WHEN a user clicks the quick add button (+), THE System SHALL navigate to the food tracker for detailed entry
5. FOR ALL calorie intake values, THE System SHALL calculate and display the percentage of daily goal achieved
6. WHEN the daily calorie goal is exceeded, THE Nutrition_Block SHALL display a visual warning indicator

### Requirement 3: Weight Logging

**User Story:** As a client, I want to log my morning weight, so that I can track weight changes over time.

#### Acceptance Criteria

1. WHEN the Weight_Block loads, THE System SHALL display an input field for entering morning weight
2. WHEN the Weight_Block loads for a day with existing weight data, THE System SHALL display the logged weight value
3. WHEN a user enters a weight value, THE System SHALL validate it is a positive number with up to one decimal place
4. WHEN a user clicks the quick add button (+), THE System SHALL save the weight value and display a success confirmation
5. WHEN weight is logged for the current day, THE Weight_Block SHALL display a visual indicator showing completion
6. WHEN weight data exists for the previous day, THE Weight_Block SHALL display the previous weight for comparison
7. WHEN a user attempts to enter an invalid weight value (negative, non-numeric, or more than 500kg), THE System SHALL prevent submission and display an error message

### Requirement 4: Steps Tracking

**User Story:** As a client, I want to track my daily steps, so that I can meet my physical activity goals.

#### Acceptance Criteria

1. WHEN the Steps_Block loads, THE System SHALL display the daily step goal and current step count
2. WHEN the Steps_Block loads, THE System SHALL display a visual progress indicator (progress bar or circular indicator)
3. WHEN a user clicks the quick add button (+), THE System SHALL open an input dialog for entering step count
4. WHEN a user enters a step count, THE System SHALL validate it is a non-negative integer
5. WHEN step count is updated, THE Steps_Block SHALL update the progress indicator in real-time
6. WHEN the daily step goal is reached, THE Steps_Block SHALL display a completion indicator
7. FOR ALL step count values, THE System SHALL calculate and display the percentage of daily goal achieved

### Requirement 5: Workout Logging

**User Story:** As a client, I want to log my workouts, so that I can track my training consistency.

#### Acceptance Criteria

1. WHEN the Workout_Block loads, THE System SHALL display whether a workout was completed for the selected day
2. WHEN a user clicks the quick add button (+), THE System SHALL open a workout entry dialog
3. WHEN a user logs a workout, THE System SHALL save the workout type and completion status
4. WHEN a workout is logged for the current day, THE Workout_Block SHALL display a completion indicator
5. WHEN a workout exists for the selected day, THE Workout_Block SHALL display the workout type
6. WHEN no workout is logged, THE Workout_Block SHALL display a prompt to add a workout

### Requirement 6: Progress Visualization

**User Story:** As a client, I want to see my progress trends, so that I can understand my long-term achievements.

#### Acceptance Criteria

1. WHEN the Progress_Section loads, THE System SHALL display a preview chart showing weight trends over the last 4 weeks
2. WHEN the Progress_Section loads, THE System SHALL display nutrition adherence percentage for the last 4 weeks
3. WHEN the Progress_Section loads, THE System SHALL display recent achievement highlights
4. WHEN a user clicks the progress section, THE System SHALL navigate to the detailed analytics page
5. WHEN insufficient data exists for trends (less than 3 data points), THE Progress_Section SHALL display a placeholder message

### Requirement 7: Weekly Photo Upload

**User Story:** As a client, I want to upload weekly body form photos, so that I can visually track my physical progress.

#### Acceptance Criteria

1. WHEN the Photo_Upload_Section loads at the end of a week (Saturday or Sunday), THE System SHALL display a prominent upload button
2. WHEN a user clicks the camera icon button, THE System SHALL open the device camera or file picker
3. WHEN a user selects a photo, THE System SHALL validate the file is an image format (JPEG, PNG, WebP)
4. WHEN a photo is uploaded, THE System SHALL save it with the current week identifier and user ID
5. WHEN a photo was uploaded for the current week, THE Photo_Upload_Section SHALL display the upload date and a thumbnail preview
6. WHEN a user attempts to upload a file larger than 10MB, THE System SHALL reject it and display an error message
7. WHEN the weekly report is submitted without a photo, THE System SHALL display a warning prompt

### Requirement 8: Weekly Plan Display

**User Story:** As a client, I want to see my weekly nutrition plan, so that I know my daily targets set by my coach.

#### Acceptance Criteria

1. WHEN the Weekly_Plan_Section loads with an active plan, THE System SHALL display the daily calorie target
2. WHEN the Weekly_Plan_Section loads with an active plan, THE System SHALL display the daily protein target
3. WHEN the Weekly_Plan_Section loads with an active plan, THE System SHALL display the plan start and end dates
4. WHEN the Weekly_Plan_Section loads with an active plan, THE System SHALL display a visual indicator showing the plan is active
5. WHEN no active plan exists, THE Weekly_Plan_Section SHALL display a placeholder message "Скоро тут будет твоя планка"
6. WHEN a plan expires (end date is in the past), THE Weekly_Plan_Section SHALL display the placeholder message
7. WHEN a coach updates the plan, THE Weekly_Plan_Section SHALL refresh and display the updated targets within 30 seconds

### Requirement 9: Tasks Display

**User Story:** As a client, I want to see tasks assigned by my coach, so that I can complete them and track my progress.

#### Acceptance Criteria

1. WHEN the Tasks_Section loads, THE System SHALL display tasks for the current week with active status
2. WHEN the Tasks_Section loads, THE System SHALL display tasks from the previous week with completion status
3. WHEN the Tasks_Section loads, THE System SHALL display week indicators (Неделя 1, Неделя 2, etc.)
4. WHEN a user clicks on a task, THE System SHALL display the full task details
5. WHEN a user marks a task as complete, THE System SHALL update the task status and display a completion indicator
6. WHEN more than 5 tasks exist, THE Tasks_Section SHALL display a "Еще" (More) link
7. WHEN a user clicks the "Еще" link, THE System SHALL navigate to a full tasks history page
8. FOR ALL tasks, THE System SHALL display the task title, description, assigned date, and status

### Requirement 10: Weekly Report Submission

**User Story:** As a client, I want to submit a weekly report to my coach, so that they can review my progress and provide feedback.

#### Acceptance Criteria

1. WHEN the week ends (Sunday), THE System SHALL enable the "Submit weekly report" button
2. WHEN a user clicks "Submit weekly report", THE System SHALL validate all required data is logged (nutrition for 5+ days, weight for 5+ days, weekly photo)
3. WHEN required data is missing, THE System SHALL display a validation error listing missing items
4. WHEN all required data is present and the user confirms submission, THE System SHALL create a weekly report record
5. WHEN a weekly report is submitted, THE System SHALL notify the assigned coach
6. WHEN a weekly report is submitted, THE System SHALL disable further editing of that week's data
7. WHEN a weekly report is already submitted, THE System SHALL display a "Report submitted" indicator instead of the submit button

### Requirement 11: Real-time Data Updates

**User Story:** As a client, I want to see my data update immediately when I log metrics, so that I have accurate real-time feedback.

#### Acceptance Criteria

1. WHEN a user logs nutrition data, THE Nutrition_Block SHALL update within 500ms without requiring a page refresh
2. WHEN a user logs weight data, THE Weight_Block SHALL update within 500ms without requiring a page refresh
3. WHEN a user logs steps data, THE Steps_Block SHALL update within 500ms without requiring a page refresh
4. WHEN a user logs workout data, THE Workout_Block SHALL update within 500ms without requiring a page refresh
5. WHEN any daily goal is completed, THE Calendar_Navigator SHALL update the goal completion indicator within 500ms
6. WHEN all daily goals are completed, THE Calendar_Navigator SHALL display the green checkmark within 500ms

### Requirement 12: Responsive Design

**User Story:** As a client, I want to use the dashboard on any device, so that I can track my progress on mobile, tablet, or desktop.

#### Acceptance Criteria

1. WHEN the Dashboard loads on a mobile device (< 768px width), THE System SHALL display a single-column layout with stacked blocks
2. WHEN the Dashboard loads on a tablet device (768px - 1024px width), THE System SHALL display a two-column layout for daily tracking blocks
3. WHEN the Dashboard loads on a desktop device (> 1024px width), THE System SHALL display a multi-column layout optimizing screen space
4. FOR ALL device sizes, THE Calendar_Navigator SHALL remain fully functional with touch or click interactions
5. FOR ALL device sizes, THE System SHALL ensure text is readable without horizontal scrolling
6. WHEN the device orientation changes, THE Dashboard SHALL adapt the layout within 300ms

### Requirement 13: Data Persistence and Loading

**User Story:** As a client, I want my data to be saved reliably, so that I don't lose my tracking information.

#### Acceptance Criteria

1. WHEN a user logs any metric, THE System SHALL persist the data to the database immediately
2. WHEN the Dashboard loads, THE System SHALL fetch all data for the current week within 2 seconds
3. WHEN a database error occurs during save, THE System SHALL display an error message and retain the unsaved data for retry
4. WHEN the Dashboard loads with no internet connection, THE System SHALL display cached data if available
5. WHEN internet connection is restored, THE System SHALL sync any pending changes to the server
6. FOR ALL data operations, THE System SHALL validate user authentication and authorization before processing

### Requirement 14: Coach Integration

**User Story:** As a coach, I want to set weekly plans and assign tasks to clients, so that I can guide their fitness journey.

#### Acceptance Criteria

1. WHEN a coach creates a weekly plan, THE System SHALL validate the plan contains daily calorie and protein targets
2. WHEN a coach creates a weekly plan, THE System SHALL validate the plan has valid start and end dates
3. WHEN a coach assigns a task to a client, THE System SHALL validate the task contains a title, description, and due date
4. WHEN a coach updates a plan or task, THE System SHALL notify the client within 30 seconds
5. WHEN a client submits a weekly report, THE System SHALL notify the coach immediately
6. FOR ALL coach actions, THE System SHALL verify the coach has permission to manage the specific client

### Requirement 15: Attention Indicators

**User Story:** As a client, I want to see visual indicators for items that need my attention, so that I can prioritize my daily tracking activities.

#### Acceptance Criteria

1. WHEN a daily metric is not logged for the current day, THE corresponding block SHALL display a visual attention indicator (badge, highlight, or icon)
2. WHEN weight is not logged for the current day, THE Weight_Block SHALL display an attention indicator
3. WHEN nutrition is not logged for the current day (calories = 0), THE Nutrition_Block SHALL display an attention indicator
4. WHEN steps are not logged for the current day (steps = 0), THE Steps_Block SHALL display an attention indicator
5. WHEN a workout is not logged for the current day AND it's a scheduled workout day, THE Workout_Block SHALL display an attention indicator
6. WHEN tasks from the coach are incomplete and approaching due date (within 2 days), THE Tasks_Section SHALL display an attention indicator with count
7. WHEN a weekly plan is set by the coach AND daily goals are not being met (< 80% adherence for 2+ consecutive days), THE Weekly_Plan_Section SHALL display an attention indicator
8. WHEN it's the end of the week (Saturday or Sunday) AND the weekly photo is not uploaded, THE Photo_Upload_Section SHALL display a prominent attention indicator
9. WHEN it's Sunday AND the weekly report is not submitted, THE Calendar_Navigator SHALL display a pulsing attention indicator on the submit button
10. FOR ALL attention indicators, THE System SHALL use consistent visual styling (color, icon, animation) across all blocks
11. WHEN a user completes an action that resolves an attention indicator, THE indicator SHALL disappear within 500ms
12. FOR ALL attention indicators, THE System SHALL provide ARIA labels for screen reader accessibility

### Requirement 16: Accessibility

**User Story:** As a client with accessibility needs, I want to use the dashboard with assistive technologies, so that I can track my fitness independently.

#### Acceptance Criteria

1. FOR ALL interactive elements, THE System SHALL provide keyboard navigation support
2. FOR ALL visual indicators, THE System SHALL provide text alternatives for screen readers
3. FOR ALL form inputs, THE System SHALL provide clear labels and error messages
4. WHEN a user navigates with keyboard, THE System SHALL display visible focus indicators
5. FOR ALL color-coded information, THE System SHALL provide additional non-color indicators (icons, text)
6. WHEN errors occur, THE System SHALL announce them to screen readers using ARIA live regions
