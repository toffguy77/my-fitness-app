# Adaptive KBJU Targets Design

## Overview

Adaptive daily KBJU (calories, protein, fat, carbs) targets that automatically recalculate based on user profile, weight changes, and workout activity. Calculated targets are stored in the database for historical tracking. Curator can override with manual weekly plans.

## Formula

### BMR — Mifflin-St Jeor

- Male: `10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) + 5`
- Female: `10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) - 161`

### TDEE = BMR × PAL

| PAL Level | Coefficient | Description |
|---|---|---|
| Sedentary | 1.2 | Office work, minimal movement |
| Light | 1.375 | 1-2 workouts/week |
| Moderate | 1.55 | 3-5 workouts/week |
| Active | 1.725 | 6-7 workouts/week |

### Workout Bonus (added to daily TDEE)

| Workout Type | kcal/hour |
|---|---|
| Strength | 300 |
| Cardio | 400 |
| HIIT | 500 |
| Yoga/Stretching | 200 |
| Swimming | 350 |
| Walking | 250 |

### Goal Modifier (deficit/surplus)

- Loss: -15% of TDEE
- Maintain: 0%
- Gain: +15% of TDEE

### Macros Split

- Protein: 1.8 g/kg (loss), 1.6 g/kg (maintain), 2.0 g/kg (gain)
- Fat: 25% of target calories
- Carbs: remaining calories

## Database Changes

### New fields in `user_settings`

| Field | Type | Constraints |
|---|---|---|
| birth_date | DATE | NOT NULL for calc |
| biological_sex | VARCHAR(10) | 'male' / 'female' |
| activity_level | VARCHAR(20) | 'sedentary' / 'light' / 'moderate' / 'active' |
| fitness_goal | VARCHAR(20) | 'loss' / 'maintain' / 'gain' |

### New table `daily_calculated_targets`

| Field | Type | Description |
|---|---|---|
| id | BIGSERIAL PK | |
| user_id | INT FK → users | |
| date | DATE | Target date |
| calories | DECIMAL(7,1) | Target kcal |
| protein | DECIMAL(5,1) | Target protein (g) |
| fat | DECIMAL(5,1) | Target fat (g) |
| carbs | DECIMAL(5,1) | Target carbs (g) |
| bmr | DECIMAL(7,1) | Calculated BMR |
| tdee | DECIMAL(7,1) | TDEE without workout |
| workout_bonus | DECIMAL(6,1) | Workout bonus (kcal) |
| weight_used | DECIMAL(5,1) | Weight used in calculation |
| source | VARCHAR(20) | 'calculated' / 'curator_override' |
| created_at | TIMESTAMP | |

**UNIQUE constraint:** `(user_id, date)` — one record per day, UPSERT on recalculation.

## Recalculation Triggers

1. Weight change (daily_metrics weight entry)
2. Profile update (height, birth_date, sex, activity_level, fitness_goal)
3. Workout logged (type + duration)
4. Workout modified/deleted

## Recalculation Logic

```
1. Get user profile (birth_date, sex, height, activity_level, goal)
2. Get latest known weight (from daily_metrics ≤ date)
3. If missing required data → skip, no record created
4. Calculate BMR → TDEE
5. Get workout for the day (from daily_metrics) → workout_bonus
6. Apply deficit/surplus by goal
7. Calculate macro split
8. Check: curator_override exists (weekly_plan for this date)?
   - Yes → save with source='curator_override', values from plan
   - No → save with source='calculated'
9. UPSERT into daily_calculated_targets
```

## Priority Logic

1. If curator set `weekly_plan` → source='curator_override', plan values used
2. If no curator plan → source='calculated', system calculates
3. Curator sees system recommendation as hint when creating weekly_plan

## Backend

### New module `internal/modules/nutrition-calc/`

- `calculator.go` — BMR/TDEE/KBJU formulas
- `service.go` — recalculation logic, triggers, CRUD
- `handler.go` — HTTP endpoints
- `types.go` — types

### New endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/nutrition-calc/targets?date=YYYY-MM-DD` | Day targets (client) |
| GET | `/v1/nutrition-calc/history?days=7` | Sliding window targets vs actual (client) |
| GET | `/v1/curator/clients/:id/targets/history?days=7` | Same for curator |
| POST | `/v1/nutrition-calc/recalculate` | Manual recalculation |

### Integration with existing modules

- `dashboard` → on weight save → calls `nutritionCalc.RecalculateForDate(userID, date)`
- `dashboard` → on workout log → same call
- `users` → on settings update → `nutritionCalc.RecalculateForDate(userID, today)`
- `food-tracker` → DailyTotals.Goals now reads from `daily_calculated_targets`

### History response format (7-day sliding window)

```json
[
  {
    "date": "2026-03-01",
    "target": { "calories": 2150, "protein": 140, "fat": 60, "carbs": 270 },
    "actual": { "calories": 2050, "protein": 135, "fat": 55, "carbs": 260 },
    "workout_bonus": 300,
    "source": "calculated"
  }
]
```

## Frontend

### Onboarding — new step "Body & Goals"

Inserted between current steps 2 (Settings) and 3 (Social):

Old flow: Photo → Settings → Social → Apple Health
New flow: Photo → Settings → **Body & Goals** → Social → Apple Health

Fields:
- Birth date (date picker)
- Biological sex (M/F radio)
- Current weight (kg/lbs based on units)
- Height (exists in settings, collect here if empty)
- Activity level (4 options with descriptions)
- Goal (loss / maintain / gain radio)
- Target weight (exists, show here too)

All fields required except target weight. First calculation triggered after onboarding completion.

### Settings — new page `/settings/body`

Same fields as onboarding, editable. On save → recalculation → show new calculated targets.

### Dashboard — "KBJU weekly" chart

Line chart (Recharts) showing 7-day sliding window:
- X axis: days (Mon-Sun)
- Y axis: kcal
- Two lines: target (dashed) and actual (solid)
- Markers on target line for workout days (visible "jump")
- Color coding: green (±10% of target), yellow (±10-20%), red (>20%)
- Click day → tooltip with full KBJU (target vs actual)

### Dashboard — updated KBZHUSummary

Existing progress bars + additions:
- Label under goal: "Calculated automatically" or "Curator plan"
- If workout: "+300 kcal for strength training (1h)"

### Curator — client card

In existing ClientCard:
- Row: age, sex, PAL, goal (compact)
- Same 7-day "targets vs actual" chart
- When creating weekly_plan: hint "System recommendation: 2150 kcal / 140P / 60F / 270C"

### Banner for incomplete profiles

On dashboard, top:
- Text: "Fill in your profile for automatic KBJU calculation"
- Link → `/settings/body`
- Dismissable, reappears after 3 days if still not filled

### New dependency

`recharts` — React charting library (~40kb gzip)

## Out of Scope

- Macro cycling / periodization
- Apple Health activity integration
- Goal achievement date projection
- Body fat percentage
