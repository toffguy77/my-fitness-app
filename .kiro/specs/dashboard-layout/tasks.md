# Implementation Plan: Dashboard Layout

## Overview

This implementation plan breaks down the dashboard layout feature into discrete coding tasks. The approach follows a bottom-up strategy: building foundational UI components first, then composing them into the complete dashboard layout, and finally adding navigation and interactivity.

The implementation prioritizes core functionality and visual structure, with optional testing tasks marked for flexibility in delivery timeline.

## Tasks

- [x] 1. Set up dashboard feature structure and shared UI components
  - Create `apps/web/src/features/dashboard/` directory structure
  - Create `components/`, `hooks/`, `utils/`, and `index.ts` files
  - Set up shared UI components: `AppLogo`, `UserAvatar`, `NotificationIcon`
  - Create type definitions in `apps/web/src/features/dashboard/types.ts`
  - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2_

- [x] 1.1 Write property test for shared UI components
  - **Property 1: Header Completeness**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. Implement UserAvatar component
  - [x] 2.1 Create `apps/web/src/shared/components/ui/UserAvatar.tsx`
    - Implement avatar with image display and initials fallback
    - Add size variants (sm, md, lg)
    - Add click handler support
    - Add proper ARIA labels for accessibility
    - _Requirements: 1.1, 5.2_
  
  - [x] 2.2 Write unit tests for UserAvatar
    - Test image display when avatarUrl provided
    - Test initials fallback when no image
    - Test click handler invocation
    - Test size variants
    - _Requirements: 1.1_

- [x] 3. Implement NotificationIcon component
  - [x] 3.1 Create `apps/web/src/shared/components/ui/NotificationIcon.tsx`
    - Use Lucide React Bell icon
    - Add optional badge with count display
    - Add click handler support
    - Add ARIA labels for accessibility
    - _Requirements: 1.3, 5.2_
  
  - [x] 3.2 Write unit tests for NotificationIcon
    - Test badge visibility when count > 0
    - Test badge hidden when count is 0
    - Test click handler invocation
    - _Requirements: 1.3_

- [x] 4. Implement AppLogo component
  - [x] 4.1 Create `apps/web/src/shared/components/ui/AppLogo.tsx`
    - Display BURCEV logo or text
    - Add size variants
    - Make it clickable to navigate to dashboard
    - _Requirements: 1.2_

- [x] 5. Implement DashboardHeader component
  - [x] 5.1 Create `apps/web/src/features/dashboard/components/DashboardHeader.tsx`
    - Compose AppLogo, UserAvatar, and NotificationIcon
    - Implement fixed positioning at top
    - Add proper spacing and layout with Tailwind
    - Handle avatar click to navigate to profile
    - Handle notification icon click (placeholder for now)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.3, 6.4_
  
  - [x] 5.2 Write property test for DashboardHeader
    - **Property 2: Avatar Navigation**
    - **Validates: Requirements 1.4**
  
  - [x] 5.3 Write property test for fixed positioning
    - **Property 3: Fixed Positioning (Header)**
    - **Validates: Requirements 1.5**

- [x] 6. Implement NavigationItem component
  - [x] 6.1 Create `apps/web/src/features/dashboard/components/NavigationItem.tsx`
    - Display icon above label in vertical layout
    - Implement active state styling
    - Implement disabled state styling with reduced opacity
    - Add keyboard navigation support
    - Add ARIA labels and disabled state attributes
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 6.4, 6.5_
  
  - [x] 6.2 Write property test for NavigationItem
    - **Property 15: Active Item Visual Distinction**
    - **Property 16: Disabled Item Visual Indication**
    - **Validates: Requirements 6.4, 6.5**
  
  - [x] 6.3 Write unit tests for NavigationItem
    - Test active state styling
    - Test disabled state prevents clicks
    - Test keyboard focus indicators
    - _Requirements: 2.3, 2.4, 5.1_

- [x] 7. Implement FooterNavigation component
  - [x] 7.1 Create navigation configuration in `apps/web/src/features/dashboard/utils/navigationConfig.ts`
    - Define NAVIGATION_ITEMS array with all five items
    - Include Russian labels, Lucide icons, hrefs, and disabled flags
    - _Requirements: 2.1, 2.2, 2.4_
  
  - [x] 7.2 Create `apps/web/src/features/dashboard/components/FooterNavigation.tsx`
    - Render five NavigationItem components from config
    - Implement fixed positioning at bottom
    - Handle navigation on item click using Next.js router
    - Prevent navigation for disabled items
    - Mark Dashboard as active by default
    - Add safe area insets for mobile devices
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.3_
  
  - [x] 7.3 Write property test for FooterNavigation
    - **Property 4: Navigation Completeness**
    - **Property 5: Initial Navigation State**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  
  - [x] 7.4 Write property test for navigation behavior
    - **Property 6: Enabled Navigation Behavior**
    - **Property 7: Disabled Navigation Prevention**
    - **Validates: Requirements 2.5, 2.6**
  
  - [x] 7.5 Write property test for fixed positioning
    - **Property 3: Fixed Positioning (Footer)**
    - **Validates: Requirements 2.7**

- [x] 8. Checkpoint - Ensure header and footer components work independently
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement MainContent component
  - [x] 9.1 Create `apps/web/src/features/dashboard/components/MainContent.tsx`
    - Create scrollable container with flex-grow
    - Add consistent padding using design tokens
    - Add overflow-y: auto for scrolling
    - Display placeholder content (simple text or card)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 9.2 Write property test for MainContent
    - **Property 8: Main Content Layout**
    - **Property 9: Placeholder Content Presence**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 10. Implement DashboardLayout component
  - [x] 10.1 Create `apps/web/src/features/dashboard/components/DashboardLayout.tsx`
    - Compose DashboardHeader, MainContent, and FooterNavigation
    - Implement full viewport height flexbox layout
    - Ensure proper spacing to prevent overlap
    - Handle responsive behavior for different screen sizes
    - _Requirements: 3.1, 4.1, 4.2, 4.3_
  
  - [x] 10.2 Write property test for responsive layout
    - **Property 10: Responsive Layout Adaptation**
    - **Property 11: Small Viewport Handling**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 11. Create dashboard page route
  - [x] 11.1 Create `apps/web/src/app/dashboard/page.tsx`
    - Import and render DashboardLayout
    - Add authentication check (redirect to login if not authenticated)
    - Fetch user profile data for header
    - Pass user data to DashboardLayout
    - _Requirements: 1.1, 1.4_
  
  - [x] 11.2 Create `apps/web/src/app/dashboard/layout.tsx` (if needed)
    - Set up any dashboard-specific layout configuration
    - Add metadata for SEO
    - _Requirements: 6.1_

- [x] 12. Implement user profile data fetching
  - [x] 12.1 Create `apps/web/src/features/dashboard/hooks/useUserProfile.ts`
    - Fetch user profile from auth state or API
    - Handle loading and error states
    - Return user name and avatar URL
    - _Requirements: 1.1_
  
  - [x] 12.2 Write unit tests for useUserProfile hook
    - Test successful data fetch
    - Test error handling
    - Test loading states
    - _Requirements: 1.1_

- [x] 13. Implement notification count fetching (optional/mock for now)
  - [x] 13.1 Create `apps/web/src/features/dashboard/hooks/useNotifications.ts`
    - Mock notification count for now (return 0 or random number)
    - Prepare structure for future API integration
    - Handle loading and error states
    - _Requirements: 1.3_

- [x] 14. Add error handling and logging
  - [x] 14.1 Add error boundaries for dashboard components
    - Wrap DashboardLayout in error boundary
    - Display fallback UI on errors
    - Log errors with context
    - _Requirements: 1.1, 1.4_
  
  - [x] 14.2 Add toast notifications for navigation errors
    - Show error toast when navigation fails
    - Provide retry option if applicable
    - _Requirements: 2.5_

- [x] 15. Implement accessibility features
  - [x] 15.1 Add keyboard navigation support
    - Ensure all interactive elements are keyboard accessible
    - Add visible focus indicators
    - Test tab order
    - _Requirements: 5.1_
  
  - [x] 15.2 Add ARIA labels and attributes
    - Add aria-label to all navigation items
    - Add aria-disabled to disabled items
    - Add aria-current to active navigation item
    - _Requirements: 5.2, 5.3_
  
  - [x] 15.3 Write property tests for accessibility
    - **Property 12: Keyboard Focus Indicators**
    - **Property 13: Accessibility Attributes**
    - **Property 14: Color Contrast Compliance**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 16. Checkpoint - Ensure complete dashboard works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Create placeholder routes for navigation targets
  - [x] 17.1 Create placeholder pages for navigation targets
    - Create `apps/web/src/app/food-tracker/page.tsx` (placeholder)
    - Create `apps/web/src/app/workout/page.tsx` (placeholder, disabled)
    - Create `apps/web/src/app/chat/page.tsx` (placeholder)
    - Create `apps/web/src/app/content/page.tsx` (placeholder)
    - Create `apps/web/src/app/profile/page.tsx` (placeholder)
    - _Requirements: 1.4, 2.5_

- [x] 18. Style refinement and polish
  - [x] 18.1 Apply design tokens and consistent styling
    - Use colors from `styles/tokens/`
    - Apply consistent spacing scale
    - Ensure mobile-first responsive design
    - Add smooth transitions for interactive elements
    - _Requirements: 6.1, 6.3, 6.4, 6.5_
  
  - [x] 18.2 Test on different screen sizes
    - Test on mobile (320px, 375px, 414px)
    - Test on tablet (768px, 1024px)
    - Test on desktop (1280px, 1920px)
    - _Requirements: 4.1, 4.2_

- [x] 19. Integration testing with Playwright
  - Write end-to-end tests for complete dashboard flow
  - Test navigation between pages
  - Test mobile device rendering
  - Run accessibility audit with axe-core
  - _Requirements: All requirements_

- [x] 20. Final checkpoint - Complete feature validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples and edge cases
- The dashboard uses existing auth state, no new backend endpoints needed for MVP
- Notification count can be mocked initially, real API integration comes later
- All Russian labels are hardcoded in the navigation config
