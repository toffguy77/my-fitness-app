/**
 * AttentionBadge Accessibility Tests
 *
 * Tests for WCAG 2.1 compliance and requirements 15.10, 15.12
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    AttentionBadge,
    AttentionIcon,
    AttentionDot,
} from '../AttentionBadge';

describe('AttentionBadge Accessibility', () => {
    describe('ARIA Labels (Requirement 15.10)', () => {
        it('has role="status" for screen readers', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toBeInTheDocument();
        });

        it('provides default ARIA label', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-label', 'Требует внимания');
        });

        it('provides ARIA label with count', () => {
            render(<AttentionBadge urgency="high" count={3} />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute(
                'aria-label',
                '3 важных элементов требуют внимания'
            );
        });

        it('provides ARIA label with custom label', () => {
            render(<AttentionBadge urgency="normal" label="Задачи" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-label', 'Задачи требует внимания');
        });

        it('accepts custom ARIA label', () => {
            render(
                <AttentionBadge
                    urgency="critical"
                    ariaLabel="Срочно: 5 задач просрочены"
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-label', 'Срочно: 5 задач просрочены');
        });

        it('uses assertive aria-live for critical urgency', () => {
            render(
                <AttentionBadge
                    urgency="critical"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live', 'assertive');
        });

        it('uses polite aria-live for high urgency', () => {
            render(
                <AttentionBadge
                    urgency="high"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live', 'polite');
        });

        it('uses polite aria-live for normal urgency', () => {
            render(
                <AttentionBadge
                    urgency="normal"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live', 'polite');
        });

        it('does not set aria-live when announceChanges is false', () => {
            render(
                <AttentionBadge
                    urgency="high"
                    announceChanges={false}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).not.toHaveAttribute('aria-live');
        });

        it('sets aria-atomic="true" for complete announcements', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-atomic', 'true');
        });

        it('links to indicated content via aria-describedby', () => {
            render(
                <AttentionBadge
                    urgency="high"
                    indicatesId="tasks-list"
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-describedby', 'tasks-list');
        });
    });

    describe('Keyboard Navigation (Requirement 15.12)', () => {
        it('is keyboard focusable with tabIndex={0}', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('tabIndex', '0');
        });

        it('can receive keyboard focus', async () => {
            const user = userEvent.setup();
            render(<AttentionBadge urgency="high" count={3} />);
            const badge = screen.getByRole('status');

            await user.tab();
            expect(badge).toHaveFocus();
        });

        it('maintains focus order in document', async () => {
            const user = userEvent.setup();
            render(
                <div>
                    <button>Before</button>
                    <AttentionBadge urgency="high" />
                    <button>After</button>
                </div>
            );

            const before = screen.getByRole('button', { name: 'Before' });
            const badge = screen.getByRole('status');
            const after = screen.getByRole('button', { name: 'After' });

            await user.tab();
            expect(before).toHaveFocus();

            await user.tab();
            expect(badge).toHaveFocus();

            await user.tab();
            expect(after).toHaveFocus();
        });
    });

    describe('Visual Indicators', () => {
        it('displays icon for visual users', () => {
            const { container } = render(<AttentionBadge urgency="normal" />);
            const icon = container.querySelector('svg');
            expect(icon).toBeInTheDocument();
            expect(icon).toHaveAttribute('aria-hidden', 'true');
        });

        it('hides decorative icon from screen readers', () => {
            const { container } = render(<AttentionBadge urgency="high" />);
            const icon = container.querySelector('svg');
            expect(icon).toHaveAttribute('aria-hidden', 'true');
        });

        it('displays count for visual users', () => {
            render(<AttentionBadge urgency="high" count={5} />);
            expect(screen.getByText('5')).toBeInTheDocument();
        });

        it('displays label for visual users', () => {
            render(<AttentionBadge urgency="normal" label="Задачи" />);
            expect(screen.getByText('Задачи')).toBeInTheDocument();
        });
    });

    describe('Urgency Levels', () => {
        it('indicates normal urgency in data attribute', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'normal');
        });

        it('indicates high urgency in data attribute', () => {
            render(<AttentionBadge urgency="high" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'high');
        });

        it('indicates critical urgency in data attribute', () => {
            render(<AttentionBadge urgency="critical" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'critical');
        });
    });
});

describe('AttentionIcon Accessibility', () => {
    describe('ARIA Labels', () => {
        it('has role="img" for screen readers', () => {
            render(<AttentionIcon urgency="normal" />);
            const icon = screen.getByRole('img');
            expect(icon).toBeInTheDocument();
        });

        it('provides default ARIA label', () => {
            render(<AttentionIcon urgency="normal" />);
            const icon = screen.getByRole('img');
            expect(icon).toHaveAttribute('aria-label', 'Требует внимания');
        });

        it('accepts custom ARIA label', () => {
            render(
                <AttentionIcon
                    urgency="high"
                    ariaLabel="Низкая приверженность плану"
                />
            );
            const icon = screen.getByRole('img');
            expect(icon).toHaveAttribute(
                'aria-label',
                'Низкая приверженность плану'
            );
        });

        it('uses assertive aria-live for critical urgency', () => {
            render(
                <AttentionIcon
                    urgency="critical"
                    announceChanges={true}
                />
            );
            const icon = screen.getByRole('img');
            expect(icon).toHaveAttribute('aria-live', 'assertive');
        });

        it('links to indicated content', () => {
            render(
                <AttentionIcon
                    urgency="high"
                    indicatesId="weekly-plan-content"
                />
            );
            const icon = screen.getByRole('img');
            expect(icon).toHaveAttribute(
                'aria-describedby',
                'weekly-plan-content'
            );
        });
    });

    describe('Keyboard Navigation', () => {
        it('is keyboard focusable', async () => {
            const user = userEvent.setup();
            const { container } = render(<AttentionIcon urgency="high" />);
            const icon = container.querySelector('[role="img"]');

            // Icon should be focusable via keyboard
            await user.tab();
            expect(icon).toHaveFocus();
        });

        it('can receive keyboard focus', async () => {
            const user = userEvent.setup();
            render(<AttentionIcon urgency="high" />);
            const icon = screen.getByRole('img');

            await user.tab();
            expect(icon).toHaveFocus();
        });
    });
});

describe('AttentionDot Accessibility', () => {
    describe('ARIA Labels', () => {
        it('has role="status" for screen readers', () => {
            render(<AttentionDot urgency="normal" />);
            const dot = screen.getByRole('status');
            expect(dot).toBeInTheDocument();
        });

        it('provides default ARIA label', () => {
            render(<AttentionDot urgency="normal" />);
            const dot = screen.getByRole('status');
            expect(dot).toHaveAttribute('aria-label', 'Требует внимания');
        });

        it('accepts custom ARIA label', () => {
            render(
                <AttentionDot
                    urgency="high"
                    ariaLabel="Новое уведомление"
                />
            );
            const dot = screen.getByRole('status');
            expect(dot).toHaveAttribute('aria-label', 'Новое уведомление');
        });

        it('uses appropriate aria-live', () => {
            render(
                <AttentionDot
                    urgency="critical"
                    announceChanges={true}
                />
            );
            const dot = screen.getByRole('status');
            expect(dot).toHaveAttribute('aria-live', 'assertive');
        });
    });

    describe('Keyboard Navigation', () => {
        it('is keyboard focusable', () => {
            render(<AttentionDot urgency="high" />);
            const dot = screen.getByRole('status');
            expect(dot).toHaveAttribute('tabIndex', '0');
        });

        it('can receive keyboard focus', async () => {
            const user = userEvent.setup();
            render(<AttentionDot urgency="high" />);
            const dot = screen.getByRole('status');

            await user.tab();
            expect(dot).toHaveFocus();
        });
    });
});

describe('Integration with Sections', () => {
    it('section links to attention indicator via aria-describedby', () => {
        render(
            <section aria-labelledby="section-heading" aria-describedby="attention-indicator">
                <h2 id="section-heading">Section Title</h2>
                <AttentionBadge
                    urgency="high"
                    count={3}
                    indicatesId="section-content"
                />
                <div id="section-content">Content</div>
            </section>
        );

        const section = screen.getByRole('region');
        expect(section).toHaveAttribute('aria-describedby', 'attention-indicator');
    });

    it('indicator links to content via indicatesId', () => {
        render(
            <div>
                <AttentionBadge
                    urgency="high"
                    indicatesId="tasks-list"
                />
                <div id="tasks-list">Tasks</div>
            </div>
        );

        const badge = screen.getByRole('status');
        expect(badge).toHaveAttribute('aria-describedby', 'tasks-list');
    });

    it('maintains logical tab order with section content', async () => {
        const user = userEvent.setup();
        render(
            <section>
                <h2>Section Title</h2>
                <AttentionBadge urgency="high" />
                <button>Action</button>
            </section>
        );

        const heading = screen.getByRole('heading');
        const badge = screen.getByRole('status');
        const button = screen.getByRole('button');

        // Tab through elements
        await user.tab();
        expect(badge).toHaveFocus();

        await user.tab();
        expect(button).toHaveFocus();
    });
});

describe('WCAG 2.1 Compliance', () => {
    describe('1.3.1 Info and Relationships', () => {
        it('uses semantic roles', () => {
            render(<AttentionBadge urgency="high" />);
            const badge = screen.getByRole('status');
            expect(badge).toBeInTheDocument();
        });

        it('establishes programmatic relationships', () => {
            render(
                <AttentionBadge
                    urgency="high"
                    indicatesId="content"
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-describedby', 'content');
        });
    });

    describe('1.4.1 Use of Color', () => {
        it('provides text alternative to color', () => {
            render(<AttentionBadge urgency="critical" count={5} />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-label');
            expect(screen.getByText('5')).toBeInTheDocument();
        });

        it('uses icons in addition to color', () => {
            const { container } = render(<AttentionBadge urgency="high" />);
            const icon = container.querySelector('svg');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('2.1.1 Keyboard', () => {
        it('is operable via keyboard', async () => {
            const user = userEvent.setup();
            render(<AttentionBadge urgency="high" />);
            const badge = screen.getByRole('status');

            await user.tab();
            expect(badge).toHaveFocus();
        });
    });

    describe('4.1.2 Name, Role, Value', () => {
        it('has accessible name', () => {
            render(<AttentionBadge urgency="high" count={3} />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAccessibleName();
        });

        it('has proper role', () => {
            render(<AttentionBadge urgency="high" />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('announces state changes', () => {
            render(
                <AttentionBadge
                    urgency="critical"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live');
        });
    });

    describe('4.1.3 Status Messages', () => {
        it('uses aria-live for status messages', () => {
            render(
                <AttentionBadge
                    urgency="high"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live', 'polite');
        });

        it('uses assertive for critical messages', () => {
            render(
                <AttentionBadge
                    urgency="critical"
                    announceChanges={true}
                />
            );
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-live', 'assertive');
        });
    });
});
