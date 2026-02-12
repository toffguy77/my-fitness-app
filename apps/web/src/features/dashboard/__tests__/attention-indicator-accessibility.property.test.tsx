/**
 * Property-Based Test: Attention Indicator Accessibility
 * 
 * Property 45: Attention Indicator Accessibility
 * Validates: Requirements 15.10, 15.12
 * 
 * Tests that ALL attention indicators have proper ARIA labels and keyboard navigation
 * regardless of props provided.
 * 
 * Feature: dashboard, Property 45: Attention Indicator Accessibility
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import {
    AttentionBadge,
    AttentionIcon,
    AttentionDot,
    type UrgencyLevel,
    type AttentionBadgeProps,
    type AttentionIconProps,
    type AttentionDotProps,
} from '../components/AttentionBadge';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate urgency levels
 */
const urgencyGenerator = (): fc.Arbitrary<UrgencyLevel> =>
    fc.constantFrom('normal', 'high', 'critical');

/**
 * Generate count values (0-99)
 */
const countGenerator = (): fc.Arbitrary<number | undefined> =>
    fc.option(fc.integer({ min: 0, max: 99 }), { nil: undefined });

/**
 * Generate label strings
 */
const labelGenerator = (): fc.Arbitrary<string | undefined> =>
    fc.option(
        fc.constantFrom(
            'Задачи',
            'Вес',
            'Питание',
            'Шаги',
            'Тренировка',
            'Фото',
            'План',
            'Отчет'
        ),
        { nil: undefined }
    );

/**
 * Generate custom ARIA labels
 */
const ariaLabelGenerator = (): fc.Arbitrary<string | undefined> =>
    fc.option(
        fc.constantFrom(
            'Требует внимания',
            'Срочно: задачи просрочены',
            'Низкая приверженность плану',
            'Загрузите фото',
            'Отправьте отчет'
        ),
        { nil: undefined }
    );

/**
 * Generate boolean values
 */
const booleanGenerator = (): fc.Arbitrary<boolean> =>
    fc.boolean();

/**
 * Generate ID strings
 */
const idGenerator = (): fc.Arbitrary<string | undefined> =>
    fc.option(
        fc.constantFrom(
            'tasks-list',
            'weight-block',
            'nutrition-block',
            'steps-block',
            'workout-block',
            'photo-section',
            'plan-section',
            'report-button'
        ),
        { nil: undefined }
    );

/**
 * Generate AttentionBadge props
 */
const attentionBadgePropsGenerator = (): fc.Arbitrary<AttentionBadgeProps> =>
    fc.record({
        urgency: urgencyGenerator(),
        count: countGenerator(),
        label: labelGenerator(),
        pulse: booleanGenerator(),
        ariaLabel: ariaLabelGenerator(),
        announceChanges: booleanGenerator(),
        indicatesId: idGenerator(),
    });

/**
 * Generate AttentionIcon props
 */
const attentionIconPropsGenerator = (): fc.Arbitrary<AttentionIconProps> =>
    fc.record({
        urgency: urgencyGenerator(),
        size: fc.constantFrom('sm', 'md', 'lg'),
        pulse: booleanGenerator(),
        ariaLabel: ariaLabelGenerator(),
        announceChanges: booleanGenerator(),
        indicatesId: idGenerator(),
    });

/**
 * Generate AttentionDot props
 */
const attentionDotPropsGenerator = (): fc.Arbitrary<AttentionDotProps> =>
    fc.record({
        urgency: urgencyGenerator(),
        pulse: booleanGenerator(),
        ariaLabel: ariaLabelGenerator(),
        announceChanges: booleanGenerator(),
        indicatesId: idGenerator(),
    });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 45: Attention Indicator Accessibility', () => {
    describe('AttentionBadge: ARIA Labels (Requirement 15.10)', () => {
        it('always has role="status" for screen readers', () => {
            fc.assert(
                fc.property(attentionBadgePropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionBadge {...props} />);

                    const badge = screen.getByRole('status');
                    expect(badge).toBeInTheDocument();

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('always has an accessible ARIA label', () => {
            fc.assert(
                fc.property(attentionBadgePropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionBadge {...props} />);

                    const badge = screen.getByRole('status');
                    const ariaLabel = badge.getAttribute('aria-label');

                    // Must have an aria-label
                    expect(ariaLabel).toBeTruthy();
                    expect(typeof ariaLabel).toBe('string');
                    expect(ariaLabel!.length).toBeGreaterThan(0);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('uses custom ARIA label when provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (urgency, customLabel) => {
                        const { unmount } = render(
                            <AttentionBadge urgency={urgency} ariaLabel={customLabel} />
                        );

                        const badge = screen.getByRole('status');
                        expect(badge).toHaveAttribute('aria-label', customLabel);

                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('always has aria-atomic="true" for complete announcements', () => {
            fc.assert(
                fc.property(attentionBadgePropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionBadge {...props} />);

                    const badge = screen.getByRole('status');
                    expect(badge).toHaveAttribute('aria-atomic', 'true');

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('sets aria-live correctly based on urgency when announceChanges is true', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount } = render(
                        <AttentionBadge urgency={urgency} announceChanges={true} />
                    );

                    const badge = screen.getByRole('status');
                    const expectedAriaLive = urgency === 'critical' ? 'assertive' : 'polite';
                    expect(badge).toHaveAttribute('aria-live', expectedAriaLive);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('does not set aria-live when announceChanges is false', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount } = render(
                        <AttentionBadge urgency={urgency} announceChanges={false} />
                    );

                    const badge = screen.getByRole('status');
                    expect(badge).not.toHaveAttribute('aria-live');

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('links to indicated content via aria-describedby when indicatesId is provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (urgency, indicatesId) => {
                        const { unmount } = render(
                            <AttentionBadge urgency={urgency} indicatesId={indicatesId} />
                        );

                        const badge = screen.getByRole('status');
                        expect(badge).toHaveAttribute('aria-describedby', indicatesId);

                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('includes urgency level in data attribute', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount } = render(<AttentionBadge urgency={urgency} />);

                    const badge = screen.getByRole('status');
                    expect(badge).toHaveAttribute('data-urgency', urgency);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('AttentionBadge: Keyboard Navigation (Requirement 15.12)', () => {
        it('is always keyboard focusable with tabIndex={0}', () => {
            fc.assert(
                fc.property(attentionBadgePropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionBadge {...props} />);

                    const badge = screen.getByRole('status');
                    expect(badge).toHaveAttribute('tabIndex', '0');

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('can receive keyboard focus for all prop combinations', async () => {
            await fc.assert(
                fc.asyncProperty(attentionBadgePropsGenerator(), async (props) => {
                    const user = userEvent.setup();
                    const { unmount } = render(<AttentionBadge {...props} />);

                    const badge = screen.getByRole('status');

                    // Tab to focus the badge
                    await user.tab();
                    expect(badge).toHaveFocus();

                    unmount();
                }),
                { numRuns: 50 } // Reduced for async tests
            );
        });

        it('maintains focus order in document for all urgency levels', async () => {
            await fc.assert(
                fc.asyncProperty(urgencyGenerator(), async (urgency) => {
                    const user = userEvent.setup();
                    const { unmount } = render(
                        <div>
                            <button>Before</button>
                            <AttentionBadge urgency={urgency} />
                            <button>After</button>
                        </div>
                    );

                    const before = screen.getByRole('button', { name: 'Before' });
                    const badge = screen.getByRole('status');
                    const after = screen.getByRole('button', { name: 'After' });

                    // Tab through elements in order
                    await user.tab();
                    expect(before).toHaveFocus();

                    await user.tab();
                    expect(badge).toHaveFocus();

                    await user.tab();
                    expect(after).toHaveFocus();

                    unmount();
                }),
                { numRuns: 30 } // Reduced for async tests
            );
        });
    });

    describe('AttentionIcon: ARIA Labels (Requirement 15.10)', () => {
        it('always has role="img" for screen readers', () => {
            fc.assert(
                fc.property(attentionIconPropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionIcon {...props} />);

                    const icon = screen.getByRole('img');
                    expect(icon).toBeInTheDocument();

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('always has an accessible ARIA label', () => {
            fc.assert(
                fc.property(attentionIconPropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionIcon {...props} />);

                    const icon = screen.getByRole('img');
                    const ariaLabel = icon.getAttribute('aria-label');

                    expect(ariaLabel).toBeTruthy();
                    expect(typeof ariaLabel).toBe('string');
                    expect(ariaLabel!.length).toBeGreaterThan(0);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('uses custom ARIA label when provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (urgency, customLabel) => {
                        const { unmount } = render(
                            <AttentionIcon urgency={urgency} ariaLabel={customLabel} />
                        );

                        const icon = screen.getByRole('img');
                        expect(icon).toHaveAttribute('aria-label', customLabel);

                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('sets aria-live correctly based on urgency when announceChanges is true', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount } = render(
                        <AttentionIcon urgency={urgency} announceChanges={true} />
                    );

                    const icon = screen.getByRole('img');
                    const expectedAriaLive = urgency === 'critical' ? 'assertive' : 'polite';
                    expect(icon).toHaveAttribute('aria-live', expectedAriaLive);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('links to indicated content when indicatesId is provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (urgency, indicatesId) => {
                        const { unmount } = render(
                            <AttentionIcon urgency={urgency} indicatesId={indicatesId} />
                        );

                        const icon = screen.getByRole('img');
                        expect(icon).toHaveAttribute('aria-describedby', indicatesId);

                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('AttentionIcon: Keyboard Navigation (Requirement 15.12)', () => {
        it('is always keyboard focusable with tabIndex={0}', () => {
            fc.assert(
                fc.property(attentionIconPropsGenerator(), (props) => {
                    const { container, unmount } = render(<AttentionIcon {...props} />);

                    // Use container to query within this specific render
                    const icon = container.querySelector('[role="img"]');
                    expect(icon).toBeInTheDocument();
                    // Note: React sets tabIndex, but DOM has lowercase tabindex
                    expect(icon).toHaveAttribute('tabindex', '0');

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('can receive keyboard focus for all prop combinations', async () => {
            await fc.assert(
                fc.asyncProperty(attentionIconPropsGenerator(), async (props) => {
                    const user = userEvent.setup();
                    const { unmount } = render(<AttentionIcon {...props} />);

                    const icon = screen.getByRole('img');

                    await user.tab();
                    expect(icon).toHaveFocus();

                    unmount();
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('AttentionDot: ARIA Labels (Requirement 15.10)', () => {
        it('always has role="status" for screen readers', () => {
            fc.assert(
                fc.property(attentionDotPropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionDot {...props} />);

                    const dot = screen.getByRole('status');
                    expect(dot).toBeInTheDocument();

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('always has an accessible ARIA label', () => {
            fc.assert(
                fc.property(attentionDotPropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionDot {...props} />);

                    const dot = screen.getByRole('status');
                    const ariaLabel = dot.getAttribute('aria-label');

                    expect(ariaLabel).toBeTruthy();
                    expect(typeof ariaLabel).toBe('string');
                    expect(ariaLabel!.length).toBeGreaterThan(0);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('uses custom ARIA label when provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (urgency, customLabel) => {
                        const { unmount } = render(
                            <AttentionDot urgency={urgency} ariaLabel={customLabel} />
                        );

                        const dot = screen.getByRole('status');
                        expect(dot).toHaveAttribute('aria-label', customLabel);

                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('sets aria-live correctly based on urgency when announceChanges is true', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount } = render(
                        <AttentionDot urgency={urgency} announceChanges={true} />
                    );

                    const dot = screen.getByRole('status');
                    const expectedAriaLive = urgency === 'critical' ? 'assertive' : 'polite';
                    expect(dot).toHaveAttribute('aria-live', expectedAriaLive);

                    unmount();
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('AttentionDot: Keyboard Navigation (Requirement 15.12)', () => {
        it('is always keyboard focusable with tabIndex={0}', () => {
            fc.assert(
                fc.property(attentionDotPropsGenerator(), (props) => {
                    const { unmount } = render(<AttentionDot {...props} />);

                    const dot = screen.getByRole('status');
                    expect(dot).toHaveAttribute('tabIndex', '0');

                    unmount();
                }),
                { numRuns: 100 }
            );
        });

        it('can receive keyboard focus for all prop combinations', async () => {
            await fc.assert(
                fc.asyncProperty(attentionDotPropsGenerator(), async (props) => {
                    const user = userEvent.setup();
                    const { unmount } = render(<AttentionDot {...props} />);

                    const dot = screen.getByRole('status');

                    await user.tab();
                    expect(dot).toHaveFocus();

                    unmount();
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Cross-Component Consistency', () => {
        it('all components use consistent urgency data attributes', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount: unmount1 } = render(<AttentionBadge urgency={urgency} />);
                    const badge = screen.getByRole('status');
                    const badgeUrgency = badge.getAttribute('data-urgency');
                    unmount1();

                    const { unmount: unmount2 } = render(<AttentionIcon urgency={urgency} />);
                    const icon = screen.getByRole('img');
                    const iconUrgency = icon.getAttribute('data-urgency');
                    unmount2();

                    const { unmount: unmount3 } = render(<AttentionDot urgency={urgency} />);
                    const dot = screen.getByRole('status');
                    const dotUrgency = dot.getAttribute('data-urgency');
                    unmount3();

                    // All should have the same urgency value
                    expect(badgeUrgency).toBe(urgency);
                    expect(iconUrgency).toBe(urgency);
                    expect(dotUrgency).toBe(urgency);
                }),
                { numRuns: 100 }
            );
        });

        it('all components handle aria-live consistently for critical urgency', () => {
            fc.assert(
                fc.property(booleanGenerator(), (announceChanges) => {
                    const { unmount: unmount1 } = render(
                        <AttentionBadge urgency="critical" announceChanges={announceChanges} />
                    );
                    const badge = screen.getByRole('status');
                    const badgeAriaLive = badge.getAttribute('aria-live');
                    unmount1();

                    const { unmount: unmount2 } = render(
                        <AttentionIcon urgency="critical" announceChanges={announceChanges} />
                    );
                    const icon = screen.getByRole('img');
                    const iconAriaLive = icon.getAttribute('aria-live');
                    unmount2();

                    const { unmount: unmount3 } = render(
                        <AttentionDot urgency="critical" announceChanges={announceChanges} />
                    );
                    const dot = screen.getByRole('status');
                    const dotAriaLive = dot.getAttribute('aria-live');
                    unmount3();

                    // All should handle aria-live the same way
                    const expectedValue = announceChanges ? 'assertive' : null;
                    expect(badgeAriaLive).toBe(expectedValue);
                    expect(iconAriaLive).toBe(expectedValue);
                    expect(dotAriaLive).toBe(expectedValue);
                }),
                { numRuns: 100 }
            );
        });

        it('all components are keyboard focusable', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { container: container1, unmount: unmount1 } = render(<AttentionBadge urgency={urgency} />);
                    const badge = container1.querySelector('[role="status"]');
                    expect(badge).toBeInTheDocument();
                    // Note: React sets tabIndex, but DOM has lowercase tabindex
                    expect(badge).toHaveAttribute('tabindex', '0');
                    unmount1();

                    const { container: container2, unmount: unmount2 } = render(<AttentionIcon urgency={urgency} />);
                    const icon = container2.querySelector('[role="img"]');
                    expect(icon).toBeInTheDocument();
                    expect(icon).toHaveAttribute('tabindex', '0');
                    unmount2();

                    const { container: container3, unmount: unmount3 } = render(<AttentionDot urgency={urgency} />);
                    const dot = container3.querySelector('[role="status"]');
                    expect(dot).toBeInTheDocument();
                    expect(dot).toHaveAttribute('tabindex', '0');
                    unmount3();
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Content Linking (indicatesId)', () => {
        it('properly links to content for all components when indicatesId is provided', () => {
            fc.assert(
                fc.property(
                    urgencyGenerator(),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (urgency, indicatesId) => {
                        // Test AttentionBadge
                        const { unmount: unmount1 } = render(
                            <AttentionBadge urgency={urgency} indicatesId={indicatesId} />
                        );
                        const badge = screen.getByRole('status');
                        expect(badge).toHaveAttribute('aria-describedby', indicatesId);
                        unmount1();

                        // Test AttentionIcon
                        const { unmount: unmount2 } = render(
                            <AttentionIcon urgency={urgency} indicatesId={indicatesId} />
                        );
                        const icon = screen.getByRole('img');
                        expect(icon).toHaveAttribute('aria-describedby', indicatesId);
                        unmount2();

                        // Test AttentionDot
                        const { unmount: unmount3 } = render(
                            <AttentionDot urgency={urgency} indicatesId={indicatesId} />
                        );
                        const dot = screen.getByRole('status');
                        expect(dot).toHaveAttribute('aria-describedby', indicatesId);
                        unmount3();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('does not set aria-describedby when indicatesId is not provided', () => {
            fc.assert(
                fc.property(urgencyGenerator(), (urgency) => {
                    const { unmount: unmount1 } = render(<AttentionBadge urgency={urgency} />);
                    const badge = screen.getByRole('status');
                    expect(badge).not.toHaveAttribute('aria-describedby');
                    unmount1();

                    const { unmount: unmount2 } = render(<AttentionIcon urgency={urgency} />);
                    const icon = screen.getByRole('img');
                    expect(icon).not.toHaveAttribute('aria-describedby');
                    unmount2();

                    const { unmount: unmount3 } = render(<AttentionDot urgency={urgency} />);
                    const dot = screen.getByRole('status');
                    expect(dot).not.toHaveAttribute('aria-describedby');
                    unmount3();
                }),
                { numRuns: 100 }
            );
        });
    });
});
