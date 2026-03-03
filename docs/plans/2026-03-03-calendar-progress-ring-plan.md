# Calendar Progress Ring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 3 indicator dots in CalendarNavigator with a compact SVG progress ring around the day number.

**Architecture:** Pure frontend change in one component. The DayButton sub-component gets a new `ProgressRing` SVG, the old dot indicators and badge are removed. Tests updated to match new DOM structure.

**Tech Stack:** React, SVG `<circle>` with `stroke-dasharray`, Tailwind CSS

---

### Task 1: Add ProgressRing SVG component and replace DayButton indicators

**Files:**
- Modify: `apps/web/src/features/dashboard/components/CalendarNavigator.tsx`

**Step 1: Add the ProgressRing sub-component**

Add this above the `DayButton` component (after line 117):

```tsx
const RING_SIZE = 36;
const RING_RADIUS = 15;
const RING_STROKE = 2.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// 3 segments with 4deg gaps → gap arc length = (4/360) * circumference
const GAP_LENGTH = (4 / 360) * RING_CIRCUMFERENCE;
const SEGMENT_LENGTH = (RING_CIRCUMFERENCE - 3 * GAP_LENGTH) / 3;

interface ProgressRingProps {
    completedCount: number;
    isSelected: boolean;
}

const ProgressRing = memo(function ProgressRing({ completedCount, isSelected }: ProgressRingProps) {
    const filledColor = isSelected ? 'white' : '#22c55e';       // white or green-500
    const emptyColor = isSelected ? 'rgba(255,255,255,0.3)' : '#e5e7eb'; // white/30 or gray-200

    // Build 3 segments. Each segment is a circle with dasharray = [segLen, rest].
    // We rotate each by 120deg offset (+ gap offset) to position them.
    const segments = [0, 1, 2].map((i) => {
        const isFilled = i < completedCount;
        // Rotation: start from top (-90deg), each segment offset by (120deg * i) + half-gap
        const rotationDeg = -90 + i * 120 + (GAP_LENGTH / RING_CIRCUMFERENCE) * 180;
        return (
            <circle
                key={i}
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={isFilled ? filledColor : emptyColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${SEGMENT_LENGTH} ${RING_CIRCUMFERENCE - SEGMENT_LENGTH}`}
                transform={`rotate(${rotationDeg} ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
        );
    });

    return (
        <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            aria-hidden="true"
            className="flex-shrink-0"
        >
            {segments}
        </svg>
    );
});
```

**Step 2: Simplify DayButtonProps**

Replace the current `DayButtonProps` interface (lines 105-117) with:

```tsx
interface DayButtonProps {
    date: Date;
    isToday: boolean;
    isSelected: boolean;
    completedCount: number;
    dayOfWeek: number;
    onClick: (date: Date) => void;
}
```

Remove `allGoalsCompleted` and `completionStatus` — replaced by `completedCount`.

**Step 3: Replace DayButton body**

Replace the DayButton component (lines 123-267) with:

```tsx
const DayButton = memo(function DayButton({
    date,
    isToday,
    isSelected,
    completedCount,
    dayOfWeek,
    onClick,
}: DayButtonProps) {
    const handleClick = useCallback(() => {
        onClick(date);
    }, [date, onClick]);

    const completionLabel =
        completedCount === 0
            ? 'нет выполненных целей'
            : completedCount === 3
                ? 'все цели выполнены'
                : `выполнено ${completedCount} из 3 целей`;

    return (
        <button
            onClick={handleClick}
            data-navigable="true"
            role="radio"
            aria-checked={isSelected}
            className={`
                flex flex-col items-center justify-center p-2 rounded-lg
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isSelected
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white hover:bg-gray-50 text-gray-700'
                }
                ${isToday && !isSelected ? 'ring-2 ring-blue-300' : ''}
            `}
            aria-label={`${DAY_NAMES_FULL[dayOfWeek]}, ${formatDayNumber(date)}, ${completionLabel}`}
            aria-current={isToday ? 'date' : undefined}
        >
            <span className="text-xs font-medium mb-1">
                {DAY_NAMES[dayOfWeek]}
            </span>

            <div className="relative flex items-center justify-center">
                <ProgressRing completedCount={completedCount} isSelected={isSelected} />
                <span className="absolute text-sm font-semibold">
                    {formatDayNumber(date)}
                </span>
            </div>
        </button>
    );
});
```

Key changes vs old DayButton:
- `p-3` → `p-2` (tighter padding since ring is more compact)
- Day number font: `text-lg` → `text-sm` (fits inside 36px ring)
- Removed: the `flex gap-1 mt-2` div with 3 indicator circles
- Removed: the absolute-positioned "all goals completed" badge
- Added: `ProgressRing` wrapping the day number
- aria-label now includes completion summary (e.g. "выполнено 2 из 3 целей")

**Step 4: Remove the `Check` import from lucide-react**

Change line 18 from:
```tsx
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
```
to:
```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
```

**Step 5: Replace `isAllGoalsCompleted` with `getCompletedCount`**

Replace the `isAllGoalsCompleted` callback (lines 336-348) with:

```tsx
const getCompletedCount = useCallback((date: Date): number => {
    const dateStr = formatDateISO(date);
    const metrics = dailyData[dateStr];
    if (!metrics?.completionStatus) return 0;
    const { nutritionFilled, weightLogged, activityCompleted } = metrics.completionStatus;
    return Number(nutritionFilled) + Number(weightLogged) + Number(activityCompleted);
}, [dailyData]);
```

**Step 6: Remove `getCompletionStatus` callback**

Delete the `getCompletionStatus` callback (lines 353-366) entirely — no longer needed.

**Step 7: Update the weekDays.map() render**

Replace the map body (lines 406-425) with:

```tsx
{weekDays.map((date) => {
    const isTodayDate = isSameDay(date, today);
    const isSelected = isSameDay(date, selectedDate);
    const completedCount = getCompletedCount(date);
    const dayOfWeek = getDayOfWeek(date);

    return (
        <DayButton
            key={date.toISOString()}
            date={date}
            isToday={isTodayDate}
            isSelected={isSelected}
            completedCount={completedCount}
            dayOfWeek={dayOfWeek}
            onClick={handleDayClick}
        />
    );
})}
```

**Step 8: Run type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 9: Run lint**

Run: `cd apps/web && npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 10: Commit**

```bash
git add apps/web/src/features/dashboard/components/CalendarNavigator.tsx
git commit -m "feat: replace calendar indicator dots with progress ring"
```

---

### Task 2: Update unit tests

**Files:**
- Modify: `apps/web/src/features/dashboard/components/__tests__/CalendarNavigator.test.tsx`

The old tests query for `.rounded-full` indicator dots, `bg-gray-300`, `bg-green-500`, aria-labels like "Питание заполнено", and "Все цели выполнены". These all need updating to match the new progress ring + completion summary aria-label.

**Step 1: Remove Check icon mock**

Replace the lucide-react mock (lines 17-21) with:

```tsx
jest.mock('lucide-react', () => ({
    ChevronLeft: () => <div data-testid="chevron-left" />,
    ChevronRight: () => <div data-testid="chevron-right" />,
}));
```

**Step 2: Replace "Goal Completion Indicators" describe block**

Replace the entire describe block (lines 212-337) with:

```tsx
describe('Goal Completion Indicators', () => {
    it('shows progress ring with 0 completed when no data', () => {
        render(<CalendarNavigator />);

        const mondayButton = screen.getByLabelText(/Понедельник, 15/);
        // Should contain an SVG (the progress ring)
        const svg = mondayButton.querySelector('svg');
        expect(svg).toBeInTheDocument();

        // aria-label should indicate no goals completed
        expect(mondayButton).toHaveAttribute(
            'aria-label',
            expect.stringContaining('нет выполненных целей')
        );
    });

    it('shows completion count in aria-label when goals partially completed', () => {
        const today = new Date('2024-01-15T12:00:00Z');
        const weekStart = getWeekStart(today);

        const partialMetrics = createMockMetrics({
            date: '2024-01-15',
            completionStatus: {
                nutritionFilled: true,
                weightLogged: false,
                activityCompleted: true,
            },
        });

        (useDashboardStore as unknown as jest.Mock).mockReturnValue({
            selectedDate: new Date('2024-01-16T12:00:00Z'),
            selectedWeek: {
                start: weekStart,
                end: getWeekEnd(today),
            },
            dailyData: {
                '2024-01-15': partialMetrics,
            },
            setSelectedDate: mockSetSelectedDate,
            navigateWeek: mockNavigateWeek,
        });

        render(<CalendarNavigator />);

        const mondayButton = screen.getByLabelText(/Понедельник, 15/);
        expect(mondayButton).toHaveAttribute(
            'aria-label',
            expect.stringContaining('выполнено 2 из 3 целей')
        );
    });

    it('shows all goals completed in aria-label when 3/3', () => {
        const today = new Date('2024-01-15T12:00:00Z');
        const weekStart = getWeekStart(today);

        const completedMetrics = createMockMetrics({
            date: '2024-01-15',
            completionStatus: {
                nutritionFilled: true,
                weightLogged: true,
                activityCompleted: true,
            },
        });

        (useDashboardStore as unknown as jest.Mock).mockReturnValue({
            selectedDate: new Date('2024-01-16T12:00:00Z'),
            selectedWeek: {
                start: weekStart,
                end: getWeekEnd(today),
            },
            dailyData: {
                '2024-01-15': completedMetrics,
            },
            setSelectedDate: mockSetSelectedDate,
            navigateWeek: mockNavigateWeek,
        });

        render(<CalendarNavigator />);

        const mondayButton = screen.getByLabelText(/Понедельник, 15/);
        expect(mondayButton).toHaveAttribute(
            'aria-label',
            expect.stringContaining('все цели выполнены')
        );
    });
});
```

**Step 3: Update "Accessibility" tests that reference old indicators**

Replace the test "has proper ARIA labels for goal indicators" (lines 404-441) with:

```tsx
it('has completion summary in day button aria-label', () => {
    const today = new Date('2024-01-15T12:00:00Z');
    const weekStart = getWeekStart(today);

    const metrics = createMockMetrics({
        date: '2024-01-15',
        completionStatus: {
            nutritionFilled: true,
            weightLogged: false,
            activityCompleted: true,
        },
    });

    (useDashboardStore as unknown as jest.Mock).mockReturnValue({
        selectedDate: today,
        selectedWeek: {
            start: weekStart,
            end: getWeekEnd(today),
        },
        dailyData: {
            '2024-01-15': metrics,
        },
        setSelectedDate: mockSetSelectedDate,
        navigateWeek: mockNavigateWeek,
    });

    render(<CalendarNavigator />);

    // Day button should include completion info in aria-label
    const mondayButton = screen.getByLabelText(/Понедельник, 15/);
    expect(mondayButton).toHaveAttribute(
        'aria-label',
        expect.stringContaining('выполнено 2 из 3')
    );
});
```

**Step 4: Update the "shows empty indicators" test in Edge Cases**

Replace the "handles empty dailyData gracefully" test (lines 522-545) — remove the part querying `.w-1\\.5.h-1\\.5.rounded-full` and instead check the SVG exists and aria-label says no goals:

```tsx
it('handles empty dailyData gracefully', () => {
    (useDashboardStore as unknown as jest.Mock).mockReturnValue({
        selectedDate: new Date('2024-01-15T12:00:00Z'),
        selectedWeek: {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-21T12:00:00Z'),
        },
        dailyData: {},
        setSelectedDate: mockSetSelectedDate,
        navigateWeek: mockNavigateWeek,
    });

    render(<CalendarNavigator />);

    expect(screen.getByText('Пн')).toBeInTheDocument();

    const mondayButton = screen.getByLabelText(/Понедельник, 15/);
    expect(mondayButton.querySelector('svg')).toBeInTheDocument();
    expect(mondayButton).toHaveAttribute(
        'aria-label',
        expect.stringContaining('нет выполненных целей')
    );
});
```

**Step 5: Run tests**

Run: `cd apps/web && npx jest src/features/dashboard/components/__tests__/CalendarNavigator.test.tsx --no-coverage`
Expected: All tests pass

**Step 6: Commit**

```bash
git add apps/web/src/features/dashboard/components/__tests__/CalendarNavigator.test.tsx
git commit -m "test: update CalendarNavigator tests for progress ring"
```

---

### Task 3: Update property tests

**Files:**
- Modify: `apps/web/src/features/dashboard/components/__tests__/CalendarNavigator.property.test.tsx`

The property tests look for individual `div[aria-label]` with "Питание", "Вес", "Активность" and `[aria-label="Все цели выполнены"]`. These need to be replaced with checks on the button's own aria-label completion summary.

**Step 1: Replace Property 3 test (indicators match data)**

Replace the first `it` block (lines 56-218) — instead of finding individual indicator divs and checking their aria-labels, check that the day button's aria-label contains the correct completion count:

```tsx
it('Property 3: Day button aria-label reflects completion count', () => {
    fc.assert(
        fc.property(
            fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
            fc.record({
                nutritionFilled: fc.boolean(),
                weightLogged: fc.boolean(),
                activityCompleted: fc.boolean(),
            }),
            (date, completionStatus: CompletionStatus) => {
                if (isNaN(date.getTime())) return true;

                const weekStart = getWeekStart(date);
                const weekEnd = getWeekEnd(date);
                const dateStr = formatDateISO(date);

                const metrics: DailyMetrics = {
                    date: dateStr,
                    userId: 'test-user',
                    nutrition: {
                        calories: completionStatus.nutritionFilled ? 2000 : 0,
                        protein: 150, fat: 60, carbs: 200,
                    },
                    weight: completionStatus.weightLogged ? 75.5 : null,
                    steps: completionStatus.activityCompleted ? 10000 : 0,
                    workout: { completed: completionStatus.activityCompleted },
                    completionStatus,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const selectedDay = date.getDay() === 1
                    ? new Date(weekStart.getTime() + 86400000)
                    : weekStart;

                mockUseDashboardStore.mockReturnValue({
                    selectedDate: selectedDay,
                    selectedWeek: { start: weekStart, end: weekEnd },
                    dailyData: { [dateStr]: metrics },
                    setSelectedDate: jest.fn(),
                    navigateWeek: jest.fn(),
                    weeklyPlan: null,
                    tasks: [],
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    pollingIntervalId: null,
                    fetchDailyData: jest.fn(),
                    fetchWeekData: jest.fn(),
                    updateMetric: jest.fn(),
                    fetchWeeklyPlan: jest.fn(),
                    fetchTasks: jest.fn(),
                    updateTaskStatus: jest.fn(),
                    submitWeeklyReport: jest.fn(),
                    uploadPhoto: jest.fn(),
                    pollForUpdates: jest.fn(),
                    startPolling: jest.fn(),
                    stopPolling: jest.fn(),
                    clearError: jest.fn(),
                    reset: jest.fn(),
                    setOfflineStatus: jest.fn(),
                    loadFromCache: jest.fn(),
                    syncWhenOnline: jest.fn(),
                });

                const { container } = render(<CalendarNavigator />);

                const dayNumber = date.getDate();
                const dayOfWeek = date.getDay();
                const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
                const expectedDayName = dayNames[dayOfWeek];

                const dayButton = Array.from(container.querySelectorAll('button')).find((btn) => {
                    const ariaLabel = btn.getAttribute('aria-label') || '';
                    return ariaLabel.includes(expectedDayName) && ariaLabel.includes(`, ${dayNumber}`);
                });

                if (!dayButton) return true;

                const completedCount = Number(completionStatus.nutritionFilled)
                    + Number(completionStatus.weightLogged)
                    + Number(completionStatus.activityCompleted);

                const label = dayButton.getAttribute('aria-label') || '';

                if (completedCount === 0) {
                    expect(label).toContain('нет выполненных целей');
                } else if (completedCount === 3) {
                    expect(label).toContain('все цели выполнены');
                } else {
                    expect(label).toContain(`выполнено ${completedCount} из 3 целей`);
                }
            }
        ),
        { numRuns: 100 }
    );
});
```

**Step 2: Replace Property 3 test (checkmark only when all completed)**

Replace the second `it` block (lines 224-338) — instead of checking for `[aria-label="Все цели выполнены"]` child div, check the button aria-label:

```tsx
it('Property 3: "все цели выполнены" in aria-label iff all 3 goals completed', () => {
    fc.assert(
        fc.property(
            fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
            fc.boolean(),
            fc.boolean(),
            fc.boolean(),
            (date, nutritionFilled, weightLogged, activityCompleted) => {
                if (isNaN(date.getTime())) return true;

                const weekStart = getWeekStart(date);
                const weekEnd = getWeekEnd(date);
                const dateStr = formatDateISO(date);

                const completionStatus: CompletionStatus = {
                    nutritionFilled, weightLogged, activityCompleted,
                };

                const metrics: DailyMetrics = {
                    date: dateStr,
                    userId: 'test-user',
                    nutrition: { calories: nutritionFilled ? 2000 : 0, protein: 150, fat: 60, carbs: 200 },
                    weight: weightLogged ? 75.5 : null,
                    steps: activityCompleted ? 10000 : 0,
                    workout: { completed: activityCompleted },
                    completionStatus,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const selectedDay = date.getDay() === 1
                    ? new Date(weekStart.getTime() + 86400000)
                    : weekStart;

                mockUseDashboardStore.mockReturnValue({
                    selectedDate: selectedDay,
                    selectedWeek: { start: weekStart, end: weekEnd },
                    dailyData: { [dateStr]: metrics },
                    setSelectedDate: jest.fn(),
                    navigateWeek: jest.fn(),
                    weeklyPlan: null,
                    tasks: [],
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    pollingIntervalId: null,
                    fetchDailyData: jest.fn(),
                    fetchWeekData: jest.fn(),
                    updateMetric: jest.fn(),
                    fetchWeeklyPlan: jest.fn(),
                    fetchTasks: jest.fn(),
                    updateTaskStatus: jest.fn(),
                    submitWeeklyReport: jest.fn(),
                    uploadPhoto: jest.fn(),
                    pollForUpdates: jest.fn(),
                    startPolling: jest.fn(),
                    stopPolling: jest.fn(),
                    clearError: jest.fn(),
                    reset: jest.fn(),
                    setOfflineStatus: jest.fn(),
                    loadFromCache: jest.fn(),
                    syncWhenOnline: jest.fn(),
                });

                const { container } = render(<CalendarNavigator />);

                const dayNumber = date.getDate();
                const dayOfWeek = date.getDay();
                const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
                const expectedDayName = dayNames[dayOfWeek];

                const dayButton = Array.from(container.querySelectorAll('button')).find((btn) => {
                    const ariaLabel = btn.getAttribute('aria-label') || '';
                    return ariaLabel.includes(expectedDayName) && ariaLabel.includes(`, ${dayNumber}`);
                });

                if (!dayButton) return true;

                const label = dayButton.getAttribute('aria-label') || '';
                const allCompleted = nutritionFilled && weightLogged && activityCompleted;

                if (allCompleted) {
                    expect(label).toContain('все цели выполнены');
                } else {
                    expect(label).not.toContain('все цели выполнены');
                }
            }
        ),
        { numRuns: 100 }
    );
});
```

**Step 3: Replace Property 3 test (indicators present for all 7 days)**

Replace the third `it` block (lines 340-454) — instead of checking for `div[aria-label]` with Питание/Вес/Активность, check that each day button has an SVG and a completion aria-label:

```tsx
it('Property 3: All 7 days have progress ring and completion aria-label', () => {
    fc.assert(
        fc.property(
            fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
            (date) => {
                if (isNaN(date.getTime())) return true;

                const weekStart = getWeekStart(date);
                const weekEnd = getWeekEnd(date);

                const dailyData: Record<string, DailyMetrics> = {};
                for (let i = 0; i < 7; i++) {
                    const dayDate = new Date(weekStart);
                    dayDate.setDate(weekStart.getDate() + i);
                    const dateStr = formatDateISO(dayDate);
                    dailyData[dateStr] = {
                        date: dateStr,
                        userId: 'test-user',
                        nutrition: { calories: Math.random() > 0.5 ? 2000 : 0, protein: 150, fat: 60, carbs: 200 },
                        weight: Math.random() > 0.5 ? 75.5 : null,
                        steps: Math.random() > 0.5 ? 10000 : 0,
                        workout: { completed: Math.random() > 0.5 },
                        completionStatus: {
                            nutritionFilled: Math.random() > 0.5,
                            weightLogged: Math.random() > 0.5,
                            activityCompleted: Math.random() > 0.5,
                        },
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                }

                mockUseDashboardStore.mockReturnValue({
                    selectedDate: date,
                    selectedWeek: { start: weekStart, end: weekEnd },
                    dailyData,
                    setSelectedDate: jest.fn(),
                    navigateWeek: jest.fn(),
                    weeklyPlan: null,
                    tasks: [],
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    pollingIntervalId: null,
                    fetchDailyData: jest.fn(),
                    fetchWeekData: jest.fn(),
                    updateMetric: jest.fn(),
                    fetchWeeklyPlan: jest.fn(),
                    fetchTasks: jest.fn(),
                    updateTaskStatus: jest.fn(),
                    submitWeeklyReport: jest.fn(),
                    uploadPhoto: jest.fn(),
                    pollForUpdates: jest.fn(),
                    startPolling: jest.fn(),
                    stopPolling: jest.fn(),
                    clearError: jest.fn(),
                    reset: jest.fn(),
                    setOfflineStatus: jest.fn(),
                    loadFromCache: jest.fn(),
                    syncWhenOnline: jest.fn(),
                });

                const { container } = render(<CalendarNavigator />);

                const dayButtons = Array.from(container.querySelectorAll('button')).filter((btn) => {
                    const label = btn.getAttribute('aria-label') || '';
                    return label.includes('Понедельник') || label.includes('Вторник') ||
                        label.includes('Среда') || label.includes('Четверг') ||
                        label.includes('Пятница') || label.includes('Суббота') ||
                        label.includes('Воскресенье');
                });

                expect(dayButtons.length).toBe(7);

                dayButtons.forEach((btn) => {
                    // Each day should have an SVG progress ring
                    expect(btn.querySelector('svg')).toBeTruthy();

                    // Each day should have completion info in aria-label
                    const label = btn.getAttribute('aria-label') || '';
                    const hasCompletionInfo =
                        label.includes('нет выполненных целей') ||
                        label.includes('выполнено') ||
                        label.includes('все цели выполнены');
                    expect(hasCompletionInfo).toBe(true);
                });
            }
        ),
        { numRuns: 100 }
    );
});
```

**Step 4: Run all tests**

Run: `cd apps/web && npx jest src/features/dashboard/components/__tests__/CalendarNavigator --no-coverage`
Expected: All tests pass (both unit and property tests)

**Step 5: Run full type-check and lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: Clean

**Step 6: Commit**

```bash
git add apps/web/src/features/dashboard/components/__tests__/CalendarNavigator.property.test.tsx
git commit -m "test: update property tests for progress ring"
```
