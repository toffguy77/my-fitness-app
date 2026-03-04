import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

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
        expect(badge.className).toContain('bg-gray-100');
        expect(badge.className).toContain('text-gray-700');
    });

    it('applies correct styling for scheduled status', () => {
        render(<StatusBadge status="scheduled" />);
        const badge = screen.getByText('Запланирован');
        expect(badge.className).toContain('bg-amber-100');
        expect(badge.className).toContain('text-amber-700');
    });

    it('applies correct styling for published status', () => {
        render(<StatusBadge status="published" />);
        const badge = screen.getByText('Опубликован');
        expect(badge.className).toContain('bg-green-100');
        expect(badge.className).toContain('text-green-700');
    });
});
