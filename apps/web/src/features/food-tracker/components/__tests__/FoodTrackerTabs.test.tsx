/**
 * FoodTrackerTabs Component Unit Tests
 *
 * Tests for tab switching, keyboard navigation, and accessibility.
 *
 * @module food-tracker/components/__tests__/FoodTrackerTabs.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FoodTrackerTabs } from '../FoodTrackerTabs';
import type { FoodTrackerTab } from '../../types';

// ============================================================================
// Tests
// ============================================================================

describe('FoodTrackerTabs', () => {
    const mockOnTabChange = jest.fn();

    beforeEach(() => {
        mockOnTabChange.mockClear();
    });

    describe('Tab Rendering', () => {
        it('renders both tabs with Russian labels', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            expect(screen.getByRole('tab', { name: 'Рацион' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Рекомендации' })).toBeInTheDocument();
        });

        it('renders tablist with proper aria-label', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            expect(screen.getByRole('tablist', { name: 'Разделы дневника питания' })).toBeInTheDocument();
        });

        it('applies active styling to selected tab', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('aria-selected', 'true');
            expect(recommendationsTab).toHaveAttribute('aria-selected', 'false');
        });

        it('applies active styling to recommendations tab when selected', () => {
            render(
                <FoodTrackerTabs activeTab="recommendations" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('aria-selected', 'false');
            expect(recommendationsTab).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Tab Switching', () => {
        it('calls onTabChange with "diet" when Рацион tab is clicked', () => {
            render(
                <FoodTrackerTabs activeTab="recommendations" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.click(dietTab);

            expect(mockOnTabChange).toHaveBeenCalledTimes(1);
            expect(mockOnTabChange).toHaveBeenCalledWith('diet');
        });

        it('calls onTabChange with "recommendations" when Рекомендации tab is clicked', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            fireEvent.click(recommendationsTab);

            expect(mockOnTabChange).toHaveBeenCalledTimes(1);
            expect(mockOnTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('calls onTabChange even when clicking already active tab', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.click(dietTab);

            expect(mockOnTabChange).toHaveBeenCalledTimes(1);
            expect(mockOnTabChange).toHaveBeenCalledWith('diet');
        });
    });

    describe('Keyboard Navigation', () => {
        it('moves focus to next tab with ArrowRight key', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            dietTab.focus();

            fireEvent.keyDown(dietTab, { key: 'ArrowRight' });

            expect(mockOnTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('moves focus to previous tab with ArrowLeft key', () => {
            render(
                <FoodTrackerTabs activeTab="recommendations" onTabChange={mockOnTabChange} />
            );

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            recommendationsTab.focus();

            fireEvent.keyDown(recommendationsTab, { key: 'ArrowLeft' });

            expect(mockOnTabChange).toHaveBeenCalledWith('diet');
        });

        it('wraps around to last tab when pressing ArrowLeft on first tab', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            dietTab.focus();

            fireEvent.keyDown(dietTab, { key: 'ArrowLeft' });

            expect(mockOnTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('wraps around to first tab when pressing ArrowRight on last tab', () => {
            render(
                <FoodTrackerTabs activeTab="recommendations" onTabChange={mockOnTabChange} />
            );

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            recommendationsTab.focus();

            fireEvent.keyDown(recommendationsTab, { key: 'ArrowRight' });

            expect(mockOnTabChange).toHaveBeenCalledWith('diet');
        });

        it('moves to first tab with Home key', () => {
            render(
                <FoodTrackerTabs activeTab="recommendations" onTabChange={mockOnTabChange} />
            );

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            recommendationsTab.focus();

            fireEvent.keyDown(recommendationsTab, { key: 'Home' });

            expect(mockOnTabChange).toHaveBeenCalledWith('diet');
        });

        it('moves to last tab with End key', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            dietTab.focus();

            fireEvent.keyDown(dietTab, { key: 'End' });

            expect(mockOnTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('does not respond to other keys', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            dietTab.focus();

            fireEvent.keyDown(dietTab, { key: 'Enter' });
            fireEvent.keyDown(dietTab, { key: 'Space' });
            fireEvent.keyDown(dietTab, { key: 'Tab' });

            expect(mockOnTabChange).not.toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        it('has proper role="tab" on each tab', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const tabs = screen.getAllByRole('tab');
            expect(tabs).toHaveLength(2);
        });

        it('has proper aria-controls attribute', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('aria-controls', 'tabpanel-diet');
            expect(recommendationsTab).toHaveAttribute('aria-controls', 'tabpanel-recommendations');
        });

        it('has proper id attributes for tabs', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('id', 'tab-diet');
            expect(recommendationsTab).toHaveAttribute('id', 'tab-recommendations');
        });

        it('sets tabIndex=0 on active tab and tabIndex=-1 on inactive tabs', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('tabIndex', '0');
            expect(recommendationsTab).toHaveAttribute('tabIndex', '-1');
        });

        it('has focus-visible styles for keyboard navigation', () => {
            render(
                <FoodTrackerTabs activeTab="diet" onTabChange={mockOnTabChange} />
            );

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            expect(dietTab.className).toContain('focus-visible:');
        });
    });

    describe('Custom className', () => {
        it('applies custom className to container', () => {
            const { container } = render(
                <FoodTrackerTabs
                    activeTab="diet"
                    onTabChange={mockOnTabChange}
                    className="custom-class"
                />
            );

            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
