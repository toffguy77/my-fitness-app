# Project Structure

## Root Directory

```
├── src/                    # Source code
├── docs/                   # Documentation
├── migrations/             # Database migrations
├── e2e/                    # End-to-end tests
├── scripts/                # Build and deployment scripts
├── supabase/               # Supabase configuration
├── public/                 # Static assets
└── .kiro/                  # Kiro configuration
```

## Source Code Organization (`src/`)

### App Router Structure (`src/app/`)

```
src/app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Landing page (public)
├── globals.css             # Global styles
├── login/                  # Authentication pages
├── register/
├── onboarding/
├── auth/callback/          # OAuth callback
├── app/                    # Protected application routes
│   ├── dashboard/          # Client dashboard
│   ├── nutrition/          # Food logging
│   ├── reports/            # Premium reports
│   ├── coordinator/        # Coach interface
│   └── settings/           # User settings
├── admin/                  # Super admin interface
├── leaderboard/            # Public leaderboard
├── metrics/                # Prometheus metrics endpoint
└── api/                    # API routes
    ├── achievements/
    ├── analytics/
    ├── email/
    ├── invite-codes/
    ├── nutrition-targets/
    └── ocr/
```

### Components (`src/components/`)

```
src/components/
├── [ComponentName].tsx     # Shared UI components
├── ui/                     # Base UI components (Skeleton, etc.)
├── charts/                 # Data visualization
├── chat/                   # Real-time messaging
├── achievements/           # Gamification
├── ocr/                    # Photo processing
├── products/               # Food database
├── meals/                  # Meal templates
├── metrics/                # Analytics dashboard
├── reports/                # Report generation
├── invites/                # Invite system
├── premium/                # Premium features
├── pwa/                    # PWA functionality
├── onboarding/             # User onboarding
└── modals/                 # Modal dialogs
```

### Utilities (`src/utils/`)

```
src/utils/
├── logger.ts               # Centralized logging
├── email.ts                # Email utilities
├── export.ts               # Data export
├── prefetch.ts             # Performance optimization
├── supabase/               # Database utilities
│   ├── client.ts           # Browser client
│   ├── server.ts           # Server client
│   └── profile.ts          # Profile management
├── validation/             # Input validation
├── analytics/              # Usage tracking
├── achievements/           # Achievement logic
├── chat/                   # Messaging utilities
├── metrics/                # Performance metrics
├── ocr/                    # Image processing
├── products/               # Food database
├── meals/                  # Meal management
├── progress/               # Progress tracking
├── invites/                # Invite management
└── draft/                  # Auto-save functionality
```

### Types (`src/types/`)

```
src/types/
├── achievements.ts         # Achievement system types
├── chat.ts                 # Messaging types
├── invites.ts              # Invite system types
├── ocr.ts                  # OCR processing types
└── products.ts             # Food database types
```

## Key Conventions

### File Naming

- **Components**: PascalCase (`UserProfile.tsx`)
- **Utilities**: camelCase (`userHelpers.ts`)
- **Types**: camelCase (`userTypes.ts`)
- **Pages**: lowercase (`page.tsx`, `layout.tsx`)
- **API routes**: lowercase (`route.ts`)

### Import Patterns

```typescript
// External libraries first
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Internal utilities
import { logger } from '@/utils/logger'
import { createClient as createSupabaseClient } from '@/utils/supabase/client'

// Types
import type { User } from '@/types/user'
```

### Component Structure

```typescript
'use client' // Only when needed

import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'

interface ComponentProps {
  // Props definition
}

export default function Component({ prop }: ComponentProps) {
  // Hooks first
  const [state, setState] = useState()
  
  // Effects
  useEffect(() => {
    // Effect logic
  }, [])
  
  // Event handlers
  const handleClick = () => {
    // Handler logic
  }
  
  // Render
  return (
    <div>
      {/* JSX */}
    </div>
  )
}
```

## Database Migrations

Located in `migrations/` with versioned naming:
- `v{Major}.{Minor}_{description}.sql`
- `setup_database_from_scratch.sql` for complete setup

## Testing Structure

```
src/__tests__/              # Integration tests
src/components/__tests__/   # Component tests
src/utils/__tests__/        # Utility tests
e2e/                        # End-to-end tests
```

## Documentation

```
docs/
├── README.md               # Documentation index
├── API_Reference.md        # API documentation
├── Database_Schema.md      # Database structure
├── Technical_Architecture.md
├── Application_Structure_vN.md    # Versioned app structure
└── Application_Navigation_Diagrams_vN.md
```

## Configuration Files

- `.env.local` - Environment variables
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Testing configuration
- `playwright.config.ts` - E2E testing
- `eslint.config.mjs` - Linting rules
- `postcss.config.mjs` - CSS processing
- `docker-compose.yml` - Container orchestration
