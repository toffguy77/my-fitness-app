# Dashboard Accessibility Documentation

## Overview

This document describes the accessibility features implemented for attention indicators in the Dashboard feature, ensuring compliance with WCAG 2.1 Level AA standards and requirements 15.10 and 15.12.

## Attention Indicator Accessibility Features

### 1. ARIA Labels (Requirement 15.10)

All attention indicators have comprehensive ARIA labels that provide context to screen reader users.

#### AttentionBadge Component

```typescript
<AttentionBadge
  urgency="high"
  count={3}
  ariaLabel="3 важных элементов требуют внимания"
  announceChanges={true}
  indicatesId="tasks-list"
/>
```

**ARIA Attributes:**
- `role="status"` - Identifies the element as a status indicator
- `aria-label` - Provides descriptive text for screen readers
- `aria-live="polite"` or `"assertive"` - Announces changes dynamically
- `aria-atomic="true"` - Ensures entire content is announced on change
- `aria-describedby` - Links indicator to the content it indicates
- `tabIndex={0}` - Makes indicator keyboard focusable

**Default ARIA Labels:**
- With count: `"${count} ${urgency} элементов требуют внимания"`
- With label: `"${label} требует внимания"`
- Default: `"Требует внимания"`

#### AttentionIcon Component

```typescript
<AttentionIcon
  urgency="high"
  size="md"
  ariaLabel="Низкая приверженность плану"
  announceChanges={true}
  indicatesId="weekly-plan-content"
/>
```

**ARIA Attributes:**
- `role="img"` - Identifies as an image/icon
- `aria-label` - Describes what the icon indicates
- `aria-live` - Announces when indicator appears/changes
- `aria-describedby` - Links to indicated content
- `tabIndex={0}` - Keyboard focusable

#### AttentionDot Component

```typescript
<AttentionDot
  urgency="normal"
  ariaLabel="Требует внимания"
  announceChanges={true}
  indicatesId="content-id"
/>
```

**ARIA Attributes:**
- `role="status"` - Status indicator
- `aria-label` - Descriptive label
- `aria-live` - Dynamic announcements
- `tabIndex={0}` - Keyboard accessible

### 2. ARIA Live Regions

Attention indicators use ARIA live regions to announce changes dynamically without requiring page refresh.

**Politeness Levels:**
- **Critical urgency**: `aria-live="assertive"` - Interrupts screen reader immediately
- **High/Normal urgency**: `aria-live="polite"` - Waits for screen reader to finish current announcement

**Implementation:**
```typescript
const ariaLive = announceChanges
  ? urgency === 'critical'
    ? 'assertive'
    : 'polite'
  : undefined;
```

**When to Use:**
- Set `announceChanges={true}` when indicator appears/disappears dynamically
- Set `announceChanges={false}` for static indicators present on page load

### 3. Keyboard Navigation (Requirement 15.12)

All attention indicators and indicated content are keyboard accessible.

#### Focus Management

**Attention Indicators:**
- All indicators have `tabIndex={0}` making them focusable
- Visible focus indicators via CSS `:focus` styles
- Focus order follows logical reading order

**Indicated Content:**
- Sections with attention indicators have proper `id` attributes
- Indicators link to content via `aria-describedby`
- Keyboard users can navigate to indicated items using Tab key

#### CalendarNavigator Keyboard Support

The calendar already implements roving tabindex for day navigation:

```typescript
useRovingTabIndex(daysContainerRef, {
  orientation: 'horizontal',
  loop: true,
  initialIndex: selectedDayIndex >= 0 ? selectedDayIndex : 0,
});
```

**Keyboard Controls:**
- **Tab**: Move focus into/out of calendar
- **Arrow Left/Right**: Navigate between days
- **Enter/Space**: Select day
- **Home**: Jump to first day
- **End**: Jump to last day

#### Section Navigation

All sections with attention indicators support keyboard navigation:

**TasksSection:**
- Tab to attention badge
- Tab to task list
- Tab through individual tasks
- Enter/Space to toggle completion or view details

**WeeklyPlanSection:**
- Tab to attention icon
- Tab through plan targets
- All interactive elements keyboard accessible

**PhotoUploadSection:**
- Tab to attention icon
- Tab to upload button
- Enter/Space to trigger file picker
- File input accessible via keyboard

### 4. Section-Level Accessibility

Each section implements proper ARIA structure:

```typescript
<section
  aria-labelledby="section-heading"
  aria-describedby={showAttentionIndicator ? "attention-indicator-id" : undefined}
>
  <h2 id="section-heading">Section Title</h2>
  {showAttentionIndicator && (
    <AttentionBadge
      indicatesId="section-content"
      announceChanges={true}
    />
  )}
  <div id="section-content">
    {/* Section content */}
  </div>
</section>
```

**ARIA Relationships:**
- `aria-labelledby` - Links section to its heading
- `aria-describedby` - Links section to attention indicator
- `indicatesId` - Links indicator to specific content

## Screen Reader Testing

### Recommended Screen Readers

1. **NVDA** (Windows) - Free, open-source
2. **JAWS** (Windows) - Industry standard
3. **VoiceOver** (macOS/iOS) - Built-in
4. **TalkBack** (Android) - Built-in

### Testing Checklist

#### Initial Page Load
- [ ] Screen reader announces page title and main heading
- [ ] All sections are properly labeled
- [ ] Attention indicators are announced with context
- [ ] Navigation landmarks are identified

#### Dynamic Updates
- [ ] New attention indicators are announced
- [ ] Indicator count changes are announced
- [ ] Indicator removal is announced
- [ ] Urgency level is communicated

#### Keyboard Navigation
- [ ] All indicators are reachable via Tab key
- [ ] Focus order is logical
- [ ] Focus indicators are visible
- [ ] Indicated content is reachable
- [ ] All interactive elements work with keyboard

#### Content Relationships
- [ ] Indicators clearly describe what they indicate
- [ ] Relationships between indicators and content are clear
- [ ] Context is provided for all indicators

### Testing Scenarios

#### Scenario 1: Tasks with Urgent Deadline

**Setup:**
- 2 tasks due within 2 days
- Current day is today

**Expected Behavior:**
1. Screen reader announces: "Задачи, 2 важных элементов требуют внимания"
2. Tab to attention badge: "2 задач требуют внимания (срок в течение 2 дней)"
3. Tab to task list: "Список задач"
4. Tab through tasks: Each task announced with title, status, and due date

#### Scenario 2: Low Plan Adherence

**Setup:**
- Active weekly plan
- Adherence < 80% for 2+ days
- Current day is today

**Expected Behavior:**
1. Screen reader announces: "Недельная планка"
2. Tab to attention icon: "Низкая приверженность плану (менее 80% в течение 2+ дней)"
3. Tab to plan content: "Активная недельная планка"
4. Plan targets announced with values

#### Scenario 3: Weekend Photo Upload

**Setup:**
- Current day is Saturday or Sunday
- No photo uploaded for current week

**Expected Behavior:**
1. Screen reader announces: "Фото прогресса"
2. Tab to attention icon: "Не забудьте загрузить фото прогресса на выходных"
3. Tab to upload button: "Загрузить фото прогресса"
4. Weekend reminder announced

## Implementation Examples

### Example 1: Adding Attention Indicator to New Section

```typescript
export function NewSection({ className = '' }: NewSectionProps) {
  const [showAttention, setShowAttention] = useState(false);

  return (
    <section
      className={className}
      aria-labelledby="new-section-heading"
      aria-describedby={showAttention ? "new-section-attention" : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="new-section-heading">New Section</h2>
        {showAttention && (
          <AttentionBadge
            urgency="high"
            count={5}
            ariaLabel="5 элементов требуют внимания"
            announceChanges={true}
            indicatesId="new-section-content"
          />
        )}
      </div>
      <div id="new-section-content">
        {/* Content */}
      </div>
    </section>
  );
}
```

### Example 2: Dynamic Attention Indicator

```typescript
export function DynamicSection() {
  const [itemCount, setItemCount] = useState(0);
  const showAttention = itemCount > 0;

  useEffect(() => {
    // When itemCount changes, indicator will announce via aria-live
  }, [itemCount]);

  return (
    <section aria-labelledby="dynamic-heading">
      <h2 id="dynamic-heading">Dynamic Section</h2>
      {showAttention && (
        <AttentionBadge
          count={itemCount}
          urgency={itemCount > 5 ? 'critical' : 'high'}
          announceChanges={true}
          indicatesId="dynamic-content"
        />
      )}
      <div id="dynamic-content">
        {/* Content */}
      </div>
    </section>
  );
}
```

### Example 3: Keyboard Navigation to Indicated Item

```typescript
export function NavigableSection() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showAttention, setShowAttention] = useState(true);

  const handleIndicatorClick = () => {
    // Focus the indicated content when indicator is clicked
    contentRef.current?.focus();
  };

  return (
    <section aria-labelledby="navigable-heading">
      <h2 id="navigable-heading">Navigable Section</h2>
      {showAttention && (
        <button
          onClick={handleIndicatorClick}
          aria-label="Перейти к элементам, требующим внимания"
        >
          <AttentionIcon
            urgency="high"
            indicatesId="navigable-content"
          />
        </button>
      )}
      <div
        id="navigable-content"
        ref={contentRef}
        tabIndex={-1}
      >
        {/* Content */}
      </div>
    </section>
  );
}
```

## Best Practices

### DO:
✅ Always provide meaningful ARIA labels
✅ Use `announceChanges={true}` for dynamic indicators
✅ Link indicators to content via `indicatesId` and `aria-describedby`
✅ Make all indicators keyboard focusable with `tabIndex={0}`
✅ Use appropriate urgency levels (normal, high, critical)
✅ Test with multiple screen readers
✅ Ensure logical focus order
✅ Provide context in ARIA labels (e.g., "срок в течение 2 дней")

### DON'T:
❌ Don't use generic labels like "Attention" or "Warning"
❌ Don't forget to set `announceChanges` for dynamic content
❌ Don't make indicators keyboard-inaccessible
❌ Don't use color alone to convey information
❌ Don't create keyboard traps
❌ Don't use `aria-live="assertive"` for non-critical updates
❌ Don't forget to test with actual screen readers

## Compliance

### WCAG 2.1 Level AA Compliance

**1.3.1 Info and Relationships (Level A):**
✅ All indicators use proper ARIA roles and relationships
✅ Semantic HTML structure maintained
✅ Relationships between indicators and content are programmatically determinable

**1.4.1 Use of Color (Level A):**
✅ Color is not the only means of conveying information
✅ Icons and text labels supplement color coding
✅ Different urgency levels use distinct icons

**2.1.1 Keyboard (Level A):**
✅ All functionality available via keyboard
✅ No keyboard traps
✅ Logical tab order

**2.4.3 Focus Order (Level A):**
✅ Focus order follows visual and logical order
✅ Indicators appear near related content

**2.4.7 Focus Visible (Level AA):**
✅ Visible focus indicators on all interactive elements
✅ Focus styles meet contrast requirements

**4.1.2 Name, Role, Value (Level A):**
✅ All indicators have accessible names (aria-label)
✅ Proper roles assigned (status, img)
✅ State changes announced via aria-live

**4.1.3 Status Messages (Level AA):**
✅ Status messages announced via aria-live
✅ Appropriate politeness levels used
✅ No focus changes required to perceive status

## Maintenance

### When Adding New Attention Indicators:

1. **Choose appropriate component:**
   - `AttentionBadge` - For counts and labels
   - `AttentionIcon` - For compact spaces
   - `AttentionDot` - For inline indicators

2. **Set proper ARIA attributes:**
   - Provide descriptive `ariaLabel`
   - Set `announceChanges={true}` if dynamic
   - Link to content via `indicatesId`

3. **Ensure keyboard accessibility:**
   - Verify indicator is focusable
   - Test tab order
   - Ensure indicated content is reachable

4. **Test with screen readers:**
   - Test with NVDA/JAWS/VoiceOver
   - Verify announcements are clear
   - Check dynamic updates work

5. **Document:**
   - Update this file with new examples
   - Add to testing checklist
   - Document any special behavior

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [NVDA Screen Reader](https://www.nvaccess.org/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [Inclusive Components](https://inclusive-components.design/)

## Support

For accessibility questions or issues:
1. Review this documentation
2. Check WCAG 2.1 guidelines
3. Test with screen readers
4. Consult with accessibility specialist if needed
