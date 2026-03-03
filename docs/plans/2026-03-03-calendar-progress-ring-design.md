# Calendar Progress Ring Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The calendar date strip on the client dashboard shows 3 completion indicator dots (16px each + gaps = 52px) per day button. On mobile screens (320-375px), the 7-column grid leaves ~40px per cell, so the dots overflow their container and overlap neighboring dates.

## Solution

Replace the 3 indicator dots and "all goals completed" badge with a single **progress ring** (SVG arc) around the day number. The ring has 3 equal segments (120deg each) with small gaps between them, corresponding to the 3 tracked goals: nutrition, weight, activity.

## Visual Spec

### Day Button Layout

```
┌─────────┐
│   Пн    │  ← day abbreviation (text, unchanged)
│  ╭───╮  │
│  │ 3 │  │  ← day number inside 36×36px SVG ring
│  ╰───╯  │
└─────────┘
```

- Ring: SVG `<circle>` with `stroke-dasharray` creating 3 arcs
- Ring diameter: 36px, stroke width: 2.5px
- Gap between arcs: 4deg for visual separation
- Removes: the `flex gap-1 mt-2` dot row and the absolute-positioned badge

### Progress States

| Completed | Ring appearance |
|-----------|----------------|
| 0/3 | 3 gray arcs |
| 1/3 | 1 green arc + 2 gray |
| 2/3 | 2 green arcs + 1 gray |
| 3/3 | Full green ring |

Arc order (clockwise from top): nutrition, weight, activity.

### Color States

| Button state | Background | Text | Filled arcs | Empty arcs |
|---|---|---|---|---|
| Default | `white` | `gray-700` | `green-500` | `gray-200` |
| Today (not selected) | `white` + `ring-2 ring-blue-300` | `gray-700` | `green-500` | `gray-200` |
| Selected | `blue-500` | `white` | `white` | `white/30` |
| 3/3 + selected | `blue-500` | `white` | full `white` ring | — |

### What Stays Unchanged

- Week navigation (prev/next chevrons, week range display)
- "Submit weekly report" button on Sunday
- Keyboard navigation (roving tabindex, arrow keys)
- Grid layout (`grid-cols-7 gap-2`)
- Day name abbreviation above the number

### Data Model

No changes. Still uses the existing `CompletionStatus`:
```typescript
interface CompletionStatus {
    nutritionFilled: boolean
    weightLogged: boolean
    activityCompleted: boolean
}
```

Completed count = count of true values in `CompletionStatus`.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/features/dashboard/components/CalendarNavigator.tsx` | Replace DayButton indicators with SVG progress ring |

Single-file change. No backend, store, or type changes needed.
