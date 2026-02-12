/**
 * Unit tests for AttentionBadge component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AttentionBadge, AttentionDot, AttentionIcon } from '../AttentionBadge';

describe('AttentionBadge', () => {
    describe('Rendering', () => {
        it('renders with default props', () => {
            render(<AttentionBadge />);
            const badge = screen.getByRole('status');
            expect(badge).toBeInTheDocument();
            expect(badge).toHaveAttribute('data-urgency', 'normal');
        });

        it('renders with count', () => {
            render(<AttentionBadge count={5} />);
            expect(screen.getByText('5')).toBeInTheDocument();
        });

        it('renders with label', () => {
            render(<AttentionBadge label="Не заполнено" />);
            expect(screen.getByText('Не заполнено')).toBeInTheDocument();
        });

        it('renders with both count and label', () => {
            render(<AttentionBadge count={3} label="задачи" />);
            expect(screen.getByText('3')).toBeInTheDocument();
            expect(screen.getByText('задачи')).toBeInTheDocument();
        });
    });

    describe('Urgency levels', () => {
        it('renders normal urgency with correct styling', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'normal');
            expect(badge.className).toContain('bg-blue-500');
        });

        it('renders high urgency with correct styling', () => {
            render(<AttentionBadge urgency="high" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'high');
            expect(badge.className).toContain('bg-orange-500');
        });

        it('renders critical urgency with correct styling', () => {
            render(<AttentionBadge urgency="critical" />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('data-urgency', 'critical');
            expect(badge.className).toContain('bg-red-500');
        });
    });

    describe('Animation', () => {
        it('applies pulse animation when pulse prop is true', () => {
            render(<AttentionBadge pulse={true} />);
            const badge = screen.getByRole('status');
            expect(badge.className).toContain('animate-pulse');
        });

        it('applies pulse animation for critical urgency by default', () => {
            render(<AttentionBadge urgency="critical" />);
            const badge = screen.getByRole('status');
            expect(badge.className).toContain('animate-pulse');
        });

        it('does not apply pulse animation for normal urgency without pulse prop', () => {
            render(<AttentionBadge urgency="normal" />);
            const badge = screen.getByRole('status');
            expect(badge.className).not.toContain('animate-pulse');
        });
    });

    describe('Accessibility', () => {
        it('has default ARIA label', () => {
            render(<AttentionBadge />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveAttribute('aria-label');
        });

        it('uses custom ARIA label when provided', () => {
            render(<AttentionBadge ariaLabel="Пользовательская метка" />);
            const badge = screen.getByLabelText('Пользовательская метка');
            expect(badge).toBeInTheDocument();
        });

        it('generates appropriate ARIA label for count', () => {
            render(<AttentionBadge count={5} urgency="high" />);
            const badge = screen.getByRole('status');
            expect(badge.getAttribute('aria-label')).toContain('5');
            expect(badge.getAttribute('aria-label')).toContain('важных');
        });

        it('has role="status" for screen readers', () => {
            render(<AttentionBadge />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('hides icon from screen readers', () => {
            const { container } = render(<AttentionBadge />);
            const icon = container.querySelector('svg');
            expect(icon).toHaveAttribute('aria-hidden', 'true');
        });
    });

    describe('Custom styling', () => {
        it('applies custom className', () => {
            render(<AttentionBadge className="custom-class" />);
            const badge = screen.getByRole('status');
            expect(badge.className).toContain('custom-class');
        });
    });
});

describe('AttentionDot', () => {
    describe('Rendering', () => {
        it('renders with default props', () => {
            render(<AttentionDot />);
            const dot = screen.getByRole('status');
            expect(dot).toBeInTheDocument();
            expect(dot).toHaveAttribute('data-urgency', 'normal');
        });

        it('renders with different urgency levels', () => {
            const { rerender } = render(<AttentionDot urgency="normal" />);
            expect(screen.getByRole('status')).toHaveAttribute('data-urgency', 'normal');

            rerender(<AttentionDot urgency="high" />);
            expect(screen.getByRole('status')).toHaveAttribute('data-urgency', 'high');

            rerender(<AttentionDot urgency="critical" />);
            expect(screen.getByRole('status')).toHaveAttribute('data-urgency', 'critical');
        });
    });

    describe('Animation', () => {
        it('applies pulse animation when pulse prop is true', () => {
            render(<AttentionDot pulse={true} />);
            const dot = screen.getByRole('status');
            expect(dot.className).toContain('animate-pulse');
        });

        it('applies pulse animation for critical urgency', () => {
            render(<AttentionDot urgency="critical" />);
            const dot = screen.getByRole('status');
            expect(dot.className).toContain('animate-pulse');
        });
    });

    describe('Accessibility', () => {
        it('has ARIA label', () => {
            render(<AttentionDot ariaLabel="Требует внимания" />);
            const dot = screen.getByLabelText('Требует внимания');
            expect(dot).toBeInTheDocument();
        });

        it('has role="status"', () => {
            render(<AttentionDot />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });
    });
});

describe('AttentionIcon', () => {
    describe('Rendering', () => {
        it('renders with default props', () => {
            render(<AttentionIcon />);
            const icon = screen.getByRole('img');
            expect(icon).toBeInTheDocument();
            expect(icon).toHaveAttribute('data-urgency', 'normal');
        });

        it('renders with different sizes', () => {
            const { rerender } = render(<AttentionIcon size="sm" />);
            let icon = screen.getByRole('img');
            expect(icon.getAttribute('class')).toContain('w-3');

            rerender(<AttentionIcon size="md" />);
            icon = screen.getByRole('img');
            expect(icon.getAttribute('class')).toContain('w-4');

            rerender(<AttentionIcon size="lg" />);
            icon = screen.getByRole('img');
            expect(icon.getAttribute('class')).toContain('w-5');
        });

        it('renders with different urgency levels', () => {
            const { rerender } = render(<AttentionIcon urgency="normal" />);
            let icon = screen.getByRole('img');
            expect(icon).toHaveAttribute('data-urgency', 'normal');
            expect(icon.getAttribute('class')).toContain('text-blue-500');

            rerender(<AttentionIcon urgency="high" />);
            icon = screen.getByRole('img');
            expect(icon).toHaveAttribute('data-urgency', 'high');
            expect(icon.getAttribute('class')).toContain('text-orange-500');

            rerender(<AttentionIcon urgency="critical" />);
            icon = screen.getByRole('img');
            expect(icon).toHaveAttribute('data-urgency', 'critical');
            expect(icon.getAttribute('class')).toContain('text-red-500');
        });
    });

    describe('Animation', () => {
        it('applies pulse animation when pulse prop is true', () => {
            render(<AttentionIcon pulse={true} />);
            const icon = screen.getByRole('img');
            expect(icon.getAttribute('class')).toContain('animate-pulse');
        });

        it('applies pulse animation for critical urgency', () => {
            render(<AttentionIcon urgency="critical" />);
            const icon = screen.getByRole('img');
            expect(icon.getAttribute('class')).toContain('animate-pulse');
        });
    });

    describe('Accessibility', () => {
        it('has ARIA label', () => {
            render(<AttentionIcon ariaLabel="Требует внимания" />);
            const icon = screen.getByLabelText('Требует внимания');
            expect(icon).toBeInTheDocument();
        });

        it('has role="img"', () => {
            render(<AttentionIcon />);
            expect(screen.getByRole('img')).toBeInTheDocument();
        });
    });
});
