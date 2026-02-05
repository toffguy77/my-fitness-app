# Design Document: Dashboard Layout

## Overview

The Dashboard Layout feature provides the foundational navigation structure for the BURCEV fitness tracking platform. It implements a mobile-first responsive layout with a persistent header, bottom navigation menu, and scrollable main content area. This design establishes the core UI framework that will host various dashboard widgets and features in future iterations.

The layout follows a three-tier structure:
1. **Header**: Fixed top bar with user profile access and notifications
2. **Main Content Area**: Scrollable region for dashboard content
3. **Footer Navigation**: Fixed bottom bar with primary app navigation

This design prioritizes mobile usability while maintaining responsiveness across all device sizes, consistent with the existing authentication screens and design system.

## Architecture

### Component Hierarchy

```
DashboardPage (app/dashboard/page.tsx)
├── DashboardLayout (features/dashboard/components/DashboardLayout.tsx)
│   ├── DashboardHeader (features/dashboard/components/DashboardHeader.tsx)
│   │   ├── AppLogo (shared/components/ui/AppLogo.tsx)
│   │   ├── UserAvatar (shared/components/ui/UserAvatar.tsx)
│   │   └── NotificationIcon (shared/components/ui/NotificationIcon.tsx)
│   ├── MainContent (features/dashboard/components/MainContent.tsx)
│   └── FooterNavigation (features/dashboard/components/FooterNavigation.tsx)
│       └── NavigationItem (features/dashboard/components/NavigationItem.tsx)
```

### Routing Structure

- `/dashboard` - Main dashboard page (protected route)
- `/profile` - User profile page (navigation target from avatar)
- `/food-tracker` - Food tracking page (navigation target)
- `/workout` - Workout page (disabled, future feature)
- `/chat` - Chat page (navigation target)
- `/content` - Content page (navigation target)

### State Management

**Local Component State:**
- Active navigation item (managed by FooterNavigation)
- User profile data (fetched on mount)
- Notification count (fetched on mount)

**Global State (Zustand):**
- User authentication state (already exists in auth feature)
- User profile information (name, avatar URL)

No new global state stores are required; the dashboard will consume existing auth state.

## Components and Interfaces

### DashboardLayout Component

**Purpose:** Container component that orchestrates the header, main content, and footer navigation.

**Props:**
```typescript
interface DashboardLayoutProps {
  children: React.ReactNode
}
```

**Behavior:**
- Renders fixed header at top
- Renders scrollable main content area
- Renders fixed footer navigation at bottom
- Applies proper spacing to prevent content overlap

**Styling:**
- Full viewport height layout
- Flexbox column layout
- Header and footer fixed positioning
- Main content with flex-grow and overflow-scroll

---

### DashboardHeader Component

**Purpose:** Top navigation bar displaying user information and notifications.

**Props:**
```typescript
interface DashboardHeaderProps {
  userName: string
  avatarUrl?: string
  notificationCount?: number
  onAvatarClick: () => void
  onNotificationClick: () => void
}
```

**Behavior:**
- Displays app logo on the left
- Displays user avatar and name in the center or right
- Displays notification icon with optional badge count
- Handles click events for avatar and notifications
- Navigates to profile page on avatar click

**Styling:**
- Fixed height (e.g., 64px)
- Horizontal flexbox layout
- Padding from design tokens
- Background color from design system
- Shadow for depth

---

### UserAvatar Component

**Purpose:** Displays user profile picture or initials with click interaction.

**Props:**
```typescript
interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
}
```

**Behavior:**
- Displays image if avatarUrl provided
- Falls back to initials (first letter of name) if no image
- Clickable with hover state
- Accessible with proper ARIA labels

**Styling:**
- Circular shape
- Size variants (sm: 32px, md: 40px, lg: 48px)
- Background color for initials
- Border for definition

---

### NotificationIcon Component

**Purpose:** Displays notification bell icon with optional badge count.

**Props:**
```typescript
interface NotificationIconProps {
  count?: number
  onClick?: () => void
  className?: string
}
```

**Behavior:**
- Displays bell icon from Lucide React
- Shows badge with count if count > 0
- Clickable with hover state
- Accessible with ARIA label

**Styling:**
- Icon size: 24px
- Badge: small circle with count
- Badge position: top-right of icon
- Badge color: accent color from design tokens

---

### FooterNavigation Component

**Purpose:** Bottom navigation menu with primary app sections.

**Props:**
```typescript
interface FooterNavigationProps {
  activeItem?: NavigationItemId
  onNavigate?: (itemId: NavigationItemId) => void
}

type NavigationItemId = 'dashboard' | 'food-tracker' | 'workout' | 'chat' | 'content'
```

**Behavior:**
- Renders five navigation items
- Marks active item with visual distinction
- Disables workout item
- Handles navigation on item click
- Uses Next.js router for navigation

**Styling:**
- Fixed height (e.g., 64px)
- Horizontal flexbox layout with equal spacing
- Background color from design system
- Top border for separation
- Safe area insets for mobile devices

---

### NavigationItem Component

**Purpose:** Individual navigation menu item with icon and label.

**Props:**
```typescript
interface NavigationItemProps {
  id: NavigationItemId
  label: string
  icon: LucideIcon
  href: string
  isActive?: boolean
  isDisabled?: boolean
  onClick?: (id: NavigationItemId) => void
}
```

**Behavior:**
- Displays icon above label
- Applies active styling when isActive is true
- Prevents interaction when isDisabled is true
- Navigates to href on click (if not disabled)
- Provides keyboard navigation support

**Styling:**
- Vertical flexbox layout (icon above label)
- Active state: accent color, bold text
- Disabled state: reduced opacity (0.4), grey color
- Hover state: subtle background change (if not disabled)
- Focus state: visible outline

---

### MainContent Component

**Purpose:** Scrollable container for dashboard content.

**Props:**
```typescript
interface MainContentProps {
  children: React.ReactNode
  className?: string
}
```

**Behavior:**
- Renders children content
- Provides scrollable area
- Applies consistent padding

**Styling:**
- Flex-grow to fill available space
- Overflow-y: auto for scrolling
- Padding from design tokens
- Background color from design system

## Data Models

### NavigationConfig

**Purpose:** Configuration for navigation items.

```typescript
interface NavigationItemConfig {
  id: NavigationItemId
  label: string
  icon: LucideIcon
  href: string
  isDisabled?: boolean
}

const NAVIGATION_ITEMS: NavigationItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Дашборд',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    id: 'food-tracker',
    label: 'Фудтрекер',
    icon: Utensils,
    href: '/food-tracker',
  },
  {
    id: 'workout',
    label: 'Тренировка',
    icon: Dumbbell,
    href: '/workout',
    isDisabled: true,
  },
  {
    id: 'chat',
    label: 'Чат',
    icon: MessageCircle,
    href: '/chat',
  },
  {
    id: 'content',
    label: 'Контент',
    icon: FileText,
    href: '/content',
  },
]
```

### User Profile Data

**Purpose:** User information displayed in header.

```typescript
interface UserProfile {
  id: string
  name: string
  avatarUrl?: string
}
```

This data will be fetched from the existing auth state or API endpoint.

### Notification Data

**Purpose:** Notification count for badge display.

```typescript
interface NotificationSummary {
  unreadCount: number
}
```

This will be fetched from a future notifications API endpoint. For now, it can be mocked or optional.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Header Completeness

*For any* dashboard render, the header should contain all required elements: application logo, user avatar, user name, and notification icon.

**Validates: Requirements 1.1, 1.2, 1.3**

---

### Property 2: Avatar Navigation

*For any* user state, clicking the user avatar should trigger navigation to the profile page.

**Validates: Requirements 1.4**

---

### Property 3: Fixed Positioning

*For any* viewport size and scroll position, the header should remain fixed at the top and the footer navigation should remain fixed at the bottom of the viewport.

**Validates: Requirements 1.5, 2.7**

---

### Property 4: Navigation Completeness

*For any* dashboard render, the footer navigation should display exactly five navigation items with the correct Russian labels: "Дашборд", "Фудтрекер", "Тренировка", "Чат", "Контент".

**Validates: Requirements 2.1, 2.2**

---

### Property 5: Initial Navigation State

*For any* dashboard render, the Dashboard navigation item should be marked as active and the Workout navigation item should be marked as disabled.

**Validates: Requirements 2.3, 2.4**

---

### Property 6: Enabled Navigation Behavior

*For any* enabled navigation item, clicking it should trigger navigation to the corresponding page URL.

**Validates: Requirements 2.5**

---

### Property 7: Disabled Navigation Prevention

*For any* disabled navigation item, clicking it should not trigger any navigation.

**Validates: Requirements 2.6**

---

### Property 8: Main Content Layout

*For any* dashboard render, the main content area should be positioned between header and footer, occupy full width, and have scrollable overflow behavior.

**Validates: Requirements 3.1, 3.3, 3.4**

---

### Property 9: Placeholder Content Presence

*For any* dashboard render, the main content area should display placeholder content.

**Validates: Requirements 3.2**

---

### Property 10: Responsive Layout Adaptation

*For any* viewport size (mobile, tablet, desktop), the dashboard should maintain proper layout structure with appropriate spacing and proportions.

**Validates: Requirements 4.1, 4.2**

---

### Property 11: Small Viewport Handling

*For any* viewport with small height, the main content area should remain scrollable without overlapping the header or footer.

**Validates: Requirements 4.3**

---

### Property 12: Keyboard Focus Indicators

*For any* interactive element (avatar, notification icon, navigation items), when focused via keyboard navigation, a visible focus indicator should be present.

**Validates: Requirements 5.1**

---

### Property 13: Accessibility Attributes

*For any* navigation item, appropriate ARIA labels should be present, and disabled items should communicate their disabled state to assistive technologies.

**Validates: Requirements 5.2, 5.3**

---

### Property 14: Color Contrast Compliance

*For any* text element in the dashboard, the color contrast ratio between text and background should meet WCAG 2.1 Level AA standards (minimum 4.5:1 for normal text).

**Validates: Requirements 5.4**

---

### Property 15: Active Item Visual Distinction

*For any* active navigation item, it should have visually distinct styling (different color, weight, or indicator) compared to inactive items.

**Validates: Requirements 6.4**

---

### Property 16: Disabled Item Visual Indication

*For any* disabled navigation item, it should have reduced opacity or greyed-out styling to indicate its disabled state.

**Validates: Requirements 6.5**

## Error Handling

### Navigation Errors

**Scenario:** Navigation to a route fails (e.g., network error, route not found)

**Handling:**
- Catch navigation errors using Next.js error boundaries
- Display toast notification with error message
- Log error with context (route, user ID, timestamp)
- Keep user on current page
- Provide retry option if applicable

**Example:**
```typescript
try {
  await router.push('/profile')
} catch (error) {
  logger.error('Navigation failed', { route: '/profile', error })
  toast.error('Не удалось перейти на страницу профиля')
}
```

---

### User Data Loading Errors

**Scenario:** Failed to fetch user profile data for header display

**Handling:**
- Display fallback avatar (generic icon or initials from cached name)
- Show generic "User" text if name unavailable
- Log error for monitoring
- Retry fetch in background
- Display subtle error indicator (optional)

**Example:**
```typescript
const { data: user, error } = useUserProfile()

if (error) {
  logger.error('Failed to load user profile', { error })
  // Fallback to cached data or defaults
  return <UserAvatar name="User" />
}
```

---

### Notification Count Errors

**Scenario:** Failed to fetch notification count

**Handling:**
- Hide notification badge if count unavailable
- Display notification icon without count
- Log error for monitoring
- Retry fetch in background
- Don't block dashboard rendering

**Example:**
```typescript
const { data: notifications, error } = useNotifications()

if (error) {
  logger.warn('Failed to load notifications', { error })
  // Show icon without badge
  return <NotificationIcon />
}
```

---

### Accessibility Errors

**Scenario:** Missing or invalid ARIA attributes detected

**Handling:**
- Log warning in development mode
- Provide fallback accessible labels
- Ensure keyboard navigation still works
- Use semantic HTML as fallback

**Example:**
```typescript
<button
  onClick={handleClick}
  aria-label={ariaLabel || 'Navigation button'} // Fallback label
  role="button"
>
  {children}
</button>
```

## Testing Strategy

### Dual Testing Approach

This feature will use both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Together, these approaches provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing

**Library:** `@fast-check/jest` for TypeScript/React property-based testing

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: dashboard-layout, Property {N}: {property description}`

**Property Test Examples:**

```typescript
// Property 1: Header Completeness
describe('Property 1: Header Completeness', () => {
  it('Feature: dashboard-layout, Property 1: Header should contain all required elements', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }),
          avatarUrl: fc.option(fc.webUrl()),
          notificationCount: fc.nat(),
        }),
        (userData) => {
          const { container } = render(<DashboardHeader {...userData} />)
          
          // Verify all required elements present
          expect(container.querySelector('[data-testid="app-logo"]')).toBeInTheDocument()
          expect(container.querySelector('[data-testid="user-avatar"]')).toBeInTheDocument()
          expect(container.querySelector('[data-testid="user-name"]')).toBeInTheDocument()
          expect(container.querySelector('[data-testid="notification-icon"]')).toBeInTheDocument()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Property 4: Navigation Completeness
describe('Property 4: Navigation Completeness', () => {
  it('Feature: dashboard-layout, Property 4: Footer navigation should display exactly five items with Russian labels', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No random input needed
        () => {
          const { container } = render(<FooterNavigation />)
          
          const navItems = container.querySelectorAll('[data-testid="nav-item"]')
          expect(navItems).toHaveLength(5)
          
          const labels = Array.from(navItems).map(item => item.textContent)
          expect(labels).toEqual(['Дашборд', 'Фудтрекер', 'Тренировка', 'Чат', 'Контент'])
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Property 6: Enabled Navigation Behavior
describe('Property 6: Enabled Navigation Behavior', () => {
  it('Feature: dashboard-layout, Property 6: Clicking enabled navigation items should trigger navigation', () => {
    const enabledItems = ['dashboard', 'food-tracker', 'chat', 'content']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...enabledItems),
        (itemId) => {
          const mockRouter = { push: jest.fn() }
          const { getByTestId } = render(
            <FooterNavigation />,
            { wrapper: createMockRouterWrapper(mockRouter) }
          )
          
          const navItem = getByTestId(`nav-item-${itemId}`)
          fireEvent.click(navItem)
          
          expect(mockRouter.push).toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### Unit Testing

**Library:** Jest + React Testing Library

**Focus Areas:**
- Specific user interactions (avatar click, navigation click)
- Edge cases (missing avatar URL, zero notifications)
- Error conditions (navigation failure, data loading errors)
- Accessibility (keyboard navigation, screen reader support)
- Responsive behavior at specific breakpoints

**Unit Test Examples:**

```typescript
describe('DashboardHeader', () => {
  it('should navigate to profile page when avatar is clicked', () => {
    const mockRouter = { push: jest.fn() }
    const { getByTestId } = render(
      <DashboardHeader userName="Test User" />,
      { wrapper: createMockRouterWrapper(mockRouter) }
    )
    
    fireEvent.click(getByTestId('user-avatar'))
    expect(mockRouter.push).toHaveBeenCalledWith('/profile')
  })
  
  it('should display initials when avatar URL is missing', () => {
    const { getByText } = render(
      <DashboardHeader userName="Test User" />
    )
    
    expect(getByText('T')).toBeInTheDocument()
  })
  
  it('should hide notification badge when count is zero', () => {
    const { queryByTestId } = render(
      <DashboardHeader userName="Test User" notificationCount={0} />
    )
    
    expect(queryByTestId('notification-badge')).not.toBeInTheDocument()
  })
})

describe('FooterNavigation', () => {
  it('should prevent navigation when disabled item is clicked', () => {
    const mockRouter = { push: jest.fn() }
    const { getByTestId } = render(
      <FooterNavigation />,
      { wrapper: createMockRouterWrapper(mockRouter) }
    )
    
    fireEvent.click(getByTestId('nav-item-workout'))
    expect(mockRouter.push).not.toHaveBeenCalled()
  })
  
  it('should support keyboard navigation with Tab key', () => {
    const { getAllByRole } = render(<FooterNavigation />)
    const navButtons = getAllByRole('button')
    
    navButtons[0].focus()
    expect(document.activeElement).toBe(navButtons[0])
    
    userEvent.tab()
    expect(document.activeElement).toBe(navButtons[1])
  })
})
```

### Integration Testing

**Library:** Playwright for end-to-end tests

**Focus Areas:**
- Full page rendering and layout
- Navigation flow between pages
- Mobile device testing
- Accessibility testing with axe-core

**Integration Test Examples:**

```typescript
test('dashboard page should render with all components', async ({ page }) => {
  await page.goto('/dashboard')
  
  // Verify header elements
  await expect(page.locator('[data-testid="app-logo"]')).toBeVisible()
  await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible()
  await expect(page.locator('[data-testid="notification-icon"]')).toBeVisible()
  
  // Verify footer navigation
  await expect(page.locator('[data-testid="footer-navigation"]')).toBeVisible()
  const navItems = page.locator('[data-testid="nav-item"]')
  await expect(navItems).toHaveCount(5)
  
  // Verify main content
  await expect(page.locator('[data-testid="main-content"]')).toBeVisible()
})

test('should navigate to profile page when avatar is clicked', async ({ page }) => {
  await page.goto('/dashboard')
  await page.click('[data-testid="user-avatar"]')
  await expect(page).toHaveURL('/profile')
})

test('should pass accessibility audit', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await injectAxe(page)
  expect(results.violations).toHaveLength(0)
})
```

### Test Coverage Goals

- **Unit tests**: 80% code coverage
- **Property tests**: All 16 correctness properties implemented
- **Integration tests**: Critical user flows covered
- **Accessibility tests**: WCAG 2.1 Level AA compliance verified

### Continuous Testing

- Run unit tests on every commit (pre-commit hook)
- Run property tests in CI pipeline
- Run integration tests on pull requests
- Run accessibility tests weekly
- Monitor test execution time and optimize as needed
