/**
 * Property-Based Tests for FoodTrackerTabs Component
 *
 * Tests the correctness properties of tab switching using fast-check.
 *
 * @module food-tracker/components/__tests__/FoodTrackerTabs.property.test
 */

import { render, screen, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { FoodTrackerTabs } from '../FoodTrackerTabs';
import type { FoodTrackerTab } from '../../types';

// ============================================================================
// Test Configuration
// ============================================================================

const PROPERTY_TEST_CONFIG = {
    numRuns: 50,
    verbose: false,
};

// ============================================================================
// Custom Generators
// ============================================================================

/**
 * Generator for food tracker tabs
 */
const tabGenerator = (): fc.Arbitrary<FoodTrackerTab> => {
    return fc.constantFrom('diet', 'recommendations');
};

// ============================================================================
// Property 10: Tab Switching Content
// ============================================================================

describe('Feature: food-tracker, Property 10: Tab Switching Content', () => {
    /**
     * **Validates: Requirements 1.4, 4.3**
     *
     * Property: For any tab selection, displayed content corresponds to selected tab
     */

    describe('Property: Active tab is visually indicated', () => {
        it('should indicate active tab for any selected tab', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    // Find the active tab button
                    const activeButton = screen.getByRole('tab', { selected: true });

                    // Verify the correct tab is marked as selected
                    const expectedLabel = activeTab === 'diet' ? 'Рацион' : 'Рекомендации';
                    expect(activeButton).toHaveTextContent(expectedLabel);

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should have exactly one active tab at any time', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    const selectedTabs = screen.getAllByRole('tab', { selected: true });
                    expect(selectedTabs).toHaveLength(1);

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Tab click triggers callback with correct tab', () => {
        it('should call onTabChange with clicked tab', () => {
            fc.assert(
                fc.property(
                    tabGenerator(),
                    tabGenerator(),
                    (initialTab, clickedTab) => {
                        const onTabChange = jest.fn();
                        const { unmount } = render(
                            <FoodTrackerTabs activeTab={initialTab} onTabChange={onTabChange} />
                        );

                        // Click the tab
                        const tabLabel = clickedTab === 'diet' ? 'Рацион' : 'Рекомендации';
                        const tabButton = screen.getByRole('tab', { name: tabLabel });
                        fireEvent.click(tabButton);

                        // Verify callback was called with correct tab
                        expect(onTabChange).toHaveBeenCalledWith(clickedTab);

                        unmount();
                        return true;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: All tabs are always rendered', () => {
        it('should render both tabs regardless of active tab', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    // Both tabs should be present
                    expect(screen.getByRole('tab', { name: 'Рацион' })).toBeInTheDocument();
                    expect(screen.getByRole('tab', { name: 'Рекомендации' })).toBeInTheDocument();

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Tab accessibility attributes', () => {
        it('should have correct ARIA attributes for any tab state', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    const tabs = screen.getAllByRole('tab');

                    // All tabs should have role="tab"
                    expect(tabs).toHaveLength(2);

                    // Active tab should have aria-selected="true"
                    const activeButton = screen.getByRole('tab', { selected: true });
                    expect(activeButton).toHaveAttribute('aria-selected', 'true');

                    // Inactive tab should have aria-selected="false"
                    const inactiveButton = screen.getByRole('tab', { selected: false });
                    expect(inactiveButton).toHaveAttribute('aria-selected', 'false');

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should have tablist role on container', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    expect(screen.getByRole('tablist')).toBeInTheDocument();

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Russian labels are displayed', () => {
        it('should display Russian labels for all tabs', () => {
            fc.assert(
                fc.property(tabGenerator(), (activeTab) => {
                    const onTabChange = jest.fn();
                    const { unmount } = render(
                        <FoodTrackerTabs activeTab={activeTab} onTabChange={onTabChange} />
                    );

                    // Check Russian labels
                    expect(screen.getByText('Рацион')).toBeInTheDocument();
                    expect(screen.getByText('Рекомендации')).toBeInTheDocument();

                    unmount();
                    return true;
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('FoodTrackerTabs Unit Tests', () => {
    describe('Keyboard Navigation', () => {
        it('should navigate to next tab with ArrowRight', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.keyDown(dietTab, { key: 'ArrowRight' });

            expect(onTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('should navigate to previous tab with ArrowLeft', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            fireEvent.keyDown(recommendationsTab, { key: 'ArrowLeft' });

            expect(onTabChange).toHaveBeenCalledWith('diet');
        });

        it('should wrap around with ArrowRight on last tab', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            fireEvent.keyDown(recommendationsTab, { key: 'ArrowRight' });

            expect(onTabChange).toHaveBeenCalledWith('diet');
        });

        it('should wrap around with ArrowLeft on first tab', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.keyDown(dietTab, { key: 'ArrowLeft' });

            expect(onTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('should navigate to first tab with Home key', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            fireEvent.keyDown(recommendationsTab, { key: 'Home' });

            expect(onTabChange).toHaveBeenCalledWith('diet');
        });

        it('should navigate to last tab with End key', () => {
            const onTabChange = jest.fn();
            render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.keyDown(dietTab, { key: 'End' });

            expect(onTabChange).toHaveBeenCalledWith('recommendations');
        });
    });

    describe('Tab Focus Management', () => {
        it('should have tabIndex 0 on active tab', () => {
            render(<FoodTrackerTabs activeTab="diet" onTabChange={jest.fn()} />);

            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });

            expect(dietTab).toHaveAttribute('tabIndex', '0');
            expect(recommendationsTab).toHaveAttribute('tabIndex', '-1');
        });
    });
});
