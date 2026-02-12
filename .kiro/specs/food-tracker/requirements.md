# Requirements Document

## Introduction

This document specifies the requirements for the Food Tracker feature in the BURCEV fitness and nutrition tracking platform. The Food Tracker provides a comprehensive interface for users to log daily meals with detailed КБЖУ (calories, protein, fat, carbs) tracking, and monitor nutrient intake recommendations. The feature is accessible via the `/food-tracker` route and consists of two main tabs: Рацион (Diet) for meal logging and Рекомендации (Recommendations) for nutrient tracking.

## Glossary

- **Food_Tracker**: The main feature module providing meal logging and nutrient recommendation tracking
- **Diet_Tab**: The "Рацион" tab displaying daily meal entries and КБЖУ totals
- **Recommendations_Tab**: The "Рекомендации" tab displaying nutrient intake recommendations and progress
- **КБЖУ**: Russian abbreviation for Калории (Calories), Белки (Protein), Жиры (Fat), Углеводы (Carbs)
- **Meal_Slot**: One of four daily meal categories: Завтрак (Breakfast), Обед (Lunch), Ужин (Dinner), Перекус (Snack)
- **Food_Entry**: A single food item logged within a meal slot with portion and nutritional data
- **Portion_Type**: The measurement unit for food entries: grams, milliliters, or standard portion
- **Nutrient_Recommendation**: A daily or weekly target for a specific nutrient (vitamin, mineral, etc.)
- **Nutrient_Category**: Grouping of nutrients: Витамины (Vitamins), Минералы (Minerals), Липиды (Lipids), Клетчатка (Fiber), Растительность (Plant-based)
- **Food_Search**: Method to find food items by name from the catalog
- **Barcode_Scanner**: Method to identify food products by scanning barcode using OpenFoodFacts API
- **AI_Recognition**: Method to identify food from photos using AI service
- **Chat_Entry**: Method to log food via chat with curator assistance
- **Daily_Totals**: Accumulated КБЖУ values from all meals for a given day
- **Target_Goals**: User-defined daily targets for КБЖУ values
- **Water_Tracker**: Component for tracking daily water intake in glasses/milliliters
- **Meal_Template**: Saved meal configuration for quick reuse
- **Food_Database**: Collection of food items with nutritional data from multiple sources (internal DB, USDA, OpenFoodFacts, user-created)
- **Curator**: Human specialist who helps calculate КБЖУ for complex dishes

## Requirements

### Requirement 1: Food Tracker Page Structure

**User Story:** As a user, I want to access a dedicated food tracking page with organized tabs, so that I can easily log meals and monitor nutrient recommendations.

#### Acceptance Criteria

1. WHEN a user navigates to `/food-tracker`, THE Food_Tracker SHALL display a date picker showing the current date in format "Сегодня, [day] [month]"
2. WHEN a user navigates to `/food-tracker`, THE Food_Tracker SHALL display two tabs labeled "Рацион" and "Рекомендации"
3. WHEN the page loads, THE Food_Tracker SHALL default to displaying the "Рацион" tab
4. WHEN a user clicks on a tab, THE Food_Tracker SHALL display the corresponding content
5. WHEN a user clicks the date picker, THE Food_Tracker SHALL display a calendar dropdown for date selection
6. WHEN a user selects a different date, THE Food_Tracker SHALL update all displayed data for that date

### Requirement 2: Daily КБЖУ Summary Display

**User Story:** As a user, I want to see my daily КБЖУ totals and goals, so that I can track my nutrition progress throughout the day.

#### Acceptance Criteria

1. WHEN the Diet_Tab loads, THE Food_Tracker SHALL display a summary bar showing current intake for Белки (Protein), Жиры (Fat), Углеводы (Carbs), and Ккал (Calories)
2. WHEN Target_Goals are set, THE Food_Tracker SHALL display each value in format "current/target" (e.g., "0/100")
3. WHEN Target_Goals are not set for a nutrient, THE Food_Tracker SHALL display the value in format "current/-" (e.g., "0/-")
4. WHEN food entries are added or removed, THE Daily_Totals SHALL update immediately without page refresh
5. FOR ALL КБЖУ values, THE Food_Tracker SHALL calculate totals by summing all Food_Entry values for the selected date
6. WHEN daily intake exceeds the target goal, THE Food_Tracker SHALL display a visual indicator (color change or warning)

### Requirement 3: Meal Slot Display

**User Story:** As a user, I want to see organized meal slots for different times of day, so that I can log food in the appropriate category.

#### Acceptance Criteria

1. WHEN the Diet_Tab loads, THE Food_Tracker SHALL display four Meal_Slot cards: Завтрак, Обед, Ужин, Перекус
2. FOR EACH Meal_Slot, THE Food_Tracker SHALL display an appropriate icon representing the meal type
3. FOR EACH Meal_Slot, THE Food_Tracker SHALL display a "+" button to add food entries
4. WHEN a Meal_Slot contains Food_Entry items, THE Food_Tracker SHALL display them as a list within the card
5. FOR EACH Food_Entry in a Meal_Slot, THE Food_Tracker SHALL display the food name, portion size, and calorie count
6. WHEN a user clicks the "+" button on a Meal_Slot, THE Food_Tracker SHALL open the food entry modal

### Requirement 4: Food Entry Modal

**User Story:** As a user, I want multiple ways to add food entries, so that I can choose the most convenient method for my situation.

#### Acceptance Criteria

1. WHEN the food entry modal opens, THE Food_Tracker SHALL display four tabs: Поиск (Search), Штрих-код (Barcode), Фото еды (Food Photo), Чат (Chat)
2. WHEN the modal opens, THE Food_Tracker SHALL default to the "Поиск" tab
3. WHEN a user switches tabs, THE Food_Tracker SHALL display the corresponding entry method interface
4. WHEN a user selects a food item from any method, THE Food_Tracker SHALL display portion selection options
5. WHEN a user confirms a food entry, THE Food_Tracker SHALL add it to the selected Meal_Slot and close the modal
6. WHEN a user clicks outside the modal or presses Escape, THE Food_Tracker SHALL close the modal without saving

### Requirement 5: Food Search Entry Method

**User Story:** As a user, I want to search for food items by name, so that I can quickly find and log common foods.

#### Acceptance Criteria

1. WHEN the Search tab is active, THE Food_Tracker SHALL display a text input field with placeholder "Поиск блюд и продуктов"
2. WHEN a user types in the search field, THE Food_Tracker SHALL display matching results after 300ms debounce
3. WHEN search results are displayed, THE Food_Tracker SHALL show food name, portion size, and calorie count for each item
4. WHEN a user clicks on a search result, THE Food_Tracker SHALL select that food item for portion entry
5. WHEN no search results match the query, THE Food_Tracker SHALL display a message "Ничего не найдено"
6. WHEN the search field is empty, THE Food_Tracker SHALL display recent or popular food items

### Requirement 6: Barcode Scanner Entry Method

**User Story:** As a user, I want to scan product barcodes, so that I can quickly log packaged foods with accurate nutritional data.

#### Acceptance Criteria

1. WHEN the Barcode tab is active, THE Food_Tracker SHALL display a camera viewfinder for barcode scanning
2. WHEN a barcode is detected, THE Food_Tracker SHALL query the OpenFoodFacts API for product data
3. WHEN product data is found, THE Food_Tracker SHALL display the product name, image, and nutritional information
4. WHEN product data is found, THE Food_Tracker SHALL cache the result locally for future use
5. WHEN product data is not found in OpenFoodFacts, THE Food_Tracker SHALL display a message "Продукт не найден" with option to add manually
6. IF the camera is not available or permission denied, THEN THE Food_Tracker SHALL display an error message with instructions
7. WHEN a cached product is available for a scanned barcode, THE Food_Tracker SHALL use cached data instead of API call

### Requirement 7: AI Food Recognition Entry Method

**User Story:** As a user, I want to take a photo of my food and have it automatically identified, so that I can log meals quickly without manual search.

#### Acceptance Criteria

1. WHEN the Food Photo tab is active, THE Food_Tracker SHALL display a camera interface or file upload option
2. WHEN a user captures or uploads a food photo, THE Food_Tracker SHALL send it to the AI recognition service
3. WHEN AI recognition returns results, THE Food_Tracker SHALL display identified food items with confidence scores
4. WHEN multiple food items are identified, THE Food_Tracker SHALL allow the user to select which items to add
5. WHEN AI recognition fails or returns low confidence, THE Food_Tracker SHALL suggest manual search as fallback
6. WHILE AI recognition is processing, THE Food_Tracker SHALL display a loading indicator
7. IF the AI service is unavailable, THEN THE Food_Tracker SHALL display an error message and suggest alternative entry methods

### Requirement 8: Chat Entry Method

**User Story:** As a user, I want to send a food photo to a curator via chat, so that I can get help entering accurate nutritional information.

#### Acceptance Criteria

1. WHEN the Chat tab is active, THE Food_Tracker SHALL display a chat interface with photo upload capability
2. WHEN a user uploads a photo in chat, THE Food_Tracker SHALL send it to the curator for review
3. WHEN a curator responds with food entry suggestions, THE Food_Tracker SHALL display them in the chat
4. WHEN a user accepts a curator's suggestion, THE Food_Tracker SHALL add the food entry to the selected Meal_Slot
5. WHEN no curator is available, THE Food_Tracker SHALL display estimated response time
6. THE Food_Tracker SHALL persist chat history for the current session

### Requirement 9: Portion Selection

**User Story:** As a user, I want to specify portion sizes in different units, so that I can accurately log the amount of food I consumed.

#### Acceptance Criteria

1. WHEN a food item is selected, THE Food_Tracker SHALL display portion type options: Граммы (Grams), Миллилитры (Milliliters), Порция (Portion)
2. WHEN "Граммы" is selected, THE Food_Tracker SHALL display a numeric input for weight in grams
3. WHEN "Миллилитры" is selected, THE Food_Tracker SHALL display a numeric input for volume in milliliters
4. WHEN "Порция" is selected, THE Food_Tracker SHALL use the standard serving size defined for the food item
5. WHEN portion amount changes, THE Food_Tracker SHALL recalculate КБЖУ values proportionally from per-100g/100ml base values
6. WHEN a user enters an invalid portion value (negative, zero, or non-numeric), THE Food_Tracker SHALL display a validation error
7. FOR ALL portion inputs, THE Food_Tracker SHALL display the calculated КБЖУ values in real-time

### Requirement 10: Food Entry Management

**User Story:** As a user, I want to edit and delete food entries, so that I can correct mistakes in my food log.

#### Acceptance Criteria

1. WHEN a user clicks on an existing Food_Entry, THE Food_Tracker SHALL open an edit modal with current values
2. WHEN editing a Food_Entry, THE Food_Tracker SHALL allow changing portion type and amount
3. WHEN a user saves edits to a Food_Entry, THE Food_Tracker SHALL update the entry and recalculate Daily_Totals
4. WHEN a user clicks delete on a Food_Entry, THE Food_Tracker SHALL display a confirmation dialog
5. WHEN a user confirms deletion, THE Food_Tracker SHALL remove the entry and update Daily_Totals
6. WHEN a Food_Entry is modified or deleted, THE Food_Tracker SHALL persist changes to the database immediately

### Requirement 11: Recommendations Tab Structure

**User Story:** As a user, I want to see nutrient recommendations organized by category, so that I can understand what nutrients I should be tracking.

#### Acceptance Criteria

1. WHEN the Recommendations_Tab loads, THE Food_Tracker SHALL display nutrient categories: Витамины, Минералы, Липиды, Клетчатка, Растительность
2. FOR EACH Nutrient_Category, THE Food_Tracker SHALL display a collapsible section with category name
3. FOR EACH Nutrient_Recommendation in a category, THE Food_Tracker SHALL display the nutrient name and daily progress
4. FOR EACH Nutrient_Recommendation, THE Food_Tracker SHALL display progress in format "current / target unit" (e.g., "0 / 38 г")
5. WHEN a user clicks on a Nutrient_Recommendation, THE Food_Tracker SHALL navigate to the nutrient detail page
6. THE Food_Tracker SHALL display a "Настроить список" (Configure list) button to customize tracked nutrients

### Requirement 12: Nutrient Detail Page

**User Story:** As a user, I want to see detailed information about each nutrient, so that I can understand why it's important and how to get more of it.

#### Acceptance Criteria

1. WHEN a user navigates to a nutrient detail page, THE Food_Tracker SHALL display the nutrient name and current progress bar
2. WHEN displaying nutrient details, THE Food_Tracker SHALL show "Что это и зачем принимать" (What it is and why to take it) section
3. WHEN displaying nutrient details, THE Food_Tracker SHALL show "На что влияет и как" (What it affects and how) section
4. WHEN displaying nutrient details, THE Food_Tracker SHALL show "Источники в рационе" (Sources in diet) section with foods from current diet
5. WHEN displaying nutrient details, THE Food_Tracker SHALL show minimum and optimal recommendation values
6. WHEN the user has logged foods containing this nutrient, THE Food_Tracker SHALL display them in the sources section
7. WHEN a user clicks back, THE Food_Tracker SHALL return to the Recommendations_Tab

### Requirement 13: Nutrient List Configuration

**User Story:** As a user, I want to customize which nutrients I track, so that I can focus on the ones most relevant to my health goals.

#### Acceptance Criteria

1. WHEN a user clicks "Настроить список", THE Food_Tracker SHALL display a configuration modal
2. WHEN the configuration modal opens, THE Food_Tracker SHALL display all available nutrients grouped by category
3. FOR EACH nutrient in the configuration modal, THE Food_Tracker SHALL display a checkbox indicating tracking status
4. WHEN a user toggles a nutrient checkbox, THE Food_Tracker SHALL update the tracking status immediately
5. THE Food_Tracker SHALL provide "Выбрать все" (Select all) and "Снять выбор" (Deselect all) options per category
6. WHEN a user closes the configuration modal, THE Food_Tracker SHALL save preferences and update the Recommendations_Tab display
7. THE Food_Tracker SHALL persist nutrient tracking preferences to the user's profile

### Requirement 14: Custom Recommendations

**User Story:** As a user, I want to add custom nutrient recommendations, so that I can track specific supplements or nutrients not in the default list.

#### Acceptance Criteria

1. WHEN viewing the Recommendations_Tab, THE Food_Tracker SHALL display an "Добавить рекомендацию" (Add recommendation) button
2. WHEN a user clicks add recommendation, THE Food_Tracker SHALL display a form for custom nutrient entry
3. WHEN adding a custom recommendation, THE Food_Tracker SHALL require nutrient name and daily target value
4. WHEN adding a custom recommendation, THE Food_Tracker SHALL allow selecting a unit (г, мг, мкг, МЕ)
5. WHEN a custom recommendation is saved, THE Food_Tracker SHALL display it in a "Пользовательские" (Custom) category
6. WHEN a user edits a custom recommendation, THE Food_Tracker SHALL allow modifying name, target, and unit
7. WHEN a user deletes a custom recommendation, THE Food_Tracker SHALL remove it after confirmation

### Requirement 15: Weekly Recommendations

**User Story:** As a user, I want to see weekly nutrient recommendations, so that I can track nutrients that are better measured over longer periods.

#### Acceptance Criteria

1. WHEN the Recommendations_Tab loads, THE Food_Tracker SHALL display a "Недельные рекомендации" (Weekly recommendations) section
2. FOR EACH weekly recommendation, THE Food_Tracker SHALL display progress accumulated over the current week
3. WHEN displaying weekly progress, THE Food_Tracker SHALL show "current / target" format with weekly totals
4. WHEN a new week starts (Monday), THE Food_Tracker SHALL reset weekly recommendation progress to zero
5. WHEN a user clicks on a weekly recommendation, THE Food_Tracker SHALL navigate to the nutrient detail page with weekly view

### Requirement 16: Data Persistence and Synchronization

**User Story:** As a user, I want my food entries and preferences to be saved reliably, so that I don't lose my tracking data.

#### Acceptance Criteria

1. WHEN a user creates a Food_Entry, THE Food_Tracker SHALL persist it to the database immediately
2. WHEN a user modifies a Food_Entry, THE Food_Tracker SHALL update the database within 500ms
3. WHEN the page loads, THE Food_Tracker SHALL fetch all data for the selected date within 2 seconds
4. WHEN a database error occurs, THE Food_Tracker SHALL display an error message in Russian and retain unsaved data for retry
5. WHEN the user is offline, THE Food_Tracker SHALL cache entries locally and sync when connection is restored
6. FOR ALL data operations, THE Food_Tracker SHALL validate user authentication before processing

### Requirement 17: Responsive Design

**User Story:** As a user, I want to use the food tracker on any device, so that I can log meals whether I'm at home or on the go.

#### Acceptance Criteria

1. WHEN the Food_Tracker loads on mobile (< 768px), THE System SHALL display a single-column layout with stacked components
2. WHEN the Food_Tracker loads on tablet (768px - 1024px), THE System SHALL display an optimized two-column layout
3. WHEN the Food_Tracker loads on desktop (> 1024px), THE System SHALL display a multi-column layout maximizing screen space
4. FOR ALL device sizes, THE date picker and tab switcher SHALL remain fully functional
5. FOR ALL device sizes, THE food entry modal SHALL be usable without horizontal scrolling
6. WHEN device orientation changes, THE Food_Tracker SHALL adapt layout within 300ms

### Requirement 18: Accessibility

**User Story:** As a user with accessibility needs, I want to use the food tracker with assistive technologies, so that I can track my nutrition independently.

#### Acceptance Criteria

1. FOR ALL interactive elements, THE Food_Tracker SHALL provide keyboard navigation support
2. FOR ALL form inputs, THE Food_Tracker SHALL provide clear labels in Russian and error messages
3. FOR ALL visual indicators (progress bars, badges), THE Food_Tracker SHALL provide text alternatives for screen readers
4. WHEN a user navigates with keyboard, THE Food_Tracker SHALL display visible focus indicators
5. FOR ALL color-coded information, THE Food_Tracker SHALL provide additional non-color indicators
6. WHEN errors occur, THE Food_Tracker SHALL announce them using ARIA live regions
7. THE Food_Tracker SHALL maintain minimum 4.5:1 contrast ratio for all text elements

### Requirement 19: OpenFoodFacts API Integration

**User Story:** As a user, I want barcode scanning to retrieve accurate product data, so that I can trust the nutritional information I'm logging.

#### Acceptance Criteria

1. WHEN querying OpenFoodFacts API, THE Food_Tracker SHALL use the product barcode as the lookup key
2. WHEN API returns product data, THE Food_Tracker SHALL extract and display: product name, brand, serving size, and КБЖУ per 100g
3. WHEN API returns incomplete data (missing КБЖУ values), THE Food_Tracker SHALL display available data and mark missing fields
4. WHEN API request fails due to network error, THE Food_Tracker SHALL display an error message and offer retry option
5. WHEN API rate limit is exceeded, THE Food_Tracker SHALL queue requests and retry with exponential backoff
6. THE Food_Tracker SHALL cache successful API responses for 30 days to reduce API calls
7. WHEN cached data exists for a barcode, THE Food_Tracker SHALL use cached data and skip API call

### Requirement 20: Performance and Loading States

**User Story:** As a user, I want the food tracker to load quickly and provide feedback during operations, so that I have a smooth experience.

#### Acceptance Criteria

1. WHEN the Food_Tracker page loads, THE System SHALL display initial content within 1 second
2. WHILE data is being fetched, THE Food_Tracker SHALL display appropriate loading indicators
3. WHEN search results are loading, THE Food_Tracker SHALL display a loading spinner in the results area
4. WHEN AI recognition is processing, THE Food_Tracker SHALL display progress feedback
5. WHEN barcode scanning is active, THE Food_Tracker SHALL display camera feed without significant lag
6. FOR ALL user actions (add, edit, delete), THE Food_Tracker SHALL provide immediate visual feedback
7. THE Food_Tracker SHALL implement virtual scrolling for food lists exceeding 50 items

### Requirement 21: Water Tracking

**User Story:** As a user, I want to track my daily water intake, so that I can ensure I stay properly hydrated.

#### Acceptance Criteria

1. WHEN the Diet_Tab loads, THE Food_Tracker SHALL display a water tracking widget showing current intake vs goal
2. WHEN a user clicks the water widget, THE Food_Tracker SHALL add one standard glass (250ml) to the daily total
3. WHEN displaying water intake, THE Food_Tracker SHALL show format "X / Y стаканов" (e.g., "6 / 8 стаканов")
4. THE Food_Tracker SHALL allow users to configure their daily water goal in settings
5. THE Food_Tracker SHALL allow users to configure the standard glass size (default 250ml)
6. WHEN the daily water goal is reached, THE Food_Tracker SHALL display a completion indicator
7. THE Food_Tracker SHALL send optional reminders to drink water throughout the day

### Requirement 22: Meal Templates and Copying

**User Story:** As a user, I want to save and reuse common meals, so that I can quickly log repetitive eating patterns.

#### Acceptance Criteria

1. WHEN viewing a Meal_Slot with entries, THE Food_Tracker SHALL display a "Сохранить как шаблон" (Save as template) option
2. WHEN saving a Meal_Template, THE Food_Tracker SHALL require a name and save all food entries with portions
3. WHEN adding food to a Meal_Slot, THE Food_Tracker SHALL display saved templates as a quick-add option
4. WHEN a user selects a Meal_Template, THE Food_Tracker SHALL add all template entries to the current meal slot
5. THE Food_Tracker SHALL allow users to edit and delete saved Meal_Templates
6. WHEN viewing a previous day, THE Food_Tracker SHALL offer to copy meals to the current day
7. THE Food_Tracker SHALL display recently used meals for quick re-logging

### Requirement 23: Manual Food Entry

**User Story:** As a user, I want to manually enter food items not in the database, so that I can track custom or homemade dishes.

#### Acceptance Criteria

1. WHEN no search results match a query, THE Food_Tracker SHALL display an "Ввести вручную" (Enter manually) option
2. WHEN entering food manually, THE Food_Tracker SHALL require: name, calories per 100g, and portion size
3. WHEN entering food manually, THE Food_Tracker SHALL optionally accept: protein, fat, carbs per 100g
4. WHEN a user saves a manual entry, THE Food_Tracker SHALL store it in the user's personal food database
5. WHEN a user creates a manual entry, THE Food_Tracker SHALL offer to share it with the community (moderated)
6. THE Food_Tracker SHALL validate that all nutritional values are non-negative numbers

### Requirement 24: Food Details View

**User Story:** As a user, I want to see detailed nutritional information about food items, so that I can make informed dietary choices.

#### Acceptance Criteria

1. WHEN a user clicks on a food item in search results, THE Food_Tracker SHALL display a detailed view
2. WHEN displaying food details, THE Food_Tracker SHALL show: name, brand (if applicable), serving size, and full КБЖУ breakdown
3. WHEN displaying food details, THE Food_Tracker SHALL show additional nutrients: fiber, sugar, sodium, vitamins, minerals
4. WHEN displaying food details, THE Food_Tracker SHALL show the data source (USDA, brand, user-created)
5. THE Food_Tracker SHALL allow users to add food items to favorites for quick access
6. WHEN a food item is from the user's personal database, THE Food_Tracker SHALL allow editing

### Requirement 25: КБЖУ Progress Visualization

**User Story:** As a user, I want to see visual progress indicators for my daily nutrition goals, so that I can quickly understand my intake status.

#### Acceptance Criteria

1. FOR EACH macro (calories, protein, fat, carbs), THE Food_Tracker SHALL display a progress bar
2. WHEN intake is 80-100% of goal, THE Food_Tracker SHALL display the progress bar in green
3. WHEN intake is 50-79% or 101-120% of goal, THE Food_Tracker SHALL display the progress bar in yellow
4. WHEN intake is below 50% or above 120% of goal, THE Food_Tracker SHALL display the progress bar in red
5. FOR EACH macro, THE Food_Tracker SHALL display percentage of daily goal achieved
6. THE Food_Tracker SHALL calculate macro goals based on calorie goal using formula: Protein 30%, Fat 30%, Carbs 40%
7. THE Food_Tracker SHALL allow users to override calculated macro goals with custom values

### Requirement 26: Meal Time Grouping

**User Story:** As a user, I want my food entries automatically grouped by meal time, so that I can see my eating patterns throughout the day.

#### Acceptance Criteria

1. WHEN a food entry is added with time 05:00-11:00, THE Food_Tracker SHALL group it under Завтрак (Breakfast)
2. WHEN a food entry is added with time 11:00-16:00, THE Food_Tracker SHALL group it under Обед (Lunch)
3. WHEN a food entry is added with time 16:00-21:00, THE Food_Tracker SHALL group it under Ужин (Dinner)
4. WHEN a food entry is added outside these times, THE Food_Tracker SHALL group it under Перекус (Snack)
5. THE Food_Tracker SHALL allow users to manually move entries between meal slots via drag-and-drop
6. FOR EACH Meal_Slot, THE Food_Tracker SHALL display the time of the first entry and subtotal КБЖУ

### Requirement 27: Day Navigation and History

**User Story:** As a user, I want to navigate between days and view my food history, so that I can track my eating patterns over time.

#### Acceptance Criteria

1. WHEN the Diet_Tab loads, THE Food_Tracker SHALL display navigation arrows for previous/next day
2. WHEN a user clicks the previous day arrow, THE Food_Tracker SHALL load data for the previous day
3. WHEN a user clicks the next day arrow, THE Food_Tracker SHALL load data for the next day (if not future)
4. THE Food_Tracker SHALL display a "Сегодня" (Today) button for quick return to current date
5. WHEN viewing a past day, THE Food_Tracker SHALL allow editing entries (unless weekly report submitted)
6. THE Food_Tracker SHALL prevent adding entries to future dates

### Requirement 28: Weekly Analytics Summary

**User Story:** As a user, I want to see weekly summaries of my nutrition, so that I can understand my overall eating patterns.

#### Acceptance Criteria

1. THE Food_Tracker SHALL provide access to a weekly analytics view
2. WHEN displaying weekly analytics, THE Food_Tracker SHALL show average daily calories and macros
3. WHEN displaying weekly analytics, THE Food_Tracker SHALL show number of days with complete logging
4. WHEN displaying weekly analytics, THE Food_Tracker SHALL show most frequently logged foods
5. WHEN displaying weekly analytics, THE Food_Tracker SHALL show adherence percentage to goals
6. THE Food_Tracker SHALL generate insights about eating patterns (e.g., "Вы часто недобираете углеводов")
