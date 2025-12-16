# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

```bash
# Development
npm run dev       # Start dev server at http://localhost:3000

# Build & Production
npm run build     # Build for production
npm run start     # Start production server

# Code Quality
npm run lint      # Run ESLint
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (`src/app/`)
- **React**: v19 with React Compiler enabled (`reactCompiler: true` in next.config.ts)
- **Styling**: Tailwind CSS v4 with PostCSS
- **Backend**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Utilities**: `clsx` + `tailwind-merge` for className handling, `lucide-react` for icons

## Architecture

### App Router Structure
All routes live under `src/app/` using Next.js App Router conventions:
- `page.tsx` — Route component
- `layout.tsx` — Shared layout wrapper
- `globals.css` — Global styles with Tailwind v4 `@import "tailwindcss"`

### Path Aliases
`@/*` maps to `./src/*` (configured in tsconfig.json)

### Styling
Tailwind v4 uses CSS-first configuration via `globals.css`:
- CSS variables for theming (`--background`, `--foreground`)
- `@theme inline` block for Tailwind theme extension
- Dark mode via `prefers-color-scheme` media query
