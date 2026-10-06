import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';
import type { ContentStatus } from '../../types';

describe('StatusBadge', () => {
    it('renders "Черновик" for draft status', () => {
        render(<StatusBadge status="draft" />);
        expect(screen.getByText('Черновик')).toBeInTheDocument();
    });

    it('renders "Запланирован" for scheduled status', () => {
        render(<StatusBadge status="scheduled" />);
        expect(screen.getByText('Запланирован')).toBeInTheDocument();
    });

    it('renders "Опубликован" for published status', () => {
        render(<StatusBadge status="published" />);
        expect(screen.getByText('Опубликован')).toBeInTheDocument();
    });

    it('applies correct styling for draft status', () => {
        render(<StatusBadge status="draft" />);
        const badge = screen.getByText('Черновик');
        expect(badge.className).toContain('bg-subtle');
        expect(badge.className).toContain('text-fg');
    });

    it('applies correct styling for scheduled status', () => {
        render(<StatusBadge status="scheduled" />);
        const badge = screen.getByText('Запланирован');
        expect(badge.className).toContain('bg-warning-soft');
        expect(badge.className).toContain('text-warning-fg');
    });

    it('applies correct styling for published status', () => {
        render(<StatusBadge status="published" />);
        const badge = screen.getByText('Опубликован');
        expect(badge.className).toContain('bg-success-soft');
        expect(badge.className).toContain('text-success-fg');
    });

    it('falls back gracefully for unknown status values', () => {
        // Test the ?? fallback branch in STATUS_CONFIG lookup
        render(<StatusBadge status={'unknown' as ContentStatus} />);
        expect(screen.getByText('unknown')).toBeInTheDocument();
    });
});
