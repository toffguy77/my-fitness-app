# Figma Design System Rules for Fitness App

This document provides comprehensive guidelines for implementing Figma designs in the My Fitness App codebase using the Model Context Protocol (MCP).

---

## 1. Design System Structure

### 1.1 Token Definitions

**Location:** `apps/web/src/styles/tokens/`

Design tokens are centralized TypeScript objects that define the visual language of the application.

#### Colors (`apps/web/src/styles/tokens/colors.ts`)

```typescript
export const colors = {
    // Brand colors
    brand: {
        primary: '#3B82F6',    // Blue-600
        secondary: '#8B5CF6',  // Purple-600
        accent: '#10B981',     // Green-500
    },

    // Semantic colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Neutral colors (50-900 scale)
    neutral: {
        50: '#F9FAFB',
        100: '#F3F4F6',
        200: '#E5E7EB',
        300: '#D1D5DB',
        400: '#9CA3AF',
        500: '#6B7280',
        600: '#4B5563',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
    },

    // Background colors
    background: {
        primary: '#FFFFFF',
        secondary: '#F9FAFB',
        tertiary: '#F3F4F6',
    },

    // Text colors
    text: {
        primary: '#111827',
        secondary: '#6B7280',
        tertiary: '#9CA3AF',
        inverse: '#FFFFFF',
    },
} as const

export type ColorToken = typeof colors
```

**Figma Mapping:**
- Map Figma color variables to the color tokens above
- Use the exact hex values for consistency
- Neutral colors follow a 50-900 scale matching Tailwind's gray palette

#### Typography (`apps/web/src/styles/tokens/typography.ts`)

```typescript
export const typography = {
    fontFamily: {
        sans: 'var(--font-geist-sans)',
        mono: 'var(--font-geist-mono)',
    },

    fontSize: {
        xs: '0.75rem',      // 12px
        sm: '0.875rem',     // 14px
        base: '1rem',       // 16px
        lg: '1.125rem',     // 18px
        xl: '1.25rem',      // 20px
        '2xl': '1.5rem',    // 24px
        '3xl': '1.875rem',  // 30px
        '4xl': '2.25rem',   // 36px
        '5xl': '3rem',      // 48px
    },

    fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    },

    lineHeight: {
        tight: '1.25',
        normal: '1.5',
        relaxed: '1.75',
    },
} as const
```

**Figma Mapping:**
- Font sizes use rem units (divide px by 16)
- Only Geist Sans and Geist Mono fonts are supported
- Line heights use unitless multipliers

#### Spacing (`apps/web/src/styles/tokens/spacing.ts`)

```typescript
export const spacing = {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px
} as const
```

**Figma Mapping:**
- Map Figma spacing values to the nearest token
- Use 4px base unit (spacing-1)
- For custom values, round to nearest defined spacing

### 1.2 Token Import Pattern

```typescript
import { colors, typography, spacing } from '@/styles/tokens'
```

---

## 2. Component Library

### 2.1 Component Locations

**Shared Components:** `apps/web/src/shared/components/ui/`
**Feature Components:** `apps/web/src/features/{feature-name}/components/`

### 2.2 Core UI Components

Available in `apps/web/src/shared/components/ui/`:

- **Button.tsx** - Primary interaction component
- **Card.tsx** - Container component (Card, CardHeader, CardTitle, CardContent)
- **Input.tsx** - Text input fields
- **Checkbox.tsx** - Checkbox inputs
- **Logo.tsx** - Application logo
- **AppLogo.tsx** - Alternative logo variant
- **UserAvatar.tsx** - User profile images
- **NotificationIcon.tsx** - Notification indicator
- **ErrorBoundary.tsx** - Error handling wrapper

### 2.3 Component Architecture Pattern

All components follow this structure:

```typescript
import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/utils/cn'

export interface ComponentProps extends HTMLAttributes<HTMLElement> {
    variant?: 'default' | 'variant1' | 'variant2'
    size?: 'sm' | 'md' | 'lg'
    // Additional custom props
}

export const Component = forwardRef<HTMLElement, ComponentProps>(
    ({ className, variant = 'default', size = 'md', ...props }, ref) => {
        const baseStyles = '/* base Tailwind classes */'

        const variants = {
            default: '/* variant classes */',
            variant1: '/* variant classes */',
            variant2: '/* variant classes */',
        }

        const sizes = {
            sm: '/* size classes */',
            md: '/* size classes */',
            lg: '/* size classes */',
        }

        return (
            <element
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], className)}
                {...props}
            />
        )
    }
)

Component.displayName = 'Component'
```

### 2.4 Component Examples

#### Button Component

```typescript
<Button
    variant="primary" // primary | secondary | outline | ghost | danger
    size="md"         // sm | md | lg
    isLoading={false}
>
    Click me
</Button>
```

Variants:
- `primary`: Blue background, white text
- `secondary`: Gray background, dark text
- `outline`: Transparent with border
- `ghost`: Transparent, hover background
- `danger`: Red background, white text

#### Card Component

```typescript
<Card variant="bordered"> {/* default | bordered | elevated */}
    <CardHeader>
        <CardTitle>Title</CardTitle>
    </CardHeader>
    <CardContent>
        Content goes here
    </CardContent>
</Card>
```

---

## 3. Frameworks & Libraries

### 3.1 UI Framework

- **Framework:** React 19.2.1
- **Type:** TypeScript with strict mode
- **Build Tool:** Next.js 16.1.6 (App Router)

### 3.2 Styling Stack

- **CSS Framework:** Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Class Merging:** `tailwind-merge` + `clsx`
- **Utility:** `cn()` function from `@/shared/utils/cn`
- **PostCSS:** Configured in `apps/web/postcss.config.mjs`

### 3.3 Key Dependencies

```json
{
    "react": "19.2.1",
    "react-dom": "19.2.1",
    "next": "^16.1.6",
    "tailwindcss": "^4",
    "lucide-react": "^0.563.0",  // Icon library
    "zustand": "^5.0.2",          // State management
    "zod": "^4.2.1",              // Schema validation
    "react-hot-toast": "^2.6.0",  // Notifications
    "tailwind-merge": "^3.4.0"
}
```

### 3.4 Build System

- **Bundler:** Next.js with Turbopack (development)
- **Output:** Standalone mode
- **PWA:** next-pwa enabled (disabled in development)
- **Image Optimization:** Next.js Image component with AVIF/WebP support

---

## 4. Asset Management

### 4.1 Asset Storage

**Public Assets:** `apps/web/public/`

Current assets:
- `logo.svg` - Application logo
- `manifest.json` - PWA manifest

### 4.2 Image Optimization

Next.js Image component is configured with:

```typescript
images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
}
```

### 4.3 Asset Import Pattern

```typescript
import Image from 'next/image'

<Image
    src="/logo.svg"
    alt="Description"
    width={100}
    height={100}
    priority={false}
/>
```

For static imports:
```typescript
import logoSrc from '@/public/logo.svg'
```

---

## 5. Icon System

### 5.1 Icon Library

**Library:** Lucide React v0.563.0

### 5.2 Icon Usage Pattern

```typescript
import { IconName } from 'lucide-react'

<IconName
    className="h-4 w-4"  // Size classes
    aria-hidden="true"    // Accessibility
/>
```

### 5.3 Common Icons

```typescript
import {
    Plus,           // Add actions
    AlertTriangle,  // Warnings
    Check,          // Success
    X,              // Close/Remove
    ChevronLeft,    // Navigation
    ChevronRight,   // Navigation
} from 'lucide-react'
```

### 5.4 Icon Sizing Standards

- **Extra Small:** `h-3 w-3` (12px)
- **Small:** `h-4 w-4` (16px)
- **Medium:** `h-5 w-5` (20px)
- **Large:** `h-6 w-6` (24px)
- **Extra Large:** `h-8 w-8` (32px)

### 5.5 Accessibility

Always include accessibility attributes:
```typescript
<Icon
    className="h-4 w-4"
    aria-hidden="true"  // Decorative icons
/>

// OR for semantic icons
<Icon
    className="h-4 w-4"
    aria-label="Description"
/>
```

---

## 6. Styling Approach

### 6.1 CSS Methodology

**Primary:** Utility-first with Tailwind CSS v4

Global styles: `apps/web/src/app/globals.css`
```css
@import "tailwindcss";
```

### 6.2 Class Merging Utility

**Location:** `apps/web/src/shared/utils/cn.ts`

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
```

**Usage:**
```typescript
import { cn } from '@/shared/utils/cn'

<div className={cn(
    'base-classes',
    condition && 'conditional-classes',
    variants[variant],
    className // User override
)} />
```

### 6.3 Styling Patterns

#### Base + Variants Pattern

```typescript
const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors'

const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
}

className={cn(baseStyles, variants[variant], className)}
```

#### Conditional Styling

```typescript
<div className={cn(
    'text-2xl font-bold',
    isOver ? 'text-orange-600' : 'text-gray-900'
)} />
```

### 6.4 Responsive Design

Tailwind breakpoints:
- **sm:** 640px
- **md:** 768px
- **lg:** 1024px
- **xl:** 1280px
- **2xl:** 1536px

Usage:
```typescript
className="text-sm md:text-base lg:text-lg"
```

### 6.5 Dark Mode

Currently not implemented. All designs use light mode only.

---

## 7. Project Structure

### 7.1 Monorepo Organization

```
my-fitness-app/
├── apps/
│   ├── api/          # Go backend
│   └── web/          # Next.js frontend
└── packages/
    ├── config/       # Shared configuration
    ├── types/        # Shared TypeScript types
    ├── ui/           # Shared UI components (future)
    └── utils/        # Shared utilities
```

### 7.2 Web App Structure

```
apps/web/src/
├── app/                      # Next.js App Router
│   ├── dashboard/           # Dashboard route
│   ├── auth/               # Authentication routes
│   ├── forgot-password/    # Password reset flow
│   ├── legal/              # Legal pages
│   ├── notifications/      # Notifications page
│   ├── globals.css         # Global styles
│   └── layout.tsx          # Root layout
├── config/                  # App configuration
├── features/                # Feature modules
│   ├── auth/
│   ├── dashboard/
│   └── notifications/
├── shared/                  # Shared resources
│   ├── components/
│   │   ├── ui/            # Reusable UI components
│   │   └── forms/         # Form components
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Utility functions
└── styles/
    └── tokens/            # Design tokens
```

### 7.3 Feature Module Pattern

Each feature follows this structure:

```
features/{feature-name}/
├── components/          # Feature-specific components
├── hooks/              # Feature-specific hooks
├── store/              # Zustand state management
├── utils/              # Feature utilities
├── types.ts            # TypeScript types
└── index.ts            # Public exports
```

Example: `features/dashboard/`
```
dashboard/
├── components/
│   ├── DashboardLayout.tsx
│   ├── NutritionBlock.tsx
│   ├── WorkoutBlock.tsx
│   ├── WeightBlock.tsx
│   ├── StepsBlock.tsx
│   ├── TasksSection.tsx
│   ├── WeeklyPlanSection.tsx
│   ├── CalendarNavigator.tsx
│   ├── AttentionBadge.tsx
│   └── __tests__/
├── store/
│   └── dashboardStore.ts
├── hooks/
│   ├── useKeyboardNavigation.ts
│   ├── useOnlineStatus.ts
│   └── useUnsavedData.ts
├── utils/
│   ├── calculations.ts
│   ├── errorHandling.ts
│   └── offlineQueue.ts
├── types.ts
└── index.ts
```

### 7.4 TypeScript Path Aliases

Configured in `apps/web/tsconfig.json`:

```json
"paths": {
    "@/*": ["./src/*"],
    "@/__mocks__/*": ["./__mocks__/*"]
}
```

Usage:
```typescript
import { Button } from '@/shared/components/ui/Button'
import { colors } from '@/styles/tokens'
import { useDashboardStore } from '@/features/dashboard'
```

### 7.5 Import Conventions

1. **External dependencies first**
```typescript
import { useState, memo } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
```

2. **UI components**
```typescript
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
```

3. **Utilities**
```typescript
import { cn } from '@/shared/utils/cn'
```

4. **Feature-specific imports**
```typescript
import { useDashboardStore } from '../store/dashboardStore'
import { AttentionBadge } from './AttentionBadge'
```

5. **Types last**
```typescript
import type { NutritionData } from '../types'
```

---

## 8. State Management

### 8.1 Global State

**Library:** Zustand v5.0.2

**Pattern:** Feature-scoped stores

Example: `features/dashboard/store/dashboardStore.ts`

```typescript
import { create } from 'zustand'

interface DashboardStore {
    // State
    selectedDate: Date
    dailyData: Record<string, DailyMetrics>

    // Actions
    setSelectedDate: (date: Date) => void
    updateMetric: (data: MetricUpdate) => Promise<void>
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
    selectedDate: new Date(),
    dailyData: {},

    setSelectedDate: (date) => set({ selectedDate: date }),
    updateMetric: async (data) => {
        // Implementation
    },
}))
```

### 8.2 Local State

Use React hooks for component-local state:
```typescript
const [isLoading, setIsLoading] = useState(false)
```

---

## 9. Performance Optimizations

### 9.1 Component Memoization

```typescript
import { memo } from 'react'

export const Component = memo(function Component(props) {
    // Component implementation
})
```

### 9.2 Optimized Imports

Next.js config optimizes these packages:
```typescript
experimental: {
    optimizePackageImports: ['lucide-react', 'react-window', 'zustand'],
}
```

### 9.3 Image Optimization

- Use Next.js Image component
- AVIF/WebP formats
- Responsive sizes: [640, 768, 1024, 1280, 1536]

---

## 10. Accessibility Standards

### 10.1 ARIA Attributes

```typescript
// Decorative elements
<Icon aria-hidden="true" />

// Semantic elements
<button aria-label="Close dialog">
<div role="alert" aria-live="polite">

// Loading states
<button aria-busy={isLoading}>
```

### 10.2 Keyboard Navigation

All interactive elements must be keyboard accessible:
```typescript
<button
    onClick={handleClick}
    onKeyDown={handleKeyDown}
    tabIndex={0}
>
```

### 10.3 Focus Styles

Use Tailwind's focus utilities:
```typescript
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
```

---

## 11. Figma-to-Code Translation Rules

### 11.1 Color Translation

1. Extract hex color from Figma
2. Find matching token in `colors.ts`
3. Use Tailwind class or token reference

Example:
- Figma: `#3B82F6`
- Token: `colors.brand.primary`
- Tailwind: `bg-blue-600` or `text-blue-600`

### 11.2 Typography Translation

1. Font size in Figma (px) → Convert to rem (divide by 16)
2. Map to typography token
3. Use Tailwind text size class

Example:
- Figma: 16px
- Token: `typography.fontSize.base` (1rem)
- Tailwind: `text-base`

### 11.3 Spacing Translation

1. Measure spacing in Figma (px)
2. Divide by 4 to get Tailwind unit
3. Use spacing class

Example:
- Figma: 16px
- Calculation: 16 / 4 = 4
- Tailwind: `p-4`, `m-4`, `gap-4`

### 11.4 Component Mapping

| Figma Element | Code Component | Location |
|--------------|----------------|----------|
| Button | `<Button>` | `@/shared/components/ui/Button` |
| Card/Frame | `<Card>` | `@/shared/components/ui/Card` |
| Input Field | `<Input>` | `@/shared/components/ui/Input` |
| Checkbox | `<Checkbox>` | `@/shared/components/ui/Checkbox` |
| Icon | Lucide React | `lucide-react` |

### 11.5 Layout Translation

Figma Auto Layout → Flexbox/Grid:

```typescript
// Horizontal stack
className="flex items-center gap-4"

// Vertical stack
className="flex flex-col gap-4"

// Grid
className="grid grid-cols-2 gap-4"

// Centered content
className="flex items-center justify-center"
```

---

## 12. Code Quality Standards

### 12.1 TypeScript

- Strict mode enabled
- Explicit types for props
- Use `interface` for component props
- Use `type` for unions and complex types

### 12.2 React Patterns

- Functional components only
- `forwardRef` for ref forwarding
- `displayName` for debugging
- `memo` for performance-critical components

### 12.3 File Naming

- Components: PascalCase (e.g., `Button.tsx`)
- Utilities: camelCase (e.g., `cn.ts`)
- Types: camelCase with `.ts` extension
- Tests: `*.test.tsx` or `*.property.test.tsx`

---

## 13. Testing Conventions

### 13.1 Test Location

Component tests in `__tests__/` subdirectory:
```
components/
├── Button.tsx
└── __tests__/
    ├── Button.test.tsx
    └── Button.property.test.tsx
```

### 13.2 Testing Libraries

- Jest
- React Testing Library
- fast-check (property-based testing)

---

## 14. Important Notes for Figma Implementation

### 14.1 Must Use Patterns

✅ **ALWAYS:**
- Use `cn()` utility for className merging
- Import from path aliases (`@/*`)
- Include TypeScript types for all props
- Add accessibility attributes
- Use existing UI components when possible
- Follow the baseStyles + variants pattern

### 14.2 Must Avoid Patterns

❌ **NEVER:**
- Use inline styles (use Tailwind classes)
- Create CSS modules (use Tailwind utilities)
- Use `any` type in TypeScript
- Hardcode colors (use tokens or Tailwind)
- Skip accessibility attributes
- Create new base components without checking existing ones

### 14.3 Language

- All user-facing text: Russian
- All code/comments: English
- Component names: English

### 14.4 Responsive Behavior

Default mobile-first approach:
```typescript
// Mobile first (default)
className="text-sm p-4"

// Tablet and up
className="text-sm md:text-base md:p-6"

// Desktop
className="text-sm md:text-base lg:text-lg lg:p-8"
```

---

## 15. Quick Reference

### Common Patterns

```typescript
// Component structure
import { forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

export interface Props {
    variant?: 'default' | 'other'
    className?: string
}

export const Component = forwardRef<HTMLDivElement, Props>(
    ({ className, variant = 'default', ...props }, ref) => (
        <div ref={ref} className={cn('base', className)} {...props} />
    )
)

Component.displayName = 'Component'
```

### Common Tailwind Classes

```typescript
// Layout
'flex items-center justify-between gap-4'
'grid grid-cols-2 gap-4'
'absolute inset-0'

// Spacing
'p-4 m-4'  // 16px
'px-6 py-3'  // Horizontal 24px, vertical 12px

// Typography
'text-sm font-medium text-gray-700'
'text-2xl font-bold text-gray-900'

// Colors
'bg-blue-600 text-white'
'border border-gray-200'
'hover:bg-blue-700'

// Rounded corners
'rounded-lg'  // 8px
'rounded-full'  // Fully rounded

// Shadows
'shadow-sm'  // Small shadow
'shadow-lg'  // Large shadow

// Transitions
'transition-colors duration-300'
'transition-all duration-200'
```

---

This document should be referenced when implementing any Figma designs into the codebase. It ensures consistency with existing patterns and maintains code quality standards.
